import {
  Fragment,
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode
} from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  APP_VERSION,
  createEmptySnapshot,
  type AppSnapshot,
  type CalendarDayViewModel,
  type CalendarEntryViewModel,
  type DecisionKind,
  type Settings
} from '../types';
import { buildCalendarView } from '../lib/recommendations';
import {
  formatLastUpdatedLabel,
  formatWeekRangeLabel,
  getLocalWeekWindow,
  getTodayWeekdayIndex
} from '../lib/date';
import { loadSnapshot, replaceSyncSnapshot, saveDecision, saveSettings, saveSyncState } from '../lib/db';
import { validatePublicUser } from '../lib/anilist';
import {
  checkRemoteVersion,
  createFailedSyncState,
  getSyncErrorMessage,
  isSnapshotStale,
  syncSchedulime
} from '../lib/sync';

type SaveResult = {
  ok: boolean;
  error?: string;
};

type ToastState = {
  message: string;
  tone: 'success';
};

const statusToneLabels: Record<NonNullable<CalendarEntryViewModel['recommendationReason']>, string> = {
  continuation: 'Continuación',
  score: 'Top score'
};

const decisionToneLabels: Record<DecisionKind, string> = {
  watching: 'Viendo',
  unsure: 'Dudando',
  ignore: 'Ignorar'
};

const compactNumberFormatter = new Intl.NumberFormat('es-ES', {
  notation: 'compact',
  maximumFractionDigits: 1
});

const recommendationSymbols: Record<
  NonNullable<CalendarEntryViewModel['recommendationReason']>,
  string
> = {
  continuation: '↻',
  score: '★'
};

const recommendationLabels: Record<
  NonNullable<CalendarEntryViewModel['recommendationReason']>,
  string
> = {
  continuation: 'Continuación',
  score: 'Top score'
};

const decisionSymbols: Record<DecisionKind, string> = {
  watching: '+',
  unsure: '?',
  ignore: '×'
};

const decisionLabels: Record<DecisionKind, string> = {
  watching: 'Viendo',
  unsure: 'Dudando',
  ignore: 'Ignorar'
};

const compactRecommendationSymbols: Record<
  NonNullable<CalendarEntryViewModel['recommendationReason']>,
  string
> = {
  continuation: '>',
  score: '*'
};

const compactDecisionSymbols: Record<DecisionKind, string> = {
  watching: '+',
  unsure: '?',
  ignore: 'x'
};

const logoUrl = `${import.meta.env.BASE_URL}schedulime-logo.png`;

const formatAnimeMetric = (
  value: number | null,
  type: 'score' | 'popularity'
): string => {
  if (value === null) {
    return 'N/A';
  }

  if (type === 'score') {
    return `${Math.round(value)}%`;
  }

  if (value < 1000) {
    return `${Math.round(value)}`;
  }

  return `${Math.round(value / 1000)}k`;
};

const renderDescriptionContent = (description: string): ReactNode => {
  const sanitizedDescription = description
    .replace(/\r\n?/g, '\n')
    .replace(/(?:<br\s*\/?>\s*){2,}\(Source:\s*[^)]+\)\s*(?=(?:<br\s*\/?>|\n|$))/gi, '')
    .replace(/\n{2,}\(Source:\s*[^)]+\)\s*(?=\n|$)/gi, '')
    .trim();
  const parser = new DOMParser();
  const document = parser.parseFromString(`<div>${sanitizedDescription}</div>`, 'text/html');
  const root = document.body.firstElementChild;

  if (!root) {
    return sanitizedDescription;
  }

  const renderNodes = (nodes: ChildNode[], keyPrefix: string): ReactNode[] =>
    nodes.flatMap((node, index) => {
      const key = `${keyPrefix}-${index}`;

      if (node.nodeType === Node.TEXT_NODE) {
        const textContent = node.textContent ?? '';
        if (textContent.trim().length === 0) {
          return [];
        }

        return textContent.replace(/\s+/g, ' ');
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return [];
      }

      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();
      const children = renderNodes(Array.from(element.childNodes), key);

      if (tagName === 'br') {
        return <br key={key} />;
      }

      if (tagName === 'strong' || tagName === 'b') {
        return <strong key={key}>{children}</strong>;
      }

      if (tagName === 'em' || tagName === 'i') {
        return <em key={key}>{children}</em>;
      }

      if (tagName === 'p') {
        return (
          <Fragment key={key}>
            {children}
            {index < nodes.length - 1 ? (
              <>
                <br />
                <br />
              </>
            ) : null}
          </Fragment>
        );
      }

      if (
        tagName === 'script' ||
        tagName === 'style' ||
        tagName === 'iframe' ||
        tagName === 'object' ||
        tagName === 'embed'
      ) {
        return [];
      }

      return children;
    });

  const content = renderNodes(Array.from(root.childNodes), 'description');
  return content.length > 0 ? content : sanitizedDescription;
};

const interpolateLightness = (
  value: number,
  min: number,
  max: number,
  darkest: number,
  lightest: number
): number => {
  if (max <= min) {
    return darkest;
  }

  const clampedValue = Math.min(Math.max(value, min), max);
  const ratio = (clampedValue - min) / (max - min);

  return lightest - (lightest - darkest) * ratio;
};

