const STREAMING_BASE_URL = 'https://animeav1.com/media';
const JIKAN_API_BASE_URL = 'https://api.jikan.moe/v4/anime';
const CORS_PROXY_PREFIX = 'https://corsproxy.io/?url=';

export type StreamingValidationState = 'available' | 'missing' | 'unknown';

interface JikanAnimeResponse {
  data?: {
    title?: string | null;
  } | null;
}

const streamingTitleCache = new Map<number, string>();
const pendingStreamingTitleRequests = new Map<number, Promise<string | null>>();
const streamingValidationCache = new Map<string, StreamingValidationState>();
const pendingStreamingValidations = new Map<string, Promise<StreamingValidationState>>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasMissingStreamingError = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some(hasMissingStreamingError);
  }

  if (!isRecord(value)) {
    return false;
  }

  const error = isRecord(value.error) ? value.error : null;
  const errorMessage = typeof error?.message === 'string' ? error.message : null;

  if (
    value.type === 'error' &&
    (value.status === 404 || errorMessage === 'Episodio no encontrado')
  ) {
    return true;
  }

  return Object.values(value).some(hasMissingStreamingError);
};

const getStreamingValidationUrl = (streamingUrl: string): string =>
  `${CORS_PROXY_PREFIX}${encodeURIComponent(`${streamingUrl}/__data.json`)}`;

export const buildStreamingSlug = (title: string): string =>
  title
    .replace(/[^A-Za-z0-9-\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();

export const buildStreamingUrl = (title: string, episode: number | null): string | null => {
  if (episode === null) {
    return null;
  }

  const slug = buildStreamingSlug(title);
  if (!slug) {
    return null;
  }

  return `${STREAMING_BASE_URL}/${slug}/${episode}`;
};

export const resolveStreamingTitle = async (
  idMal: number | null | undefined,
  fallbackTitle: string
): Promise<string> => {
  if (idMal === null || idMal === undefined) {
    return fallbackTitle;
  }

  const cachedTitle = streamingTitleCache.get(idMal);
  if (cachedTitle) {
    return cachedTitle;
  }

  const pendingRequest = pendingStreamingTitleRequests.get(idMal);
  if (pendingRequest) {
    return (await pendingRequest) ?? fallbackTitle;
  }

  const request = (async (): Promise<string | null> => {
    try {
      const response = await fetch(`${JIKAN_API_BASE_URL}/${idMal}`);
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as JikanAnimeResponse;
      const resolvedTitle = payload.data?.title?.trim();

      if (!resolvedTitle) {
        return null;
      }

      streamingTitleCache.set(idMal, resolvedTitle);
      return resolvedTitle;
    } catch {
      return null;
    } finally {
      pendingStreamingTitleRequests.delete(idMal);
    }
  })();

  pendingStreamingTitleRequests.set(idMal, request);

  return (await request) ?? fallbackTitle;
};

export const resolveStreamingUrl = async (params: {
  idMal: number | null | undefined;
  fallbackTitle: string;
  episode: number | null;
}): Promise<{
  resolvedTitle: string;
  streamingUrl: string | null;
}> => {
  const resolvedTitle = await resolveStreamingTitle(params.idMal, params.fallbackTitle);

  return {
    resolvedTitle,
    streamingUrl: buildStreamingUrl(resolvedTitle, params.episode)
  };
};

export const getCachedStreamingValidationState = (
  streamingUrl: string | null
): StreamingValidationState => {
  if (!streamingUrl) {
    return 'unknown';
  }

  return streamingValidationCache.get(streamingUrl) ?? 'unknown';
};

export const validateStreamingUrl = async (streamingUrl: string): Promise<StreamingValidationState> => {
  const cached = streamingValidationCache.get(streamingUrl);
  if (cached) {
    return cached;
  }

  const pendingRequest = pendingStreamingValidations.get(streamingUrl);
  if (pendingRequest) {
    return pendingRequest;
  }

  const request = (async () => {
    try {
      const response = await fetch(getStreamingValidationUrl(streamingUrl), {
        cache: 'no-store'
      });
      const payload = await response.json();
      const validationState = hasMissingStreamingError(payload)
        ? 'missing'
        : response.ok
          ? 'available'
          : 'unknown';

      if (validationState !== 'unknown') {
        streamingValidationCache.set(streamingUrl, validationState);
      }

      return validationState;
    } catch {
      return 'unknown';
    } finally {
      pendingStreamingValidations.delete(streamingUrl);
    }
  })();

  pendingStreamingValidations.set(streamingUrl, request);

  return request;
};
