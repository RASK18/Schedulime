import { AniListError, fetchPublicUserWatchSet, fetchWeeklySchedule } from './anilist';
import {
  APP_VERSION,
  SYNC_STALE_AFTER_MS,
  defaultSyncState,
  type Settings,
  type SyncState,
  type WeeklyWindow
} from '../types';
import { getLocalWeekWindow } from './date';

const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;

const compareVersions = (left: string, right: string): number => {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
};

export const isSnapshotStale = (
  syncState: SyncState,
  targetWeekWindow: WeeklyWindow = getLocalWeekWindow()
): boolean => {
  const currentWindow = targetWeekWindow;

  if (!syncState.lastSuccessfulSync) {
    return true;
  }

  if (syncState.weekKey !== currentWindow.weekKey) {
    return true;
  }

  return Date.now() - syncState.lastSuccessfulSync > SYNC_STALE_AFTER_MS;
};

export const createFailedSyncState = (
  currentState: SyncState | null,
  message: string
): SyncState => ({
  ...(currentState ?? defaultSyncState()),
  appVersion: APP_VERSION,
  latestError: message,
  stale: true,
  lastAttempt: Date.now()
});

export const syncSchedulime = async (
  settings: Settings,
  targetWeekWindow: WeeklyWindow = getLocalWeekWindow()
): Promise<{
  animeList: Awaited<ReturnType<typeof fetchWeeklySchedule>>['animeList'];
  scheduleEntries: Awaited<ReturnType<typeof fetchWeeklySchedule>>['scheduleEntries'];
  watchedMediaIds: number[];
  syncState: SyncState;
  warningMessage: string | null;
}> => {
  const weekWindow = targetWeekWindow;
  const { animeList, scheduleEntries } = await fetchWeeklySchedule({
    startSec: Math.floor(weekWindow.syncStartMs / 1000),
    endSec: Math.floor(weekWindow.syncEndMs / 1000)
  });

  let watchedMediaIds: number[] = [];
  let warningMessage: string | null = settings.anilistUsername.trim()
    ? null
    : 'Añade tu usuario público de AniList para priorizar continuaciones automáticamente.';

  if (settings.anilistUsername.trim()) {
    try {
      watchedMediaIds = await fetchPublicUserWatchSet(settings.anilistUsername.trim());
    } catch {
      warningMessage =
        'No se pudo leer la lista pública de AniList. El calendario sigue funcionando, pero las continuaciones pueden no priorizarse.';
    }
  }

  const now = Date.now();

  return {
    animeList,
    scheduleEntries,
    watchedMediaIds,
    syncState: {
      appVersion: APP_VERSION,
      availableVersion: null,
      weekKey: weekWindow.weekKey,
      syncWindowStart: weekWindow.syncStartMs,
      syncWindowEnd: weekWindow.syncEndMs,
      lastAttempt: now,
      lastSuccessfulSync: now,
      latestError: null,
      stale: false
    },
    warningMessage
  };
};

export const getSyncErrorMessage = (error: unknown): string => {
  if (error instanceof AniListError) {
    if (error.status === 403) {
      return 'AniList ha rechazado temporalmente la consulta. Se mantiene la copia local.';
    }

    if (error.status === 429) {
      return 'AniList ha limitado las peticiones. Se mantiene la última snapshot local.';
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'La sincronización ha fallado. Se mantiene la copia local disponible.';
};

export const checkRemoteVersion = async (currentVersion: string): Promise<string | null> => {
  try {
    const response = await fetch(VERSION_URL, {
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { version?: string };

    if (!payload.version) {
      return null;
    }

    return compareVersions(payload.version, currentVersion) > 0 ? payload.version : null;
  } catch {
    return null;
  }
};