const getScoreColor = (value: number | null): string | undefined => {
  if (value === null) {
    return undefined;
  }

  if (value >= 75) {
    return `hsl(152 64% ${interpolateLightness(value, 75, 100, 34, 66)}%)`;
  }

  if (value >= 62) {
    return `hsl(45 88% ${interpolateLightness(value, 62, 75, 68, 36)}%)`;
  }

  return `hsl(7 82% ${interpolateLightness(value, 50, 61, 70, 40)}%)`;
};

const getDecisionSummaryLabel = (decision: DecisionKind | null): string =>
  decision ? decisionLabels[decision] : 'Elegir estado';

const getIgnoredSourceLabel = (entry: CalendarEntryViewModel): string => {
  if (entry.ignoredSource === 'manual') {
    return '';
  }

  if (entry.autoIgnoreReason === 'low-score') {
    return 'Autoignorado: score medio menor de 50';
  }

  if (entry.autoIgnoreReason === 'short-ona-ova') {
    return 'Autoignorado: ONA/OVA de 3 minutos o menos';
  }

  if (entry.autoIgnoreReason === 'non-japan-origin') {
    return 'Autoignorado: país de origen distinto de Japón';
  }

  if (entry.autoIgnoreReason === 'missing-score-after-episode-3') {
    return 'Autoignorado: tiene 3 episodios o más y aun no tiene score';
  }

  return 'Ignorado';
};

const truncateIgnoredTitle = (title: string): string =>
  title.length > 50 ? `${title.slice(0, 47)}...` : title;

