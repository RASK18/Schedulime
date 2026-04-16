import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStreamingSlug,
  buildStreamingUrl,
  resolveStreamingTitle,
  resolveStreamingUrl
} from './streaming';

describe('streaming helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes titles into the expected streaming slug', () => {
    expect(buildStreamingSlug('Re:Zero, kara Hajimeru-Isekai Seikatsu? 4th Season')).toBe(
      'rezero-kara-hajimeru-isekai-seikatsu-4th-season'
    );
  });

  it('builds the final streaming url from the resolved title and episode', () => {
    expect(buildStreamingUrl('ReZero kara Hajimeru-Isekai Seikatsu 4th Season', 2)).toBe(
      'https://animeav1.com/media/rezero-kara-hajimeru-isekai-seikatsu-4th-season/2'
    );
  });

  it('uses the Jikan title when it is available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { title: 'Re:Zero kara Hajimeru Isekai Seikatsu 4th Season' } }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );

    await expect(
      resolveStreamingUrl({
        idMal: 101001,
        fallbackTitle: 'Fallback AniList Title',
        episode: 2
      })
    ).resolves.toEqual({
      resolvedTitle: 'Re:Zero kara Hajimeru Isekai Seikatsu 4th Season',
      streamingUrl: 'https://animeav1.com/media/rezero-kara-hajimeru-isekai-seikatsu-4th-season/2'
    });
  });

  it('falls back to the AniList title when idMal is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(resolveStreamingTitle(null, 'AniList Only Title')).resolves.toBe('AniList Only Title');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([404, 429, 500])('falls back to the AniList title when Jikan responds with %i', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status, error: 'Request failed' }), {
        status,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );

    await expect(resolveStreamingTitle(101100 + status, 'AniList Fallback Title')).resolves.toBe(
      'AniList Fallback Title'
    );
  });

  it('falls back to the AniList title when Jikan fails with a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(resolveStreamingTitle(101700, 'AniList Fallback Title')).resolves.toBe(
      'AniList Fallback Title'
    );
  });

  it('deduplicates in-flight Jikan requests and caches successful titles', async () => {
    let resolveResponse!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => fetchPromise);

    const firstRequest = resolveStreamingTitle(102000, 'Fallback Title');
    const secondRequest = resolveStreamingTitle(102000, 'Fallback Title');

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    resolveResponse(
      new Response(JSON.stringify({ data: { title: 'Cached Jikan Title' } }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      'Cached Jikan Title',
      'Cached Jikan Title'
    ]);

    fetchSpy.mockClear();

    await expect(resolveStreamingTitle(102000, 'Fallback Title')).resolves.toBe('Cached Jikan Title');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
