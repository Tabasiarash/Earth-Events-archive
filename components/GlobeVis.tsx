
import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { IntelEvent, EventCategory, AppLanguage } from '../types';

interface GlobeVisProps {
  events: IntelEvent[];
  selectedEventId?: string;
  onEventClick: (event: IntelEvent) => void;
  onClosePopup?: () => void;
  language: AppLanguage;
}

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

const formatCount = (n: number) => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
};

const createCustomIcon = (color: string, isSelected: boolean, hasCrowdData: boolean, count?: number) => {
  const size = isSelected ? 24 : (hasCrowdData ? 24 : 16);
  
  // Custom SVG for Crowd Data events (Target/Eye like)
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
  
  // If crowd data exists, wrap svg in a div and add a count label
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
        crowdAnalyzed: "CROWD ANALYZED"
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
        crowdAnalyzed: "تحلیل جمعیت"
    },
    de: {
        eventTypes: "EREIGNISTYPEN",
        reliability: "Zuverlässigkeit",
        reason: "Grund",
        verified: "Verifizierte Quellen",
        protestors: "Geschätzte Protestierende",
        impact: "Humanitäre Auswirkungen",
        dead: "Getötet",
        injured: "Verletzt",
        detained: "Inhaftiert",
        cats: {
            [EventCategory.MILITARY]: "Militär",
            [EventCategory.POLITICAL]: "Politisch",
            [EventCategory.CYBER]: "Cyber",
            [EventCategory.TERRORISM]: "Terrorismus",
            [EventCategory.CIVIL_UNREST]: "Unruhen",
            [EventCategory.OTHER]: "Andere"
        },
        crowdAnalyzed: "MENGE ANALYSIERT"
    },
    ar: {
        eventTypes: "أنواع الأحداث",
        reliability: "الموثوقية",
        reason: "السبب",
        verified: "مصادر موثوقة",
        protestors: "تقدير المتظاهرين",
        impact: "الأثر الإنساني",
        dead: "قتلى",
        injured: "جرحى",
        detained: "معتقلين",
        cats: {
            [EventCategory.MILITARY]: "عسكري",
            [EventCategory.POLITICAL]: "سياسي",
            [EventCategory.CYBER]: "إلكتروني",
            [EventCategory.TERRORISM]: "إرهاب",
            [EventCategory.CIVIL_UNREST]: "اضطرابات مدنية",
            [EventCategory.OTHER]: "أخرى"
        },
        crowdAnalyzed: "تحليل الحشود"
    }
};