const getStreamingUrl = (title: string, episode: number | null): string | null => {
  if (episode === null) {
    return null;
  }

  const slug = title
    .replace(/[^A-Za-z0-9-\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();

  if (!slug) {
    return null;
  }

  return `https://animeav1.com/media/${slug}/${episode}`;
};

const IconBase = ({
  children,
  className,
  viewBox = '0 0 24 24'
}: {
  children: ReactNode;
  className?: string;
  viewBox?: string;
}): JSX.Element => (
  <svg viewBox={viewBox} aria-hidden="true" className={className ?? 'ui-icon'}>
    {children}
  </svg>
);

const EyeIcon = ({ className }: { className?: string }): JSX.Element => (
  <IconBase className={className}>
    <path
      d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.9" />
  </IconBase>
);

const HelpIcon = ({ className }: { className?: string }): JSX.Element => (
  <IconBase className={className}>
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.9" />
    <path
      d="M9.4 9.2a2.8 2.8 0 0 1 5.2 1.4c0 2-2.6 2.4-2.6 4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="17.2" r="1" fill="currentColor" />
  </IconBase>
);

const EyeOffIcon = ({ className }: { className?: string }): JSX.Element => (
  <IconBase className={className}>
    <path
      d="M3 3l18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.6 5.4A10.8 10.8 0 0 1 12 5.3c6 0 9.5 6.7 9.5 6.7a16.7 16.7 0 0 1-3.3 4.1"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6.5 7.4A17 17 0 0 0 2.5 12s3.5 6.7 9.5 6.7c1 0 1.9-.2 2.8-.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.6 10.6A3 3 0 0 0 13.4 13.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </IconBase>
);

const RotateCcwIcon = ({ className }: { className?: string }): JSX.Element => (
  <IconBase className={className}>
    <path
      d="M8 7H4v4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4 11a8 8 0 1 0 2.3-5.7L8 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </IconBase>
);

const RefreshIcon = ({ className }: { className?: string }): JSX.Element => (
  <IconBase className={className}>
    <path
      d="M3 12a9 9 0 0 1 15-6.7L21 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M21 3v5h-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M21 12a9 9 0 0 1-15 6.7L3 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3 21v-5h5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </IconBase>
);

const MoreHorizontalIcon = ({ className }: { className?: string }): JSX.Element => (
  <IconBase className={className}>
    <circle cx="5" cy="12" r="1.8" fill="currentColor" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    <circle cx="19" cy="12" r="1.8" fill="currentColor" />
  </IconBase>
);

const ChevronLeftIcon = ({ className }: { className?: string }): JSX.Element => (
  <IconBase className={className}>
    <path
      d="M14.5 6 8.5 12l6 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </IconBase>
);

const ChevronRightIcon = ({ className }: { className?: string }): JSX.Element => (
  <IconBase className={className}>
    <path
      d="m9.5 6 6 6-6 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </IconBase>
);

const SettingsIcon = ({ className }: { className?: string }): JSX.Element => (
  <IconBase className={className}>
    <path
      d="M12 3.5 14 5l2.4-.4.9 2.2L19.5 8l-.4 2.4 1.4 1.6-1.4 1.6.4 2.4-2.2 1.2-.9 2.2L14 19l-2 1.5L10 19l-2.4.4-.9-2.2L4.5 16l.4-2.4L3.5 12l1.4-1.6L4.5 8l2.2-1.2.9-2.2L10 5l2-1.5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
  </IconBase>
);

const RecommendationBadgeIcon = ({
  reason
}: {
  reason: NonNullable<CalendarEntryViewModel['recommendationReason']>;
}): JSX.Element => {
  if (reason === 'continuation') {
    return (
      <IconBase className="badge-icon">
        <path
          d="M5 7h4v10H5zM11 12l8-5v10l-8-5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </IconBase>
    );
  }

  return (
    <IconBase className="badge-icon">
      <path
        d="m12 3 2.7 5.5 6 .9-4.4 4.3 1 6-5.3-2.8-5.3 2.8 1-6L3.3 9.4l6-.9L12 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  );
};

const DecisionIcon = ({
  decision,
  className
}: {
  decision: DecisionKind;
  className?: string;
}): JSX.Element => {
  if (decision === 'watching') {
    return <EyeIcon className={className} />;
  }

  if (decision === 'unsure') {
    return <HelpIcon className={className} />;
  }

  return <EyeOffIcon className={className} />;
};

const DecisionSummaryIcon = ({
  decision,
  className
}: {
  decision: DecisionKind | null;
  className?: string;
}): JSX.Element =>
  decision ? <DecisionIcon decision={decision} className={className} /> : <MoreHorizontalIcon className={className} />;

const getDecisionButtonClassName = (decision: DecisionKind | null): string => {
  if (decision === 'watching') {
    return 'decision-button icon-button active decision-button-watching';
  }

  if (decision === 'unsure') {
    return 'decision-button icon-button active decision-button-unsure';
  }

  if (decision === 'ignore') {
    return 'decision-button icon-button active';
  }

  return 'decision-button icon-button';
};

const getDecisionMenuOptionClassName = (
  currentDecision: DecisionKind | null,
  optionDecision: DecisionKind
): string => {
  if (currentDecision !== optionDecision) {
    return 'decision-menu-option';
  }

  if (optionDecision === 'watching') {
    return 'decision-menu-option active decision-menu-option-watching';
  }

  if (optionDecision === 'unsure') {
    return 'decision-menu-option active decision-menu-option-unsure';
  }

  return 'decision-menu-option active';
};

const App = (): JSX.Element => {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(createEmptySnapshot());
  const [booted, setBooted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ignoredOpen, setIgnoredOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<CalendarEntryViewModel | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isCompact, setIsCompact] = useState(() =>
    window.matchMedia('(max-width: 960px)').matches
  );
  const [visibleWeekOffset, setVisibleWeekOffset] = useState(0);
  const [activeCompactDay, setActiveCompactDay] = useState(getTodayWeekdayIndex());
  const [activeDecisionMenuKey, setActiveDecisionMenuKey] = useState<string | null>(null);
  const latestSyncRequestId = useRef(0);
  const scheduledAutoSyncKey = useRef<string | null>(null);
  const hasShownOfflineReadyToast = useRef(false);

  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker
  } = useRegisterSW();

  useEffect(() => {
    let active = true;

    void loadSnapshot()
      .then((storedSnapshot) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          setSnapshot(storedSnapshot);
          setActiveCompactDay(getTodayWeekdayIndex());
          setBooted(true);
        });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setMessage(getSyncErrorMessage(error));
        setBooted(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleOnline = (): void => setIsOnline(true);
    const handleOffline = (): void => setIsOnline(false);
    const mediaQuery = window.matchMedia('(max-width: 960px)');
    const handleViewportChange = (event: MediaQueryListEvent): void =>
      setIsCompact(event.matches);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    mediaQuery.addEventListener('change', handleViewportChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      mediaQuery.removeEventListener('change', handleViewportChange);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 3200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toast]);

  useEffect(() => {
    if (!offlineReady || hasShownOfflineReadyToast.current) {
      return;
    }

    hasShownOfflineReadyToast.current = true;
    setToast({
      message: 'La app ya está lista para funcionar offline.',
      tone: 'success'
    });
  }, [offlineReady]);

  const weekWindow = getLocalWeekWindow(new Date(), visibleWeekOffset);
  const isCurrentWeek = visibleWeekOffset === 0;

  useEffect(() => {
    setActiveCompactDay(isCurrentWeek ? getTodayWeekdayIndex() : 0);
  }, [isCurrentWeek, visibleWeekOffset]);

  const calendarView = buildCalendarView({
    animeById: snapshot.animeById,
    scheduleEntries: snapshot.scheduleEntries,
    decisionsByMediaId: snapshot.decisionsByMediaId,
    watchedMediaIds: new Set(snapshot.watchedMediaIds),
    settings: snapshot.settings,
    weekWindow
  });
  const deferredCalendarView = useDeferredValue(calendarView);

  const today = deferredCalendarView.days[deferredCalendarView.todayIndex];
  const visibleDays = isCompact
    ? [deferredCalendarView.days[activeCompactDay] ?? deferredCalendarView.days[deferredCalendarView.todayIndex]]
    : deferredCalendarView.days;
  const visibleEntries = deferredCalendarView.days.reduce((count, day) => count + day.entries.length, 0);
  const recommendedEntries = deferredCalendarView.days.reduce(
    (count, day) => count + day.entries.filter((entry) => entry.isRecommended).length,
    0
  );

  const persistSyncState = async (nextSyncState: AppSnapshot['syncState']): Promise<void> => {
    await saveSyncState(nextSyncState);
    startTransition(() => {
      setSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        syncState: nextSyncState
      }));
    });
  };

  const getAutoSyncKey = (
    settings: Settings,
    targetWeekWindow: ReturnType<typeof getLocalWeekWindow>
  ): string => `${targetWeekWindow.weekKey}:${settings.anilistUsername.trim() || 'anonymous'}`;

  const runSync = async (
    settings: Settings,
    reason: 'background' | 'manual' | 'settings',
    targetWeekWindow = weekWindow
  ): Promise<void> => {
    if (!navigator.onLine) {
      setMessage('Sin conexión. Se mantiene la última snapshot local.');
      return;
    }

    const requestId = latestSyncRequestId.current + 1;
    latestSyncRequestId.current = requestId;
    setSyncing(true);

    try {
      const result = await syncSchedulime(settings, targetWeekWindow);
      const remoteVersion = await checkRemoteVersion(APP_VERSION);

      if (latestSyncRequestId.current !== requestId) {
        return;
      }
      const syncState = {
        ...result.syncState,
        availableVersion: remoteVersion
      };

      await replaceSyncSnapshot({
        animeList: result.animeList,
        scheduleEntries: result.scheduleEntries,
        watchedMediaIds: result.watchedMediaIds,
        syncState
      });

      startTransition(() => {
        setSnapshot((currentSnapshot) => ({
          ...currentSnapshot,
          animeById: Object.fromEntries(result.animeList.map((anime) => [anime.id, anime])),
          scheduleEntries: result.scheduleEntries,
          watchedMediaIds: result.watchedMediaIds,
          settings,
          syncState
        }));
      });

      if (reason !== 'background') {
        setMessage(result.warningMessage ?? 'Sincronización completada.');
      }
      if (reason !== 'background' && !result.warningMessage) {
        setMessage(null);
        setToast({
          message: 'Sincronización completada.',
          tone: 'success'
        });
      }
    } catch (error) {
      if (latestSyncRequestId.current !== requestId) {
        return;
      }

      const nextSyncState = createFailedSyncState(snapshot.syncState, getSyncErrorMessage(error));
      await persistSyncState(nextSyncState);
      setMessage(nextSyncState.latestError);
    } finally {
      if (latestSyncRequestId.current === requestId) {
        setSyncing(false);
      }
    }
  };

  useEffect(() => {
    if (!booted || !isOnline || syncing) {
      return;
    }

    const autoSyncKey = getAutoSyncKey(snapshot.settings, weekWindow);

    if (!isSnapshotStale(snapshot.syncState, weekWindow)) {
      if (scheduledAutoSyncKey.current === autoSyncKey) {
        scheduledAutoSyncKey.current = null;
      }

      return;
    }

    if (scheduledAutoSyncKey.current === autoSyncKey) {
      return;
    }

    scheduledAutoSyncKey.current = autoSyncKey;

    // Delay the auto-sync to the next tick so StrictMode's throwaway mount in dev
    // can cancel it before any AniList requests are sent.
    let syncStarted = false;
    const syncTimeoutId = window.setTimeout(() => {
      syncStarted = true;
      void runSync(snapshot.settings, 'background', weekWindow);
    }, 0);

    return () => {
      window.clearTimeout(syncTimeoutId);
      if (!syncStarted && scheduledAutoSyncKey.current === autoSyncKey) {
        scheduledAutoSyncKey.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, isOnline, syncing, snapshot.settings, snapshot.syncState, weekWindow]);

  const handleSettingsSave = async (nextSettings: Settings): Promise<SaveResult> => {
    const username = nextSettings.anilistUsername.trim();
    const normalizedSettings: Settings = {
      ...nextSettings,
      anilistUsername: username
    };

    if (username && isOnline) {
      try {
        await validatePublicUser(username);
      } catch (error) {
        return {
          ok: false,
          error: getSyncErrorMessage(error)
        };
      }
    }

    await saveSettings(normalizedSettings);
    startTransition(() => {
      setSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        settings: normalizedSettings
      }));
    });
    setSettingsOpen(false);

    if (isOnline) {
      void runSync(normalizedSettings, 'settings');
    } else {
      setMessage('Configuración guardada. Se sincronizará cuando vuelva la conexión.');
    }

    return { ok: true };
  };

  const handleDecision = async (mediaId: number, decision: DecisionKind | null): Promise<void> => {
    await saveDecision(mediaId, decision);
    startTransition(() => {
      setSnapshot((currentSnapshot) => {
        const nextDecisions = { ...currentSnapshot.decisionsByMediaId };

        if (decision) {
          nextDecisions[mediaId] = decision;
        } else {
          delete nextDecisions[mediaId];
        }

        return {
          ...currentSnapshot,
          decisionsByMediaId: nextDecisions
        };
      });
    });
  };

  const handleToggleHideIgnored = async (): Promise<void> => {
    const nextSettings = {
      ...snapshot.settings,
      hideIgnored: !snapshot.settings.hideIgnored
    };

    await saveSettings(nextSettings);
    startTransition(() => {
      setSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        settings: nextSettings
      }));
    });
  };

  const noSnapshotYet =
    booted && snapshot.syncState.weekKey === null && snapshot.scheduleEntries.length === 0;

  return (
    <div className="app-shell">
      <div className="backdrop blob-a" />
      <div className="backdrop blob-b" />

      <header className="hero">
        <div className="hero-copy-block">
          <h1 className="brand-heading">
            <img
              src={logoUrl}
              alt="Schedulime"
              className="brand-logo"
              width="964"
              height="245"
            />
          </h1>
          <p className="hero-copy">
            Calendario semanal de estrenos anime que sigue vivo incluso si tu hosting o AniList se
            caen. La app guarda una snapshot local y recomienda qué ver cada día.
          </p>
        </div>

        <div className="week-switcher" aria-label="Navegación semanal">
          <button
            type="button"
            className="ghost-button week-nav-button"
            onClick={() => setVisibleWeekOffset((currentValue) => currentValue - 1)}
            disabled={syncing}
            aria-label="Ir a la semana anterior"
            title="Semana anterior"
          >
            <ChevronLeftIcon className="ui-icon" />
          </button>

          <div className="week-switcher-copy">
            <strong className="week-switcher-value">{formatWeekRangeLabel(weekWindow)}</strong>
          </div>

          <button
            type="button"
            className="ghost-button week-nav-button"
            onClick={() => setVisibleWeekOffset((currentValue) => currentValue + 1)}
            disabled={syncing}
            aria-label="Ir a la semana siguiente"
            title="Semana siguiente"
          >
            <ChevronRightIcon className="ui-icon" />
          </button>
        </div>

        <div className="hero-actions">
          <button
            type="button"
            className="ghost-button hero-icon-button"
            onClick={() => void runSync(snapshot.settings, 'manual')}
            disabled={syncing}
            title="Refrescar semana"
            aria-label="Refrescar semana"
          >
            <RefreshIcon className={syncing ? 'refresh-icon spinning' : 'refresh-icon'} />
          </button>
          <button
            type="button"
            className="ghost-button hero-icon-button"
            onClick={() => setSettingsOpen(true)}
            title="Configuración"
            aria-label="Configuración"
          >
            <SettingsIcon className="ui-icon" />
          </button>
          <button
            type="button"
            className="ghost-button ignored-trigger-button"
            onClick={() => setIgnoredOpen(true)}
            title={`Ignorados (${deferredCalendarView.ignoredEntries.length})`}
            aria-label={`Ignorados (${deferredCalendarView.ignoredEntries.length})`}
          >
            <EyeOffIcon className="ui-icon" />
            <span>({deferredCalendarView.ignoredEntries.length})</span>
          </button>
        </div>
      </header>

      <section className="status-grid">
        <StatusCard
          label="Última actualización"
          value={formatLastUpdatedLabel(snapshot.syncState.lastSuccessfulSync, currentTime)}
        />
        <StatusCard label="Semana visible" value={formatWeekRangeLabel(weekWindow)} />
        <StatusCard
          label="Recomendados esta semana"
          value={`${recommendedEntries} / ${visibleEntries}`}
        />
        <StatusCard
          label="Hoy"
          value={today ? `${today.recommendedCount} destacados · ${today.entries.length} emisiones` : 'Sin datos'}
        />
      </section>

      {(message ||
        snapshot.syncState.latestError ||
        snapshot.syncState.availableVersion ||
        needRefresh) && (
        <section className="banner-stack">
          {message && <Banner tone="info">{message}</Banner>}
          {snapshot.syncState.latestError && (
            <Banner tone="warning">{snapshot.syncState.latestError}</Banner>
          )}
          {snapshot.syncState.availableVersion && (
            <Banner tone="accent">
              Hay una versión nueva ({snapshot.syncState.availableVersion}) disponible. Recarga para
              actualizar tu copia local cuando quieras.
            </Banner>
          )}
          {needRefresh && (
            <Banner tone="accent">
              Hay una actualización del shell de la app lista para instalar.
              <button
                type="button"
                className="inline-button"
                onClick={() => void updateServiceWorker(true)}
              >
                Actualizar ahora
              </button>
            </Banner>
          )}
        </section>
      )}

      {toast && (
        <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      )}

      <section className="toolbar">
        <div>
          <p className="toolbar-label">Modo horario</p>
          <strong>Hora local del dispositivo</strong>
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={snapshot.settings.hideIgnored}
            onChange={() => void handleToggleHideIgnored()}
          />
          <span>Ocultar ignorados</span>
        </label>
      </section>

      {isCompact && (
        <nav className="day-nav" aria-label="Seleccionar día">
          {deferredCalendarView.days.map((day) => (
            <button
              key={day.index}
              type="button"
              className={day.index === activeCompactDay ? 'day-pill active' : 'day-pill'}
              onClick={() => setActiveCompactDay(day.index)}
            >
              <span>{day.shortLabel}</span>
            </button>
          ))}
        </nav>
      )}

      {noSnapshotYet ? (
        <section className="empty-state">
          <h2>No hay snapshot local todavía</h2>
          <p>
            Abre la app al menos una vez con conexión para descargar la semana actual. Después
            seguirá funcionando offline con la copia almacenada.
          </p>
        </section>
      ) : (
        <section className={isCompact ? 'calendar compact' : 'calendar'}>
          {visibleDays.map((day) => (
            <DayColumn
              key={day.index}
              day={day}
              activeDecisionMenuKey={activeDecisionMenuKey}
              onDecisionMenuToggle={setActiveDecisionMenuKey}
              onDecisionChange={handleDecision}
              onOpenDetails={setDetailEntry}
              highlightToday={isCurrentWeek && day.index === deferredCalendarView.todayIndex}
            />
          ))}
        </section>
      )}

      <footer className="footer-note">
        <div className="footer-sync-meta">
          <span
            className={`footer-sync-dot ${syncing || isOnline ? 'footer-sync-dot-online' : 'footer-sync-dot-offline'}`}
            aria-label={syncing ? 'Sincronizando' : isOnline ? 'Online' : 'Offline'}
            title={syncing ? 'Sincronizando' : isOnline ? 'Online' : 'Offline'}
          />
          <p>
            Última actualización:{' '}
            <strong>{formatLastUpdatedLabel(snapshot.syncState.lastSuccessfulSync, currentTime)}</strong>
          </p>
        </div>
        <p className="footer-version">
          Versión: <strong>{APP_VERSION}</strong>
        </p>
      </footer>

      {settingsOpen && (
        <SettingsDialog
          initialSettings={snapshot.settings}
          isOnline={isOnline}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSettingsSave}
        />
      )}

      {ignoredOpen && (
        <IgnoredDialog
          entries={deferredCalendarView.ignoredEntries}
          onClose={() => setIgnoredOpen(false)}
          onOpenDetails={setDetailEntry}
          onRestore={(entry) =>
            void handleDecision(
              entry.anime.id,
              entry.ignoredSource === 'automatic' ? 'unsure' : null
            )
          }
        />
      )}

      {detailEntry && (
        <AnimeDetailsDialog entry={detailEntry} onClose={() => setDetailEntry(null)} />
      )}
    </div>
  );
};

