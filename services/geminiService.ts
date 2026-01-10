
import { GoogleGenAI, Type } from "@google/genai";
import { IntelEvent, EventCategory, SourceType, AppLanguage, Casualties, CrowdAnalysisResult } from '../types';
import { v4 as uuidv4 } from 'uuid';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const isRateLimitError = (error: any): boolean => {
    if (!error) return false;
    if (String(error.status) === '429' || String(error.code) === '429') return true;
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('429') || msg.includes('quota')) return true;
    return false;
};

// Helper to handle potential JSON truncation from model responses
function repairTruncatedJson(json: string): any {
    try {
        // Remove markdown blocks if present
        let str = json.trim();
        if (str.startsWith('```')) {
            str = str.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }
        return JSON.parse(str);
    } catch (e) {
        let str = json.trim();
        str = str.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // Basic attempt to close arrays/objects if truncated
        if (str.startsWith('[')) {
            const lastMatch = str.lastIndexOf('}');
            if (lastMatch !== -1) {
                try {
                    return JSON.parse(str.substring(0, lastMatch + 1) + ']');
                } catch (err) {}
            }
        }
        if (str.startsWith('{')) {
             const lastMatch = str.lastIndexOf('}');
             if (lastMatch !== -1) {
                try {
                    return JSON.parse(str.substring(0, lastMatch + 1));
                } catch (err) {}
             }
        }
        throw e;
    }
}

// Proxy fetcher to bypass CORS issues when scraping public intel sources
async function fetchWithProxyFallback(targetUrl: string): Promise<string> {
    const proxies = [
        { name: 'CorsProxy', getUrl: (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}` },
        { name: 'AllOrigins', getUrl: (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, isJson: true },
        { name: 'CodeTabs', getUrl: (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` }
    ];

    let lastError: any;
    for (const proxy of proxies) {
        try {
            const fetchUrl = proxy.getUrl(targetUrl);
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            let content = '';
            if ((proxy as any).isJson) {
                const data = await response.json();
                content = data.contents;
            } else {
                content = await response.text();
            }

            if (!content || content.length < 50) throw new Error("Content too short");
            if (content.includes("challenge-form") || content.includes("Cloudflare")) throw new Error("Bot Protected");

            return content;
        } catch (error) {
            lastError = error;
            await new Promise(r => setTimeout(r, 300));
        }
    }
    throw new Error(`Proxy network failure: ${lastError?.message}`);
}

export interface SourcePage {
    text: string;
    nextCursor?: string;
    sourceName?: string;
    oldestPostDate?: string;
    messageCount: number;
    type: SourceType;
}

/**
 * Basic source data fetcher (primarily for Telegram scraping).
 */
export const fetchSourceData = async (urlInput: string, cursor?: string): Promise<SourcePage> => {
  const url = urlInput.trim();
  let type: SourceType = SourceType.WEB;
  let targetUrl = url;

  if (url.includes('t.me/')) {
      type = SourceType.TELEGRAM;
      if (!url.includes('/s/')) targetUrl = url.replace('t.me/', 't.me/s/');
      if (cursor) {
          const id = cursor.split('/').pop();
          targetUrl += (targetUrl.includes('?') ? '&' : '?') + `before=${id}`;
      }
  }

  try {
      const htmlContent = await fetchWithProxyFallback(targetUrl);
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      let cleanedText = `SOURCE: ${url}\n\n`;
      let messageCount = 0;
      let minId = Infinity;
      let sourceName = url.split('/').filter(p => p).pop()?.replace(/\?.*/, '') || "IntelSource";

      if (type === SourceType.TELEGRAM) {
          const nodes = doc.querySelectorAll('.tgme_widget_message');
          nodes.forEach(node => {
              const textEl = node.querySelector('.tgme_widget_message_text');
              const content = (textEl as HTMLElement)?.innerText;
              const date = node.querySelector('time')?.getAttribute('datetime');
              const id = node.getAttribute('data-post')?.split('/').pop();
              if (content) {
                  cleanedText += `ID: ${id} | DATE: ${date} | MSG: ${content.replace(/\n/g, ' ')}\n`;
                  messageCount++;
                  if (id && parseInt(id) < minId) minId = parseInt(id);
              }
          });
      } else {
          cleanedText += doc.body.innerText.substring(0, 15000);
          messageCount = 1;
      }

      return { 
          text: cleanedText, 
          nextCursor: minId !== Infinity ? `${sourceName}/${minId}` : undefined,
          sourceName,
          messageCount,
          type
      };
  } catch (error) {
      console.error("Fetch Failed:", error);
      throw error;
  }
};

