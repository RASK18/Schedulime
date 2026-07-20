import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';

const endpoint =
  'https://worker.example/v2/availability?slug=saikyou-degarashi-ouji-no-anyaku-teii-arasoi&episode=3';

describe('streaming proxy Worker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the upstream status and body without interpreting them', async () => {
    const upstreamPayload = {
      type: 'data',
      nodes: [null, { type: 'error', error: { message: 'Internal Error' } }]
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(upstreamPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const response = await worker.fetch(
      new Request(endpoint, { headers: { Origin: 'https://disboard.es' } })
    );

    await expect(response.json()).resolves.toEqual(upstreamPayload);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://disboard.es');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Upstream-Status')).toBe('200');
    expect(response.headers.get('X-Worker-Cache')).toBe('BYPASS');
  });

  it('rejects arbitrary parameters without contacting the upstream', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await worker.fetch(new Request(`${endpoint}&url=https://example.com`));

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects browser origins outside the allowlist', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await worker.fetch(
      new Request(endpoint, { headers: { Origin: 'https://example.com' } })
    );

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
