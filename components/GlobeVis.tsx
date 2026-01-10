
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle } from 'react-leaflet';
import L from 'leaflet';
import { IntelEvent, EventCategory, AppLanguage } from '../types';
import { Users, Skull, ShieldAlert, AlertTriangle, Bell, Activity, Flame, History, X, Globe } from 'lucide-react';

interface GlobeVisProps {
  events: IntelEvent[];
  selectedEventId?: string;
  onEventClick: (event: IntelEvent) => void;
  onClosePopup?: () => void;
  language: AppLanguage;
}

const CITY_POPULATIONS: Record<string, number> = {
  "Tehran": 8700000, "Mashhad": 3000000, "Isfahan": 1960000, "Karaj": 1590000,
  "Shiraz": 1560000, "Tabriz": 1550000, "Qom": 1200000, "Ahvaz": 1180000,
  "Kermanshah": 947000, "Urmia": 736000, "Rasht": 679000, "Zahedan": 587000,
  "Hamadan": 554000, "Kerman": 537000, "Yazd": 529000, "Ardabil": 529000,
  "Bandar Abbas": 526000, "Arak": 520000, "Eslamshahr": 448000, "Zanjan": 430000,
  "Sanandaj": 412000, "Qazvin": 402000, "Khorramabad": 373000, "Gorgan": 350000,
  "Sari": 309000, "Shahriar": 309000, "Qods": 309000, "Kashan": 304000,
  "Malard": 281000, "Dezful": 264000, "Nishapur": 264000, "Babol": 250000,
  "Khomeini Shahr": 247000, "Sabzevar": 243000, "Golestan": 239000, "Amol": 237000,
  "Pakdasht": 236000, "Najafabad": 235000, "Borujerd": 234000, "Abadan": 231000,
  "Qarchak": 231000, "Bojnurd": 228000, "Varamin": 225000, "Bushehr": 223000,
  "Saveh": 220000, "Khomein": 70000, "Mahshahr": 160000, "Izeh": 120000,
  "Damghan": 60000, "Takestan": 80000, "Aligudarz": 90000, "Gonbad-e Kavus": 150000,
  "Ramsar": 35000, "Nazarabad": 120000, "Ashkhaneh": 25000, "Pareh Sar": 15000,
  "Abdanan": 25000, "Melkshahi": 20000, "Masjed Soleyman": 85000, "Robat Karim": 105000
};

const getCategoryColor = (category: EventCategory): string => {
  switch (category) {
    case EventCategory.MILITARY: return '#ef4444'; // Red
    case EventCategory.POLITICAL: return '#3b82f6'; // Blue
    case EventCategory.CYBER: return '#10b981'; // Emerald
    case EventCategory.TERRORISM: return '#f97316'; // Orange
    case EventCategory.CIVIL_UNREST: return '#eab308'; // Yellow
    default: return '#94a3b8'; // Slate
  }
};

const getDensityColor = (count: number): string => {
  if (count < 500) return '#22d3ee'; // Cyan (Scatter/Low)
  if (count < 1500) return '#facc15'; // Yellow (Medium-Low)
  if (count < 3000) return '#fb923c'; // Orange (Medium-High)
  if (count < 7000) return '#ef4444'; // Red (High)
  return '#d946ef'; // Fuchsia/Purple (Very High)
};

const formatCount = (n: number) => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
};

