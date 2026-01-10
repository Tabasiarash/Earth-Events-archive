
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import GlobeVis from './components/GlobeVis';
import Sidebar from './components/Sidebar';
import { IntelEvent, ProcessingStatus, EventCategory, SourceType, AppLanguage, SyncConfig, ChannelMetadataMap } from './types';
import { parseIntelContent, fetchSourceData, isRateLimitError, generateSituationReport } from './services/geminiService';
import { AlertCircle } from 'lucide-react';
import { INITIAL_EVENTS } from './data/initialEvents';

const STORAGE_KEY = 'INTEL_MAP_ARCHIVE_V10';
const SYNC_CONFIG_KEY = 'INTEL_MAP_SYNC_CONFIG_V5';
const METADATA_KEY = 'INTEL_MAP_CHANNEL_METADATA_V5';

const PREFERRED_SOURCES = [
  "https://t.me/DEJradio",
  "https://t.me/IranintlTV",
  "https://t.me/Farsi_Iranwire",
  "https://t.me/haalvsh"
];

const App: React.FC = () => {
  const [events, setEvents] = useState<IntelEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<ProcessingStatus>({ isProcessing: false, message: '' });
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  
  // Default language set to Farsi ('fa')
  const [language, setLanguage] = useState<AppLanguage>('fa');
  
  const [channelMetadata, setChannelMetadata] = useState<ChannelMetadataMap>(() => {
    try {
      const saved = localStorage.getItem(METADATA_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.warn("Failed to parse metadata, resetting:", e);
      return {};
    }
  });

  // Report State
  const [reportContent, setReportContent] = useState<string>('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const abortScanRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const hasAutoScannedRef = useRef(false);

  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => {
    try {
      const saved = localStorage.getItem(SYNC_CONFIG_KEY);
      let config = saved ? JSON.parse(saved) : { enabled: true, intervalMinutes: 120, monitoredChannels: [] };
      
      // Ensure Preferred Sources are always in the config
      const existingUrls = new Set(config.monitoredChannels.map((c: any) => c.url));
      PREFERRED_SOURCES.forEach(url => {
          if (!existingUrls.has(url)) {
              config.monitoredChannels.push({ url, type: SourceType.TELEGRAM });
          }
      });
      
      return config;
    } catch (e) {
      console.warn("Failed to parse sync config, resetting:", e);
      return { enabled: true, intervalMinutes: 120, monitoredChannels: [] };
    }
  });
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);

  // Default to Last Week (7 days ago)
  const [filterStartDate, setFilterStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7); 
    return d.toISOString().split('T')[0];
  });
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Time Range Preset State
  const [timeRange, setTimeRange] = useState<string>('LAST_WEEK');

  useEffect(() => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                setEvents(parsed);
            } else {
                setEvents(INITIAL_EVENTS);
            }
        } else {
            setEvents(INITIAL_EVENTS);
        }
    } catch (e) {
        console.error("Failed to load events from storage, resetting to initial:", e);
        setEvents(INITIAL_EVENTS);
    }

    if (!process.env.API_KEY) setApiKeyMissing(true);
  }, []);

  // Auto-Scan Logic on Start
  useEffect(() => {
      const runAutoScan = async () => {
          if (hasAutoScannedRef.current || !process.env.API_KEY) return;
          hasAutoScannedRef.current = true;

          // Initial Notification
          setStatus({ isProcessing: true, message: 'INTEL DETECTION IN PROCESS...' });

          // Wait a moment for initial render
          await new Promise(r => setTimeout(r, 1500));

          // Scan Preferred Sources
          for (const url of PREFERRED_SOURCES) {
              if (abortScanRef.current) break;
              // Use '1_MONTH' depth for initial scan
              await handleIngestUrl(url, '1_MONTH', undefined, false);
              // Cool down between channels to avoid rate limits
              await new Promise(r => setTimeout(r, 3000));
          }
      };

      runAutoScan();
  }, [apiKeyMissing]);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(events)), [events]);
  useEffect(() => localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(syncConfig)), [syncConfig]);
  useEffect(() => localStorage.setItem(METADATA_KEY, JSON.stringify(channelMetadata)), [channelMetadata]);

  useEffect(() => {
    if (syncTimerRef.current) window.clearInterval(syncTimerRef.current);
    if (syncConfig.enabled && syncConfig.monitoredChannels.length > 0) {
        syncTimerRef.current = window.setInterval(() => triggerBackgroundSync(), syncConfig.intervalMinutes * 60 * 1000);
    }
    return () => { if (syncTimerRef.current) window.clearInterval(syncTimerRef.current); };
  }, [syncConfig.enabled, syncConfig.intervalMinutes, syncConfig.monitoredChannels]);

  const triggerBackgroundSync = async () => {
    if (status.isProcessing || isBackgroundSyncing || apiKeyMissing) return;
    setIsBackgroundSyncing(true);
    for (const source of syncConfig.monitoredChannels) {
        if (abortScanRef.current) break;
        // Use 'LATEST_20' to check for NEW updates (Monitoring Mode)
        await handleIngestUrl(source.url, 'LATEST_20', undefined, true);
    }
    setSyncConfig(prev => ({ ...prev, lastSyncTimestamp: Date.now() }));
    setIsBackgroundSyncing(false);
  };

  const handleTimeRangeChange = (range: string) => {
    setTimeRange(range);
    const now = new Date();
    let start = new Date();
    
    // Reset end date to 'now' (empty string usually implies 'up to current')
    setFilterEndDate(''); 

    switch(range) {
        case 'TODAY':
            start = now; // Start of today logic handled by ISO string split
            break;
        case 'RECENT': // Last 3 days
            start.setDate(now.getDate() - 3);
            break;
        case 'LAST_WEEK':
            start.setDate(now.getDate() - 7);
            break;
        case 'LAST_3_WEEKS':
            start.setDate(now.getDate() - 21);
            break;
        case 'LAST_3_MONTHS':
            start.setMonth(now.getMonth() - 3);
            break;
        case 'LAST_YEAR':
            start.setFullYear(now.getFullYear() - 1);
            break;
        case 'ALL':
            setFilterStartDate(''); // Clear start date
            return;
        default:
            return;
    }
    setFilterStartDate(start.toISOString().split('T')[0]);
  };

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const matchesSearch = (e.title || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (e.locationName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (e.summary || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'ALL' || e.category === filterCategory;
      
      let matchesDate = true;
      if (filterStartDate || filterEndDate) {
        const eventDate = new Date(e.date).getTime();
        const start = filterStartDate ? new Date(filterStartDate).setHours(0,0,0,0) : -Infinity;
        const end = filterEndDate ? new Date(filterEndDate).setHours(23,59,59,999) : Infinity;
        
        // If filterStartDate is Today, we need to ensure we catch today's events regardless of time
        matchesDate = eventDate >= start && eventDate <= end;
      }
      return matchesSearch && matchesCategory && matchesDate;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [events, searchTerm, filterCategory, filterStartDate, filterEndDate]);

  const handleGenerateReport = async () => {
      if (filteredEvents.length === 0 || apiKeyMissing) return;
      setIsGeneratingReport(true);
      try {
          const report = await generateSituationReport(filteredEvents, language);
          setReportContent(report);
      } catch (e) {
          setReportContent("Error generating report.");
      } finally {
          setIsGeneratingReport(false);
      }
  };

  const handleIngestText = async (text: string, region?: string) => {
    if (apiKeyMissing) return;
    setStatus({ isProcessing: true, message: region ? `Filtering analysis for: ${region}...` : 'Analyzing text snippet...' });
    try {
      const newEvents = await parseIntelContent(text, SourceType.MANUAL, language, region);
      processResults(newEvents);
      setStatus({ isProcessing: false, message: 'Processing complete.' });
    } catch (error) { handleError(error); }
  };

  const handleIngestUrl = async (url: string, durationStr: string, region?: string, isSilent = false) => {
    if (apiKeyMissing) return;
    abortScanRef.current = false;
    const isResume = durationStr === 'RESUME';
    const isContinue = durationStr === 'CONTINUE';
    
    // Better user feedback for auto-scan
    const channelName = url.split('/').pop();
    if (!isSilent) setStatus({ isProcessing: true, message: `Connecting to ${channelName}...` });

    try {
        let currentCursor = (isResume || isContinue) ? channelMetadata[url]?.lastCursor : undefined;
        let pagesProcessed = 0;
        
        // Define page limits based on duration
        let maxPages = 1;
        switch(durationStr) {
          case '1_MONTH': maxPages = 10; break;
          case '3_MONTHS': maxPages = 30; break;
          case '6_MONTHS': maxPages = 60; break;
          case '12_MONTHS': maxPages = 120; break;
          case 'ALL': maxPages = 300; break;
          default: maxPages = 1; // LATEST_20 or unknown
        }
        
        while (pagesProcessed < maxPages && !abortScanRef.current) {
            if (!isSilent) setStatus(prev => ({ ...prev, message: `Scanning ${channelName}: Page ${pagesProcessed + 1} / ${maxPages}...` }));
            const page = await fetchSourceData(url, currentCursor);
            
            if (page.messageCount > 0) {
                if (!isSilent) setStatus(prev => ({ ...prev, message: `Analyzing ${channelName} data (${page.messageCount} posts)...` }));
                const newEvents = await parseIntelContent(page.text, page.type, language, region);
                processResults(newEvents, url);
                
                // Update metadata for this source
                setChannelMetadata(prev => ({
                    ...prev,
                    [url]: { 
                        lastCursor: page.nextCursor || prev[url]?.lastCursor, 
                        totalEvents: (prev[url]?.totalEvents || 0) + newEvents.length, 
                        lastUpdate: new Date().toISOString(), 
                        type: page.type 
                    }
                }));

                currentCursor = page.nextCursor;
            } else {
                // If page message count is 0, we might have hit end or failed parse
                if (!isSilent) console.warn("No messages found on page.");
                break;
            }

            pagesProcessed++;
            if (!currentCursor) break;
            
            // INCREASED THROTTLE to 2000ms to avoid Rate Limits (429)
            await new Promise(r => setTimeout(r, 2000));
        }
        
        if (!isSilent) setStatus({ isProcessing: false, message: abortScanRef.current ? 'Scan stopped by user.' : `Scan Complete: ${channelName}` });
    } catch (error: any) {
        if (!isSilent) handleError(error);
    } finally {
        abortScanRef.current = false;
    }
  };

  const handleAddEvents = (newEvents: IntelEvent[], shouldSelect = false) => {
      if (shouldSelect && newEvents.length === 1) {
          const ne = newEvents[0];
          const match = events.find(e => e.id === ne.id); 
          const targetId = match ? match.id : ne.id;
          setSelectedEventId(targetId);
      }
      processResults(newEvents);
  };

  const handleRemoveSource = (urlToRemove: string) => {
      // 1. Filter out events from this source
      const initialCount = events.length;
      const newEvents = events.filter(e => e.sourceUrl !== urlToRemove);
      const removedCount = initialCount - newEvents.length;

      if (window.confirm(`Are you sure you want to remove source: ${urlToRemove}?\nThis will delete ${removedCount} archived events.`)) {
          setEvents(newEvents);
          
          // 2. Remove from Monitoring Config
          setSyncConfig(prev => ({
              ...prev,
              monitoredChannels: prev.monitoredChannels.filter(c => c.url !== urlToRemove)
          }));

          // 3. Remove Metadata
          setChannelMetadata(prev => {
              const next = { ...prev };
              delete next[urlToRemove];
              return next;
          });

          setStatus({ isProcessing: false, message: `Removed source and ${removedCount} events.` });
      }
  };

  const processResults = (newEvents: IntelEvent[], url?: string) => {
    if (newEvents.length > 0) {
      setEvents(prev => {
        const updatedEvents = [...prev];
        const trulyNewEvents: IntelEvent[] = [];

        newEvents.forEach(ne => {
            const isManualUpload = ne.sourceUrl === 'Manual Upload';

            // Enhanced Deduplication Logic
            const existingIndex = updatedEvents.findIndex(e => {
                // 1. Strict ID Match
                if (e.id === ne.id) return true;

                // 2. Source ID Match
                if (e.sourceId && ne.sourceId && e.sourceId === ne.sourceId && 
                    (!url || !e.sourceUrl || e.sourceUrl === ne.sourceUrl)) return true;

                // 3. Date & Spatial/Title Heuristics
                if (e.date !== ne.date) return false;

                // 3a. Exact Content Match
                if (e.title === ne.title && e.locationName === ne.locationName) return true;

                // 3b. Spatial Match
                const latDiff = Math.abs(e.lat - ne.lat);
                const lngDiff = Math.abs(e.lng - ne.lng);
                let isSpatialMatch = latDiff < 0.002 && lngDiff < 0.002;

                if (isManualUpload && !isSpatialMatch) {
                    if (latDiff < 0.05 && lngDiff < 0.05) {
                         if (e.category === ne.category) isSpatialMatch = true;
                    }
                }

                if (isSpatialMatch) return true;

                // 3c. Similar Content Match
                if (e.locationName.includes(ne.locationName) || ne.locationName.includes(e.locationName)) {
                     const normalize = (s: string) => s.toLowerCase().replace(/[^\w\u0600-\u06FF]/g, '');
                     const t1 = normalize(e.title);
                     const t2 = normalize(ne.title);
                     if (t1.includes(t2) || t2.includes(t1)) return true;
                }

                return false;
            });

            if (existingIndex > -1) {
                const existing = updatedEvents[existingIndex];
                const isManualCrowdOverride = ne.isCrowdResult && isManualUpload;

                updatedEvents[existingIndex] = {
                    ...existing,
                    sourceId: existing.sourceId || ne.sourceId,
                    lat: isManualCrowdOverride ? ne.lat : existing.lat,
                    lng: isManualCrowdOverride ? ne.lng : existing.lng,
                    locationName: isManualCrowdOverride ? ne.locationName : existing.locationName,
                    protestorCount: isManualCrowdOverride ? ne.protestorCount : Math.max(existing.protestorCount || 0, ne.protestorCount || 0),
                    casualties: {
                        dead: Math.max(existing.casualties?.dead || 0, ne.casualties?.dead || 0),
                        injured: Math.max(existing.casualties?.injured || 0, ne.casualties?.injured || 0),
                        detained: Math.max(existing.casualties?.detained || 0, ne.casualties?.detained || 0),
                    },
                    securityCasualties: {
                        dead: Math.max(existing.securityCasualties?.dead || 0, ne.securityCasualties?.dead || 0),
                        injured: Math.max(existing.securityCasualties?.injured || 0, ne.securityCasualties?.injured || 0),
                    },
                    reliabilityScore: isManualCrowdOverride ? 10 : Math.max(existing.reliabilityScore || 0, ne.reliabilityScore || 0),
                    reliabilityReason: isManualCrowdOverride 
                        ? `VALIDATED by Analyst: ${ne.summary}` 
                        : (existing.reliabilityReason !== ne.reliabilityReason ? `${existing.reliabilityReason || ''} | ${ne.reliabilityReason || ''}`.replace(/^ \| /, '') : existing.reliabilityReason),
                    title: isManualCrowdOverride ? ne.title : ((ne.title.startsWith("Crowd:") && !existing.title.startsWith("Crowd:")) ? existing.title : ne.title),
                    summary: isManualCrowdOverride ? ne.summary : (existing.summary.length < ne.summary.length ? ne.summary : existing.summary), 
                    isCrowdResult: ne.isCrowdResult || existing.isCrowdResult 
                };
            } else {
                trulyNewEvents.push(ne);
            }
        });

        return [...updatedEvents, ...trulyNewEvents];
      });
    }
  };

  const handleError = (error: any) => {
    setStatus({ isProcessing: false, message: 'Operation failed.', error: error.message });
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(events, null, 2));
    const dlNode = document.createElement('a');
    dlNode.setAttribute("href", dataStr);
    dlNode.setAttribute("download", `intel_export_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(dlNode);
    dlNode.click();
    dlNode.remove();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const reader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      reader.readAsText(e.target.files[0], "UTF-8");
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed)) {
            processResults(parsed);
            setStatus({ isProcessing: false, message: `Successfully loaded/merged ${parsed.length} events.` });
            setTimeout(() => setStatus({ isProcessing: false, message: '' }), 3000);
          }
        } catch (err) { alert("Invalid JSON file."); }
      };
    }
  };

  const handleStopScan = () => {
    abortScanRef.current = true;
    setStatus(prev => ({ ...prev, message: 'Stopping scan...' }));
  };

  return (
    <div className={`flex h-screen w-screen bg-slate-950 overflow-hidden text-slate-200 ${language === 'ar' || language === 'fa' ? 'flex-row-reverse' : 'flex-row'}`}>
      <Sidebar 
        events={filteredEvents} totalEventCount={events.length}
        onIngestText={handleIngestText} onIngestUrl={handleIngestUrl} onStopScan={handleStopScan}
        status={status} onExport={handleExport} onImport={handleImport}
        onSelectEvent={(e) => setSelectedEventId(e.id)} selectedEventId={selectedEventId}
        searchTerm={searchTerm} setSearchTerm={setSearchTerm}
        filterCategory={filterCategory} setFilterCategory={setFilterCategory}
        filterStartDate={filterStartDate} setFilterStartDate={setFilterStartDate}
        filterEndDate={filterEndDate} setFilterEndDate={setFilterEndDate}
        timeRange={timeRange} onTimeRangeChange={handleTimeRangeChange}
        language={language} setLanguage={setLanguage}
        syncConfig={syncConfig} onUpdateSyncConfig={(cfg) => setSyncConfig(prev => ({ ...prev, ...cfg }))}
        isSyncing={isBackgroundSyncing} channelMetadata={channelMetadata}
        onGenerateReport={handleGenerateReport} reportContent={reportContent} isGeneratingReport={isGeneratingReport}
        onAddEvents={handleAddEvents}
        onRemoveSource={handleRemoveSource}
      />
      <div className="flex-1 relative h-full">
        {apiKeyMissing && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 px-4 py-2 rounded text-white font-bold flex items-center gap-2 shadow-xl border border-red-400"><AlertCircle size={18}/> API KEY MISSING</div>}
        <GlobeVis events={filteredEvents} selectedEventId={selectedEventId} onEventClick={(e) => setSelectedEventId(e.id)} language={language} />
      </div>
    </div>
  );
};

export default App;