/**
 * Multimodal analysis for crowd counting and geolocation using Gemini 3 Flash.
 * Optimized for standard API keys.
 */
export const analyzeCrowdPost = async (base64Data: string, mimeType: string, contextText: string): Promise<CrowdAnalysisResult | null> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const isVideo = mimeType.startsWith('video');

    const prompt = `
      TACTICAL INTEL ANALYSIS: MEDIA ANALYSIS (${isVideo ? 'VIDEO' : 'IMAGE'})
      CONTEXT: ${contextText}

      OBJECTIVES:
      1. CROWD COUNT: Be precise. Estimate based on visible density.
      2. GEOLOCATION: Extract street-level data from signs, architecture, or metadata.
      3. COORDINATES: Provide estimated [Lat, Lng] for the specific street/landmark.
      4. THREAT LEVEL: Identify fires, weapons, arrests, or casualties.

      OUTPUT FORMAT (JSON ONLY):
      {
        "minEstimate": int,
        "maxEstimate": int,
        "confidence": "High"|"Medium"|"Low",
        "crowdType": "string",
        "description": "string",
        "hazards": ["string"],
        "location": "Detailed Street/City",
        "lat": float,
        "lng": float,
        "date": "YYYY-MM-DD"
      }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', 
            contents: {
                parts: [
                    { inlineData: { mimeType, data: base64Data } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json"
            }
        });
        return repairTruncatedJson(response.text);
    } catch (e) {
        console.error("Media analysis failed", e);
        throw e;
    }
};

/**
 * Extracts intelligence events from scraped text data using Gemini 3 Flash.
 */
export const parseIntelContent = async (inputContent: string, type: SourceType, language: AppLanguage = 'en', regionFocus?: string): Promise<IntelEvent[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    GEO-INT EXTRACTION:
    PROCESS DATA: ${inputContent.substring(0, 25000)}
    FOCUS REGION: ${regionFocus || "Global"}

    EXTRACT EVENTS:
    - CATEGORY: Military, Political, Cyber, Terrorism, Civil Unrest, Other
    - COORDINATES: Accurate Lat/Lng for specific neighborhood or city centers.
    - COUNTS: Protestor estimates (Integer).
    - CASUALTIES: dead, injured, detained.
    
    RESPONSE SCHEMA: JSON ARRAY ONLY.
    [{
      "title": "Short title",
      "summary": "Brief analysis",
      "category": "Enum",
      "date": "YYYY-MM-DD",
      "locationName": "City, Province, Country",
      "lat": float,
      "lng": float,
      "sourceId": "id",
      "protestorCount": int,
      "casualties": {"dead": int, "injured": int, "detained": int},
      "securityCasualties": {"dead": int, "injured": int}
    }]
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const parsed = repairTruncatedJson(response.text || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: any) => ({
      id: uuidv4(),
      title: item.title || "Unknown Event",
      summary: item.summary || "",
      category: item.category as EventCategory || EventCategory.OTHER,
      date: item.date || new Date().toISOString().split('T')[0],
      locationName: item.locationName || "Unknown",
      lat: Number(item.lat) || 0,
      lng: Number(item.lng) || 0,
      reliabilityScore: 7,
      sourceId: item.sourceId,
      protestorCount: Number(item.protestorCount) || 0,
      casualties: {
        dead: Number(item.casualties?.dead) || 0,
        injured: Number(item.casualties?.injured) || 0,
        detained: Number(item.casualties?.detained) || 0
      },
      securityCasualties: {
        dead: Number(item.securityCasualties?.dead) || 0,
        injured: Number(item.securityCasualties?.injured) || 0
      },
      sourceType: type,
      sourceUrl: inputContent.split('\n')[0].replace('SOURCE: ', '')
    }));
  } catch (e) {
    console.error("AI Extraction failed", e);
    return [];
  }
};

/**
 * Synthesizes a situation report based on a list of intelligence events.
 */
export const generateSituationReport = async (events: IntelEvent[], language: AppLanguage): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const data = events.slice(0, 50).map(e => `${e.date}|${e.locationName}|${e.title}`);
  
  const prompt = `Generate a tactical SITREP in ${language === 'fa' ? 'Persian' : 'English'}. Data: ${data.join('; ')}`;
  
  try {
      const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
      });
      return response.text || "Report generation failed.";
  } catch (e) {
      return "Critical error in report synthesis.";
  }
};

/**
 * Enables conversational analysis of intelligence data.
 */
export const chatWithIntel = async (userMessage: string, contextEvents: IntelEvent[], language: AppLanguage, history: {role: 'user' | 'model', text: string}[]): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const context = contextEvents.map(e => `[${e.date}] ${e.title} in ${e.locationName}`).join('\n');
    
    try {
        const chat = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: { systemInstruction: `Analyst Mode. Context: ${context}` },
            history: history.map(h => ({ role: h.role, parts: [{ text: h.text }] }))
        });
        const result = await chat.sendMessage({ message: userMessage });
        return result.text || "No analysis available.";
    } catch (e) {
        return "System offline.";
    }
};

/**
 * Generates cinematic tactical drone footage using Veo 3.1 Fast.
 * Note: This specific feature requires a paid tier key if triggered.
 */
export const generateVideoBriefing = async (reportContent: string, language: AppLanguage): Promise<string | null> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: `Cinematic tactical drone footage over a city at night with digital UI overlays, map indicators, 4k.`,
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
        });

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 8000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }

        return operation.response?.generatedVideos?.[0]?.video?.uri ? `${operation.response.generatedVideos[0].video.uri}&key=${process.env.API_KEY}` : null;
    } catch (e) {
        console.error("Video Gen Error:", e);
        return null;
    }
};

/**
 * Fetches multiple structured posts from a channel (e.g., Telegram).
 */
export const fetchChannelPosts = async (url: string): Promise<{id: string, text: string, url: string, mediaUrl?: string}[]> => {
    try {
        let targetUrl = url;
        if (url.includes('t.me/') && !url.includes('/s/')) {
            targetUrl = url.replace('t.me/', 't.me/s/');
        }
        const html = await fetchWithProxyFallback(targetUrl);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const posts: {id: string, text: string, url: string, mediaUrl?: string}[] = [];
        
        const nodes = doc.querySelectorAll('.tgme_widget_message');
        nodes.forEach(node => {
            const textEl = node.querySelector('.tgme_widget_message_text');
            const text = (textEl as HTMLElement)?.innerText || "";
            const id = node.getAttribute('data-post')?.split('/').pop() || "";
            const postUrl = node.querySelector('.tgme_widget_message_date')?.getAttribute('href') || url;
            
            const photoEl = node.querySelector('.tgme_widget_message_photo_wrap');
            let mediaUrl: string | undefined;
            if (photoEl) {
                const style = photoEl.getAttribute('style');
                const match = style?.match(/url\(['"]?([^'"]+)['"]?\)/);
                if (match) {
                    mediaUrl = match[1];
                }
            }
            
            if (text || mediaUrl) {
                posts.push({ id, text, url: postUrl, mediaUrl });
            }
        });
        return posts;
    } catch (error) {
        console.error("fetchChannelPosts error:", error);
        return [];
    }
};

/**
 * Extracts a candidate media URL (image) from a public web page.
 */
export const extractMediaUrlFromPage = async (url: string): Promise<string | null> => {
    try {
        const html = await fetchWithProxyFallback(url);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
        if (ogImage) return ogImage;
        const img = doc.querySelector('img');
        return img ? img.src : null;
    } catch (error) {
        console.error("extractMediaUrlFromPage error:", error);
        return null;
    }
};

/**
 * Alias for crowd analysis media input.
 */
export const analyzeCrowdMedia = analyzeCrowdPost;
