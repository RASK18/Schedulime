import {
  addDays,
  formatDateLabel,
  formatDayLabel,
  formatShortDayLabel,
  formatTimeLabel,
  getWeekdayIndex,
  isWithinLocalWeek
} from './date';
import type {
  Anime,
  AutoIgnoreReason,
  CalendarDayViewModel,
  CalendarEntryViewModel,
  CalendarViewModel,
  DecisionKind,
  RecommendationReason,
  ScheduleEntry,
  Settings,
  WeeklyWindow
} from '../types';

const getRecommendationReason = (
  anime: Anime,
  watchedMediaIds: Set<number>
): RecommendationReason => {
  if (anime.prequelIds.some((prequelId) => watchedMediaIds.has(prequelId))) {
    return 'continuation';
  }

  return 'score';
};

const compareRecommendationWeight = (
  left: CalendarEntryViewModel,
  right: CalendarEntryViewModel
): number => {
  const reasonPriority: Record<RecommendationReason, number> = {
    continuation: 0,
    score: 1
  };

  const leftReason = left.recommendationReason ?? 'score';
  const rightReason = right.recommendationReason ?? 'score';

  if (reasonPriority[leftReason] !== reasonPriority[rightReason]) {
    return reasonPriority[leftReason] - reasonPriority[rightReason];
  }

  const scoreDiff = (right.anime.averageScore ?? -1) - (left.anime.averageScore ?? -1);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const popularityDiff = (right.anime.popularity ?? -1) - (left.anime.popularity ?? -1);
  if (popularityDiff !== 0) {
    return popularityDiff;
  }

  return left.anime.title.localeCompare(right.anime.title, 'es');
};

const compareDisplayOrder = (
  left: CalendarEntryViewModel,
  right: CalendarEntryViewModel
): number => {
  if (left.entry.airingAt !== right.entry.airingAt) {
    return left.entry.airingAt - right.entry.airingAt;
  }

  return left.anime.title.localeCompare(right.anime.title, 'es');
};

const compareIgnoredDisplayOrder = (
  left: CalendarEntryViewModel,
  right: CalendarEntryViewModel
): number => {
  const leftPriority = left.ignoredSource === 'manual' ? 0 : 1;
  const rightPriority = right.ignoredSource === 'manual' ? 0 : 1;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return compareDisplayOrder(left, right);
};

const getAutoIgnoreReason = (
  anime: Anime,
  entry: ScheduleEntry,
  decision: DecisionKind | null
): AutoIgnoreReason | null => {
  if (decision === 'watching' || decision === 'unsure' || decision === 'ignore') {
    return null;
  }

  if (anime.countryOfOrigin !== null && anime.countryOfOrigin !== 'JP') {
    return 'non-japan-origin';
  }

  if (
    (anime.format === 'ONA' || anime.format === 'OVA') &&
    anime.duration !== null &&
    anime.duration <= 3
  ) {
    return 'short-ona-ova';
  }

  if (anime.averageScore !== null) {
    return anime.averageScore < 50 ? 'low-score' : null;
  }

  return (entry.episode ?? 0) >= 3 ? 'missing-score-after-episode-3' : null;
};

const pushIgnoredEntry = (
  ignoredEntriesByAnimeId: Map<number, CalendarEntryViewModel>,
  entry: CalendarEntryViewModel
): void => {
  const currentEntry = ignoredEntriesByAnimeId.get(entry.anime.id);

  if (!currentEntry || compareDisplayOrder(entry, currentEntry) < 0) {
    ignoredEntriesByAnimeId.set(entry.anime.id, entry);
  }
};

const isRecommendationCandidate = (entry: CalendarEntryViewModel): boolean =>
  entry.decision !== 'ignore' && entry.autoIgnoreReason === null;

export const buildCalendarView = (params: {
  animeById: Record<number, Anime>;
  scheduleEntries: ScheduleEntry[];
  decisionsByMediaId: Record<number, DecisionKind>;
  watchedMediaIds: Set<number>;
  settings: Settings;
  weekWindow: WeeklyWindow;
}): CalendarViewModel => {
  const todayIndex = getWeekdayIndex(Math.floor(Date.now() / 1000));

  const days: CalendarDayViewModel[] = Array.from({ length: 7 }, (_, index) => {
    const dayDate = addDays(new Date(params.weekWindow.startMs), index);
    return {
      index,
      label: formatDayLabel(dayDate),
      shortLabel: formatShortDayLabel(dayDate),
      dateLabel: formatDateLabel(dayDate),
      entries: [],
      recommendedCount: 0
    };
  });

  const ignoredEntriesByAnimeId = new Map<number, CalendarEntryViewModel>();

  params.scheduleEntries
    .filter((entry) =>
      isWithinLocalWeek(entry.airingAt, params.weekWindow.startMs, params.weekWindow.endMs)
    )
    .forEach((entry) => {
      const anime = params.animeById[entry.mediaId];
      if (!anime) {
        return;
      }

      const decision = params.decisionsByMediaId[entry.mediaId] ?? null;
      const autoIgnoreReason = getAutoIgnoreReason(anime, entry, decision);
      const weekdayIndex = getWeekdayIndex(entry.airingAt);
      const entryViewModel: CalendarEntryViewModel = {
        entry,
        anime,
        decision,
        isRecommended: false,
        recommendationReason: getRecommendationReason(anime, params.watchedMediaIds),
        ignoredSource: null,
        autoIgnoreReason,
        weekdayIndex,
        timeLabel: formatTimeLabel(entry.airingAt)
      };

      if (decision === 'ignore') {
        pushIgnoredEntry(ignoredEntriesByAnimeId, {
          ...entryViewModel,
          ignoredSource: 'manual',
          autoIgnoreReason: null
        });
        if (params.settings.hideIgnored) {
          return;
        }
      } else if (autoIgnoreReason) {
        pushIgnoredEntry(ignoredEntriesByAnimeId, {
          ...entryViewModel,
          ignoredSource: 'automatic'
        });
        if (params.settings.hideIgnored) {
          return;
        }
      }

      days[weekdayIndex].entries.push(entryViewModel);
    });

  days.forEach((day) => {
    const recommendations = [...day.entries]
      .filter(isRecommendationCandidate)
      .sort(compareRecommendationWeight)
      .slice(0, Math.max(params.settings.maxEpisodesPerDay, 1));

    const recommendedKeys = new Set(recommendations.map((entry) => entry.entry.key));

    day.entries = day.entries
      .map((entry) => ({
        ...entry,
        isRecommended: recommendedKeys.has(entry.entry.key)
      }))
      .sort(compareDisplayOrder);

    day.recommendedCount = recommendations.length;
  });

  const ignoredEntries = Array.from(ignoredEntriesByAnimeId.values()).sort(compareIgnoredDisplayOrder);

  return {
    days,
    ignoredEntries,
    todayIndex
  };
};
