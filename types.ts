
export enum EventCategory {
  MILITARY = 'Military',
  POLITICAL = 'Political',
  CYBER = 'Cyber',
  TERRORISM = 'Terrorism',
  CIVIL_UNREST = 'Civil Unrest',
  OTHER = 'Other'
}

export enum SourceType {
  TELEGRAM = 'Telegram',
  INSTAGRAM = 'Instagram',
  TWITTER = 'Twitter',
  WEB = 'Web',
  MANUAL = 'Manual'
}

export type AppLanguage = 'en' | 'de' | 'fa' | 'ar';

export interface Casualties {
  dead: number;
  injured: number;
  detained: number;
}

export interface IntelEvent {
  id: string;
  title: string;
  summary: string;
  date: string; // ISO String
  locationName: string;
  lat: number;
  lng: number;
  category: EventCategory;
  sourceType: SourceType;
  sourceName?: string;
  sourceUrl?: string; 
  sourceId?: string; 
  groundingUrls?: string[]; 
  reliabilityScore?: number; 
  reliabilityReason?: string;
  // Analysis fields
  protestorCount?: number; // Estimated number of protestors
  casualties?: Casualties; // Categorized casualties
}

export interface ProcessingStatus {
  isProcessing: boolean;
  message: string;
  error?: string;
}

export interface FetchResult {
  events: IntelEvent[];
  nextCursor?: string;
  channelName?: string;
  oldestPostDate?: string;
}

export interface SyncConfig {
  enabled: boolean;
  intervalMinutes: number;
  monitoredChannels: { url: string; type: SourceType }[]; 
  lastSyncTimestamp?: number;
}

export interface ChannelMetadata {
  lastCursor?: string;
  totalEvents: number;
  lastUpdate: string;
  type: SourceType;
}

export type ChannelMetadataMap = Record<string, ChannelMetadata>;

export interface CrowdAnalysisResult {
  minEstimate: number;
  maxEstimate: number;
  confidence: 'High' | 'Medium' | 'Low';
  crowdType: string;
  description: string;
  hazards: string[];
  location?: string;
  lat?: number;
  lng?: number;
  date?: string;
}