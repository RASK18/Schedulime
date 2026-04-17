import { describe, expect, it } from 'vitest';
import { sanitizeAnimeDescription } from './descriptions';

describe('sanitizeAnimeDescription', () => {
  it('removes a trailing source block after blank lines', () => {
    expect(sanitizeAnimeDescription('Main synopsis\n\n(Source: Manga)')).toBe('Main synopsis');
  });

  it('removes a trailing note block after blank lines', () => {
    expect(
      sanitizeAnimeDescription(
        'Main synopsis\n\nNote: Episode 2 was streamed a week in advance on Crunchyroll.'
      )
    ).toBe('Main synopsis');
  });

  it('removes a trailing note block after html line breaks', () => {
    expect(
      sanitizeAnimeDescription(
        'Main synopsis<br><br>Note: Episode 2 was streamed a week in advance on Crunchyroll.'
      )
    ).toBe('Main synopsis');
  });

  it('removes a trailing source block followed by an italic note block', () => {
    expect(
      sanitizeAnimeDescription(
        [
          'Main synopsis',
          '<br><br>(Source: Kodansha USA)',
          '<br><br><i>Note: Tongari Boushi no Atelier episode 2 was streamed a week in advance.</i>'
        ].join('')
      )
    ).toBe('Main synopsis');
  });
});