const DayColumn = ({
  day,
  activeDecisionMenuKey,
  onDecisionMenuToggle,
  onDecisionChange,
  onOpenDetails,
  highlightToday
}: {
  day: CalendarDayViewModel;
  activeDecisionMenuKey: string | null;
  onDecisionMenuToggle: (menuKey: string | null) => void;
  onDecisionChange: (mediaId: number, decision: DecisionKind | null) => Promise<void>;
  onOpenDetails: (entry: CalendarEntryViewModel | null) => void;
  highlightToday: boolean;
}): JSX.Element => (
  <article className={highlightToday ? 'day-column today' : 'day-column'}>
    <header className="day-header">
      <h2>{day.label}</h2>
      <p>{day.dateLabel}</p>
    </header>

    <div className="cards">
      {day.entries.length === 0 ? (
        <div className="empty-day">Sin estrenos visibles este día.</div>
      ) : (
        day.entries.map((entry) => (
          <AnimeCard
            key={entry.entry.key}
            entry={entry}
            isMenuOpen={activeDecisionMenuKey === entry.entry.key}
            onMenuToggle={onDecisionMenuToggle}
            onDecisionChange={onDecisionChange}
            onOpenDetails={onOpenDetails}
          />
        ))
      )}
    </div>
  </article>
);

