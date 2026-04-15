import { describe, expect, it } from 'vitest';
import { buildCalendarView } from './recommendations';
import { defaultSettings, type Anime, type DecisionKind, type ScheduleEntry } from '../types';
import { getLocalWeekWindow } from './date';

const createAnime = (
  id: number,
  overrides: Partial<Anime> = {}
): Anime => ({
  id,
  title: `Anime ${id}`,
  titleEnglish: null,
  titleNative: null,
  description: null,
  coverImage: '',
  coverColor: null,
  siteUrl: `https://anilist.co/anime/${id}`,
  averageScore: 70,
  popularity: 1000,
  episodes: 12,
  duration: 24,
  format: 'TV',
  countryOfOrigin: 'JP',
  status: 'RELEASING',
  season: 'SPRING',
  seasonYear: 2026,
  isAdult: false,
  genres: ['Action'],
  prequelIds: [],
  ...overrides
});

const createScheduleEntry = (mediaId: number, airingAt: number): ScheduleEntry => ({
  key: `${mediaId}-${airingAt}`,
  mediaId,
  airingAt,
  episode: 1
});

describe('buildCalendarView', () => {
  it('prioritizes continuations first and ignores manual watching and unsure when ranking', () => {
    const weekWindow = getLocalWeekWindow(new Date('2026-04-15T10:00:00'));
    const airingAt = Math.floor(new Date('2026-04-15T19:00:00').getTime() / 1000);

    const animeById = {
      1: createAnime(1, { averageScore: 80 }),
      2: createAnime(2, { averageScore: 60, prequelIds: [99] }),
      3: createAnime(3, { averageScore: 95, popularity: 2000 }),
      4: createAnime(4, { averageScore: 90, popularity: 1500 })
    };

    const decisionsByMediaId: Record<number, DecisionKind> = {
      1: 'watching',
      4: 'unsure'
    };

    const view = buildCalendarView({
      animeById,
      scheduleEntries: [
        createScheduleEntry(1, airingAt),
        createScheduleEntry(2, airingAt + 10),
        createScheduleEntry(3, airingAt + 20),
        createScheduleEntry(4, airingAt + 30)
      ],
      decisionsByMediaId,
      watchedMediaIds: new Set([99]),
      settings: {
        ...defaultSettings(),
        maxEpisodesPerDay: 2
      },
      weekWindow
    });

    const day = view.days.find((candidate) => candidate.entries.length === 4);
    expect(day).toBeDefined();
    expect(day?.entries.filter((entry) => entry.isRecommended).map((entry) => entry.anime.id)).toEqual([
      2,
      3
    ]);
  });

  it('excludes manual ignores and auto-ignored entries from the ranking even when they stay visible', () => {
    const weekWindow = getLocalWeekWindow(new Date('2026-04-15T10:00:00'));
    const airingAt = Math.floor(new Date('2026-04-15T19:00:00').getTime() / 1000);

    const view = buildCalendarView({
      animeById: {
        18: createAnime(18, { averageScore: 98, popularity: 5000 }),
        19: createAnime(19, { averageScore: 49, popularity: 4500 }),
        20: createAnime(20, { averageScore: 70, prequelIds: [99] }),
        21: createAnime(21, { averageScore: 92, popularity: 3000 }),
        22: createAnime(22, { averageScore: 48, popularity: 6000 })
      },
      scheduleEntries: [
        createScheduleEntry(18, airingAt),
        createScheduleEntry(19, airingAt + 10),
        createScheduleEntry(20, airingAt + 20),
        createScheduleEntry(21, airingAt + 30),
        createScheduleEntry(22, airingAt + 40)
      ],
      decisionsByMediaId: {
        18: 'ignore'
      },
      watchedMediaIds: new Set([99]),
      settings: {
        ...defaultSettings(),
        hideIgnored: false,
        maxEpisodesPerDay: 2
      },
      weekWindow
    });

    const day = view.days.find((candidate) => candidate.entries.length === 5);
    expect(day).toBeDefined();
    expect(day?.entries.filter((entry) => entry.isRecommended).map((entry) => entry.anime.id)).toEqual([
      20,
      21
    ]);
    expect(day?.entries.find((entry) => entry.anime.id === 18)?.isRecommended).toBe(false);
    expect(day?.entries.find((entry) => entry.anime.id === 19)?.isRecommended).toBe(false);
    expect(day?.entries.find((entry) => entry.anime.id === 22)?.autoIgnoreReason).toBe('low-score');
  });

  it('filters ignored entries from the main calendar and keeps them recoverable', () => {
    const weekWindow = getLocalWeekWindow(new Date('2026-04-15T10:00:00'));
    const airingAt = Math.floor(new Date('2026-04-15T19:00:00').getTime() / 1000);

    const view = buildCalendarView({
      animeById: {
        4: createAnime(4)
      },
      scheduleEntries: [createScheduleEntry(4, airingAt)],
      decisionsByMediaId: {
        4: 'ignore'
      },
      watchedMediaIds: new Set(),
      settings: {
        ...defaultSettings(),
        hideIgnored: true
      },
      weekWindow
    });

    expect(view.days.every((day) => day.entries.length === 0)).toBe(true);
    expect(view.ignoredEntries).toHaveLength(1);
    expect(view.ignoredEntries[0]?.anime.id).toBe(4);
  });

  it('deduplicates ignored entries when the same anime airs multiple times in the week', () => {
    const weekWindow = getLocalWeekWindow(new Date('2026-04-15T10:00:00'));
    const firstAiringAt = Math.floor(new Date('2026-04-15T19:00:00').getTime() / 1000);
    const secondAiringAt = Math.floor(new Date('2026-04-17T19:00:00').getTime() / 1000);

    const firstEntry: ScheduleEntry = {
      ...createScheduleEntry(9, firstAiringAt),
      episode: 3
    };
    const secondEntry: ScheduleEntry = {
      ...createScheduleEntry(9, secondAiringAt),
      episode: 4
    };

    const view = buildCalendarView({
      animeById: {
        9: createAnime(9, { averageScore: null })
      },
      scheduleEntries: [firstEntry, secondEntry],
      decisionsByMediaId: {},
      watchedMediaIds: new Set(),
      settings: {
        ...defaultSettings(),
        hideIgnored: true
      },
      weekWindow
    });

    expect(view.ignoredEntries).toHaveLength(1);
    expect(view.ignoredEntries[0]?.anime.id).toBe(9);
    expect(view.ignoredEntries[0]?.entry.airingAt).toBe(firstAiringAt);
  });

  it('sorts ignored entries with manual ignores first, then keeps the existing display order inside each group', () => {
    const weekWindow = getLocalWeekWindow(new Date('2026-04-15T10:00:00'));
    const firstAiringAt = Math.floor(new Date('2026-04-15T18:00:00').getTime() / 1000);
    const secondAiringAt = Math.floor(new Date('2026-04-15T19:00:00').getTime() / 1000);
    const thirdAiringAt = Math.floor(new Date('2026-04-15T20:00:00').getTime() / 1000);

    const view = buildCalendarView({
      animeById: {
        18: createAnime(18),
        19: createAnime(19, { averageScore: 40 }),
        20: createAnime(20)
      },
      scheduleEntries: [
        createScheduleEntry(19, firstAiringAt),
        createScheduleEntry(18, secondAiringAt),
        createScheduleEntry(20, thirdAiringAt)
      ],
      decisionsByMediaId: {
        18: 'ignore',
        20: 'ignore'
      },
      watchedMediaIds: new Set(),
      settings: {
        ...defaultSettings(),
        hideIgnored: true
      },
      weekWindow
    });

    expect(view.ignoredEntries.map((entry) => entry.anime.id)).toEqual([18, 20, 19]);
    expect(view.ignoredEntries.map((entry) => entry.ignoredSource)).toEqual([
      'manual',
      'manual',
      'automatic'
    ]);
  });

  it('auto-ignores entries with score below 50 but keeps score 50 visible', () => {
    const weekWindow = getLocalWeekWindow(new Date('2026-04-15T10:00:00'));
    const airingAt = Math.floor(new Date('2026-04-15T19:00:00').getTime() / 1000);

    const view = buildCalendarView({
      animeById: {
        5: createAnime(5, { averageScore: 49 }),
        6: createAnime(6, { averageScore: 50 })
      },
      scheduleEntries: [createScheduleEntry(5, airingAt), createScheduleEntry(6, airingAt + 10)],
      decisionsByMediaId: {},
      watchedMediaIds: new Set(),
      settings: {
        ...defaultSettings(),
        hideIgnored: true
      },
      weekWindow
    });

    const visibleIds = view.days.flatMap((day) => day.entries.map((entry) => entry.anime.id));
    expect(visibleIds).toContain(6);
    expect(visibleIds).not.toContain(5);
    expect(view.ignoredEntries.map((entry) => entry.anime.id)).toContain(5);
    expect(view.ignoredEntries.find((entry) => entry.anime.id === 5)?.ignoredSource).toBe(
      'automatic'
    );
  });

  it('auto-ignores short ONA and OVA entries with duration of 3 minutes or less', () => {
    const weekWindow = getLocalWeekWindow(new Date('2026-04-15T10:00:00'));
    const airingAt = Math.floor(new Date('2026-04-15T19:00:00').getTime() / 1000);

    const view = buildCalendarView({
      animeById: {
        10: createAnime(10, { format: 'ONA', duration: 3 }),
        11: createAnime(11, { format: 'OVA', duration: 2 }),
        12: createAnime(12, { format: 'ONA', duration: 4 }),
        13: createAnime(13, { format: 'TV', duration: 3 })
      },
      scheduleEntries: [
        createScheduleEntry(10, airingAt),
        createScheduleEntry(11, airingAt + 10),
        createScheduleEntry(12, airingAt + 20),
        createScheduleEntry(13, airingAt + 30)
      ],
      decisionsByMediaId: {},
      watchedMediaIds: new Set(),
      settings: {
        ...defaultSettings(),
        hideIgnored: true
      },
      weekWindow
    });

    const visibleIds = view.days.flatMap((day) => day.entries.map((entry) => entry.anime.id));
    expect(visibleIds).toContain(12);
    expect(visibleIds).toContain(13);
    expect(visibleIds).not.toContain(10);
    expect(visibleIds).not.toContain(11);
    expect(view.ignoredEntries.find((entry) => entry.anime.id === 10)?.autoIgnoreReason).toBe(
      'short-ona-ova'
    );
    expect(view.ignoredEntries.find((entry) => entry.anime.id === 11)?.autoIgnoreReason).toBe(
      'short-ona-ova'
    );
  });

  it('auto-ignores entries whose country of origin is not Japan', () => {
    const weekWindow = getLocalWeekWindow(new Date('2026-04-15T10:00:00'));
    const airingAt = Math.floor(new Date('2026-04-15T19:00:00').getTime() / 1000);

    const view = buildCalendarView({
      animeById: {
        14: createAnime(14, { countryOfOrigin: 'CN' }),
        15: createAnime(15, { countryOfOrigin: 'KR' }),
        16: createAnime(16, { countryOfOrigin: 'JP' }),
        17: createAnime(17, { countryOfOrigin: null })
      },
      scheduleEntries: [
        createScheduleEntry(14, airingAt),
        createScheduleEntry(15, airingAt + 10),
        createScheduleEntry(16, airingAt + 20),
        createScheduleEntry(17, airingAt + 30)
      ],
      decisionsByMediaId: {},
      watchedMediaIds: new Set(),
      settings: {
        ...defaultSettings(),
        hideIgnored: true
      },
      weekWindow
    });

    const visibleIds = view.days.flatMap((day) => day.entries.map((entry) => entry.anime.id));
    expect(visibleIds).toContain(16);
    expect(visibleIds).toContain(17);
    expect(visibleIds).not.toContain(14);
    expect(visibleIds).not.toContain(15);
    expect(view.ignoredEntries.find((entry) => entry.anime.id === 14)?.autoIgnoreReason).toBe(
      'non-japan-origin'
    );
    expect(view.ignoredEntries.find((entry) => entry.anime.id === 15)?.autoIgnoreReason).toBe(
      'non-japan-origin'
    );
  });

  it('auto-ignores entries without score from episode 3 onwards but allows recovering them with unsure', () => {
    const weekWindow = getLocalWeekWindow(new Date('2026-04-15T10:00:00'));
    const airingAt = Math.floor(new Date('2026-04-15T19:00:00').getTime() / 1000);

    const thirdEpisodeEntry: ScheduleEntry = {
      ...createScheduleEntry(7, airingAt),
      episode: 3
    };
    const secondEpisodeEntry: ScheduleEntry = {
      ...createScheduleEntry(8, airingAt + 10),
      episode: 2
    };

    const hiddenView = buildCalendarView({
      animeById: {
        7: createAnime(7, { averageScore: null }),
        8: createAnime(8, { averageScore: null })
      },
      scheduleEntries: [thirdEpisodeEntry, secondEpisodeEntry],
      decisionsByMediaId: {},
      watchedMediaIds: new Set(),
      settings: {
        ...defaultSettings(),
        hideIgnored: true
      },
      weekWindow
    });

    const hiddenIds = hiddenView.days.flatMap((day) => day.entries.map((entry) => entry.anime.id));
    expect(hiddenIds).toContain(8);
    expect(hiddenIds).not.toContain(7);
    expect(hiddenView.ignoredEntries.find((entry) => entry.anime.id === 7)?.autoIgnoreReason).toBe(
      'missing-score-after-episode-3'
    );

    const restoredView = buildCalendarView({
      animeById: {
        7: createAnime(7, { averageScore: null })
      },
      scheduleEntries: [thirdEpisodeEntry],
      decisionsByMediaId: {
        7: 'unsure'
      },
      watchedMediaIds: new Set(),
      settings: {
        ...defaultSettings(),
        hideIgnored: true
      },
      weekWindow
    });

    expect(restoredView.days.some((day) => day.entries.some((entry) => entry.anime.id === 7))).toBe(
      true
    );
    expect(restoredView.ignoredEntries).toHaveLength(0);
    expect(
      restoredView.days.flatMap((day) => day.entries).find((entry) => entry.anime.id === 7)?.decision
    ).toBe('unsure');
  });
});
