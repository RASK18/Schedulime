import type { Anime, ScheduleEntry } from '../types';

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [350, 900];

interface GraphqlError {
  message: string;
  status?: number;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: GraphqlError[];
}

interface AiringSchedulePageResponse {
  Page: {
    pageInfo: {
      currentPage: number;
      hasNextPage: boolean;
    };
    airingSchedules: Array<{
      id: number;
      airingAt: number;
      episode: number | null;
      media: AnilistMedia | null;
    }>;
  };
}

interface UserValidationResponse {
  User: {
    id: number;
    name: string;
  } | null;
}

interface UserListCollectionResponse {
  MediaListCollection: {
    lists: Array<{
      entries: Array<{
        status: string | null;
        media: {
          id: number;
        } | null;
      }>;
    }> | null;
  } | null;
}

interface AnilistMedia {
  id: number;
  isAdult: boolean;
  description: string | null;
  siteUrl: string | null;
  averageScore: number | null;
  popularity: number | null;
  episodes: number | null;
  duration: number | null;
  format: string | null;
  countryOfOrigin: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  genres: string[] | null;
  title: {
    userPreferred: string | null;
    english: string | null;
    native: string | null;
    romaji: string | null;
  } | null;
  coverImage: {
    large: string | null;
    medium: string | null;
    color: string | null;
  } | null;
  relations: {
    edges: Array<{
      relationType: string | null;
      node: {
        id: number;
      } | null;
    }> | null;
  } | null;
}

const normalizeDescription = (description: string | null): string | null => {
  if (!description) {
    return null;
  }

  const normalized = description
    .replace(/\r\n?/g, '\n')
    .replace(/(?:<br\s*\/?>\s*){2,}\(Source:\s*[^)]+\)\s*(?=(?:<br\s*\/?>|\n|$))/gi, '')
    .replace(/\n{2,}\(Source:\s*[^)]+\)\s*(?=\n|$)/gi, '')
    .trim();
  return normalized.length > 0 ? normalized : null;
};

export class AniListError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AniListError';
    this.status = status;
  }
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const anilistRequest = async <T>(
  query: string,
  variables: Record<string, unknown> = {},
  attempt = 0
): Promise<T> => {
  try {
    const response = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });

    const payload = (await response.json()) as GraphqlResponse<T>;

    if (!response.ok || payload.errors?.length) {
      const message =
        payload.errors?.map((error) => error.message).join(' · ') || response.statusText;
      const status = payload.errors?.[0]?.status ?? response.status;
      const retriable = status === 429 || status === 500 || status === 502 || status === 503;

      if (retriable && attempt < MAX_RETRIES) {
        await wait(RETRY_DELAYS_MS[attempt] ?? 900);
        return anilistRequest<T>(query, variables, attempt + 1);
      }

      throw new AniListError(message || 'AniList no ha respondido correctamente.', status);
    }

    if (!payload.data) {
      throw new AniListError('AniList respondió sin datos.');
    }

    return payload.data;
  } catch (error) {
    if (error instanceof AniListError) {
      throw error;
    }

    if (attempt < MAX_RETRIES) {
      await wait(RETRY_DELAYS_MS[attempt] ?? 900);
      return anilistRequest<T>(query, variables, attempt + 1);
    }

    throw new AniListError('No se pudo conectar con AniList. Se usará la copia local si existe.');
  }
};

const normalizeAnime = (media: AnilistMedia): Anime => {
  const preferredTitle =
    media.title?.userPreferred ??
    media.title?.english ??
    media.title?.romaji ??
    media.title?.native ??
    `Anime #${media.id}`;

  const prequelIds =
    media.relations?.edges
      ?.filter((edge) => edge.relationType === 'PREQUEL' && Boolean(edge.node?.id))
      .map((edge) => edge.node!.id) ?? [];

  return {
    id: media.id,
    title: preferredTitle,
    titleEnglish: media.title?.english ?? null,
    titleNative: media.title?.native ?? null,
    description: normalizeDescription(media.description),
    coverImage: media.coverImage?.large ?? media.coverImage?.medium ?? '',
    coverColor: media.coverImage?.color ?? null,
    siteUrl: media.siteUrl ?? `https://anilist.co/anime/${media.id}`,
    averageScore: media.averageScore ?? null,
    popularity: media.popularity ?? null,
    episodes: media.episodes ?? null,
    duration: media.duration ?? null,
    format: media.format ?? null,
    countryOfOrigin: media.countryOfOrigin ?? null,
    status: media.status ?? null,
    season: media.season ?? null,
    seasonYear: media.seasonYear ?? null,
    isAdult: media.isAdult,
    genres: media.genres ?? [],
    prequelIds
  };
};