const MapController: React.FC<{ selectedEvent?: IntelEvent }> = ({ selectedEvent }) => {
  const map = useMap();
  useEffect(() => {
    if (selectedEvent) {
      // Instantly center map on event without changing zoom level
      map.setView([selectedEvent.lat, selectedEvent.lng], map.getZoom(), { animate: false });
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
  const t = translations[language] || translations.en;
  const isRtl = language === 'ar' || language === 'fa';
  
  const safeEvents = useMemo(() => {
    return events.filter(e => 
        !isNaN(e.lat) && !isNaN(e.lng) && e.lat !== 0 && e.lng !== 0
    );
  }, [events]);

  const selectedEvent = useMemo(() => 
    safeEvents.find(e => e.id === selectedEventId), 
  [selectedEventId, safeEvents]);

  const getReliabilityColor = (score?: number) => {
      if (!score) return '#94a3b8';
      if (score >= 8) return '#10b981';
      if (score >= 5) return '#eab308';
      return '#ef4444';
  };

  return (
    <div className="relative w-full h-full bg-slate-950 z-0">
      <MapContainer 
        center={[20, 0]} 
        zoom={2} 
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

        {safeEvents.map(event => {
            const isSelected = selectedEventId === event.id;
            const color = getCategoryColor(event.category);
            const hasCrowdData = (event.protestorCount || 0) > 0;
            
            return (
                <Marker 
                    key={event.id} 
                    position={[event.lat, event.lng]}
                    icon={createCustomIcon(color, isSelected, hasCrowdData, event.protestorCount)}
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
                                            style={{ backgroundColor: `${color}30`, color: color }}
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
                                
                                {/* Analysis Stats */}
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                   {event.protestorCount ? (
                                      <div className="bg-cyan-900/20 border border-cyan-800/30 rounded p-1.5 shadow-[0_0_10px_rgba(34,211,238,0.1)]">
                                         <span className="text-[8px] text-cyan-500 uppercase font-bold block">{t.protestors}</span>
                                         <span className="text-xs font-mono text-cyan-300 font-bold">{event.protestorCount.toLocaleString()}</span>
                                      </div>
                                   ) : null}
                                   <div className="bg-slate-800/80 rounded p-1.5 border border-slate-700">
                                      <span className="text-[8px] text-slate-400 uppercase font-bold block">{t.reliability}</span>
                                      <span className="text-xs font-bold" style={{ color: getReliabilityColor(event.reliabilityScore) }}>
                                         {event.reliabilityScore || '?'}/10
                                      </span>
                                   </div>
                                </div>

                                {/* Detailed Impact */}
                                {(event.casualties?.dead || 0) + (event.casualties?.injured || 0) + (event.casualties?.detained || 0) > 0 && (
                                    <div className="bg-red-950/20 border border-red-900/30 rounded p-2 mb-3">
                                        <span className="text-[9px] font-bold text-red-500 uppercase block mb-1.5 tracking-wider">{t.impact}</span>
                                        <div className="flex justify-between text-[11px] font-bold">
                                            <div className="flex flex-col items-center flex-1">
                                                <span className="text-red-500">{event.casualties?.dead || 0}</span>
                                                <span className="text-[8px] text-slate-500 uppercase font-normal">{t.dead}</span>
                                            </div>
                                            <div className="flex flex-col items-center flex-1 border-x border-slate-800">
                                                <span className="text-yellow-500">{event.casualties?.injured || 0}</span>
                                                <span className="text-[8px] text-slate-500 uppercase font-normal">{t.injured}</span>
                                            </div>
                                            <div className="flex flex-col items-center flex-1">
                                                <span className="text-blue-500">{event.casualties?.detained || 0}</span>
                                                <span className="text-[8px] text-slate-500 uppercase font-normal">{t.detained}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {event.groundingUrls && event.groundingUrls.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-600/50">
                                        <div className="flex flex-col gap-1">
                                            {event.groundingUrls.slice(0, 2).map((url, i) => (
                                                <a 
                                                    key={i} 
                                                    href={url} 
                                                    target="_blank" 
                                                    rel="noreferrer"
                                                    className="text-[9px] text-cyan-400 hover:text-cyan-300 truncate block hover:underline"
                                                >
                                                    🔗 {new URL(url).hostname}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                             </div>
                        </Popup>
                    )}
                </Marker>
            );
        })}
      </MapContainer>

      <div className={`absolute bottom-4 p-4 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded text-xs text-slate-300 pointer-events-none shadow-lg z-[1000] ${isRtl ? 'right-4' : 'left-4'}`} dir={isRtl ? 'rtl' : 'ltr'}>
        <h3 className="font-bold mb-2 text-white font-mono tracking-wider">{t.eventTypes}</h3>
        <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> {t.cats[EventCategory.MILITARY]}</div>
        <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> {t.cats[EventCategory.POLITICAL]}</div>
        <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> {t.cats[EventCategory.CYBER]}</div>
        <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> {t.cats[EventCategory.TERRORISM]}</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> {t.cats[EventCategory.CIVIL_UNREST]}</div>
        <div className="mt-3 pt-2 border-t border-slate-600">
             <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-cyan-500 bg-cyan-900/50 animate-pulse"></span> {t.crowdAnalyzed}</div>
        </div>
      </div>
    </div>
  );
};

export default GlobeVis;