const ALLOWED_ORIGINS = new Set([
  'https://rask18.github.io',
  'https://disboard.es',
  'http://localhost:4173',
  'http://localhost:5173'
]);
const AVAILABILITY_PATH = '/v2/availability';
const STREAMING_ORIGIN = 'https://animeav1.com';
const SLUG_PATTERN = /^[a-z0-9-]{1,200}$/;
const EPISODE_PATTERN = /^[1-9]\d{0,4}$/;
const EXPOSED_HEADERS = 'X-Upstream-Status, X-Upstream-URL, X-Worker-Cache';

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
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
  headers.set('Access-Control-Expose-Headers', EXPOSED_HEADERS);
  headers.append('Vary', 'Origin');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

const buildUpstreamResponse = (
  upstreamResponse: Response,
  upstreamUrl: string
): Response => {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Upstream-Status': String(upstreamResponse.status),
    'X-Upstream-URL': upstreamUrl,
    'X-Worker-Cache': 'BYPASS'
  });
  const contentType = upstreamResponse.headers.get('Content-Type');

  if (contentType) {
    headers.set('Content-Type', contentType);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers
  });
};

const handler = {
  async fetch(request: Request): Promise<Response> {
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
      const response = jsonResponse({ error: 'Method not allowed' }, 405);
      response.headers.set('Allow', 'GET, OPTIONS');
      return withCors(response, allowedOrigin);
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname !== AVAILABILITY_PATH) {
      return withCors(
        jsonResponse({ error: 'Not found', pathname: requestUrl.pathname }, 404),
        allowedOrigin
      );
    }

    const unexpectedParameter = [...requestUrl.searchParams.keys()].find(
      (parameter) => parameter !== 'slug' && parameter !== 'episode'
    );
    const slug = requestUrl.searchParams.get('slug') ?? '';
    const episode = requestUrl.searchParams.get('episode') ?? '';

    if (unexpectedParameter || !SLUG_PATTERN.test(slug) || !EPISODE_PATTERN.test(episode)) {
      return withCors(jsonResponse({ error: 'Invalid slug or episode' }, 400), allowedOrigin);
    }

    const upstreamUrl = `${STREAMING_ORIGIN}/media/${encodeURIComponent(slug)}/${episode}/__data.json`;

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json'
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000)
      });

      return withCors(buildUpstreamResponse(upstreamResponse, upstreamUrl), allowedOrigin);
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      const isTimeout = errorName === 'TimeoutError';
      const response = jsonResponse(
        {
          type: 'proxy_error',
          error: {
            message: isTimeout ? 'AnimeAV1 request timed out' : 'AnimeAV1 request failed',
            name: errorName
          }
        },
        isTimeout ? 504 : 502
      );
      response.headers.set('X-Upstream-URL', upstreamUrl);
      response.headers.set('X-Worker-Cache', 'BYPASS');

      return withCors(response, allowedOrigin);
    }
  }
};

export default handler;
