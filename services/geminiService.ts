
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { IntelEvent, EventCategory, SourceType, AppLanguage, Casualties, CrowdAnalysisResult } from '../types';
import { v4 as uuidv4 } from 'uuid';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const isRateLimitError = (error: any): boolean => {
    if (!error) return false;
    if (String(error.status) === '429' || String(error.code) === '429') return true;
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted')) return true;
    return false;
};

async function callWithRetry<T>(fn: () => Promise<T>, retries = 3, initialDelay = 4000): Promise<T> {
    let currentDelay = initialDelay;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            if (isRateLimitError(error) && i < retries - 1) {
                console.warn(`Rate limit hit (Attempt ${i + 1}/${retries}). Retrying in ${currentDelay}ms...`);
                await sleep(currentDelay);
                currentDelay *= 2; // Exponential backoff
                continue;
            }
            throw error;
        }
    }
    throw new Error("Max retries exceeded");
}

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
  } else if (url.includes('threads.net/')) {
      type = SourceType.THREADS;
      // Ensure clean URL for proxy fetching
      targetUrl = url.split('?')[0]; 
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
          // General web scraping fallback (Works for Threads via Proxy text dump)
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

export const extractMediaUrlFromPage = async (url: string): Promise<string | null> => {
    try {
        let targetUrl = url;
        
        if (url.includes('t.me/') && !url.includes('/s/')) {
            targetUrl = url.replace('t.me/', 't.me/s/');
        }

        if (url.includes('x.com/') || url.includes('twitter.com/')) {
            targetUrl = url.replace('x.com', 'nitter.net').replace('twitter.com', 'nitter.net');
        }

        const html = await fetchWithProxyFallback(targetUrl);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const ogVideo = doc.querySelector('meta[property="og:video"]')?.getAttribute('content') ||
                        doc.querySelector('meta[property="og:video:url"]')?.getAttribute('content') ||
                        doc.querySelector('meta[property="og:video:secure_url"]')?.getAttribute('content');
        if (ogVideo) return ogVideo;

        const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || 
                        doc.querySelector('meta[property="og:image:url"]')?.getAttribute('content');
        if (ogImage) return ogImage;

        const twitterImage = doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
        if (twitterImage) return twitterImage;
        const twitterPlayer = doc.querySelector('meta[name="twitter:player:stream"]')?.getAttribute('content');
        if (twitterPlayer) return twitterPlayer;

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

      2. Identify the PRECISE LOCATION (City, Neighborhood, Street, Landmark) based on the text and visual cues. 
         - **CRITICAL**: The location and date are often VISIBLE IN THE IMAGE/VIDEO as text overlays, banners, or recognizable landmarks. Look for them explicitly.
         - You MUST estimate the numeric latitude and longitude for this specific location (e.g., specific intersection, square, or street).
         - Look for street signs, shop names, or famous buildings in the image.
         - Do not return 0,0. If exact street is unknown, use the neighborhood center. If neighborhood is unknown, use city center.

      3. Identify the DATE of the event based on the text or visual metadata cues (text overlays in the media are the most reliable source).

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
        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-pro-preview', 
            contents: {
                parts: [
                    { inlineData: { mimeType, data: base64Data } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 4000 }
            }
        }));

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

export const analyzeCrowdMedia = async (base64Data: string, mimeType: string): Promise<CrowdAnalysisResult | null> => {
    return analyzeCrowdPost(base64Data, mimeType, "No context provided.");
};

export const generateSituationReport = async (events: IntelEvent[], language: AppLanguage): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const condensedEvents = events.slice(0, 80).map(e => ({
      date: e.date,
      category: e.category,
      title: e.title,
      location: e.locationName,
      casualties: e.casualties
  }));

  const langName = { 'en': 'English', 'de': 'German', 'fa': 'Farsi', 'ar': 'Arabic' }[language];

  const prompt = `
    ROLE: Senior Military Intelligence Analyst.
    TASK: Generate a TACTICAL SITUATION REPORT (SITREP) based on the provided event logs.
    LANGUAGE: Write the report in ${langName}.
    
    DATA:
    ${JSON.stringify(condensedEvents)}

    REQUIREMENTS:
    1. STYLE: Strictly military/intelligence style. Use uppercase headers. Brief, punchy sentences. No fluff.
    2. FORMAT:
       [CLASSIFIED // EYES ONLY]
       DATE: [Current Date]
       SUBJECT: SITREP - ONGOING CIVIL UNREST

       1. EXECUTIVE SUMMARY
       [One sentence overview of the tactical situation]

       2. KEY ESCALATIONS
       - [Bullet point 1: Specific major incident]
       - [Bullet point 2: Specific major incident]

       3. CASUALTY ASSESSMENT
       [Concise summary of civilian vs security force impact]

       4. TACTICAL OUTLOOK
       [Prediction of next 24-48h activity]

       [END OF REPORT]
  `;

  try {
      const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
      }));
      return response.text || "Failed to generate report.";
  } catch (e) {
      return "Error generating situation report. Please check API Key or quota.";
  }
};