const AnimeCard = ({
  entry,
  isMenuOpen,
  onMenuToggle,
  onDecisionChange,
  onOpenDetails
}: {
  entry: CalendarEntryViewModel;
  isMenuOpen: boolean;
  onMenuToggle: (menuKey: string | null) => void;
  onDecisionChange: (mediaId: number, decision: DecisionKind | null) => Promise<void>;
  onOpenDetails: (entry: CalendarEntryViewModel | null) => void;
}): JSX.Element => {
  const accentStyle = entry.anime.coverColor
    ? ({ '--accent-color': entry.anime.coverColor } as CSSProperties)
    : undefined;
  const scoreLabel = formatAnimeMetric(entry.anime.averageScore, 'score');
  const scoreColor = getScoreColor(entry.anime.averageScore);
  const streamingUrl = getStreamingUrl(entry.anime.title, entry.entry.episode);
  const handleDecisionSelect = (decision: DecisionKind): void => {
    onMenuToggle(null);
    void onDecisionChange(
      entry.anime.id,
      entry.decision === decision ? null : decision
    );
  };

  return (
    <article className={entry.isRecommended ? 'anime-card recommended' : 'anime-card'} style={accentStyle}>
      <div className="anime-media">
        <button
          type="button"
          className="cover-button"
          onClick={() => onOpenDetails(entry)}
          aria-label={`Abrir detalles de ${entry.anime.title}`}
        >
          {entry.anime.coverImage ? (
            <img
              src={entry.anime.coverImage}
              alt={entry.anime.title}
              loading="lazy"
              className="cover-image"
            />
          ) : (
            <div className="cover-fallback">{entry.anime.title.slice(0, 1)}</div>
          )}
          {entry.isRecommended && entry.recommendationReason ? (
            <span
              className="cover-recommendation-badge"
              title={recommendationLabels[entry.recommendationReason]}
              aria-label={recommendationLabels[entry.recommendationReason]}
            >
              <RecommendationBadgeIcon reason={entry.recommendationReason} />
            </span>
          ) : null}
        </button>

        <div className="anime-copy">
          <div className="anime-header-row">
          <h3>
            <button
              type="button"
              className="anime-title-button"
              onClick={() => onOpenDetails(entry)}
              title={entry.anime.title}
            >
              {entry.anime.title}
            </button>
          </h3>
            <div className="decision-picker">
              <button
                type="button"
                className={getDecisionButtonClassName(entry.decision)}
                onClick={() => onMenuToggle(isMenuOpen ? null : entry.entry.key)}
                title={getDecisionSummaryLabel(entry.decision)}
                aria-label={getDecisionSummaryLabel(entry.decision)}
              >
                <DecisionSummaryIcon decision={entry.decision} className="ui-icon" />
              </button>

              {isMenuOpen && (
                <div className="decision-menu" role="menu" aria-label="Elegir estado">
                  {(['watching', 'unsure', 'ignore'] as const).map((decision) => (
                    <button
                      key={decision}
                      type="button"
                      className={getDecisionMenuOptionClassName(entry.decision, decision)}
                      onClick={() => handleDecisionSelect(decision)}
                      title={decisionLabels[decision]}
                      aria-label={decisionLabels[decision]}
                    >
                      <DecisionIcon decision={decision} className="ui-icon" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="anime-topline">
            <span className="time-chip">{entry.timeLabel}</span>
            {entry.entry.episode ? <span className="time-chip soft">Ep.{entry.entry.episode}</span> : null}
            <span className="metric-pill" title="Score" style={scoreColor ? { color: scoreColor } : undefined}>
              {scoreLabel}
            </span>
          </div>
          <p className="meta-line">
            Score {entry.anime.averageScore ?? 'N/A'} · Popularidad {entry.anime.popularity ?? 'N/A'}
          </p>
          {entry.anime.genres.length > 0 ? (
            <p className="meta-line">{entry.anime.genres.slice(0, 3).join(' · ')}</p>
          ) : null}
        </div>
      </div>

      <div className="decision-row">
        {(['watching', 'unsure', 'ignore'] as const).map((decision) => (
          <button
            key={decision}
            type="button"
            className={entry.decision === decision ? 'decision-button icon-button active' : 'decision-button icon-button'}
            onClick={() => void onDecisionChange(entry.anime.id, decision)}
            title={decisionLabels[decision]}
            aria-label={decisionLabels[decision]}
          >
            <DecisionIcon decision={decision} className="ui-icon" />
          </button>
        ))}

        {entry.decision && (
          <button
            type="button"
            className="decision-button icon-button reset"
            onClick={() => void onDecisionChange(entry.anime.id, null)}
            title="Quitar selección"
            aria-label="Quitar selección"
          >
            <RotateCcwIcon className="ui-icon" />
          </button>
        )}
      </div>

      <div className="card-footer">
        <a href={entry.anime.siteUrl} className="link-button" target="_blank" rel="noreferrer">
          AniList
        </a>
        {streamingUrl ? (
          <a href={streamingUrl} className="link-button" target="_blank" rel="noreferrer">
            Ver streaming
          </a>
        ) : (
          <button type="button" className="link-button disabled" disabled>
            Streaming próximamente
          </button>
        )}
      </div>
    </article>
  );
};

const AnimeDetailsDialog = ({
  entry,
  onClose
}: {
  entry: CalendarEntryViewModel;
  onClose: () => void;
}): JSX.Element => {
  const genresLabel =
    entry.anime.genres.length > 0 ? entry.anime.genres.join(' / ') : 'Sin género especificado';
  const scoreColor = getScoreColor(entry.anime.averageScore);
  const streamingUrl = getStreamingUrl(entry.anime.title, entry.entry.episode);

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card detail-modal-card" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <p className="eyebrow">Detalle del anime</p>
            <h2>{entry.anime.title}</h2>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Cerrar
          </button>
        </header>

        <div className="anime-detail-layout">
          <div className="anime-detail-cover-frame">
            {entry.anime.coverImage ? (
              <img
                src={entry.anime.coverImage}
                alt={entry.anime.title}
                className="cover-image"
              />
            ) : (
              <div className="cover-fallback">{entry.anime.title.slice(0, 1)}</div>
            )}
            {entry.isRecommended && entry.recommendationReason ? (
              <span
                className="cover-recommendation-badge cover-recommendation-badge-detail"
                title={recommendationLabels[entry.recommendationReason]}
                aria-label={recommendationLabels[entry.recommendationReason]}
              >
                <RecommendationBadgeIcon reason={entry.recommendationReason} />
              </span>
            ) : null}
          </div>

          <div className="anime-detail-copy">
            <div className="anime-topline">
              <span className="time-chip">{entry.timeLabel}</span>
              {entry.entry.episode ? <span className="time-chip soft">Ep. {entry.entry.episode}</span> : null}
              <span
                className="time-chip detail-metric-chip"
                title="Score"
                style={scoreColor ? { color: scoreColor } : undefined}
              >
                Score: {formatAnimeMetric(entry.anime.averageScore, 'score')}
              </span>
              <span className="time-chip detail-metric-chip" title="Popularidad">
                Popularidad: {formatAnimeMetric(entry.anime.popularity, 'popularity')}
              </span>
            </div>

            <p className="detail-genres">{genresLabel}</p>
            <div className="detail-description">
              {entry.anime.description
                ? renderDescriptionContent(entry.anime.description)
                : 'AniList no ha publicado una descripción para este anime.'}
            </div>

            <div className="detail-actions">
              <a href={entry.anime.siteUrl} className="link-button" target="_blank" rel="noreferrer">
                AniList
              </a>
              {streamingUrl ? (
                <a href={streamingUrl} className="link-button" target="_blank" rel="noreferrer">
                  Ver streaming
                </a>
              ) : (
                <button type="button" className="link-button disabled" disabled>
                  Streaming pronto
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SettingsDialog = ({
  initialSettings,
  isOnline,
  onClose,
  onSave
}: {
  initialSettings: Settings;
  isOnline: boolean;
  onClose: () => void;
  onSave: (settings: Settings) => Promise<SaveResult>;
}): JSX.Element => {
  const [username, setUsername] = useState(initialSettings.anilistUsername);
  const [maxEpisodesPerDay, setMaxEpisodesPerDay] = useState(initialSettings.maxEpisodesPerDay);
  const [hideIgnored, setHideIgnored] = useState(initialSettings.hideIgnored);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const result = await onSave({
      anilistUsername: username.trim(),
      maxEpisodesPerDay: Math.min(12, Math.max(1, maxEpisodesPerDay)),
      hideIgnored,
      timezoneMode: 'local'
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error ?? 'No se pudo guardar la configuración.');
    }
  };

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Configuración local</p>
            <h2>Tus reglas de recomendación</h2>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Cerrar
          </button>
        </header>

        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Usuario público de AniList
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="ej. RafaAnime"
            />
            <small>
              {isOnline
                ? 'Se validará online al guardar. Si lo dejas vacío, la app funcionará en modo manual.'
                : 'Sin conexión: se guardará sin validar y se intentará sincronizar más tarde.'}
            </small>
          </label>

          <label>
            Máximo de episodios recomendados por día
            <input
              type="number"
              value={maxEpisodesPerDay}
              min={1}
              max={12}
              onChange={(event) => {
                const nextValue = Number.parseInt(event.target.value, 10);
                if (Number.isNaN(nextValue)) {
                  return;
                }

                setMaxEpisodesPerDay(Math.min(12, Math.max(1, nextValue)));
              }}
            />
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={hideIgnored}
              onChange={(event) => setHideIgnored(event.target.checked)}
            />
            <span>Ocultar animes ignorados del calendario principal</span>
          </label>

          {error && <Banner tone="warning">{error}</Banner>}

          <div className="dialog-actions">
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar configuración'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const IgnoredDialog = ({
  entries,
  onClose,
  onOpenDetails,
  onRestore
}: {
  entries: CalendarEntryViewModel[];
  onClose: () => void;
  onOpenDetails: (entry: CalendarEntryViewModel | null) => void;
  onRestore: (entry: CalendarEntryViewModel) => void;
}): JSX.Element => (
  <div className="modal-shell" role="dialog" aria-modal="true" onClick={onClose}>
    <div className="modal-card ignored-modal-card" onClick={(event) => event.stopPropagation()}>
      <div className="ignored-modal-scroll">
      <header className="modal-header">
        <div>
          <p className="eyebrow">Recuperación rápida</p>
          <h2>Animes ignorados</h2>
          <p className="ignored-dialog-note">
              Los autoignorados se restaurarán como <strong>Dudando</strong>.
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={onClose}>
          Cerrar
        </button>
      </header>

      {entries.length === 0 ? (
        <div className="empty-state small">
          <p>No hay animes ignorados esta semana.</p>
        </div>
      ) : (
        <div className="ignored-list">
          {entries.map((entry) => (
            <div key={entry.anime.id} className="ignored-item">
              <div className="ignored-item-main">
                <button
                  type="button"
                  className="ignored-cover-frame ignored-detail-trigger"
                  onClick={() => onOpenDetails(entry)}
                  aria-label={`Abrir detalles de ${entry.anime.title}`}
                >
                  {entry.anime.coverImage ? (
                    <img
                      src={entry.anime.coverImage}
                      alt={entry.anime.title}
                      loading="lazy"
                      className="cover-image"
                    />
                  ) : (
                    <div className="cover-fallback">{entry.anime.title.slice(0, 1)}</div>
                  )}
                </button>
                <div>
                  <button
                    type="button"
                    className="ignored-title-button"
                    onClick={() => onOpenDetails(entry)}
                  >
                    {truncateIgnoredTitle(entry.anime.title)}
                  </button>
                  {getIgnoredSourceLabel(entry) ? (
                    <p className="ignored-reason">{getIgnoredSourceLabel(entry)}</p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => onRestore(entry)}
              >
                Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  </div>
);

const StatusCard = ({ label, value }: { label: string; value: string }): JSX.Element => (
  <article className="status-card">
    <p>{label}</p>
    <strong>{value}</strong>
  </article>
);

const Banner = ({
  children,
  tone
}: {
  children: ReactNode;
  tone: 'info' | 'warning' | 'success' | 'accent';
}): JSX.Element => <div className={`banner ${tone}`}>{children}</div>;

export default App;

