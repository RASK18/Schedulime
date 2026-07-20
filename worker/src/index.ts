type StreamingValidationState = 'available' | 'missing' | 'unknown';

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const ALLOWED_ORIGINS = new Set([
  'https://rask18.github.io',
  'http://localhost:4173',
  'http://localhost:5173'
]);
const AVAILABILITY_PATH = '/v1/availability';
const STREAMING_ORIGIN = 'https://animeav1.com';
const SLUG_PATTERN = /^[a-z0-9-]{1,200}$/;
const EPISODE_PATTERN = /^[1-9]\d{0,4}$/;

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

const jsonResponse = (body: unknown, status: number, cacheSeconds = 0): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    }
  });

const withCors = (response: Response, allowedOrigin: string | null): Response => {
  if (!allowedOrigin) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.append('Vary', 'Origin');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

const validationCacheSeconds = (state: StreamingValidationState): number => {
  switch (state) {
    case 'available':
      return 60 * 60;
    case 'missing':
      return 5 * 60;
    default:
      return 30;
  }
};

const handler = {
  async fetch(
    request: Request,
    _environment: unknown,
    context: WorkerExecutionContext
  ): Promise<Response> {
    const requestOrigin = request.headers.get('Origin');
    const allowedOrigin = requestOrigin && ALLOWED_ORIGINS.has(requestOrigin) ? requestOrigin : null;

    if (requestOrigin && !allowedOrigin) {
      return jsonResponse({ error: 'Origin not allowed' }, 403);
    }

    if (request.method === 'OPTIONS') {
      const response = new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Headers': 'Accept, Content-Type',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Max-Age': '86400',
          'Cache-Control': 'public, max-age=86400'
        }
      });

      return withCors(response, allowedOrigin);
    }

    if (request.method !== 'GET') {
      return withCors(jsonResponse({ error: 'Method not allowed' }, 405), allowedOrigin);
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname !== AVAILABILITY_PATH) {
      return withCors(jsonResponse({ error: 'Not found' }, 404), allowedOrigin);
    }

    const slug = requestUrl.searchParams.get('slug') ?? '';
    const episode = requestUrl.searchParams.get('episode') ?? '';

    if (!SLUG_PATTERN.test(slug) || !EPISODE_PATTERN.test(episode)) {
      return withCors(jsonResponse({ error: 'Invalid slug or episode' }, 400), allowedOrigin);
    }

    const canonicalUrl = new URL(AVAILABILITY_PATH, requestUrl.origin);
    canonicalUrl.searchParams.set('slug', slug);
    canonicalUrl.searchParams.set('episode', episode);
    const cacheKey = new Request(canonicalUrl, { method: 'GET' });
    const cache = caches.default;
    const cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      return withCors(cachedResponse, allowedOrigin);
    }

    let state: StreamingValidationState = 'unknown';

    try {
      const upstreamUrl = `${STREAMING_ORIGIN}/media/${encodeURIComponent(slug)}/${episode}/__data.json`;
      const upstreamResponse = await fetch(upstreamUrl, {
        headers: {
          Accept: 'application/json'
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000)
      });
      const payload: unknown = await upstreamResponse.json();

      state = hasMissingStreamingError(payload)
        ? 'missing'
        : upstreamResponse.ok
          ? 'available'
          : 'unknown';
    } catch {
      state = 'unknown';
    }

    const response = jsonResponse({ state }, 200, validationCacheSeconds(state));
    context.waitUntil(cache.put(cacheKey, response.clone()));

    return withCors(response, allowedOrigin);
  }
};

export default handler;
