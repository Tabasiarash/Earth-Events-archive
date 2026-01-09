
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import GlobeVis from './components/GlobeVis';
import Sidebar from './components/Sidebar';
import { IntelEvent, ProcessingStatus, EventCategory, SourceType, AppLanguage, SyncConfig, ChannelMetadataMap } from './types';
import { parseIntelContent, fetchSourceData, isRateLimitError, generateSituationReport } from './services/geminiService';
import { AlertCircle } from 'lucide-react';
import { INITIAL_EVENTS } from './data/initialEvents';

const STORAGE_KEY = 'INTEL_MAP_ARCHIVE_V3';
const SYNC_CONFIG_KEY = 'INTEL_MAP_SYNC_CONFIG_V2';
const METADATA_KEY = 'INTEL_MAP_CHANNEL_METADATA_V2';

const App: React.FC = () => {
  const [events, setEvents] = useState<IntelEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<ProcessingStatus>({ isProcessing: false, message: '' });
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  
  // Default language set to Farsi ('fa')
  const [language, setLanguage] = useState<AppLanguage>('fa');
  
  const [channelMetadata, setChannelMetadata] = useState<ChannelMetadataMap>(() => {
    const saved = localStorage.getItem(METADATA_KEY);
    return saved ? JSON.parse(saved) : {};
  });

  // Report State
  const [reportContent, setReportContent] = useState<string>('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const abortScanRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);

  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => {
    const saved = localStorage.getItem(SYNC_CONFIG_KEY);
    // Default: Enabled, 120 min interval (2 hours)
    return saved ? JSON.parse(saved) : { enabled: true, intervalMinutes: 120, monitoredChannels: [] };
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
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        setEvents(JSON.parse(saved));
    } else {
        setEvents(INITIAL_EVENTS);
    }
    if (!process.env.API_KEY) setApiKeyMissing(true);
  }, []);

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
        await handleIngestUrl(source.url, 'RESUME', undefined, true);
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
    
    if (!isSilent) setStatus({ isProcessing: true, message: 'Connecting to source...' });

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
            if (!isSilent) setStatus(prev => ({ ...prev, message: `Fetching data page ${pagesProcessed + 1} / ${maxPages}...` }));
            const page = await fetchSourceData(url, currentCursor);
            
            if (page.messageCount > 0) {
                if (!isSilent) setStatus(prev => ({ ...prev, message: `Extracting intelligence from page ${pagesProcessed + 1}...` }));
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
            
            // Minimal throttle to be nice to proxies
            await new Promise(r => setTimeout(r, 800));
        }
        
        if (!isSilent) setStatus({ isProcessing: false, message: abortScanRef.current ? 'Scan stopped by user.' : 'Scan Complete.' });
    } catch (error: any) {
        if (!isSilent) handleError(error);
    } finally {
        abortScanRef.current = false;
    }
  };

  const handleAddEvents = (newEvents: IntelEvent[]) => {
      processResults(newEvents);
  };

  const processResults = (newEvents: IntelEvent[], url?: string) => {
    if (newEvents.length > 0) {
      setEvents(prev => {
        // Prevent exact duplicates
        const unique = newEvents.filter(ne => !prev.some(e => 
          (e.title === ne.title && e.date === ne.date) || 
          (e.id === ne.id)
        ));
        return [...prev, ...unique];
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
          if (Array.isArray(parsed)) setEvents(parsed);
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
      />
      <div className="flex-1 relative h-full">
        {apiKeyMissing && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 px-4 py-2 rounded text-white font-bold flex items-center gap-2 shadow-xl border border-red-400"><AlertCircle size={18}/> API KEY MISSING</div>}
        <GlobeVis events={filteredEvents} selectedEventId={selectedEventId} onEventClick={(e) => setSelectedEventId(e.id)} language={language} />
      </div>
    </div>
  );
};

export default App;