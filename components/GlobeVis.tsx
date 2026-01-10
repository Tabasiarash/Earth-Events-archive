
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { IntelEvent, EventCategory, AppLanguage } from '../types';
import { Users, Skull, ShieldAlert, AlertTriangle, Bell, Activity, Flame, History, X, Globe, Layers, Map as MapIcon } from 'lucide-react';

interface GlobeVisProps {
  events: IntelEvent[];
  selectedEventId?: string;
  onEventClick: (event: IntelEvent) => void;
  onClosePopup?: () => void;
  language: AppLanguage;
}

const getCategoryColor = (category: EventCategory): string => {
  switch (category) {
    case EventCategory.MILITARY: return '#ef4444';
    case EventCategory.POLITICAL: return '#3b82f6';
    case EventCategory.CYBER: return '#10b981';
    case EventCategory.TERRORISM: return '#f97316';
    case EventCategory.CIVIL_UNREST: return '#eab308';
    default: return '#94a3b8';
  }
};

const getDensityColor = (count: number): string => {
  if (count < 500) return '#22d3ee';
  if (count < 2000) return '#facc15';
  if (count < 5000) return '#f97316';
  return '#ef4444';
};

const formatCount = (n: number) => {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
};

const createCustomIcon = (color: string, isSelected: boolean, count?: number, isCrowdResult?: boolean) => {
  const size = isSelected ? 28 : 18;
  const pulseClass = isCrowdResult ? 'animate-pulse' : '';
  
  const html = `
    <div class="flex items-center justify-center relative ${pulseClass}">
      <div style="background: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px ${color}aa;"></div>
      ${count && isSelected ? `<div class="absolute -top-6 bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded border border-slate-700 font-bold">${formatCount(count)}</div>` : ''}
    </div>
  `;

  return new L.DivIcon({
    className: 'custom-leaflet-marker',
    html: html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
};

const MapController: React.FC<{ selectedEvent?: IntelEvent }> = ({ selectedEvent }) => {
  const map = useMap();
  useEffect(() => {
    if (selectedEvent) {
      map.flyTo([selectedEvent.lat, selectedEvent.lng], 13, { duration: 1.5 });
    }
  }, [selectedEvent, map]);
  return null;
};

const GlobeVis: React.FC<GlobeVisProps> = ({ events, selectedEventId, onEventClick, onClosePopup, language }) => {
  const [activeAlerts, setActiveAlerts] = useState<IntelEvent[]>([]);
  const processedAlertIds = useRef<Set<string>>(new Set());

  const t = language === 'fa' ? {
      live: "آمار زنده",
      dead: "کشته",
      injured: "مجروح",
      protestors: "جمعیت",
      satView: "نمای ماهواره‌ای",
      darkView: "نمای تاریک"
  } : {
      live: "LIVE INTEL",
      dead: "Killed",
      injured: "Injured",
      protestors: "Crowd",
      satView: "Satellite",
      darkView: "Tactical Dark"
  };

  useEffect(() => {
      const newHighPriority = events.filter(e => {
        const isCritical = (e.casualties?.dead || 0) > 0 || (e.protestorCount || 0) > 5000;
        return isCritical && !processedAlertIds.current.has(e.id);
      });

      if (newHighPriority.length > 0) {
          processedAlertIds.current.add(newHighPriority[0].id);
          setActiveAlerts(prev => [newHighPriority[0], ...prev].slice(0, 3));
          setTimeout(() => setActiveAlerts(current => current.filter(a => a.id !== newHighPriority[0].id)), 8000);
      }
  }, [events]);

  return (
    <div className="relative w-full h-full bg-slate-950">
      <MapContainer 
        center={[32.4279, 53.6880]} zoom={5} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false} attributionControl={false}
      >
        <LayersControl position="bottomright">
          <LayersControl.BaseLayer checked name={t.darkView}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name={t.satView}>
            <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" />
          </LayersControl.BaseLayer>
        </LayersControl>

        <MapController selectedEvent={events.find(e => e.id === selectedEventId)} />

        {events.map(event => (
            <Marker 
                key={event.id} 
                position={[event.lat, event.lng]}
                icon={createCustomIcon(
                    (event.protestorCount || 0) > 0 ? getDensityColor(event.protestorCount || 0) : getCategoryColor(event.category),
                    selectedEventId === event.id,
                    event.protestorCount,
                    event.isCrowdResult
                )}
                eventHandlers={{ click: () => onEventClick(event) }}
            >
                {selectedEventId === event.id && (
                    <Popup closeButton={false}>
                        <div className="w-64 p-1">
                            <h4 className="font-bold text-sm mb-1">{event.title}</h4>
                            <p className="text-[10px] text-slate-300 line-clamp-2">{event.summary}</p>
                            <div className="mt-2 flex gap-2">
                                {event.protestorCount ? <span className="text-[9px] bg-cyan-900/50 text-cyan-400 px-1 rounded">CROWD: {formatCount(event.protestorCount)}</span> : null}
                                <span className="text-[9px] bg-slate-800 text-slate-400 px-1 rounded">{event.date}</span>
                            </div>
                        </div>
                    </Popup>
                )}
            </Marker>
        ))}
      </MapContainer>

      {/* OVERLAY: Alert Feed */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000] w-72 pointer-events-none">
          {activeAlerts.map(alert => (
              <div key={alert.id} className="bg-red-950/90 border border-red-500 p-3 rounded-lg shadow-2xl animate-in slide-in-from-right fade-in duration-500">
                  <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle size={14} className="text-red-500 animate-pulse"/>
                      <span className="text-[10px] font-bold text-red-400 uppercase">Flash Intel</span>
                  </div>
                  <h5 className="text-xs font-bold text-white leading-tight">{alert.title}</h5>
                  <p className="text-[9px] text-red-200 mt-1">{alert.locationName}</p>
              </div>
          ))}
      </div>

      {/* OVERLAY: HUD Analytics */}
      <div className="absolute top-4 left-4 z-[1000] pointer-events-none">
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-3 rounded-xl shadow-2xl w-56 pointer-events-auto">
              <div className="flex items-center gap-2 mb-3 border-b border-slate-700 pb-2">
                  <Activity size={14} className="text-cyan-400 animate-pulse"/>
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">{t.live}</span>
              </div>
              <div className="space-y-2">
                  <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 uppercase">{t.protestors}</span>
                      <span className="text-sm font-mono font-bold text-cyan-400">{events.reduce((acc, e) => acc + (e.protestorCount || 0), 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 uppercase">{t.dead}</span>
                      <span className="text-sm font-mono font-bold text-red-500">{events.reduce((acc, e) => acc + (e.casualties?.dead || 0), 0)}</span>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default GlobeVis;
