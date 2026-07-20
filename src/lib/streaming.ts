const STREAMING_BASE_URL = 'https://animeav1.com/media';
const JIKAN_API_BASE_URL = 'https://api.jikan.moe/v4/anime';
const STREAMING_VALIDATOR_URL = import.meta.env.VITE_STREAMING_VALIDATOR_URL?.trim() ?? '';

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

interface StreamingValidationResponse {
  state?: StreamingValidationState;
}

export const buildStreamingValidationRequestUrl = (
  streamingUrl: string,
  validatorUrl: string
): string | null => {
  if (!validatorUrl.trim()) {
    return null;
  }

  try {
    const parsedStreamingUrl = new URL(streamingUrl);
    const pathMatch = /^\/media\/([a-z0-9-]{1,200})\/([1-9]\d{0,4})\/?$/.exec(
      parsedStreamingUrl.pathname
    );

    if (parsedStreamingUrl.origin !== 'https://animeav1.com' || !pathMatch) {
      return null;
    }

    const requestUrl = new URL(validatorUrl);
    requestUrl.searchParams.set('slug', pathMatch[1]);
    requestUrl.searchParams.set('episode', pathMatch[2]);

    return requestUrl.toString();
  } catch {
    return null;
  }
};

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

export const validateStreamingUrl = async (
  streamingUrl: string,
  validatorUrl = STREAMING_VALIDATOR_URL
): Promise<StreamingValidationState> => {
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
      const validationRequestUrl = buildStreamingValidationRequestUrl(streamingUrl, validatorUrl);
      if (!validationRequestUrl) {
        return 'unknown';
      }

      const response = await fetch(validationRequestUrl, {
        cache: 'no-store'
      });
      const payload = (await response.json()) as StreamingValidationResponse;
      const validationState =
        response.ok &&
        (payload.state === 'available' || payload.state === 'missing' || payload.state === 'unknown')
          ? payload.state
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
