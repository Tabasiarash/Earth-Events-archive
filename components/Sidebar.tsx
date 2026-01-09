
import React, { useState, useMemo, useRef } from 'react';
import { IntelEvent, EventCategory, SourceType, ProcessingStatus, AppLanguage, SyncConfig, ChannelMetadataMap, Casualties, CrowdAnalysisResult } from '../types';
import { extractMediaUrlFromPage, analyzeCrowdPost, fetchChannelPosts } from '../services/geminiService';
import { v4 as uuidv4 } from 'uuid';
import { 
  Upload, Map, Search, FileJson, Layers, Link as LinkIcon, 
  FileText, History, Calendar, Clock, Square, Globe, 
  RefreshCcw, Activity, Bell, BellOff, Zap, Play,
  Instagram, Twitter, Send, Navigation, XCircle, AlertCircle, BarChart3, TrendingUp, Users, Skull, HeartPulse, UserX,
  FileBarChart, PieChart, Flame, Target, Camera, Video, ImageIcon, List
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
  onAddEvents?: (events: IntelEvent[]) => void;
}

const translations = {
  en: {
    archive: "Archive", sources: "Sources", ingest: "Ingest", analysis: "Analysis", crowd: "Crowd AI",
    searchPlaceholder: "Search events...", allCategories: "All Categories",
    startDate: "Start Date", endDate: "End Date", save: "Save", load: "Load",
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
    impact: "Impact Summary", totalProtestors: "Total Protestors", totalDead: "Total Killed",
    totalInjured: "Total Wounded", totalDetained: "Total Detained", hotspots: "Active Conflict Zones",
    cats: {
      [EventCategory.MILITARY]: "Military", [EventCategory.POLITICAL]: "Political",
      [EventCategory.CYBER]: "Cyber", [EventCategory.TERRORISM]: "Terrorism",
      [EventCategory.CIVIL_UNREST]: "Unrest", [EventCategory.OTHER]: "Other"
    },
    categoryDistribution: "Event Categorization",
    sitRep: "Intelligence Briefing (AI)",
    generateReport: "Generate Situation Report",
    reportPlaceholder: "Click generate to analyze current filtered events...",
    dropMedia: "Drop Image or Video here",
    orPaste: "OR PASTE POST URL(S)",
    analyzeCrowd: "Count Crowd",
    analyzing: "Analyzing...",
    crowdRes: "Crowd Analysis",
    minEst: "Min Est.", maxEst: "Max Est.", confidence: "Confidence", hazards: "Hazards",
    bulkScan: "Source Scanner", scanChannel: "Scan Channel", scanLinks: "Analyze Link(s)",
    channelPlaceholder: "https://t.me/s/channel...", linksPlaceholder: "Paste Instagram, Twitter, or Telegram links...",
    addToMap: "Analyze & Map",
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
    archive: "آرشیو", sources: "منابع", ingest: "دریافت", analysis: "تحلیل", crowd: "شمارش جمعیت",
    searchPlaceholder: "جستجوی رویدادها...", allCategories: "همه دسته‌ها",
    startDate: "تاریخ شروع", endDate: "تاریخ پایان", save: "ذخیره", load: "بارگذاری",
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
    impact: "خلاصه تاثیرات", totalProtestors: "مجموع معترضان", totalDead: "مجموع کشته‌شدگان",
    totalInjured: "مجموع مجروحان", totalDetained: "مجموع بازداشت‌شدگان", hotspots: "کانون‌های درگیری فعال",
    cats: {
      [EventCategory.MILITARY]: "نظامی", [EventCategory.POLITICAL]: "سیاسی",
      [EventCategory.CYBER]: "سایبری", [EventCategory.TERRORISM]: "تروریسم",
      [EventCategory.CIVIL_UNREST]: "ناآرامی مدنی", [EventCategory.OTHER]: "سایر"
    },
    categoryDistribution: "توزیع دسته‌بندی‌ها",
    sitRep: "گزارش اطلاعاتی (هوش مصنوعی)",
    generateReport: "تولید گزارش وضعیت",
    reportPlaceholder: "برای تحلیل رویدادهای فیلتر شده کلیک کنید...",
    dropMedia: "تصویر یا ویدیو را اینجا بکشید",
    orPaste: "یا لینک پست (ها) را وارد کنید",
    analyzeCrowd: "شمارش جمعیت",
    analyzing: "در حال تحلیل...",
    crowdRes: "تحلیل جمعیت",
    minEst: "حداقل", maxEst: "حداکثر", confidence: "اطمینان", hazards: "خطرات",
    bulkScan: "اسکنر منبع", scanChannel: "اسکن کانال", scanLinks: "تحلیل لینک(ها)",
    channelPlaceholder: "https://t.me/s/...", linksPlaceholder: "لینک‌های اینستاگرام، توییتر یا تلگرام...",
    addToMap: "تحلیل و نقشه‌برداری",
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
  onGenerateReport, reportContent, isGeneratingReport, onAddEvents
}) => {
  const [activeTab, setActiveTab] = useState<'events' | 'sources' | 'analysis' | 'ingest' | 'crowd'>('events');
  const [ingestMode, setIngestMode] = useState<'url' | 'text'>('url');
  const [scanDuration, setScanDuration] = useState<string>('LATEST_20');
  const [rawText, setRawText] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [regionFocus, setRegionFocus] = useState('');

  // Crowd Analysis State
  const [crowdMediaData, setCrowdMediaData] = useState<string | null>(null);
  const [crowdMimeType, setCrowdMimeType] = useState<string | null>(null);
  const [crowdLink, setCrowdLink] = useState(''); // This is now used for the Channel input too
  const [bulkLinks, setBulkLinks] = useState('');
  const [crowdResult, setCrowdResult] = useState<CrowdAnalysisResult | null>(null);
  const [isAnalyzingCrowd, setIsAnalyzingCrowd] = useState(false);
  const [scanType, setScanType] = useState<'channel' | 'links'>('channel');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const t = (translations as Record<string, typeof translations.en>)[language] || translations.en;
  const isRtl = language === 'ar' || language === 'fa';

  const stats = useMemo(() => {
    let protestors = 0;
    let dead = 0;
    let injured = 0;
    let detained = 0;
    events.forEach(e => {
        protestors += (e.protestorCount || 0);
        dead += (e.casualties?.dead || 0);
        injured += (e.casualties?.injured || 0);
        detained += (e.casualties?.detained || 0);
    });
    return { protestors, dead, injured, detained };
  }, [events]);

  const categoryStats = useMemo(() => {
    const counts: Record<string, number> = {};
    let max = 0;
    events.forEach(e => {
        counts[e.category] = (counts[e.category] || 0) + 1;
        if (counts[e.category] > max) max = counts[e.category];
    });
    return { counts, max, total: events.length };
  }, [events]);

  const hotspots = useMemo(() => {
    const map: Record<string, { score: number, count: number }> = {};
    events.forEach(e => {
        if (!e.locationName || e.locationName === "Unknown" || e.locationName === "Global") return;
        const score = (e.protestorCount ? 1 : 0) + (e.casualties?.dead || 0) * 10 + (e.casualties?.injured || 0) * 2 + (e.casualties?.detained || 0) * 1;
        if (!map[e.locationName]) {
            map[e.locationName] = { score: 0, count: 0 };
        }
        map[e.locationName].score += score;
        map[e.locationName].count += 1;
    });
    return Object.entries(map).sort((a,b) => b[1].score - a[1].score || b[1].count - a[1].count).slice(0, 5);
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

  const processAndAddEvent = async (base64: string, mime: string, context: string, srcUrl: string) => {
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
                  casualties: { dead: 0, injured: 0, detained: 0 }
              };
              if (onAddEvents) onAddEvents([newEvent]);
              return result;
          }
      } catch (e) {
          console.error("Failed to process event", e);
      }
      return null;
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
                      // Note: Production would require a backend proxy for images to avoid CORS.
                      // This uses a demo proxy.
                      const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(post.mediaUrl || '')}`);
                      if (response.ok) {
                          const blob = await response.blob();
                          if (blob.size > 20 * 1024 * 1024) { console.warn("Skipping large file"); continue; }

                          const reader = new FileReader();
                          await new Promise<void>((resolve) => {
                              reader.onloadend = async () => {
                                  const base64 = (reader.result as string).split(',')[1];
                                  const res = await processAndAddEvent(base64, blob.type, post.text, post.url);
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
                                   const res = await processAndAddEvent(base64, blob.type, "Link scan", link);
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
          const result = await processAndAddEvent(crowdMediaData, crowdMimeType, "Uploaded media", "Manual Upload");
          setCrowdResult(result);
      } catch (e) {
          alert("Analysis failed.");
      } finally {
          setIsAnalyzingCrowd(false);
      }
  };

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
        <button onClick={() => setActiveTab('events')} className={`flex-1 min-w-[60px] py-2 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'events' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t.archive}</button>
        <button onClick={() => setActiveTab('sources')} className={`flex-1 min-w-[60px] py-2 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'sources' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t.sources}</button>
        <button onClick={() => setActiveTab('analysis')} className={`flex-1 min-w-[60px] py-2 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'analysis' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t.analysis}</button>
        <button onClick={() => setActiveTab('crowd')} className={`flex-1 min-w-[60px] py-2 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'crowd' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t.crowd}</button>
        <button onClick={() => setActiveTab('ingest')} className={`flex-1 min-w-[60px] py-2 text-[10px] font-bold rounded-lg transition-all ${activeTab === 'ingest' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{t.ingest}</button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col mt-2">
        {activeTab === 'events' && (
          <div className="h-full flex flex-col">
            <div className="p-3 space-y-3 border-b border-slate-800/80">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                <input 
                  type="text" placeholder={t.searchPlaceholder}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-cyan-500 transition-all placeholder:text-slate-600"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                 {/* Time Range Selector */}
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
                 
                 {/* Category Selector */}
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
                        {(event.casualties?.dead || 0) > 0 && <span className="text-[9px] text-red-500 font-bold flex items-center gap-1"><Skull size={8}/> {event.casualties?.dead}</span>}
                    </div>
                  </div>
                ))
              }
            </div>
            
            <div className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2">
              <button onClick={onExport} className="flex-1 bg-slate-800 text-[10px] font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 border border-slate-700 hover:bg-slate-700 transition-colors uppercase"><FileJson size={12}/>{t.save}</button>
              <label className="flex-1 bg-slate-800 text-[10px] font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 border border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer uppercase"><Upload size={12}/>{t.load}<input type="file" className="hidden" onChange={onImport}/></label>
            </div>
          </div>
        )}
        
        {activeTab === 'sources' && (
           <div className="h-full overflow-y-auto p-3 space-y-4 custom-scrollbar">
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

        {activeTab === 'analysis' && (
           <div className="h-full overflow-y-auto p-4 space-y-6 custom-scrollbar">
              <div className="space-y-2">
                 <h3 className="text-xs font-extrabold text-white uppercase tracking-widest flex items-center gap-2">
                    <FileBarChart size={14} className="text-cyan-400"/> {t.sitRep}
                 </h3>
                 <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
                    {reportContent ? (
                       <div className="text-[10px] text-slate-300 font-mono leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">
                           {reportContent}
                       </div>
                    ) : (
                       <p className="text-[10px] text-slate-600 italic text-center py-4">{t.reportPlaceholder}</p>
                    )}
                    <button 
                        onClick={onGenerateReport} 
                        disabled={isGeneratingReport || events.length === 0}
                        className="w-full mt-3 py-2 bg-cyan-900/50 hover:bg-cyan-900/80 border border-cyan-800/50 text-cyan-400 text-[10px] font-bold uppercase rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isGeneratingReport ? <RefreshCcw size={12} className="animate-spin"/> : <Zap size={12}/>}
                        {t.generateReport}
                    </button>
                 </div>
              </div>
              <div className="space-y-1">
                 <h3 className="text-xs font-extrabold text-white uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp size={14} className="text-cyan-400"/> {t.impact}
                 </h3>
                 <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                        <Users size={12}/> <span className="text-[9px] font-bold uppercase">{t.totalProtestors}</span>
                        </div>
                        <p className="text-lg font-black text-cyan-400 font-mono">{(stats.protestors / 1000).toFixed(1)}K</p>
                    </div>
                    <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                        <Skull size={12}/> <span className="text-[9px] font-bold uppercase">{t.totalDead}</span>
                        </div>
                        <p className="text-lg font-black text-red-500 font-mono">{stats.dead}</p>
                    </div>
                    <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                        <HeartPulse size={12}/> <span className="text-[9px] font-bold uppercase">{t.totalInjured}</span>
                        </div>
                        <p className="text-lg font-black text-yellow-500 font-mono">{stats.injured}</p>
                    </div>
                    <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                        <UserX size={12}/> <span className="text-[9px] font-bold uppercase">{t.totalDetained}</span>
                        </div>
                        <p className="text-lg font-black text-blue-400 font-mono">{stats.detained}</p>
                    </div>
                 </div>
              </div>
           </div>
        )}
        
        {activeTab === 'crowd' && (
           <div className="h-full flex flex-col p-4 custom-scrollbar overflow-y-auto">
              <div className="space-y-6">
                  
                  {/* Bulk / Channel Scanning Section */}
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

                  <div className="relative flex py-2 items-center">
                      <div className="flex-grow border-t border-slate-800"></div>
                      <span className="flex-shrink-0 mx-4 text-slate-600 text-[9px] uppercase">Single File Upload</span>
                      <div className="flex-grow border-t border-slate-800"></div>
                  </div>

                  {/* Upload Area */}
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

                  {/* Preview Area */}
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

                  {/* Single Analyze Button */}
                  <button 
                     onClick={runSingleCrowdAnalysis}
                     disabled={!crowdMediaData || isAnalyzingCrowd}
                     className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-extrabold text-xs uppercase tracking-widest transition-all shadow-xl shadow-cyan-900/20 disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
                  >
                     {isAnalyzingCrowd ? <RefreshCcw size={14} className="animate-spin"/> : <Users size={14}/>}
                     {isAnalyzingCrowd ? t.analyzing : t.analyzeCrowd}
                  </button>

                  {/* Results Dashboard */}
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
                             {crowdResult.hazards.length > 0 && (
                                 <div className="pt-1">
                                    <span className="text-[10px] text-red-400 font-bold uppercase block mb-1">{t.hazards}</span>
                                    <div className="flex flex-wrap gap-1">
                                        {crowdResult.hazards.map((h, i) => (
                                            <span key={i} className="px-1.5 py-0.5 bg-red-900/30 text-red-300 text-[9px] rounded border border-red-900/50">{h}</span>
                                        ))}
                                    </div>
                                 </div>
                             )}
                          </div>
                          
                          <p className="text-[10px] text-slate-300 italic leading-relaxed bg-slate-900/30 p-2 rounded">
                             "{crowdResult.description}"
                          </p>
                      </div>
                  )}
              </div>
           </div>
        )}

        {activeTab === 'ingest' && (
          <div className="h-full flex flex-col p-4">
            {/* Ingest Type Toggle */}
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
                        placeholder="https://t.me/example..." 
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
    </div>
  );
};

export default Sidebar;
