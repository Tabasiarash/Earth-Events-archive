
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

function repairTruncatedJson(json: string): any {
    try {
        return JSON.parse(json);
    } catch (e) {
        let str = json.trim();
        str = str.replace(/```json/g, '').replace(/```/g, '').trim();
        if (str.startsWith('[')) {
            const lastMatch = str.lastIndexOf('}');
            if (lastMatch !== -1) {
                try {
                    const repaired = str.substring(0, lastMatch + 1) + ']';
                    return JSON.parse(repaired);
                } catch (err) {}
            }
        }
        // Try object repair for single object responses
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

async function fetchWithProxyFallback(targetUrl: string): Promise<string> {
    // Priority: AllOrigins (JSON) -> CorsProxy (Raw) -> CodeTabs (Raw)
    const proxies = [
        {
            name: 'AllOrigins',
            getUrl: (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
            isJson: true
        },
        { name: 'CorsProxy', getUrl: (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}` },
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

            if (!content || content.length < 50) {
                throw new Error("Content empty or too short");
            }
            // Basic check if we got blocked by a captcha
            if (content.includes("challenge-form") || content.includes("Cloudflare")) {
                throw new Error("Blocked by Bot Protection");
            }

            return content;
        } catch (error) {
            console.warn(`Proxy ${proxy.name} failed for ${targetUrl}:`, error);
            lastError = error;
            // Short delay before next proxy
            await new Promise(r => setTimeout(r, 500));
        }
    }
    throw new Error(`Failed to access source. All proxies failed. Last error: ${lastError?.message || 'Unknown'}`);
}

export interface SourcePage {
    text: string;
    nextCursor?: string;
    sourceName?: string;
    oldestPostDate?: string;
    messageCount: number;
    type: SourceType;
}

export const fetchSourceData = async (urlInput: string, cursor?: string): Promise<SourcePage> => {
  const url = urlInput.trim();
  let type: SourceType = SourceType.WEB;
  let targetUrl = url;

  if (url.includes('t.me/')) {
      type = SourceType.TELEGRAM;
      // Convert to preview URL: t.me/s/channelName
      if (!url.includes('/s/')) {
          targetUrl = url.replace('t.me/', 't.me/s/');
      }
      if (cursor) {
          const id = cursor.split('/').pop();
          targetUrl += (targetUrl.includes('?') ? '&' : '?') + `before=${id}`;
      }
  } else if (url.includes('instagram.com/')) {
      type = SourceType.INSTAGRAM;
  } else if (url.includes('twitter.com/') || url.includes('x.com/')) {
      type = SourceType.TWITTER;
      targetUrl = url.replace('twitter.com', 'nitter.net').replace('x.com', 'nitter.net');
  }

  try {
      const htmlContent = await fetchWithProxyFallback(targetUrl);
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      let cleanedText = `SOURCE_URL: ${url}\nPLATFORM: ${type}\n\n`;
      let messageCount = 0;
      let minId = Infinity;
      let sourceName = url.split('/').filter(p => p).pop()?.replace(/\?.*/, '') || "Source";

      if (type === SourceType.TELEGRAM) {
          const nodes = doc.querySelectorAll('.tgme_widget_message');
          nodes.forEach(node => {
              const content = (node.querySelector('.tgme_widget_message_text') as HTMLElement)?.innerText;
              const date = node.querySelector('time')?.getAttribute('datetime');
              const id = node.getAttribute('data-post')?.split('/').pop();
              if (content) {
                  cleanedText += `ID: ${id}\nDATE: ${date}\nTEXT: ${content}\n---\n`;
                  messageCount++;
                  if (id && parseInt(id) < minId) minId = parseInt(id);
              }
          });
      } else {
          // General web scraping fallback
          const bodyText = doc.body.innerText.replace(/\s+/g, ' ').substring(0, 15000);
          cleanedText += bodyText;
          messageCount = bodyText.length > 200 ? 1 : 0;
      }

      return { 
          text: cleanedText, 
          nextCursor: minId !== Infinity ? `${sourceName}/${minId}` : undefined,
          sourceName,
          messageCount,
          type
      };
  } catch (error) {
      console.error("Fetch Source Data Failed:", error);
      throw error;
  }
};

export interface ScannedPost {
    id: string;
    url: string;
    text: string;
    date: string;
    mediaUrl?: string;
    mediaType: 'image' | 'video';
}

export const fetchChannelPosts = async (channelUrl: string): Promise<ScannedPost[]> => {
    let targetUrl = channelUrl;
    if (channelUrl.includes('t.me/') && !channelUrl.includes('/s/')) {
        targetUrl = channelUrl.replace('t.me/', 't.me/s/');
    }

    try {
        const html = await fetchWithProxyFallback(targetUrl);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const posts: ScannedPost[] = [];

        const messageNodes = doc.querySelectorAll('.tgme_widget_message');
        messageNodes.forEach(node => {
             const id = node.getAttribute('data-post') || uuidv4();
             const textEl = node.querySelector('.tgme_widget_message_text');
             const text = (textEl as HTMLElement)?.innerText || '';
             const timeEl = node.querySelector('time');
             const date = timeEl?.getAttribute('datetime') || new Date().toISOString();
             
             // Check for image (background-image on a div usually)
             const photoWrap = node.querySelector('.tgme_widget_message_photo_wrap');
             let mediaUrl: string | undefined;
             let mediaType: 'image' | 'video' = 'image';

             if (photoWrap) {
                 const style = photoWrap.getAttribute('style');
                 const match = style?.match(/url\('?(.*?)'?\)/);
                 if (match && match[1]) {
                     mediaUrl = match[1];
                 }
             }

             // Check for video
             const videoWrap = node.querySelector('video');
             if (videoWrap) {
                 mediaUrl = videoWrap.getAttribute('src') || undefined;
                 mediaType = 'video';
             }

             if (mediaUrl) {
                 posts.push({ id, url: `https://t.me/${id}`, text, date, mediaUrl, mediaType });
             }
        });
        return posts;

    } catch (e) {
        console.error("Failed to fetch channel posts", e);
        return [];
    }
};

// Helper to extract image/video URL from HTML for crowd counting
export const extractMediaUrlFromPage = async (url: string): Promise<string | null> => {
    try {
        let targetUrl = url;
        
        // Telegram preview fix
        if (url.includes('t.me/') && !url.includes('/s/')) {
            targetUrl = url.replace('t.me/', 't.me/s/');
        }

        // Twitter/X fix (Use Nitter)
        if (url.includes('x.com/') || url.includes('twitter.com/')) {
            targetUrl = url.replace('x.com', 'nitter.net').replace('twitter.com', 'nitter.net');
        }

        const html = await fetchWithProxyFallback(targetUrl);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Priority 1: OpenGraph Video (Most reliable for video understanding)
        const ogVideo = doc.querySelector('meta[property="og:video"]')?.getAttribute('content') ||
                        doc.querySelector('meta[property="og:video:url"]')?.getAttribute('content') ||
                        doc.querySelector('meta[property="og:video:secure_url"]')?.getAttribute('content');
        if (ogVideo) return ogVideo;

        // Priority 2: OpenGraph Image
        const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || 
                        doc.querySelector('meta[property="og:image:url"]')?.getAttribute('content');
        if (ogImage) return ogImage;

        // Priority 3: Twitter Cards
        const twitterImage = doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
        if (twitterImage) return twitterImage;
        const twitterPlayer = doc.querySelector('meta[name="twitter:player:stream"]')?.getAttribute('content');
        if (twitterPlayer) return twitterPlayer;

        // Priority 4: First substantial image
        const imgs = doc.querySelectorAll('img');
        for (let i = 0; i < imgs.length; i++) {
            const src = imgs[i].src;
            if (src && src.startsWith('http') && imgs[i].width > 200) return src;
        }
        
        return null;
    } catch (e) {
        console.error("Failed to extract media", e);
        return null;
    }
};

export const analyzeCrowdPost = async (base64Data: string, mimeType: string, contextText: string): Promise<CrowdAnalysisResult | null> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const isVideo = mimeType.startsWith('video');

    const prompt = `
      You are an expert Crowd Safety and Reconnaissance Analyst specializing in PRECISE CROWD COUNTING.
      Analyze the provided visual media (${isVideo ? 'VIDEO/CLIP' : 'IMAGE'}) and the accompanying text context.
      
      CONTEXT: ${contextText}

      YOUR TASKS:
      1. **PRECISE CROWD ESTIMATION (CRITICAL)**:
         - Use a visual grid estimation technique. Divide the visible area into sectors, estimate density (people per m²), and sum them up.
         - Do NOT return vague ranges like "hundreds" or "thousands" if a narrower range is visible.
         - If the image is high resolution, try to count individual heads in the foreground and extrapolate.
         - Provide a tight min/max range.

      2. Identify the LOCATION (City, Neighborhood, Landmark) based on the text and visual cues. 
         - **REQUIRED**: You MUST estimate the numeric latitude and longitude for this location. Do not return null. If the city is known, use the city center. If a landmark is known, use the landmark.

      3. Identify the DATE of the event based on the text or visual metadata cues.

      4. Analyze the crowd's behavior (e.g., Peaceful protest, Riot, Panic).

      5. Identify potential hazards (e.g., fires, blocked exits, weapons).
      
      ${isVideo ? `
      6. VIDEO SPECIFIC ANALYSIS:
         - Describe the movement/flow.
         - Note temporal changes.
         - Note audio cues if implied by context.
      ` : ''}

      OUTPUT FORMAT (JSON ONLY):
      {
        "minEstimate": integer,
        "maxEstimate": integer,
        "confidence": "High" | "Medium" | "Low",
        "crowdType": "string",
        "description": "string (max 50 words)",
        "hazards": ["string"],
        "location": "string",
        "lat": float,
        "lng": float,
        "date": "YYYY-MM-DD"
      }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', 
            contents: {
                parts: [
                    { inlineData: { mimeType, data: base64Data } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 4000 } // Increased thinking budget for calculation
            }
        });

        const text = response.text || "{}";
        const result = repairTruncatedJson(text);

        return {
            minEstimate: result.minEstimate || 0,
            maxEstimate: result.maxEstimate || 0,
            confidence: result.confidence || 'Low',
            crowdType: result.crowdType || 'Unknown',
            description: result.description || 'Analysis failed.',
            hazards: Array.isArray(result.hazards) ? result.hazards : [],
            location: result.location,
            lat: result.lat,
            lng: result.lng,
            date: result.date
        };
    } catch (e) {
        console.error("Crowd analysis failed", e);
        throw e;
    }
};

// Legacy support for direct media only
export const analyzeCrowdMedia = async (base64Data: string, mimeType: string): Promise<CrowdAnalysisResult | null> => {
    return analyzeCrowdPost(base64Data, mimeType, "No context provided.");
};

export const generateSituationReport = async (events: IntelEvent[], language: AppLanguage): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Create a condensed representation of events to save tokens
  const condensedEvents = events.slice(0, 80).map(e => ({
      date: e.date,
      category: e.category,
      title: e.title,
      location: e.locationName,
      casualties: e.casualties
  }));

  const langName = { 'en': 'English', 'de': 'German', 'fa': 'Farsi', 'ar': 'Arabic' }[language];

  const prompt = `
    ROLE: Senior Intelligence Analyst.
    TASK: Write a concise "Situation Report" (SITREP) based on the provided event logs.
    LANGUAGE: Write the report in ${langName}.
    
    DATA:
    ${JSON.stringify(condensedEvents)}

    REQUIREMENTS:
    1. STRUCTURE:
       - **Executive Summary**: 1 sentence overview.
       - **Key Escalations**: Bullet points of major military or political shifts.
       - **Casualty Assessment**: Summary of human impact.
       - **Outlook**: Predicted short-term trajectory based on these events.
    2. TONE: Professional, objective, military/intelligence style.
    3. FORMAT: Markdown.
  `;

  try {
      const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
      });
      return response.text || "Failed to generate report.";
  } catch (e) {
      return "Error generating situation report. Please check API Key or quota.";
  }
};

export const parseIntelContent = async (inputContent: string, type: SourceType, language: AppLanguage = 'en', regionFocus?: string): Promise<IntelEvent[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const spatialConstraint = regionFocus && regionFocus.trim().length > 0 
    ? `IMPORTANT SPATIAL CONSTRAINT: ONLY extract events within "${regionFocus}".` 
    : "";

  const prompt = `
    OSINT ANALYST MISSION:
    Analyze the following social media/news data.
    
    INPUT:
    ${inputContent.substring(0, 30000)}
    
    ${spatialConstraint}

    OBJECTIVE:
    1. Identify discrete geographical events.
    2. ESTIMATE AND CALCULATE NUMBERS: 
       - Look for crowd sizes, participant counts, or protestor numbers. Use exact numbers if available.
       - Look for casualties and CATEGORIZE them into: Dead (martyred/killed), Injured (wounded), and Detained (arrested/captured).
    3. BE GRANULAR: Separate entries for each city/location.

    EXTRACTION RULES:
    - If no specific number is found, leave as null or 0.
    - If a range is provided (e.g. "100-200 people"), use the mid-point or the most reliable estimate.
    - Return valid JSON.

    JSON Schema:
    [{
      "title": "string",
      "summary": "string",
      "category": "Military|Political|Cyber|Terrorism|Civil Unrest|Other",
      "date": "YYYY-MM-DD",
      "locationName": "string",
      "lat": float,
      "lng": float,
      "reliabilityScore": 1-10,
      "protestorCount": integer|null,
      "casualties": {
         "dead": integer,
         "injured": integer,
         "detained": integer
      }
    }]
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });

    const text = response.text || "[]";
    const parsed = repairTruncatedJson(text);
    
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: any) => ({
      id: uuidv4(),
      title: item.title || "Untitled Event",
      summary: item.summary || "",
      category: item.category as EventCategory || EventCategory.OTHER,
      date: item.date || new Date().toISOString().split('T')[0],
      locationName: item.locationName || "Unknown",
      lat: typeof item.lat === 'number' ? item.lat : 0,
      lng: typeof item.lng === 'number' ? item.lng : 0,
      reliabilityScore: item.reliabilityScore || 5,
      protestorCount: item.protestorCount || 0,
      casualties: {
        dead: item.casualties?.dead || 0,
        injured: item.casualties?.injured || 0,
        detained: item.casualties?.detained || 0
      },
      sourceType: type,
      sourceUrl: inputContent.split('\n')[0].replace('SOURCE_URL: ', '')
    }));
  } catch (e) {
    console.error("AI Extraction failed", e);
    return [];
  }
};
