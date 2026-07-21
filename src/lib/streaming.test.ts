import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStreamingAnimeUrl,
  buildStreamingSlug,
  buildStreamingValidationRequestUrl,
  buildStreamingUrl,
  resolveStreamingTitle,
  resolveStreamingUrl,
  validateStreamingUrl
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

  it('transliterates accented letters instead of removing them from the slug', () => {
    expect(buildStreamingSlug('Otome Kaijuu Caraméliser')).toBe(
      'otome-kaijuu-carameliser'
    );
  });

  it('collapses title hyphens and surrounding spaces into one slug separator', () => {
    expect(
      buildStreamingSlug(
        'Honzuki no Gekokujou: Shisho ni Naru Tame ni wa Shudan wo Erandeiraremasen - Ryoushu no Youjo'
      )
    ).toBe(
      'honzuki-no-gekokujou-shisho-ni-naru-tame-ni-wa-shudan-wo-erandeiraremasen-ryoushu-no-youjo'
    );
  });

  it('builds the final streaming url from the resolved title and episode', () => {
    expect(buildStreamingUrl('ReZero kara Hajimeru-Isekai Seikatsu 4th Season', 2)).toBe(
      'https://animeav1.com/media/rezero-kara-hajimeru-isekai-seikatsu-4th-season/2'
    );
  });

  it('builds the general Animeav1 url without an episode suffix', () => {
    expect(
      buildStreamingAnimeUrl('Toumei na Yoru ni Kakeru Kimi to, Me ni Mienai Koi wo Shita')
    ).toBe(
      'https://animeav1.com/media/toumei-na-yoru-ni-kakeru-kimi-to-me-ni-mienai-koi-wo-shita'
    );
  });

  it('builds a closed Worker validation request from a streaming url', () => {
    expect(
      buildStreamingValidationRequestUrl(
        'https://animeav1.com/media/rezero-kara-hajimeru-isekai-seikatsu-4th-season/2',
        'https://schedulime-streaming-validator.example.workers.dev/v2/availability'
      )
    ).toBe(
      'https://schedulime-streaming-validator.example.workers.dev/v2/availability?slug=rezero-kara-hajimeru-isekai-seikatsu-4th-season&episode=2'
    );
  });

  it('does not send unrelated urls to the Worker', () => {
    expect(
      buildStreamingValidationRequestUrl(
        'https://example.com/media/test/1',
        'https://schedulime-streaming-validator.example.workers.dev/v2/availability'
      )
    ).toBeNull();
  });

  it('marks a transparent upstream payload containing an error as missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          type: 'data',
          nodes: [
            null,
            { type: 'data', data: [{ user: 1 }, null] },
            { type: 'error', error: { message: 'Internal Error' } }
          ]
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    );

    await expect(
      validateStreamingUrl(
        'https://animeav1.com/media/worker-validation-test/7',
        'https://schedulime-streaming-validator.example.workers.dev/v2/availability'
      )
    ).resolves.toBe('missing');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://schedulime-streaming-validator.example.workers.dev/v2/availability?slug=worker-validation-test&episode=7',
      { cache: 'no-store' }
    );
  });

  it('marks an error-free transparent upstream payload as available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ type: 'data', nodes: [null, { type: 'data' }] }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );

    await expect(
      validateStreamingUrl(
        'https://animeav1.com/media/worker-available-test/8',
        'https://schedulime-streaming-validator.example.workers.dev/v2/availability'
      )
    ).resolves.toBe('available');
  });

  it('does not cache completed streaming validations', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ type: 'data', nodes: [null, { type: 'data' }] }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );
    const streamingUrl = 'https://animeav1.com/media/non-cached-validation-test/9';
    const validatorUrl =
      'https://schedulime-streaming-validator.example.workers.dev/v2/availability';

    await validateStreamingUrl(streamingUrl, validatorUrl);
    await validateStreamingUrl(streamingUrl, validatorUrl);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('uses the Jikan title when it differs from the AniList fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { title: 'Tai-Ari deshita. Ojousama wa Kakutou Game nante Shinai' }
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    );

    await expect(
      resolveStreamingUrl({
        idMal: 46488,
        fallbackTitle: 'Tai-Ari deshita.: Ojou-sama wa Kakutou Game nante Shinai',
        episode: 3
      })
    ).resolves.toEqual({
      jikanTitle: 'Tai-Ari deshita. Ojousama wa Kakutou Game nante Shinai',
      effectiveTitle: 'Tai-Ari deshita. Ojousama wa Kakutou Game nante Shinai',
      titleSource: 'jikan',
      streamingUrl:
        'https://animeav1.com/media/tai-ari-deshita-ojousama-wa-kakutou-game-nante-shinai/3'
    });
  });

  it('keeps the Jikan title null and uses the AniList title when idMal is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(
      resolveStreamingUrl({
        idMal: null,
        fallbackTitle: 'AniList Only Title',
        episode: 4
      })
    ).resolves.toEqual({
      jikanTitle: null,
      effectiveTitle: 'AniList Only Title',
      titleSource: 'anilist',
      streamingUrl: 'https://animeav1.com/media/anilist-only-title/4'
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([404, 429, 500])('returns null when Jikan responds with %i', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status, error: 'Request failed' }), {
        status,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );

    await expect(resolveStreamingTitle(101100 + status)).resolves.toBeNull();
  });

  it('returns null when Jikan fails with a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(
      resolveStreamingUrl({
        idMal: 101700,
        fallbackTitle: 'AniList Fallback Title',
        episode: 5
      })
    ).resolves.toEqual({
      jikanTitle: null,
      effectiveTitle: 'AniList Fallback Title',
      titleSource: 'anilist',
      streamingUrl: 'https://animeav1.com/media/anilist-fallback-title/5'
    });
  });

  it('deduplicates in-flight Jikan requests and caches successful titles', async () => {
    let resolveResponse!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => fetchPromise);

    const firstRequest = resolveStreamingTitle(102000);
    const secondRequest = resolveStreamingTitle(102000);

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

    await expect(resolveStreamingTitle(102000)).resolves.toBe('Cached Jikan Title');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
