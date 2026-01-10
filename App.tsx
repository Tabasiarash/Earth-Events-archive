
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import GlobeVis from './components/GlobeVis';
import Sidebar from './components/Sidebar';
import { IntelEvent, ProcessingStatus, SourceType, AppLanguage, SyncConfig, ChannelMetadataMap } from './types';
import { parseIntelContent, fetchSourceData, generateSituationReport } from './services/geminiService';
import { AlertCircle } from 'lucide-react';
import { INITIAL_EVENTS } from './data/initialEvents';

const STORAGE_KEY = 'INTEL_MAP_CORE_V11';

const App: React.FC = () => {
  const [events, setEvents] = useState<IntelEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<ProcessingStatus>({ isProcessing: false, message: '' });
  const [language, setLanguage] = useState<AppLanguage>('fa');
  const [reportContent, setReportContent] = useState<string | undefined>(undefined);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  const abortScanRef = useRef(false);

  // Initialize data from local storage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setEvents(saved ? JSON.parse(saved) : INITIAL_EVENTS);
  }, []);

  // Sync state to local storage for persistence
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  const processResults = useCallback((newEvents: IntelEvent[]) => {
    if (newEvents.length === 0) return;
    setEvents(prev => {
        const merged = [...prev];
        newEvents.forEach(ne => {
            const exists = merged.find(e => 
                (e.sourceId && e.sourceId === ne.sourceId) || 
                (Math.abs(e.lat - ne.lat) < 0.01 && Math.abs(e.lng - ne.lng) < 0.01 && e.date === ne.date)
            );
            if (!exists) merged.push(ne);
        });
        return merged;
    });
  }, []);

  const handleIngestUrl = async (url: string, depth: string, region?: string) => {
    abortScanRef.current = false;
    setStatus({ isProcessing: true, message: `Accelerated Scan: ${url.split('/').pop()}` });

    try {
        let cursor: string | undefined;
        let pages = 0;
        const maxPages = depth === 'ALL' ? 50 : depth === 'LATEST_20' ? 1 : 10;

        while (pages < maxPages && !abortScanRef.current) {
            pages++;
            setStatus(s => ({ ...s, message: `Extracting page ${pages}/${maxPages}...` }));
            
            const data = await fetchSourceData(url, cursor);
            if (data.messageCount === 0) break;

            // Process page content asynchronously to improve throughput
            parseIntelContent(data.text, data.type, language, region).then(processResults);
            
            cursor = data.nextCursor;
            if (!cursor) break;
            
            await new Promise(r => setTimeout(r, 500)); // Minimal buffer for rate limiting
        }
        setStatus({ isProcessing: false, message: 'Scan Complete.' });
    } catch (e: any) {
        setStatus({ isProcessing: false, message: 'Scan Failed.', error: e.message });
    }
  };

  const handleIngestText = async (text: string, region?: string) => {
      setStatus({ isProcessing: true, message: 'Analyzing text stream...' });
      const res = await parseIntelContent(text, SourceType.MANUAL, language, region);
      processResults(res);
      setStatus({ isProcessing: false, message: 'Analysis complete.' });
  };

  const handleGenerateReport = async () => {
      setIsGeneratingReport(true);
      setStatus({ isProcessing: true, message: 'Synthesizing report...' });
      try {
          const rep = await generateSituationReport(events, language);
          setReportContent(rep);
          setStatus({ isProcessing: false, message: 'Report Ready.' });
      } catch (e) {
          setStatus({ isProcessing: false, message: 'Report synthesis failed.' });
      } finally {
          setIsGeneratingReport(false);
      }
  };

  return (
    <div className={`flex h-screen w-screen bg-slate-950 text-slate-200 ${language === 'fa' ? 'flex-row-reverse' : 'flex-row'}`}>
      <Sidebar 
        events={events} totalEventCount={events.length}
        onIngestText={handleIngestText} onIngestUrl={handleIngestUrl}
        onStopScan={() => { abortScanRef.current = true; }}
        status={status} onExport={() => {}} onImport={() => {}}
        onSelectEvent={(e) => setSelectedEventId(e.id)} selectedEventId={selectedEventId}
        searchTerm="" setSearchTerm={() => {}}
        filterCategory="ALL" setFilterCategory={() => {}}
        filterStartDate="" setFilterStartDate={() => {}}
        filterEndDate="" setFilterEndDate={() => {}}
        language={language} setLanguage={setLanguage}
        syncConfig={{enabled: false, intervalMinutes: 60, monitoredChannels: []}}
        onUpdateSyncConfig={() => {}}
        isSyncing={status.isProcessing}
        channelMetadata={{}}
        onGenerateReport={handleGenerateReport}
        reportContent={reportContent}
        isGeneratingReport={isGeneratingReport}
        onAddEvents={(newEvents, shouldSelect) => {
            processResults(newEvents);
            if (shouldSelect && newEvents.length > 0) setSelectedEventId(newEvents[0].id);
        }}
        onRemoveSource={(url) => setEvents(prev => prev.filter(e => e.sourceUrl !== url))}
      />
      <div className="flex-1 relative">
        <GlobeVis events={events} selectedEventId={selectedEventId} onEventClick={(e) => setSelectedEventId(e.id)} language={language} />
      </div>
    </div>
  );
};

export default App;