export const chatWithIntel = async (userMessage: string, contextEvents: IntelEvent[], language: AppLanguage, history: {role: 'user' | 'model', text: string}[]): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const contextData = contextEvents.map(e => `[${e.date}] ${e.title} at ${e.locationName}: ${e.summary} (Count: ${e.protestorCount})`).join('\n');
    const langName = { 'en': 'English', 'de': 'German', 'fa': 'Farsi', 'ar': 'Arabic' }[language];

    const systemPrompt = `
      You are an Intelligence Analyst Chatbot named "IntelNode AI".
      Your mission is to answer questions based STRICTLY on the provided intelligence data.
      
      DATA CONTEXT (Most recent 100 events):
      ${contextData}

      RULES:
      1. Answer in ${langName}.
      2. If the user asks about something not in the data, state that you have no intelligence on that topic.
      3. Be concise, objective, and analytical.
      4. Highlight patterns, clusters, or significant escalations if asked.
    `;

    try {
        const chat = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: { systemInstruction: systemPrompt },
            history: history.map(h => ({ role: h.role, parts: [{ text: h.text }] }))
        });

        const result = await callWithRetry<GenerateContentResponse>(() => chat.sendMessage({ message: userMessage }));
        return result.text || "No response generated.";
    } catch (e) {
        console.error("Chat failed", e);
        return "System Error: Unable to process query.";
    }
};

export const generateVideoBriefing = async (reportContent: string, language: AppLanguage): Promise<string | null> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Summarize the report into a prompt for Veo
    const summaryPrompt = `
      Summarize the following intelligence report into a single, highly descriptive visual prompt for a video generation model.
      The video should depict a futuristic, holographic tactical map room visualizing the conflict described.
      Key elements: Digital map of Iran, red alert indicators, data streams, dark cinematic lighting, 4k resolution.
      
      REPORT:
      ${reportContent.substring(0, 5000)}
    `;

    try {
        // 1. Get Visual Prompt
        const promptRes = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: summaryPrompt
        }));
        const visualPrompt = promptRes.text || "Futuristic tactical map of Iran with red alert markers and data streams.";

        // 2. Generate Video (Video generation usually has strict rate limits, allow retry)
        // Using <any> because operation types might vary or not be strictly exported as GenerateContentResponse
        let operation = await callWithRetry<any>(() => ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: visualPrompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9'
            }
        }));

        // 3. Poll for completion
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            // Polling might also need retry if network blips
            operation = await callWithRetry<any>(() => ai.operations.getVideosOperation({ operation: operation }));
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (downloadLink) {
            return `${downloadLink}&key=${process.env.API_KEY}`;
        }
        return null;

    } catch (e) {
        console.error("Video gen failed", e);
        throw e;
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
       - **PROTESTOR COUNT**: You MUST provide an integer estimate.
         - If text says "massive" or "huge crowd", estimate 3000-5000 based on context.
         - If "large group", estimate 500-1000.
         - If "scattered" or "small", estimate 50-100.
         - If a specific number range is given (e.g. "thousands"), use 2000.
       - **CASUALTIES**: CATEGORIZE into: 
          a) CIVILIANS/PROTESTORS: Dead (martyred/killed), Injured (wounded), Detained.
          b) SECURITY FORCES: Dead, Injured.
    3. BE GRANULAR: Separate entries for each city/location.

    EXTRACTION RULES:
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
      "sourceId": "string (The ID from the input text line 'ID: ...', if available)",
      "protestorCount": integer|null,
      "casualties": {
         "dead": integer,
         "injured": integer,
         "detained": integer
      },
      "securityCasualties": {
         "dead": integer,
         "injured": integer
      }
    }]
  `;

  try {
    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 4000 }
      }
    }));

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
      sourceId: item.sourceId, // New field mapped from extraction
      protestorCount: item.protestorCount || 0,
      casualties: {
        dead: item.casualties?.dead || 0,
        injured: item.casualties?.injured || 0,
        detained: item.casualties?.detained || 0
      },
      securityCasualties: {
        dead: item.securityCasualties?.dead || 0,
        injured: item.securityCasualties?.injured || 0
      },
      sourceType: type,
      sourceUrl: inputContent.split('\n')[0].replace('SOURCE_URL: ', '')
    }));
  } catch (e) {
    console.error("AI Extraction failed", e);
    return [];
  }
};
