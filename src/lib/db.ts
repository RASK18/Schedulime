import {
  createEmptySnapshot,
  defaultSettings,
  defaultSyncState,
  type Anime,
  type AppSnapshot,
  type DecisionKind,
  type ScheduleEntry,
  type Settings,
  type SyncState
} from '../types';

type StoreName = 'settings' | 'anime' | 'schedule' | 'decisions' | 'meta';

interface StoredDecisionRecord {
  mediaId: number;
  decision: string;
  updatedAt?: number;
}

interface SingletonRecord<T> {
  key: string;
  value: T;
}

const DB_NAME = 'schedulime-db';
const DB_VERSION = 1;

let databasePromise: Promise<IDBDatabase> | null = null;

const isDecisionKind = (decision: string): decision is DecisionKind =>
  decision === 'watching' || decision === 'unsure' || decision === 'ignore';

const hasValidDecision = (
  decision: StoredDecisionRecord
): decision is StoredDecisionRecord & { decision: DecisionKind } =>
  isDecisionKind(decision.decision);

const openDatabase = (): Promise<IDBDatabase> => {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }

      if (!database.objectStoreNames.contains('anime')) {
        database.createObjectStore('anime', { keyPath: 'id' });
      }

      if (!database.objectStoreNames.contains('schedule')) {
        const scheduleStore = database.createObjectStore('schedule', { keyPath: 'key' });
        scheduleStore.createIndex('airingAt', 'airingAt');
      }

      if (!database.objectStoreNames.contains('decisions')) {
        database.createObjectStore('decisions', { keyPath: 'mediaId' });
      }

      if (!database.objectStoreNames.contains('meta')) {
        database.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('No se pudo abrir la base de datos local.'));
  });

  return databasePromise;
};

const awaitTransaction = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('La transacción de IndexedDB ha fallado.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('La transacción de IndexedDB fue cancelada.'));
  });

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('La petición a IndexedDB no se pudo completar.'));
  });

export const loadSnapshot = async (): Promise<AppSnapshot> => {
  const database = await openDatabase();
  const transaction = database.transaction(
    ['settings', 'anime', 'schedule', 'decisions', 'meta'],
    'readonly'
  );

  const settingsStore = transaction.objectStore('settings');
  const animeStore = transaction.objectStore('anime');
  const scheduleStore = transaction.objectStore('schedule');
  const decisionsStore = transaction.objectStore('decisions');
  const metaStore = transaction.objectStore('meta');

  const [storedSettings, animeList, scheduleEntries, decisions, syncState, watchedMediaIds] =
    await Promise.all([
      requestToPromise(
        settingsStore.get('settings') as IDBRequest<SingletonRecord<Settings> | undefined>
      ),
      requestToPromise(animeStore.getAll() as IDBRequest<Anime[]>),
      requestToPromise(scheduleStore.getAll() as IDBRequest<ScheduleEntry[]>),
      requestToPromise(decisionsStore.getAll() as IDBRequest<StoredDecisionRecord[]>),
      requestToPromise(
        metaStore.get('syncState') as IDBRequest<SingletonRecord<SyncState> | undefined>
      ),
      requestToPromise(
        metaStore.get('watchedMediaIds') as IDBRequest<SingletonRecord<number[]> | undefined>
      )
    ]);

  await awaitTransaction(transaction);

  const snapshot = createEmptySnapshot();
  snapshot.settings = storedSettings?.value ?? defaultSettings();
  snapshot.animeById = Object.fromEntries(animeList.map((anime) => [anime.id, anime]));
  snapshot.scheduleEntries = scheduleEntries;
  const decisionEntries = decisions
    .filter(hasValidDecision)
    .map((decision): [number, DecisionKind] => [decision.mediaId, decision.decision]);
  snapshot.decisionsByMediaId = Object.fromEntries(
    decisionEntries
  ) as Record<number, DecisionKind>;
  snapshot.syncState = syncState?.value ?? defaultSyncState();
  snapshot.watchedMediaIds = watchedMediaIds?.value ?? [];

  return snapshot;
};

export const saveSettings = async (settings: Settings): Promise<void> => {
  const database = await openDatabase();
  const transaction = database.transaction('settings', 'readwrite');
  transaction.objectStore('settings').put({ key: 'settings', value: settings });
  await awaitTransaction(transaction);
};

export const saveSyncState = async (syncState: SyncState): Promise<void> => {
  const database = await openDatabase();
  const transaction = database.transaction('meta', 'readwrite');
  transaction.objectStore('meta').put({ key: 'syncState', value: syncState });
  await awaitTransaction(transaction);
};

export const replaceSyncSnapshot = async (payload: {
  animeList: Anime[];
  scheduleEntries: ScheduleEntry[];
  watchedMediaIds: number[];
  syncState: SyncState;
}): Promise<void> => {
  const database = await openDatabase();
  const transaction = database.transaction(['anime', 'schedule', 'meta'], 'readwrite');
  const animeStore = transaction.objectStore('anime');
  const scheduleStore = transaction.objectStore('schedule');
  const metaStore = transaction.objectStore('meta');

  animeStore.clear();
  scheduleStore.clear();

  payload.animeList.forEach((anime) => animeStore.put(anime));
  payload.scheduleEntries.forEach((entry) => scheduleStore.put(entry));

  metaStore.put({ key: 'watchedMediaIds', value: payload.watchedMediaIds });
  metaStore.put({ key: 'syncState', value: payload.syncState });

  await awaitTransaction(transaction);
};

export const saveDecision = async (
  mediaId: number,
  decision: DecisionKind | null
): Promise<void> => {
  const database = await openDatabase();
  const transaction = database.transaction('decisions', 'readwrite');
  const store = transaction.objectStore('decisions');

  if (decision) {
    store.put({ mediaId, decision, updatedAt: Date.now() });
  } else {
    store.delete(mediaId);
  }

  await awaitTransaction(transaction);
};