export const fetchWeeklySchedule = async (window: {
  startSec: number;
  endSec: number;
}): Promise<{ animeList: Anime[]; scheduleEntries: ScheduleEntry[] }> => {
  const query = `
    query WeeklyAiringSchedule(
      $page: Int!
      $perPage: Int!
      $airingAtGreater: Int!
      $airingAtLesser: Int!
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          currentPage
          hasNextPage
        }
        airingSchedules(
          airingAt_greater: $airingAtGreater
          airingAt_lesser: $airingAtLesser
          sort: TIME
        ) {
          id
          airingAt
          episode
          media {
            id
            isAdult
            description(asHtml: false)
            siteUrl
            averageScore
            popularity
            episodes
            duration
            format
            countryOfOrigin
            status
            season
            seasonYear
            genres
            title {
              userPreferred
              english
              native
              romaji
            }
            coverImage {
              large
              medium
              color
            }
            relations {
              edges {
                relationType
                node {
                  id
                }
              }
            }
          }
        }
      }
    }
  `;

  let page = 1;
  let hasNextPage = true;
  const animeById = new Map<number, Anime>();
  const entries: ScheduleEntry[] = [];
  const seenScheduleIds = new Set<number>();

  while (hasNextPage) {
    const payload = await anilistRequest<AiringSchedulePageResponse>(query, {
      page,
      perPage: 50,
      airingAtGreater: window.startSec,
      airingAtLesser: window.endSec
    });

    payload.Page.airingSchedules.forEach((schedule) => {
      if (!schedule.media || schedule.media.isAdult) {
        return;
      }

      if (seenScheduleIds.has(schedule.id)) {
        return;
      }

      seenScheduleIds.add(schedule.id);

      const anime = normalizeAnime(schedule.media);
      animeById.set(anime.id, anime);

      entries.push({
        key: `${schedule.id}`,
        mediaId: schedule.media.id,
        airingAt: schedule.airingAt,
        episode: schedule.episode ?? null
      });
    });

    hasNextPage = payload.Page.pageInfo.hasNextPage;
    page = payload.Page.pageInfo.currentPage + 1;
  }

  entries.sort((left, right) => left.airingAt - right.airingAt);

  return {
    animeList: Array.from(animeById.values()),
    scheduleEntries: entries
  };
};

export const validatePublicUser = async (username: string): Promise<void> => {
  const query = `
    query ValidateUser($name: String!) {
      User(name: $name) {
        id
        name
      }
    }
  `;

  const payload = await anilistRequest<UserValidationResponse>(query, {
    name: username
  });

  if (!payload.User) {
    throw new AniListError(`No se encontró el usuario público "${username}".`);
  }
};

export const fetchPublicUserWatchSet = async (username: string): Promise<number[]> => {
  const query = `
    query PublicAnimeList($userName: String!) {
      MediaListCollection(userName: $userName, type: ANIME) {
        lists {
          entries {
            status
            media {
              id
            }
          }
        }
      }
    }
  `;

  const payload = await anilistRequest<UserListCollectionResponse>(query, {
    userName: username
  });

  const watchedStatuses = new Set(['CURRENT', 'COMPLETED']);
  const watchedIds = new Set<number>();

  payload.MediaListCollection?.lists?.forEach((list) => {
    list.entries.forEach((entry) => {
      if (entry.media?.id && entry.status && watchedStatuses.has(entry.status)) {
        watchedIds.add(entry.media.id);
      }
    });
  });

  return Array.from(watchedIds);
};