const createCustomIcon = (color: string, isSelected: boolean, hasCrowdData: boolean, count?: number, isCrowdResult?: boolean) => {
  // SPECIAL FIRE ICON FOR CROWD ANALYSIS TOOL
  if (isCrowdResult) {
     const fireSize = isSelected ? 40 : 32;
     // Use the provided color (which is density based) for the glow if available
     const glowColor = color;
     
     return new L.DivIcon({
         className: 'fire-marker-container',
         html: `
            <div style="position: relative; width: ${fireSize}px; height: ${fireSize}px; display: flex; justify-content: center; align-items: center;">
                <div style="position: absolute; inset: 0; background: radial-gradient(circle, ${glowColor}99 0%, ${glowColor}00 70%); animation: pulse-glow 1.5s infinite;"></div>
                <svg xmlns="http://www.w3.org/2000/svg" width="${fireSize}" height="${fireSize}" viewBox="0 0 24 24" fill="${glowColor}" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-flame drop-shadow-lg">
                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.1.2-2.2.5-3.3a9 9 0 0 0 4 3.8z"/>
                </svg>
                ${count ? `
                <div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); background-color: ${glowColor}; color: white; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.5); white-space: nowrap; border: 1px solid rgba(255,255,255,0.4); font-family: 'JetBrains Mono', monospace;">
                   ${formatCount(count)}
                </div>` : ''}
            </div>
            <style>
                @keyframes pulse-glow {
                    0% { transform: scale(0.8); opacity: 0.8; }
                    50% { transform: scale(1.2); opacity: 0.4; }
                    100% { transform: scale(0.8); opacity: 0.8; }
                }
            </style>
         `,
         iconSize: [fireSize, fireSize],
         iconAnchor: [fireSize / 2, fireSize / 2],
         popupAnchor: [0, -fireSize / 2]
     });
  }

  const size = isSelected ? 24 : (hasCrowdData ? 24 : 16);
  
  const svgContent = hasCrowdData 
    ? `
      <circle cx="12" cy="12" r="10" stroke="${color}" stroke-width="2" fill="${color}" fill-opacity="0.3"></circle>
      <circle cx="12" cy="12" r="5" fill="#fff"></circle>
      <circle cx="12" cy="12" r="2" fill="${color}"></circle>
      <line x1="12" y1="0" x2="12" y2="24" stroke="${color}" stroke-width="1" stroke-opacity="0.5" />
      <line x1="0" y1="12" x2="24" y2="12" stroke="${color}" stroke-width="1" stroke-opacity="0.5" />
    `
    : `
      <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"></circle>
    `;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
      ${svgContent}
    </svg>
  `;
  
  let html = svg;
  if (hasCrowdData && count) {
      html = `
        <div style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center;">
            ${svg}
            <div style="position: absolute; top: -16px; left: 50%; transform: translateX(-50%); background-color: ${color}; color: white; font-size: 10px; font-weight: 800; padding: 1px 5px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.5); white-space: nowrap; border: 1px solid rgba(255,255,255,0.3); font-family: 'JetBrains Mono', monospace;">
               ${formatCount(count)}
            </div>
        </div>
      `;
  }
  
  const className = `custom-marker ${isSelected ? 'selected-marker' : ''} ${hasCrowdData ? 'crowd-marker crowd-marker-ring' : ''}`;

  return new L.DivIcon({
    className: className,
    html: html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
};

const translations = {
    en: {
        eventTypes: "EVENT TYPES",
        reliability: "Reliability",
        reason: "Reason",
        verified: "Verified Sources",
        protestors: "Estimated Protestors",
        impact: "Humanitarian Impact",
        dead: "Killed",
        injured: "Wounded",
        detained: "Detained",
        cats: {
            [EventCategory.MILITARY]: "Military",
            [EventCategory.POLITICAL]: "Political",
            [EventCategory.CYBER]: "Cyber",
            [EventCategory.TERRORISM]: "Terrorism",
            [EventCategory.CIVIL_UNREST]: "Civil Unrest",
            [EventCategory.OTHER]: "Other"
        },
        crowdAnalyzed: "CROWD ANALYZED",
        liveAnalytics: "LIVE ANALYTICS",
        totalParticipants: "Total Participants",
        civilians: "Civilians",
        forces: "Security Forces",
        breakingNews: "HIGH PRIORITY ALERTS",
        densityMap: "Participation Density",
        densityLegend: "Crowd Density",
        notifications: "Notifications History",
        noHistory: "No prior alerts.",
        clear: "Clear"
    },
    fa: {
        eventTypes: "انواع رویداد",
        reliability: "قابلیت اطمینان",
        reason: "دلیل",
        verified: "منابع تایید شده",
        protestors: "تعداد معترضان",
        impact: "تاثیرات انسانی",
        dead: "کشته",
        injured: "مجروح",
        detained: "بازداشتی",
        cats: {
            [EventCategory.MILITARY]: "نظامی",
            [EventCategory.POLITICAL]: "سیاسی",
            [EventCategory.CYBER]: "سایبری",
            [EventCategory.TERRORISM]: "تروریسم",
            [EventCategory.CIVIL_UNREST]: "ناآرامی مدنی",
            [EventCategory.OTHER]: "سایر"
        },
        crowdAnalyzed: "تحلیل جمعیت",
        liveAnalytics: "آمار زنده",
        totalParticipants: "کل شرکت‌کنندگان",
        civilians: "شهروندان",
        forces: "نیروهای امنیتی",
        breakingNews: "هشدارهای مهم",
        densityMap: "تراکم مشارکت",
        densityLegend: "تراکم جمعیت",
        notifications: "تاریخچه هشدارها",
        noHistory: "بدون هشدار قبلی",
        clear: "پاک کردن"
    },
};

const MapController: React.FC<{ selectedEvent?: IntelEvent }> = ({ selectedEvent }) => {
  const map = useMap();
  useEffect(() => {
    if (selectedEvent) {
      map.flyTo([selectedEvent.lat, selectedEvent.lng], 14, { animate: true, duration: 1.5 });
    }
  }, [selectedEvent, map]);
  return null;
};

const MapClick: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    useMapEvents({
        click: () => {
           onClose();
        }
    });
    return null;
};

const GlobeVis: React.FC<GlobeVisProps> = ({ events, selectedEventId, onEventClick, onClosePopup, language }) => {
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [countryFilter, setCountryFilter] = useState('ALL');

  const t = translations[language as keyof typeof translations] || translations.en;
  const isRtl = language === 'ar' || language === 'fa';
  
  // Notification State
  const [activeAlerts, setActiveAlerts] = useState<IntelEvent[]>([]);
  const [alertHistory, setAlertHistory] = useState<IntelEvent[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const processedAlertIds = useRef<Set<string>>(new Set());

  const safeEvents = useMemo(() => {
    return events.filter(e => 
        !isNaN(e.lat) && !isNaN(e.lng) && e.lat !== 0 && e.lng !== 0
    );
  }, [events]);

  const selectedEvent = useMemo(() => 
    safeEvents.find(e => e.id === selectedEventId), 
  [selectedEventId, safeEvents]);

  // Extract available countries
  const availableCountries = useMemo(() => {
      const countries = new Set<string>();
      events.forEach(e => {
          if (e.locationName) {
              const parts = e.locationName.split(',');
              const c = parts[parts.length - 1].trim();
              if (c) countries.add(c);
          }
      });
      return Array.from(countries).sort();
  }, [events]);

  // Updated Analytics Calculation - includes country filtering
  const analytics = useMemo(() => {
      let totalProtestors = 0;
      let civDead = 0, civInjured = 0, civDetained = 0;
      let secDead = 0, secInjured = 0;

      events.forEach(e => {
          // Filter check
          let matchesCountry = true;
          if (countryFilter !== 'ALL' && e.locationName) {
               const parts = e.locationName.split(',');
               const c = parts[parts.length - 1].trim();
               if (c !== countryFilter) matchesCountry = false;
          }

          if (matchesCountry) {
              totalProtestors += (e.protestorCount || 0);
              civDead += (e.casualties?.dead || 0);
              civInjured += (e.casualties?.injured || 0);
              civDetained += (e.casualties?.detained || 0);
              
              secDead += (e.securityCasualties?.dead || 0);
              secInjured += (e.securityCasualties?.injured || 0);
          }
      });
      return { totalProtestors, civDead, civInjured, civDetained, secDead, secInjured };
  }, [events, countryFilter]);

  // Manage Notifications with 10 second timeout and history slide-back
  useEffect(() => {
      // Find high priority events that haven't been alerted yet
      const newHighPriority = events.filter(e => {
        const isHighCasualty = (e.casualties?.dead || 0) > 0 || (e.securityCasualties?.dead || 0) > 0;
        const isMassiveCrowd = (e.protestorCount || 0) > 2000;
        const isHighReliability = (e.reliabilityScore || 0) >= 9;
        const isPriority = isHighCasualty || isMassiveCrowd || (isHighReliability && e.category === EventCategory.MILITARY);
        
        return isPriority && !processedAlertIds.current.has(e.id);
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (newHighPriority.length > 0) {
          const toAdd = newHighPriority.slice(0, 4); 
          
          toAdd.forEach(e => processedAlertIds.current.add(e.id));
          
          setActiveAlerts(prev => [...toAdd, ...prev].slice(0, 6)); // Keep max 6 on screen

          // Schedule removal for these specific alerts
          toAdd.forEach(alertEvent => {
              setTimeout(() => {
                  setActiveAlerts(current => {
                      // Only remove if still present
                      return current.filter(a => a.id !== alertEvent.id);
                  });
                  // Move to History
                  setAlertHistory(prev => {
                      if (prev.find(h => h.id === alertEvent.id)) return prev;
                      return [alertEvent, ...prev].slice(0, 50); // Keep last 50
                  });
              }, 10000); // Remove after 10 seconds and slide to history
          });
      }
  }, [events]);

  const getReliabilityColor = (score?: number) => {
      if (!score) return '#94a3b8';
      if (score >= 8) return '#10b981';
      if (score >= 5) return '#eab308';
      return '#ef4444';
  };

  // Heatmap Data Preparation
  const heatmapData = useMemo(() => {
      const cityGroups: Record<string, { lat: number, lng: number, count: number, name: string }> = {};
      
      safeEvents.forEach(e => {
          if (!e.protestorCount) return;
          
          // Simple clustering by city name derived from locationName
          let cityName = e.locationName.split(',')[0].trim();
          
          // Fix for common variations
          if (cityName === "Tehran Province") cityName = "Tehran";

          if (!cityGroups[cityName]) {
              cityGroups[cityName] = { lat: e.lat, lng: e.lng, count: 0, name: cityName };
          }
          const g = cityGroups[cityName];
          g.count += e.protestorCount;
      });

      return Object.values(cityGroups).map(city => {
          const pop = CITY_POPULATIONS[city.name] || 100000; 
          const ratio = city.count / pop;
          return { ...city, ratio, pop };
      });
  }, [safeEvents]);

  return (
    <div className="relative w-full h-full bg-slate-950 z-0">
      <MapContainer 
        center={[32.4279, 53.6880]} 
        zoom={5} 
        style={{ height: '100%', width: '100%', background: '#0f172a' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        <MapController selectedEvent={selectedEvent} />
        {onClosePopup && <MapClick onClose={onClosePopup} />}

        {/* Heatmap Layer (Underlay) */}
        {showHeatmap && heatmapData.map((data, idx) => {
            let color = '#facc15'; // Yellow (Low)
            let radius = 15000; // Meters
            if (data.ratio > 0.01) { color = '#a855f7'; radius = 25000; } // Purple (Very High)
            else if (data.ratio > 0.005) { color = '#ef4444'; radius = 20000; } // Red (High)
            else if (data.ratio > 0.001) { color = '#f97316'; radius = 18000; } // Orange (Medium)

            return (
                <Circle 
                    key={`heat-${idx}`}
                    center={[data.lat, data.lng]}
                    radius={radius}
                    pathOptions={{ 
                        color: color, 
                        fillColor: color, 
                        fillOpacity: 0.3, 
                        stroke: false 
                    }}
                />
            );
        })}

        {safeEvents.map(event => {
            const isSelected = selectedEventId === event.id;
            const hasCrowdData = (event.protestorCount || 0) > 0;
            // Use density color if crowd data exists, otherwise category color
            const color = hasCrowdData ? getDensityColor(event.protestorCount || 0) : getCategoryColor(event.category);
            
            return (
                <Marker 
                    key={event.id} 
                    position={[event.lat, event.lng]}
                    icon={createCustomIcon(color, isSelected, hasCrowdData, event.protestorCount, event.isCrowdResult)}
                    zIndexOffset={isSelected ? 1000 : 0}
                    eventHandlers={{
                        click: () => onEventClick(event)
                    }}
                >
                    {isSelected && (
                        <Popup offset={[0, -10]} closeButton={false} autoPan={true}>
                             <div className={`w-72 font-sans ${isRtl ? 'text-right' : 'text-left'}`} dir={isRtl ? 'rtl' : 'ltr'}>
                                <div className="flex justify-between items-start mb-2 border-b border-slate-600 pb-2">
                                    <div className="flex gap-2">
                                        <span 
                                            className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                                            style={{ backgroundColor: `${getCategoryColor(event.category)}30`, color: getCategoryColor(event.category) }}
                                        >
                                            {t.cats[event.category]}
                                        </span>
                                        {hasCrowdData && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide bg-cyan-900/50 text-cyan-400 border border-cyan-800 animate-pulse">
                                                {t.crowdAnalyzed}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono">{event.date}</span>
                                </div>

                                <h3 className="font-bold text-sm text-white mb-1 leading-snug">{event.title}</h3>
                                <p className="text-xs text-slate-300 mb-3 leading-relaxed">{event.summary}</p>
                                
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                   {event.protestorCount ? (
                                      <div className="bg-slate-900/50 border border-slate-700/50 rounded p-1.5 shadow-sm">
                                         <span className="text-[8px] text-slate-400 uppercase font-bold block">{t.protestors}</span>
                                         <span className="text-xs font-mono font-bold" style={{ color: color }}>
                                             {formatCount(event.protestorCount)}
                                         </span>
                                      </div>
                                   ) : null}
                                   <div className="bg-slate-800/80 rounded p-1.5 border border-slate-700">
                                      <span className="text-[8px] text-slate-400 uppercase font-bold block">{t.reliability}</span>
                                      <span className="text-xs font-bold" style={{ color: getReliabilityColor(event.reliabilityScore) }}>
                                         {event.reliabilityScore || '?'}/10
                                      </span>
                                   </div>
                                </div>
                             </div>
                        </Popup>
                    )}
                </Marker>
            );
        })}
      </MapContainer>

      {/* TOP LEFT: LIVE ANALYTICS (Fixed to left for request) */}
      <div className={`absolute top-4 left-4 w-64 bg-slate-900/90 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-2xl z-[1000] overflow-hidden`} dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="bg-slate-800/50 p-2 border-b border-slate-700/50 flex items-center justify-between">
             <div className="flex items-center gap-2">
                 <Activity size={14} className="text-cyan-400 animate-pulse"/>
                 <span className="text-[10px] font-extrabold text-white uppercase tracking-widest">{t.liveAnalytics}</span>
             </div>
             <select 
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-[9px] text-slate-300 rounded px-1 py-0.5 outline-none focus:border-cyan-500 max-w-[80px]"
                onClick={(e) => e.stopPropagation()}
             >
                <option value="ALL">Global</option>
                {availableCountries.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
          <div className="p-3 space-y-3">
             <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase font-bold">{t.totalParticipants}</span>
                <span className="text-lg font-mono font-bold text-cyan-400">{analytics.totalProtestors.toLocaleString()}</span>
             </div>
             
             <div className="space-y-1">
                 <div className="flex items-center gap-1 mb-1">
                    <Users size={10} className="text-slate-500"/>
                    <span className="text-[9px] text-slate-500 uppercase font-bold">{t.civilians}</span>
                 </div>
                 <div className="grid grid-cols-3 gap-1">
                    <div className="bg-red-900/20 rounded p-1 text-center border border-red-900/30">
                        <span className="block text-[8px] text-red-400 uppercase">{t.dead}</span>
                        <span className="text-xs font-bold text-red-500">{analytics.civDead}</span>
                    </div>
                    <div className="bg-yellow-900/20 rounded p-1 text-center border border-yellow-900/30">
                        <span className="block text-[8px] text-yellow-400 uppercase">{t.injured}</span>
                        <span className="text-xs font-bold text-yellow-500">{analytics.civInjured}</span>
                    </div>
                    <div className="bg-blue-900/20 rounded p-1 text-center border border-blue-900/30">
                        <span className="block text-[8px] text-blue-400 uppercase">{t.detained}</span>
                        <span className="text-xs font-bold text-blue-500">{analytics.civDetained}</span>
                    </div>
                 </div>
             </div>

             <div className="space-y-1 border-t border-slate-700/50 pt-2">
                 <div className="flex items-center gap-1 mb-1">
                    <ShieldAlert size={10} className="text-slate-500"/>
                    <span className="text-[9px] text-slate-500 uppercase font-bold">{t.forces}</span>
                 </div>
                 <div className="grid grid-cols-3 gap-1">
                    <div className="bg-slate-800 rounded p-1 text-center border border-slate-700">
                        <span className="block text-[8px] text-slate-400 uppercase">{t.dead}</span>
                        <span className="text-xs font-bold text-slate-200">{analytics.secDead}</span>
                    </div>
                    <div className="bg-slate-800 rounded p-1 text-center border border-slate-700">
                        <span className="block text-[8px] text-slate-400 uppercase">{t.injured}</span>
                        <span className="text-xs font-bold text-slate-200">{analytics.secInjured}</span>
                    </div>
                 </div>
             </div>
          </div>
      </div>

      {/* TOP RIGHT: Notification Center & Active Alerts */}
      <div className={`absolute top-4 right-4 flex flex-col items-end gap-2 z-[1000] pointer-events-none`} dir={isRtl ? 'rtl' : 'ltr'}>
          {/* Notification History Toggle */}
          <button 
             onClick={() => setShowHistory(!showHistory)}
             className="pointer-events-auto bg-slate-900/90 hover:bg-slate-800 text-white p-2 rounded-lg border border-slate-700 shadow-xl flex items-center gap-2 transition-all relative"
          >
             <Bell size={16} className={alertHistory.length > 0 ? "text-cyan-400" : "text-slate-500"} />
             {alertHistory.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] flex items-center justify-center font-bold">{alertHistory.length}</span>
             )}
          </button>

          {/* History Panel */}
          {showHistory && (
             <div className="pointer-events-auto w-72 max-h-96 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right-5 fade-in">
                <div className="flex justify-between items-center p-2 border-b border-slate-800 bg-slate-950/50">
                    <h4 className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-2"><History size={12}/> {t.notifications}</h4>
                    <button onClick={() => setAlertHistory([])} className="text-[9px] text-red-400 hover:text-red-300">{t.clear}</button>
                </div>
                <div className="overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {alertHistory.length === 0 ? (
                        <div className="text-center py-4 text-[10px] text-slate-600 italic">{t.noHistory}</div>
                    ) : (
                        alertHistory.map((note) => (
                            <div key={`hist-${note.id}`} onClick={() => { onEventClick(note); setShowHistory(false); }} className="bg-slate-800/40 p-2 rounded border border-slate-800 hover:bg-slate-800 cursor-pointer transition-colors group">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="text-[9px] font-bold text-slate-300 truncate max-w-[150px]">{note.title}</span>
                                    <span className="text-[8px] text-slate-600 font-mono">{note.date}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[8px] text-slate-500">
                                   {note.protestorCount ? <span className="text-cyan-600 font-bold group-hover:text-cyan-400">👥 {formatCount(note.protestorCount)}</span> : null}
                                   <span className="truncate">{note.locationName}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
             </div>
          )}

          {/* Active Alerts List */}
          {activeAlerts.map(note => (
             <div key={note.id} className="w-72 bg-slate-900/95 backdrop-blur-md border border-red-500/30 rounded-lg shadow-xl p-3 pointer-events-auto animate-in slide-in-from-top-2 fade-in duration-500 cursor-pointer hover:bg-slate-900" onClick={() => onEventClick(note)}>
                 <div className="flex justify-between items-start mb-1">
                     <div className="flex items-center gap-1.5">
                        <AlertTriangle size={12} className="text-red-500 animate-pulse"/>
                        <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">{t.breakingNews}</span>
                     </div>
                     <span className="text-[9px] text-slate-500 font-mono">{note.date}</span>
                 </div>
                 <h4 className="text-xs font-bold text-white mb-1 leading-tight">{note.title}</h4>
                 <div className="flex items-center gap-3 text-[9px] text-slate-400">
                    {note.protestorCount ? <span>👥 {formatCount(note.protestorCount)}</span> : null}
                    {note.locationName ? <span className="truncate max-w-[100px]">📍 {note.locationName}</span> : null}
                 </div>
             </div>
         ))}
      </div>

      {/* BOTTOM LEGEND */}
      <div className={`absolute bottom-4 p-4 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded text-xs text-slate-300 pointer-events-none shadow-lg z-[1000] ${isRtl ? 'right-4' : 'left-4'}`} dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="flex gap-6 pointer-events-auto">
            <div>
                <h3 className="font-bold mb-2 text-white font-mono tracking-wider">{t.eventTypes}</h3>
                <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> {t.cats[EventCategory.MILITARY]}</div>
                <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> {t.cats[EventCategory.POLITICAL]}</div>
                <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> {t.cats[EventCategory.CYBER]}</div>
                <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> {t.cats[EventCategory.TERRORISM]}</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> {t.cats[EventCategory.CIVIL_UNREST]}</div>
            </div>
            
            <div className="border-l border-slate-700 pl-4">
                <h3 className="font-bold mb-2 text-white font-mono tracking-wider">{t.densityLegend}</h3>
                <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-cyan-400"></span> Low</div>
                <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-yellow-400"></span> Moderate</div>
                <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-orange-400"></span> High</div>
                <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Severe</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-fuchsia-500"></span> Extreme</div>
            </div>
        </div>

        <div className="mt-3 pt-2 border-t border-slate-600 space-y-2 pointer-events-auto">
             <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-cyan-500 bg-cyan-900/50 animate-pulse"></span> {t.crowdAnalyzed}</div>
             <button onClick={() => setShowHeatmap(!showHeatmap)} className={`flex items-center gap-2 text-[10px] font-bold uppercase transition-colors ${showHeatmap ? 'text-orange-400' : 'text-slate-500 hover:text-orange-300'}`}>
                 <Flame size={12} fill={showHeatmap ? "currentColor" : "none"}/> {t.densityMap}
             </button>
        </div>
      </div>
    </div>
  );
};

export default GlobeVis;
