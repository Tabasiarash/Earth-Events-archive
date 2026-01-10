
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { IntelEvent, EventCategory, SourceType, ProcessingStatus, AppLanguage, SyncConfig, ChannelMetadataMap, Casualties, CrowdAnalysisResult } from '../types';
import { extractMediaUrlFromPage, analyzeCrowdPost, fetchChannelPosts, chatWithIntel, generateVideoBriefing } from '../services/geminiService';
import { v4 as uuidv4 } from 'uuid';
import { 
  Upload, Map, Search, FileJson, Layers, Link as LinkIcon, 
  FileText, History, Calendar, Clock, Square, Globe, 
  RefreshCcw, Activity, Bell, BellOff, Zap, Play,
  Instagram, Twitter, Send, Navigation, XCircle, AlertCircle, BarChart3, TrendingUp, Users, Skull, HeartPulse, UserX,
  FileBarChart, PieChart, Flame, Target, Camera, Video, ImageIcon, List, ShieldAlert, MapPin, AtSign, Terminal, Cpu, Lock, Trash2,
  MessageSquare, Mic, PlayCircle, Film
} from 'lucide-react';

interface SidebarProps {
  events: IntelEvent[];
  totalEventCount: number;
  onIngestText: (text: string, region?: string) => void;
  onIngestUrl: (url: string, duration: string, region?: string) => void;
  onStopScan: () => void;
  status: ProcessingStatus;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectEvent: (event: IntelEvent) => void;
  selectedEventId?: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  filterCategory: string;
  setFilterCategory: (c: string) => void;
  filterStartDate: string;
  setFilterStartDate: (d: string) => void;
  filterEndDate: string;
  setFilterEndDate: (d: string) => void;
  timeRange?: string;
  onTimeRangeChange?: (range: string) => void;
  language: AppLanguage;
  setLanguage: (l: AppLanguage) => void;
  syncConfig: SyncConfig;
  onUpdateSyncConfig: (config: Partial<SyncConfig>) => void;
  isSyncing: boolean;
  channelMetadata: ChannelMetadataMap;
  onGenerateReport: () => void;
  reportContent?: string;
  isGeneratingReport: boolean;
  onAddEvents?: (events: IntelEvent[], shouldSelect?: boolean) => void;
  onRemoveSource: (url: string) => void;
}

const translations = {
  en: {
    archive: "Archive", sources: "Sources", ingest: "Ingest", analysis: "Analysis", crowd: "Crowd AI", chat: "Intel Chat",
    searchPlaceholder: "Search events...", allCategories: "All Categories",
    startDate: "Start Date", endDate: "End Date", save: "Save Data", load: "Load Data",
    channelLink: "Source Link", rawText: "Raw Text", channelUrlLabel: "Channel / Profile URL",
    scanDuration: "Scan Depth", startScan: "Start Analysis", processText: "Process Text",
    stopScan: "Stop Scanning", latest20: "Latest Activity", 
    lastMonth: "Last Month", last3Months: "Last 3 Months", 
    last6Months: "Last 6 Months", last12Months: "Last 12 Months",
    allHistory: "All History",
    noMatches: "No matches found.", noEvents: "Archive is empty.", noSources: "No active sources.",
    syncTooltip: "Sync New", resumeTooltip: "Resume Sync", continueTooltip: "Fetch Older",
    lastEvent: "Last activity:", autoSync: "Auto-Sync", interval: "Interval",
    monitoring: "Monitoring", lastSynced: "Synced:",
    regionalFocus: "Regional Focus (Optional)",
    regionalFocusHint: "e.g. Ukraine, Middle East, Iran",
    impact: "Casualty Analysis", totalProtestors: "Total Participants", totalDead: "Total Killed",
    totalInjured: "Total Wounded", totalDetained: "Total Detained", hotspots: "Active Conflict Zones",
    civilians: "CIVILIANS", security: "SECURITY FORCES",
    cats: {
      [EventCategory.MILITARY]: "Military", [EventCategory.POLITICAL]: "Political",
      [EventCategory.CYBER]: "Cyber", [EventCategory.TERRORISM]: "Terrorism",
      [EventCategory.CIVIL_UNREST]: "Unrest", [EventCategory.OTHER]: "Other"
    },
    categoryDistribution: "Event Categorization",
    sitRep: "Intelligence Briefing (AI)",
    generateReport: "Generate SITREP",
    generateVideo: "Generate Video Briefing",
    videoGenerating: "Synthesizing Video...",
    reportPlaceholder: "AWAITING COMMAND...",
    dropMedia: "Drop Image or Video here",
    orPaste: "OR PASTE POST URL(S)",
    analyzeCrowd: "Count Crowd",
    analyzing: "Analyzing...",
    crowdRes: "Crowd Analysis",
    minEst: "Min Est.", maxEst: "Max Est.", confidence: "Confidence", hazards: "Hazards",
    bulkScan: "Source Scanner", scanChannel: "Scan Channel", scanLinks: "Analyze Link(s)",
    channelPlaceholder: "https://t.me/s/..., https://threads.net/@...", linksPlaceholder: "Paste Instagram, Twitter, or Telegram links...",
    addToMap: "Analyze & Map",
    pinToMap: "Record & View on Map",
    chatPlaceholder: "Ask about events, patterns, or specific regions...",
    send: "Send",
    sourceInfo: "Source Info",
    timeRanges: {
        TODAY: "Today",
        RECENT: "Recent (3 Days)",
        LAST_WEEK: "Last Week (Default)",
        LAST_3_WEEKS: "Last 3 Weeks",
        LAST_3_MONTHS: "Last 3 Months",
        LAST_YEAR: "Last Year",
        ALL: "All History"
    }
  },
  fa: {
    archive: "آرشیو", sources: "منابع", ingest: "دریافت", analysis: "تحلیل", crowd: "شمارش جمعیت", chat: "چت هوشمند",
    searchPlaceholder: "جستجوی رویدادها...", allCategories: "همه دسته‌ها",
    startDate: "تاریخ شروع", endDate: "تاریخ پایان", save: "ذخیره داده‌ها", load: "بارگذاری داده‌ها",
    channelLink: "لینک منبع", rawText: "متن خام", channelUrlLabel: "آدرس کانال یا پروفایل",
    scanDuration: "عمق اسکن", startScan: "شروع تحلیل", processText: "پردازش متن",
    stopScan: "توقف اسکن", latest20: "آخرین فعالیت‌ها", 
    lastMonth: "ماه گذشته", last3Months: "۳ ماه گذشته", 
    last6Months: "۶ ماه گذشته", last12Months: "۱۲ ماه گذشته",
    allHistory: "تمام تاریخچه",
    noMatches: "موردی یافت نشد.", noEvents: "آرشیو خالی است.", noSources: "منبع فعالی وجود ندارد.",
    syncTooltip: "بروزرسانی", resumeTooltip: "ادامه همگام‌سازی", continueTooltip: "دریافت قدیمی‌ترها",
    lastEvent: "آخرین فعالیت:", autoSync: "همگام‌سازی خودکار", interval: "بازه زمانی",
    monitoring: "نظارت", lastSynced: "آخرین همگام‌سازی:",
    regionalFocus: "تمرکز منطقه‌ای (اختیاری)",
    regionalFocusHint: "مثلاً: اوکراین، خاورمیانه، ایران",
    impact: "تحلیل تلفات", totalProtestors: "مجموع شرکت‌کنندگان", totalDead: "مجموع کشته‌شدگان",
    totalInjured: "مجموع مجروحان", totalDetained: "مجموع بازداشت‌شدگان", hotspots: "کانون‌های درگیری فعال",
    civilians: "شهروندان", security: "نیروهای امنیتی",
    cats: {
      [EventCategory.MILITARY]: "نظامی", [EventCategory.POLITICAL]: "سیاسی",
      [EventCategory.CYBER]: "سایبری", [EventCategory.TERRORISM]: "تروریسم",
      [EventCategory.CIVIL_UNREST]: "ناآرامی مدنی", [EventCategory.OTHER]: "سایر"
    },
    categoryDistribution: "توزیع دسته‌بندی‌ها",
    sitRep: "گزارش اطلاعاتی (هوش مصنوعی)",
    generateReport: "تولید گزارش وضعیت",
    generateVideo: "تولید ویدیوی خلاصه",
    videoGenerating: "در حال ساخت ویدیو...",
    reportPlaceholder: "منتظر فرمان...",
    dropMedia: "تصویر یا ویدیو را اینجا بکشید",
    orPaste: "یا لینک پست (ها) را وارد کنید",
    analyzeCrowd: "شمارش جمعیت",
    analyzing: "در حال تحلیل...",
    crowdRes: "تحلیل جمعیت",
    minEst: "حداقل", maxEst: "حداکثر", confidence: "اطمینان", hazards: "خطرات",
    bulkScan: "اسکنر منبع", scanChannel: "اسکن کانال", scanLinks: "تحلیل لینک(ها)",
    channelPlaceholder: "https://t.me/s/..., https://threads.net/@...", linksPlaceholder: "لینک‌های اینستاگرام، توییتر یا تلگرام...",
    addToMap: "تحلیل و نقشه‌برداری",
    pinToMap: "ثبت و مشاهده روی نقشه",
    chatPlaceholder: "درباره رویدادها، الگوها یا مناطق خاص بپرسید...",
    send: "ارسال",
    sourceInfo: "اطلاعات منبع",
    timeRanges: {
        TODAY: "امروز",
        RECENT: "اخیر (۳ روز)",
        LAST_WEEK: "هفته گذشته (پیش‌فرض)",
        LAST_3_WEEKS: "۳ هفته گذشته",
        LAST_3_MONTHS: "۳ ماه گذشته",
        LAST_YEAR: "سال گذشته",
        ALL: "تمام تاریخچه"
    }
  }
};

