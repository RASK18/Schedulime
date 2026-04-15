export const APP_VERSION = __APP_VERSION__;
export const DEFAULT_MAX_EPISODES_PER_DAY = 3;
export const SYNC_STALE_AFTER_MS = 1000 * 60 * 60 * 6;

export type DecisionKind = 'watching' | 'unsure' | 'ignore';
export type TimezoneMode = 'local';
export type RecommendationReason = 'continuation' | 'score';
export type AutoIgnoreReason =
  | 'low-score'
  | 'missing-score-after-episode-3'
  | 'short-ona-ova'
  | 'non-japan-origin';
export type IgnoredSource = 'manual' | 'automatic';

export interface Settings {
  anilistUsername: string;
  maxEpisodesPerDay: number;
  hideIgnored: boolean;
  timezoneMode: TimezoneMode;
}

export interface Anime {
  id: number;
  title: string;
  titleEnglish: string | null;
  titleNative: string | null;
  description: string | null;
  coverImage: string;
  coverColor: string | null;
  siteUrl: string;
  averageScore: number | null;
  popularity: number | null;
  episodes: number | null;
  duration: number | null;
  format: string | null;
  countryOfOrigin: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  isAdult: boolean;
  genres: string[];
  prequelIds: number[];
}

export interface ScheduleEntry {
  key: string;
  mediaId: number;
  airingAt: number;
  episode: number | null;
}

export interface UserDecision {
  mediaId: number;
  decision: DecisionKind;
  updatedAt: number;
}

export interface SyncState {
  appVersion: string;
  availableVersion: string | null;
  weekKey: string | null;
  syncWindowStart: number | null;
  syncWindowEnd: number | null;
  lastAttempt: number | null;
  lastSuccessfulSync: number | null;
  latestError: string | null;
  stale: boolean;
}

export interface AppSnapshot {
  settings: Settings;
  animeById: Record<number, Anime>;
  scheduleEntries: ScheduleEntry[];
  decisionsByMediaId: Record<number, DecisionKind>;
  watchedMediaIds: number[];
  syncState: SyncState;
}

export interface CalendarEntryViewModel {
  entry: ScheduleEntry;
  anime: Anime;
  decision: DecisionKind | null;
  isRecommended: boolean;
  recommendationReason: RecommendationReason | null;
  ignoredSource: IgnoredSource | null;
  autoIgnoreReason: AutoIgnoreReason | null;
  weekdayIndex: number;
  timeLabel: string;
}

export interface CalendarDayViewModel {
  index: number;
  label: string;
  shortLabel: string;
  dateLabel: string;
  entries: CalendarEntryViewModel[];
  recommendedCount: number;
}

export interface CalendarViewModel {
  days: CalendarDayViewModel[];
  ignoredEntries: CalendarEntryViewModel[];
  todayIndex: number;
}

export interface WeeklyWindow {
  startMs: number;
  endMs: number;
  syncStartMs: number;
  syncEndMs: number;
  weekKey: string;
}

export const defaultSettings = (): Settings => ({
  anilistUsername: '',
  maxEpisodesPerDay: DEFAULT_MAX_EPISODES_PER_DAY,
  hideIgnored: true,
  timezoneMode: 'local'
});

export const defaultSyncState = (): SyncState => ({
  appVersion: APP_VERSION,
  availableVersion: null,
  weekKey: null,
  syncWindowStart: null,
  syncWindowEnd: null,
  lastAttempt: null,
  lastSuccessfulSync: null,
  latestError: null,
  stale: true
});

export const createEmptySnapshot = (): AppSnapshot => ({
  settings: defaultSettings(),
  animeById: {},
  scheduleEntries: [],
  decisionsByMediaId: {},
  watchedMediaIds: [],
  syncState: defaultSyncState()
});