const getSourceIcon = (type: SourceType) => {
  switch(type) {
    case SourceType.TELEGRAM: return <Send size={14} className="text-sky-400" />;
    case SourceType.INSTAGRAM: return <Instagram size={14} className="text-pink-400" />;
    case SourceType.TWITTER: return <Twitter size={14} className="text-slate-200" />;
    case SourceType.THREADS: return <AtSign size={14} className="text-slate-200" />;
    default: return <Globe size={14} className="text-cyan-400" />;
  }
};

const getCategoryColor = (category: EventCategory) => {
  switch (category) {
    case EventCategory.MILITARY: return 'bg-red-500';
    case EventCategory.POLITICAL: return 'bg-blue-500';
    case EventCategory.CYBER: return 'bg-emerald-500';
    case EventCategory.TERRORISM: return 'bg-orange-500';
    case EventCategory.CIVIL_UNREST: return 'bg-yellow-500';
    default: return 'bg-slate-500';
  }
};

const Sidebar: React.FC<SidebarProps> = ({ 
  events, totalEventCount, onIngestText, onIngestUrl, onStopScan, status, onExport, onImport,
  onSelectEvent, selectedEventId, searchTerm, setSearchTerm, filterCategory, setFilterCategory,
  filterStartDate, setFilterStartDate, filterEndDate, setFilterEndDate, timeRange, onTimeRangeChange,
  language, setLanguage,
  syncConfig, onUpdateSyncConfig, isSyncing, channelMetadata,
  onGenerateReport, reportContent, isGeneratingReport, onAddEvents, onRemoveSource
}) => {
  const [activeTab, setActiveTab] = useState<'events' | 'sources' | 'analysis' | 'ingest' | 'crowd' | 'chat'>('events');
  const [ingestMode, setIngestMode] = useState<'url' | 'text'>('url');
  const [scanDuration, setScanDuration] = useState<string>('LATEST_20');
  const [rawText, setRawText] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [regionFocus, setRegionFocus] = useState('');

  // Report & Video State
  const [displayedReport, setDisplayedReport] = useState('');
  const [loadingStep, setLoadingStep] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);

  // Crowd Analysis State
  const [crowdMediaData, setCrowdMediaData] = useState<string | null>(null);
  const [crowdMimeType, setCrowdMimeType] = useState<string | null>(null);
  const [crowdLink, setCrowdLink] = useState(''); 
  const [bulkLinks, setBulkLinks] = useState('');
  const [crowdResult, setCrowdResult] = useState<CrowdAnalysisResult | null>(null);
  const [isAnalyzingCrowd, setIsAnalyzingCrowd] = useState(false);
  const [scanType, setScanType] = useState<'channel' | 'links'>('channel');
  
  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'model', text: string}[]>([]);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportContainerRef = useRef<HTMLDivElement>(null);
  
  const t = (translations as Record<string, typeof translations.en>)[language] || translations.en;
  const isRtl = language === 'ar' || language === 'fa';

  const stats = useMemo(() => {
    let protestors = 0;
    let civDead = 0;
    let civInjured = 0;
    let civDetained = 0;
    let secDead = 0;
    let secInjured = 0;

    events.forEach(e => {
        protestors += (e.protestorCount || 0);
        civDead += (e.casualties?.dead || 0);
        civInjured += (e.casualties?.injured || 0);
        civDetained += (e.casualties?.detained || 0);
        secDead += (e.securityCasualties?.dead || 0);
        secInjured += (e.securityCasualties?.injured || 0);
    });
    return { protestors, civDead, civInjured, civDetained, secDead, secInjured };
  }, [events]);

  const sourcesList = useMemo(() => {
    const sourceMap: Record<string, { lastDate: string, count: number, type: SourceType }> = {};
    events.forEach(e => {
        if (!e.sourceUrl) return;
        if (!sourceMap[e.sourceUrl]) {
            sourceMap[e.sourceUrl] = { lastDate: e.date, count: 0, type: e.sourceType };
        }
        sourceMap[e.sourceUrl].count++;
        if (new Date(e.date) > new Date(sourceMap[e.sourceUrl].lastDate)) {
            sourceMap[e.sourceUrl].lastDate = e.date;
        }
    });
    return Object.entries(sourceMap).map(([url, data]) => ({ url, ...data }));
  }, [events]);

  // Loading sequence effect
  useEffect(() => {
    let interval: any;
    if (isGeneratingReport) {
      setDisplayedReport('');
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % 4);
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isGeneratingReport]);

  // Scroll to bottom of chat
  useEffect(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isChatThinking]);

  // Typewriter effect for Report
  useEffect(() => {
    if (!isGeneratingReport && reportContent) {
      let i = 0;
      setDisplayedReport('');
      const speed = 10; // ms per char
      const timer = setInterval(() => {
        setDisplayedReport(reportContent.substring(0, i));
        i += 2; // Type 2 chars at a time for speed
        if (reportContainerRef.current) {
            reportContainerRef.current.scrollTop = reportContainerRef.current.scrollHeight;
        }
        if (i > reportContent.length) clearInterval(timer);
      }, speed);
      return () => clearInterval(timer);
    }
  }, [reportContent, isGeneratingReport]);

  const handleChatSubmit = async () => {
      if (!chatInput.trim()) return;
      const userMsg = chatInput;
      setChatInput('');
      setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
      setIsChatThinking(true);

      try {
          // Provide filtered events as context to the chat
          const contextEvents = events.slice(0, 100); // Limit context size
          const response = await chatWithIntel(userMsg, contextEvents, language, chatHistory);
          setChatHistory(prev => [...prev, { role: 'model', text: response }]);
      } catch (e) {
          setChatHistory(prev => [...prev, { role: 'model', text: "Connection error. Please try again." }]);
      } finally {
          setIsChatThinking(false);
      }
  };

  const handleGenerateVideo = async () => {
      if (!reportContent) return;
      setIsVideoGenerating(true);
      setVideoUrl(null);
      try {
          const url = await generateVideoBriefing(reportContent, language);
          if (url) setVideoUrl(url);
          else alert("Failed to generate video.");
      } catch (e) {
          alert("Error generating video: " + (e as any).message);
      } finally {
          setIsVideoGenerating(false);
      }
  };

  // ... (ingest handlers same as before)
  const handleIngest = () => {
    if (ingestMode === 'text') {
      if (!rawText.trim()) return;
      onIngestText(rawText, regionFocus);
      setRawText('');
    } else {
      if (!channelUrl.trim()) return;
      onIngestUrl(channelUrl, scanDuration, regionFocus);
    }
  };

  const toggleMonitoring = (url: string, type: SourceType) => {
    const monitored = [...syncConfig.monitoredChannels];
    const exists = monitored.find(m => m.url === url);
    if (exists) {
      onUpdateSyncConfig({ monitoredChannels: monitored.filter(u => u.url !== url) });
    } else {
      onUpdateSyncConfig({ monitoredChannels: [...monitored, { url, type }] });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
            const result = evt.target.result as string;
            const base64 = result.split(',')[1];
            setCrowdMediaData(base64);
            setCrowdMimeType(file.type);
            setCrowdResult(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const performCrowdAnalysis = async (base64: string, mime: string, context: string, srcUrl: string, autoAdd: boolean) => {
      try {
          const result = await analyzeCrowdPost(base64, mime, context);
          if (result && result.minEstimate > 0) {
              const newEvent: IntelEvent = {
                  id: uuidv4(),
                  title: `Crowd: ${result.location || 'Unknown'} (${result.crowdType})`,
                  summary: result.description,
                  category: EventCategory.CIVIL_UNREST,
                  date: result.date || new Date().toISOString().split('T')[0],
                  locationName: result.location || "Unknown",
                  lat: result.lat || 0,
                  lng: result.lng || 0,
                  reliabilityScore: result.confidence === 'High' ? 9 : result.confidence === 'Medium' ? 7 : 5,
                  reliabilityReason: `Gemini Vision. ${result.confidence}. Hazards: ${result.hazards.join(', ')}`,
                  sourceType: SourceType.WEB,
                  sourceUrl: srcUrl,
                  protestorCount: Math.round((result.minEstimate + result.maxEstimate) / 2),
                  casualties: { dead: 0, injured: 0, detained: 0 },
                  isCrowdResult: true // Mark as a crowd result for fire icon
              };
              
              if (autoAdd) {
                  if (onAddEvents) onAddEvents([newEvent]);
              }
              return result;
          }
      } catch (e) {
          console.error("Failed to process event", e);
      }
      return null;
  };

  const handlePinCrowdResult = () => {
      if (!crowdResult) return;
      const newEvent: IntelEvent = {
          id: uuidv4(),
          title: `Crowd: ${crowdResult.location || 'Unknown'} (${crowdResult.crowdType})`,
          summary: crowdResult.description,
          category: EventCategory.CIVIL_UNREST,
          date: crowdResult.date || new Date().toISOString().split('T')[0],
          locationName: crowdResult.location || "Unknown",
          lat: crowdResult.lat || 0,
          lng: crowdResult.lng || 0,
          reliabilityScore: crowdResult.confidence === 'High' ? 9 : crowdResult.confidence === 'Medium' ? 7 : 5,
          reliabilityReason: `Gemini Vision. ${crowdResult.confidence}. Hazards: ${crowdResult.hazards.join(', ')}`,
          sourceType: SourceType.WEB,
          sourceUrl: "Manual Upload",
          protestorCount: Math.round((crowdResult.minEstimate + crowdResult.maxEstimate) / 2),
          casualties: { dead: 0, injured: 0, detained: 0 },
          isCrowdResult: true 
      };
      
      if (onAddEvents) {
          onAddEvents([newEvent], true); // Pass true to select the event after adding
      }
      
      // Optional: Clear result after adding
      setCrowdResult(null); 
      setCrowdMediaData(null);
      setCrowdMimeType(null);
  };

  const handleBulkScan = async () => {
      setIsAnalyzingCrowd(true);
      setCrowdResult(null);

      if (scanType === 'channel') {
          if (!crowdLink) return;
          try {
              const posts = await fetchChannelPosts(crowdLink);
              let processed = 0;
              for (const post of posts) {
                  try {
                      const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(post.mediaUrl || '')}`);
                      if (response.ok) {
                          const blob = await response.blob();
                          if (blob.size > 20 * 1024 * 1024) { console.warn("Skipping large file"); continue; }

                          const reader = new FileReader();
                          await new Promise<void>((resolve) => {
                              reader.onloadend = async () => {
                                  const base64 = (reader.result as string).split(',')[1];
                                  // Bulk scan adds events automatically (autoAdd = true)
                                  const res = await performCrowdAnalysis(base64, blob.type, post.text, post.url, true);
                                  if (res && processed === 0) setCrowdResult(res); 
                                  processed++;
                                  resolve();
                              };
                              reader.readAsDataURL(blob);
                          });
                      }
                  } catch (err) {
                      console.warn(`Skipping post ${post.id}`, err);
                  }
                  await new Promise(r => setTimeout(r, 1500));
              }
              if (processed === 0) alert("No processable media found (Check URL or CORS).");
          } catch (e) {
              console.error(e);
              alert("Channel scan failed.");
          }
      } else {
          // Bulk Links Logic
          const links = bulkLinks.split('\n').filter(l => l.trim().length > 0);
          let processed = 0;
          for (const link of links) {
               try {
                   const mediaUrl = await extractMediaUrlFromPage(link);
                   if (mediaUrl) {
                       const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(mediaUrl)}`);
                       if (response.ok) {
                           const blob = await response.blob();
                           if (blob.size > 20 * 1024 * 1024) { console.warn("Skipping large file"); continue; }
                           
                           const reader = new FileReader();
                           await new Promise<void>((resolve) => {
                               reader.onloadend = async () => {
                                   const base64 = (reader.result as string).split(',')[1];
                                   // Bulk scan adds events automatically (autoAdd = true)
                                   const res = await performCrowdAnalysis(base64, blob.type, "Link scan", link, true);
                                   if (res) setCrowdResult(res);
                                   processed++;
                                   resolve();
                               };
                               reader.readAsDataURL(blob);
                           });
                       }
                   }
                   await new Promise(r => setTimeout(r, 1000));
               } catch (e) { console.warn("Failed link", link); }
          }
          if (processed === 0) alert("No valid media found in links.");
      }
      setIsAnalyzingCrowd(false);
  };

  const runSingleCrowdAnalysis = async () => {
      if (!crowdMediaData || !crowdMimeType) return;
      setIsAnalyzingCrowd(true);
      try {
          // Single analysis does NOT auto add (autoAdd = false). Waits for "Pin to Map"
          const result = await performCrowdAnalysis(crowdMediaData, crowdMimeType, "Uploaded media", "Manual Upload", false);
          setCrowdResult(result);
      } catch (e) {
          alert("Analysis failed.");
      } finally {
          setIsAnalyzingCrowd(false);
      }
  };

  const loadingMessages = [
      "ESTABLISHING SECURE CONNECTION...",
      "AGGREGATING FIELD REPORTS...",
      "ANALYZING PATTERNS...",
      "DECRYPTING INTELLIGENCE..."
  ];

  return (
    <div className={`w-80 h-full bg-slate-900 border-r border-slate-700 flex flex-col font-sans z-10 shadow-xl ${isRtl ? 'border-l border-r-0' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Brand Header */}
      <div className="p-4 bg-slate-900 border-b border-slate-800">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <div className="bg-cyan-600 p-1.5 rounded-lg shadow-lg shadow-cyan-900/40">
              <Map className="text-white" size={18} />
            </div>
            <h1 className="font-extrabold text-lg text-white tracking-tight uppercase">Intel<span className="text-cyan-500">Node</span></h1>
          </div>
          <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value as AppLanguage)}
              className="bg-slate-800 border border-slate-700 text-[10px] text-slate-300 rounded-md px-2 py-1 focus:ring-1 focus:ring-cyan-500 outline-none"
          >
              <option value="en">EN</option>
              <option value="de">DE</option>
              <option value="fa">FA</option>
              <option value="ar">AR</option>
          </select>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1"><Activity size={10}/> SCANNER_ACTIVE: V2.6</p>
          {isSyncing && (
             <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-bold bg-cyan-900/20 px-2 py-0.5 rounded-full border border-cyan-800/30">
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping"></div> SYNC_IN_PROGRESS
             </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex bg-slate-900/50 p-1 mx-2 mt-2 rounded-xl border border-slate-800/50 overflow-x-auto no-scrollbar gap-1">
        <button onClick={() => setActiveTab('events')} className={`flex-1 min-w-[50px] py-2 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'events' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t.archive}</button>
        <button onClick={() => setActiveTab('sources')} className={`flex-1 min-w-[50px] py-2 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'sources' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t.sources}</button>
        <button onClick={() => setActiveTab('analysis')} className={`flex-1 min-w-[50px] py-2 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'analysis' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t.analysis}</button>
        <button onClick={() => setActiveTab('chat')} className={`flex-1 min-w-[50px] py-2 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'chat' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t.chat}</button>
        <button onClick={() => setActiveTab('crowd')} className={`flex-1 min-w-[50px] py-2 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'crowd' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t.crowd}</button>
        <button onClick={() => setActiveTab('ingest')} className={`flex-1 min-w-[50px] py-2 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'ingest' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t.ingest}</button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col mt-2">
        {activeTab === 'events' && (
          <div className="h-full flex flex-col">
            <div className="p-3 space-y-3 border-b border-slate-800/80">
              {/* Search and Filters */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                <input 
                  type="text" placeholder={t.searchPlaceholder}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-cyan-500 transition-all placeholder:text-slate-600"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                 <div className="relative flex-1">
                    <Calendar size={12} className="absolute left-2.5 top-2 text-slate-500" />
                    <select 
                        value={timeRange} 
                        onChange={(e) => onTimeRangeChange && onTimeRangeChange(e.target.value)}
                        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-7 pr-2 py-1.5 text-xs text-white outline-none focus:border-cyan-500 appearance-none truncate"
                    >
                        {Object.entries(t.timeRanges).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                 </div>
                 <select 
                  className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-500 appearance-none truncate"
                  value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="ALL">{t.allCategories}</option>
                  {Object.values(EventCategory).map(c => <option key={c} value={c}>{t.cats[c]}</option>)}
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-2 py-10">
                   <FileText size={40} className="opacity-20" />
                   <p className="text-xs font-medium">{t.noEvents}</p>
                </div>
              ) : 
                events.map(event => (
                  <div 
                    key={event.id} 
                    onClick={() => onSelectEvent(event)} 
                    className={`p-3 rounded-xl border cursor-pointer transition-all hover:translate-x-1 ${selectedEventId === event.id ? 'bg-slate-800/80 border-cyan-500 shadow-lg shadow-cyan-900/10 ring-1 ring-cyan-500/20' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${getCategoryColor(event.category)}`}></div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{t.cats[event.category]}</span>
                      </div>
                      <span className="text-[9px] text-slate-600 font-mono bg-slate-950 px-1.5 py-0.5 rounded">{event.date}</span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-100 mb-1 leading-tight line-clamp-2">{event.title}</h4>
                    <div className="flex justify-between items-center mt-2">
                        <div className="flex items-center gap-1 text-[9px] text-slate-500">
                          <Navigation size={8} /> <span>{event.locationName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {(event.protestorCount || 0) > 0 && <span className="text-[9px] text-cyan-400 font-bold flex items-center gap-1"><Users size={8}/> {(event.protestorCount || 0) >= 1000 ? ((event.protestorCount||0)/1000).toFixed(1)+'k' : event.protestorCount}</span>}
                            {(event.casualties?.dead || 0) > 0 && <span className="text-[9px] text-red-500 font-bold flex items-center gap-1"><Skull size={8}/> {event.casualties?.dead}</span>}
                        </div>
                    </div>
                    {/* ADDED: Source URL Display */}
                    {selectedEventId === event.id && event.sourceUrl && (
                        <div className="mt-3 pt-2 border-t border-slate-700/50 flex flex-col gap-1">
                            <span className="text-[9px] font-bold text-slate-500 uppercase">{t.sourceInfo}</span>
                            <div className="flex items-center gap-2 text-[10px] text-cyan-400 break-all bg-slate-950/30 p-1.5 rounded">
                                {getSourceIcon(event.sourceType)}
                                <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline opacity-90">{event.sourceUrl}</a>
                            </div>
                        </div>
                    )}
                  </div>
                ))
              }
            </div>
          </div>
        )}
        
        {/* ... Sources Tab ... */}
        {activeTab === 'sources' && (
           <div className="h-full overflow-y-auto p-3 space-y-4 custom-scrollbar">
             {/* ... Source list same as before ... */}
              <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-3 shadow-inner">
                <div className="flex items-center justify-between mb-3">
                   <div className="flex items-center gap-2">
                    <Zap size={14} className={syncConfig.enabled ? 'text-cyan-400' : 'text-slate-500'} />
                    <span className="text-[11px] font-bold text-white uppercase">{t.autoSync}</span>
                   </div>
                   <button onClick={() => onUpdateSyncConfig({ enabled: !syncConfig.enabled })} className={`w-10 h-5 rounded-full relative transition-colors ${syncConfig.enabled ? 'bg-cyan-600' : 'bg-slate-700'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow transition-all ${syncConfig.enabled ? (isRtl ? 'left-1' : 'right-1') : (isRtl ? 'right-1' : 'left-1')}`} /></button>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase font-mono">
                   <span>Freq: {syncConfig.intervalMinutes}m</span>
                   {syncConfig.lastSyncTimestamp && <span>Last: {new Date(syncConfig.lastSyncTimestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>}
                </div>
             </div>
             {sourcesList.length === 0 ? (
               <div className="text-center text-slate-600 text-xs py-20">{t.noSources}</div>
             ) : 
               sourcesList.map(source => (
                 <div key={source.url} className="bg-slate-800/20 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-all group">
                     {/* Source Item */}
                     <div className="flex justify-between items-start mb-3">
                         <div className="overflow-hidden flex-1">
                             <div className="flex items-center gap-2 mb-1.5">
                               {getSourceIcon(source.type)} 
                               <span className="text-xs font-bold text-slate-200 truncate">{source.url.split('/').pop() || 'Unknown'}</span>
                             </div>
                             <p className="text-[10px] text-slate-500 truncate font-mono opacity-60" dir="ltr">{source.url}</p>
                         </div>
                         <div className="flex gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => toggleMonitoring(source.url, source.type)} className={`p-1.5 rounded-lg transition-colors ${syncConfig.monitoredChannels.some(m => m.url === source.url) ? 'bg-cyan-900/40 text-cyan-400' : 'text-slate-500 hover:bg-slate-800'}`}>{syncConfig.monitoredChannels.some(m => m.url === source.url) ? <Bell size={14}/> : <BellOff size={14}/>}</button>
                            <button onClick={() => onIngestUrl(source.url, 'RESUME')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"><RefreshCcw size={14}/></button>
                            <button onClick={() => onRemoveSource(source.url)} className="p-1.5 rounded-lg text-slate-500 hover:bg-red-900/30 hover:text-red-400 transition-colors" title="Delete Source & Data"><Trash2 size={14}/></button>
                         </div>
                     </div>
                     <div className="flex items-center justify-between pt-3 border-t border-slate-800/50 text-[10px]">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Activity size={10} className="text-cyan-500"/>
                          <span>{source.count} events</span>
                        </div>
                        <span className="text-slate-600 italic">{t.lastEvent} {source.lastDate.split('T')[0]}</span>
                     </div>
                 </div>
               ))
             }
           </div>
        )}

        {/* ANALYSIS TAB - IMPROVED TERMINAL & CASUALTIES & VIDEO */}
        {activeTab === 'analysis' && (
           <div className="h-full overflow-y-auto p-4 space-y-6 custom-scrollbar">
              <div className="space-y-2">
                 <h3 className="text-xs font-extrabold text-white uppercase tracking-widest flex items-center gap-2">
                    <FileBarChart size={14} className="text-cyan-400"/> {t.sitRep}
                 </h3>
                 
                 {/* TACTICAL TERMINAL */}
                 <div className="bg-black border border-slate-700 rounded-lg overflow-hidden flex flex-col shadow-2xl relative">
                    {/* Terminal Header */}
                    <div className="bg-slate-800/80 px-2 py-1 flex items-center justify-between border-b border-slate-700">
                        <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                            <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                            <div className="w-2 h-2 rounded-full bg-green-500/50"></div>
                        </div>
                        <span className="text-[8px] font-mono text-slate-400 tracking-widest flex items-center gap-1"><Lock size={8}/> TOP SECRET // EYES ONLY</span>
                    </div>
                    
                    {/* Terminal Content Area */}
                    <div ref={reportContainerRef} className="p-3 min-h-[200px] max-h-[250px] overflow-y-auto custom-scrollbar font-mono text-[10px] leading-relaxed relative">
                        {/* Scanlines Effect */}
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 pointer-events-none bg-[length:100%_4px,3px_100%]"></div>
                        
                        {isGeneratingReport ? (
                            <div className="text-cyan-500 h-full flex flex-col items-center justify-center space-y-2">
                                <Cpu size={24} className="animate-pulse text-cyan-400"/>
                                <span className="animate-pulse tracking-widest font-bold">{loadingMessages[loadingStep]}</span>
                                <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden mt-2">
                                    <div className="h-full bg-cyan-500 animate-[width_1s_ease-in-out_infinite]" style={{width: '30%'}}></div>
                                </div>
                            </div>
                        ) : displayedReport ? (
                            <div className="text-green-400 whitespace-pre-wrap">
                                {displayedReport}
                                <span className="inline-block w-2 h-3 bg-green-400 ml-1 animate-pulse align-middle"></span>
                            </div>
                        ) : (
                            <div className="text-slate-600 italic h-full flex items-center justify-center opacity-50">
                                {t.reportPlaceholder}
                            </div>
                        )}
                    </div>
                 </div>

                 <button 
                    onClick={onGenerateReport} 
                    disabled={isGeneratingReport || events.length === 0}
                    className="w-full mt-1 py-3 bg-cyan-900/30 hover:bg-cyan-900/60 border border-cyan-500/30 hover:border-cyan-400 text-cyan-400 text-[10px] font-extrabold uppercase rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 group shadow-lg shadow-cyan-900/20"
                 >
                    {isGeneratingReport ? <RefreshCcw size={12} className="animate-spin"/> : <Terminal size={12} className="group-hover:text-cyan-200 transition-colors"/>}
                    {t.generateReport}
                 </button>

                 {/* Video Generation Button */}
                 {reportContent && !isGeneratingReport && (
                     <div className="mt-2">
                         {videoUrl ? (
                             <div className="rounded-lg overflow-hidden border border-cyan-500/50 shadow-lg shadow-cyan-900/20">
                                 <video controls src={videoUrl} className="w-full" />
                             </div>
                         ) : (
                             <button
                                onClick={handleGenerateVideo}
                                disabled={isVideoGenerating}
                                className="w-full py-3 bg-fuchsia-900/30 hover:bg-fuchsia-900/60 border border-fuchsia-500/30 hover:border-fuchsia-400 text-fuchsia-400 text-[10px] font-extrabold uppercase rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 group shadow-lg shadow-fuchsia-900/20"
                             >
                                 {isVideoGenerating ? <Film size={12} className="animate-bounce"/> : <PlayCircle size={12} className="group-hover:text-fuchsia-200 transition-colors"/>}
                                 {isVideoGenerating ? t.videoGenerating : t.generateVideo}
                             </button>
                         )}
                     </div>
                 )}
              </div>

              {/* Impact Summary */}
              <div className="space-y-1">
                 <h3 className="text-xs font-extrabold text-white uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp size={14} className="text-cyan-400"/> {t.impact}
                 </h3>
                 <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 mb-2">
                      <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-slate-400">
                             <Users size={12}/> <span className="text-[9px] font-bold uppercase">{t.totalProtestors}</span>
                          </div>
                          <p className="text-xl font-black text-cyan-400 font-mono">{(stats.protestors / 1000).toFixed(1)}K</p>
                      </div>
                 </div>

                 <div className="grid grid-cols-1 gap-2">
                    {/* Civilians */}
                    <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-800">
                       <h5 className="text-[9px] font-bold text-slate-500 uppercase mb-2 ml-1 flex items-center gap-1"><UserX size={10}/> {t.civilians}</h5>
                       <div className="grid grid-cols-3 gap-2">
                          <div className="text-center bg-red-900/10 rounded p-1 border border-red-900/20">
                             <span className="block text-[8px] text-red-500 uppercase font-bold">{t.totalDead}</span>
                             <span className="text-sm font-bold text-white">{stats.civDead}</span>
                          </div>
                          <div className="text-center bg-yellow-900/10 rounded p-1 border border-yellow-900/20">
                             <span className="block text-[8px] text-yellow-500 uppercase font-bold">{t.totalInjured}</span>
                             <span className="text-sm font-bold text-white">{stats.civInjured}</span>
                          </div>
                          <div className="text-center bg-blue-900/10 rounded p-1 border border-blue-900/20">
                             <span className="block text-[8px] text-blue-500 uppercase font-bold">{t.totalDetained}</span>
                             <span className="text-sm font-bold text-white">{stats.civDetained}</span>
                          </div>
                       </div>
                    </div>

                    {/* Security Forces */}
                    <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-800">
                       <h5 className="text-[9px] font-bold text-slate-500 uppercase mb-2 ml-1 flex items-center gap-1"><ShieldAlert size={10}/> {t.security}</h5>
                       <div className="grid grid-cols-2 gap-2">
                          <div className="text-center bg-slate-800 rounded p-1 border border-slate-700">
                             <span className="block text-[8px] text-slate-400 uppercase font-bold">{t.totalDead}</span>
                             <span className="text-sm font-bold text-white">{stats.secDead}</span>
                          </div>
                          <div className="text-center bg-slate-800 rounded p-1 border border-slate-700">
                             <span className="block text-[8px] text-slate-400 uppercase font-bold">{t.totalInjured}</span>
                             <span className="text-sm font-bold text-white">{stats.secInjured}</span>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        )}

        {/* CHAT TAB (NEW) */}
        {activeTab === 'chat' && (
            <div className="h-full flex flex-col p-2">
                <div className="flex-1 overflow-y-auto space-y-4 p-2 custom-scrollbar">
                    {chatHistory.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50 space-y-2">
                            <MessageSquare size={32}/>
                            <p className="text-xs text-center px-4">{t.chatPlaceholder}</p>
                        </div>
                    ) : (
                        chatHistory.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-lg p-3 text-xs leading-relaxed ${msg.role === 'user' ? 'bg-cyan-900/50 text-white rounded-br-none border border-cyan-800' : 'bg-slate-800 text-slate-300 rounded-bl-none border border-slate-700'}`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))
                    )}
                    {isChatThinking && (
                        <div className="flex justify-start">
                            <div className="bg-slate-800 rounded-lg p-3 rounded-bl-none border border-slate-700 flex gap-1">
                                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></div>
                                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-100"></div>
                                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-200"></div>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>
                <div className="mt-2 bg-slate-900 border border-slate-700 rounded-xl flex items-center p-1.5 gap-2">
                    <input 
                        type="text" 
                        className="bg-transparent text-xs text-white flex-1 outline-none px-2 placeholder:text-slate-600"
                        placeholder={t.chatPlaceholder}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleChatSubmit()}
                        disabled={isChatThinking}
                    />
                    <button 
                        onClick={handleChatSubmit} 
                        disabled={!chatInput.trim() || isChatThinking}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white p-2 rounded-lg disabled:opacity-50 disabled:grayscale transition-all"
                    >
                        <Send size={14}/>
                    </button>
                </div>
            </div>
        )}
        
        {/* ... Crowd & Ingest Tabs same ... */}
        {activeTab === 'crowd' && (
           <div className="h-full flex flex-col p-4 custom-scrollbar overflow-y-auto">
              <div className="space-y-6">
                  {/* ... Crowd Scanning UI ... */}
                  <div className="bg-slate-800/20 border border-slate-800 rounded-xl p-3">
                      <h4 className="text-[10px] font-bold text-cyan-500 uppercase mb-3 flex items-center gap-2"><List size={12}/> {t.bulkScan}</h4>
                      
                      <div className="flex bg-slate-900 rounded-lg p-1 mb-3 border border-slate-800">
                          <button onClick={() => setScanType('channel')} className={`flex-1 text-[10px] py-1.5 rounded transition-all ${scanType === 'channel' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>{t.scanChannel}</button>
                          <button onClick={() => setScanType('links')} className={`flex-1 text-[10px] py-1.5 rounded transition-all ${scanType === 'links' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>{t.scanLinks}</button>
                      </div>

                      {scanType === 'channel' ? (
                          <input 
                            type="text" 
                            placeholder={t.channelPlaceholder}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-xs text-white focus:border-cyan-500 outline-none placeholder:text-slate-600 mb-2"
                            value={crowdLink}
                            onChange={(e) => setCrowdLink(e.target.value)}
                          />
                      ) : (
                          <textarea 
                            placeholder={t.linksPlaceholder}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-[10px] text-white focus:border-cyan-500 outline-none placeholder:text-slate-600 mb-2 min-h-[80px]"
                            value={bulkLinks}
                            onChange={(e) => setBulkLinks(e.target.value)}
                          />
                      )}

                      <button 
                         onClick={handleBulkScan}
                         disabled={isAnalyzingCrowd || (scanType === 'channel' ? !crowdLink : !bulkLinks)}
                         className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                         {isAnalyzingCrowd ? <RefreshCcw size={12} className="animate-spin"/> : <Layers size={12}/>}
                         {isAnalyzingCrowd ? t.analyzing : t.addToMap}
                      </button>
                  </div>

                  {/* Single Upload Area */}
                  <div className="relative flex py-2 items-center">
                      <div className="flex-grow border-t border-slate-800"></div>
                      <span className="flex-shrink-0 mx-4 text-slate-600 text-[9px] uppercase">Single File Upload</span>
                      <div className="flex-grow border-t border-slate-800"></div>
                  </div>

                  <div 
                    className="border-2 border-dashed border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-cyan-500/50 hover:bg-slate-800/30 transition-all bg-slate-800/20"
                    onClick={() => fileInputRef.current?.click()}
                  >
                     <input 
                       type="file" 
                       className="hidden" 
                       ref={fileInputRef} 
                       accept="image/*,video/*"
                       onChange={handleFileUpload}
                     />
                     <div className="bg-slate-800 p-3 rounded-full shadow-lg">
                        {crowdMimeType?.startsWith('video') ? <Video size={24} className="text-cyan-400"/> : <Camera size={24} className="text-cyan-400"/>}
                     </div>
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">{t.dropMedia}</span>
                  </div>

                  {crowdMediaData && (
                     <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-950 relative group">
                        {crowdMimeType?.startsWith('video') ? (
                            <div className="w-full aspect-video flex items-center justify-center bg-black">
                                <Video size={32} className="text-slate-600"/>
                                <span className="text-[10px] text-slate-500 absolute bottom-2">Video loaded (Preview disabled)</span>
                            </div>
                        ) : (
                            <img src={`data:${crowdMimeType};base64,${crowdMediaData}`} className="w-full h-auto object-cover max-h-48" />
                        )}
                        <button 
                           onClick={() => {setCrowdMediaData(null); setCrowdMimeType(null); setCrowdResult(null);}} 
                           className="absolute top-2 right-2 bg-black/50 hover:bg-red-900/80 p-1 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                           <XCircle size={14} />
                        </button>
                     </div>
                  )}

                  <button 
                     onClick={runSingleCrowdAnalysis}
                     disabled={!crowdMediaData || isAnalyzingCrowd}
                     className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-extrabold text-xs uppercase tracking-widest transition-all shadow-xl shadow-cyan-900/20 disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
                  >
                     {isAnalyzingCrowd ? <RefreshCcw size={14} className="animate-spin"/> : <Users size={14}/>}
                     {isAnalyzingCrowd ? t.analyzing : t.analyzeCrowd}
                  </button>

                  {crowdResult && (
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              <Activity size={12} className="text-cyan-400"/> {t.crowdRes}
                          </h4>
                          <div className="grid grid-cols-2 gap-3">
                              <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                  <span className="text-[9px] text-slate-500 uppercase font-bold block mb-1">{t.minEst}</span>
                                  <span className="text-xl font-black text-white font-mono">{crowdResult.minEstimate.toLocaleString()}</span>
                              </div>
                              <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                  <span className="text-[9px] text-slate-500 uppercase font-bold block mb-1">{t.maxEst}</span>
                                  <span className="text-xl font-black text-white font-mono">{crowdResult.maxEstimate.toLocaleString()}</span>
                              </div>
                          </div>
                          {/* ... rest of result dashboard */}
                          <div className="space-y-2">
                             <div className="flex justify-between items-center text-[10px] border-b border-slate-800 pb-1">
                                <span className="text-slate-400">{t.confidence}</span>
                                <span className={`font-bold ${crowdResult.confidence === 'High' ? 'text-emerald-400' : crowdResult.confidence === 'Medium' ? 'text-yellow-400' : 'text-red-400'}`}>{crowdResult.confidence}</span>
                             </div>
                             {crowdResult.location && (
                                 <div className="flex justify-between items-center text-[10px] border-b border-slate-800 pb-1">
                                    <span className="text-slate-400">Loc</span>
                                    <span className="text-cyan-400 font-medium truncate max-w-[150px]">{crowdResult.location}</span>
                                 </div>
                             )}
                             <div className="flex justify-between items-center text-[10px] border-b border-slate-800 pb-1">
                                <span className="text-slate-400">Type</span>
                                <span className="text-white font-medium">{crowdResult.crowdType}</span>
                             </div>
                             
                             <button 
                                onClick={handlePinCrowdResult}
                                className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg"
                             >
                                <MapPin size={12} /> {t.pinToMap}
                             </button>
                          </div>
                      </div>
                  )}
              </div>
           </div>
        )}

        {/* ... Ingest Tab same ... */}
        {activeTab === 'ingest' && (
          <div className="h-full flex flex-col p-4">
             {/* ... */}
             <div className="flex bg-slate-800 p-1 rounded-xl mb-5 border border-slate-700/50">
              <button onClick={() => setIngestMode('url')} className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${ingestMode === 'url' ? 'bg-cyan-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>{t.channelLink}</button>
              <button onClick={() => setIngestMode('text')} className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${ingestMode === 'text' ? 'bg-cyan-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>{t.rawText}</button>
            </div>
            
            <div className="flex-1 space-y-5 overflow-y-auto pr-1 custom-scrollbar">
              {ingestMode === 'url' ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 uppercase font-bold ml-1">{t.channelUrlLabel}</label>
                    <div className="relative">
                      <LinkIcon size={12} className="absolute left-3 top-2.5 text-slate-500" />
                      <input 
                        type="text" 
                        placeholder={t.channelPlaceholder}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 pl-9 pr-3 text-xs text-white focus:border-cyan-500 outline-none transition-all placeholder:text-slate-700" 
                        value={channelUrl} 
                        onChange={(e) => setChannelUrl(e.target.value)} 
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 uppercase font-bold ml-1">{t.scanDuration}</label>
                    <div className="relative">
                      <Clock size={12} className="absolute left-3 top-2.5 text-slate-500" />
                      <select 
                        value={scanDuration} 
                        onChange={(e) => setScanDuration(e.target.value)} 
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 pl-9 pr-3 text-xs text-white focus:border-cyan-500 outline-none appearance-none cursor-pointer"
                      >
                          <option value="LATEST_20">{t.latest20}</option>
                          <option value="1_MONTH">{t.lastMonth}</option>
                          <option value="3_MONTHS">{t.last3Months}</option>
                          <option value="6_MONTHS">{t.last6Months}</option>
                          <option value="12_MONTHS">{t.last12Months}</option>
                          <option value="ALL">{t.allHistory}</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 h-full flex flex-col">
                  <label className="text-[10px] text-slate-500 uppercase font-bold ml-1">{t.rawText}</label>
                  <textarea 
                    placeholder="Paste news reports or posts..." 
                    className="w-full flex-1 min-h-[160px] bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white resize-none focus:border-cyan-500 outline-none transition-all placeholder:text-slate-700" 
                    value={rawText} 
                    onChange={(e) => setRawText(e.target.value)} 
                  />
                </div>
              )}

              {/* Spatial Filter Field */}
              <div className="pt-4 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between mb-1">
                   <label className="text-[10px] text-cyan-500 uppercase font-bold ml-1 flex items-center gap-1">
                    <Navigation size={10} /> {t.regionalFocus}
                   </label>
                   {regionFocus && <button onClick={() => setRegionFocus('')} className="text-[9px] text-slate-500 hover:text-white">Clear</button>}
                </div>
                <input 
                  type="text" 
                  placeholder={t.regionalFocusHint}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs text-white focus:border-cyan-500 outline-none transition-all placeholder:text-slate-700 shadow-inner"
                  value={regionFocus}
                  onChange={(e) => setRegionFocus(e.target.value)}
                />
              </div>
            </div>

            {/* Action Buttons Section */}
            <div className="mt-6 space-y-3">
              {status.isProcessing ? (
                <div className="space-y-2">
                   {/* Processing status view */}
                  <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50 animate-pulse">
                     <div className="flex items-center gap-3 mb-2">
                       <RefreshCcw size={14} className="animate-spin text-cyan-400" />
                       <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Processing Data...</span>
                     </div>
                     <p className="text-[10px] text-slate-400 font-mono leading-tight">{status.message}</p>
                  </div>
                  <button 
                    onClick={onStopScan} 
                    className="w-full py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-xl font-bold text-xs uppercase transition-all flex items-center justify-center gap-2 tracking-widest shadow-lg shadow-red-900/10"
                  >
                    <XCircle size={14} /> {t.stopScan}
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleIngest} 
                  disabled={ingestMode === 'url' ? !channelUrl : !rawText} 
                  className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-extrabold text-xs uppercase tracking-widest transition-all shadow-xl shadow-cyan-900/20 disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-2"
                >
                  <Zap size={14} fill="currentColor" /> {t.startScan}
                </button>
              )}

              {/* Status / Error Toast-like message */}
              {status.message && !status.isProcessing && (
                <div className={`p-3 rounded-lg border text-[10px] font-medium text-center animate-in fade-in slide-in-from-bottom-2 ${status.error ? 'bg-red-900/10 border-red-800/30 text-red-400' : 'bg-emerald-900/10 border-emerald-800/30 text-emerald-400'}`}>
                  {status.error ? (
                    <div className="flex items-center justify-center gap-2"><AlertCircle size={12}/> {status.error}</div>
                  ) : (
                    status.message
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Persistent Save/Load Footer */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2 shrink-0">
          <button onClick={onExport} className="flex-1 bg-slate-800 text-[10px] font-bold py-3 rounded-lg flex items-center justify-center gap-1.5 border border-slate-700 hover:bg-slate-700 transition-colors uppercase"><FileJson size={12}/>{t.save}</button>
          <label className="flex-1 bg-slate-800 text-[10px] font-bold py-3 rounded-lg flex items-center justify-center gap-1.5 border border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer uppercase">
              <Upload size={12}/>{t.load}
              <input 
                type="file" 
                className="hidden" 
                accept=".json" 
                onChange={onImport} 
                onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
              />
          </label>
      </div>
    </div>
  );
};

export default Sidebar;
