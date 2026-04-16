import { describe, expect, it } from 'vitest';
import { getNowMarkerPlacement } from './now-marker';

const createEntry = (key: string, isoDate: string) => ({
  entry: {
    key,
    airingAt: Math.floor(new Date(isoDate).getTime() / 1000)
  }
});

describe('getNowMarkerPlacement', () => {
  const entries = [
    createEntry('first', '2026-04-15T13:00:00'),
    createEntry('second', '2026-04-15T17:30:00'),
    createEntry('third', '2026-04-15T22:00:00')
  ];

  it('returns before-first when the current time is before the first visible entry', () => {
    expect(
      getNowMarkerPlacement({
        entries,
        currentTime: new Date('2026-04-15T10:00:00').getTime(),
        showMarker: true
      })
    ).toBe('before-first');
  });

  it('returns the previous entry key when the current time falls between visible entries', () => {
    expect(
      getNowMarkerPlacement({
        entries,
        currentTime: new Date('2026-04-15T15:30:00').getTime(),
        showMarker: true
      })
    ).toBe('after-entry:first');
  });

  it('returns after-last when the current time is after the final visible entry', () => {
    expect(
      getNowMarkerPlacement({
        entries,
        currentTime: new Date('2026-04-15T23:10:00').getTime(),
        showMarker: true
      })
    ).toBe('after-last');
  });

  it('treats an entry airing at the exact current time as already available', () => {
    expect(
      getNowMarkerPlacement({
        entries,
        currentTime: new Date('2026-04-15T17:30:00').getTime(),
        showMarker: true
      })
    ).toBe('after-entry:second');
  });

  it('returns hidden when the day has no visible entries', () => {
    expect(
      getNowMarkerPlacement({
        entries: [],
        currentTime: new Date('2026-04-15T17:30:00').getTime(),
        showMarker: true
      })
    ).toBe('hidden');
  });

  it('returns hidden when the visible week is not the current week', () => {
    expect(
      getNowMarkerPlacement({
        entries,
        currentTime: new Date('2026-04-15T17:30:00').getTime(),
        showMarker: false
      })
    ).toBe('hidden');
  });

  it('returns hidden when the day is not today even inside the current week', () => {
    expect(
      getNowMarkerPlacement({
        entries,
        currentTime: new Date('2026-04-15T12:00:00').getTime(),
        showMarker: false
      })
    ).toBe('hidden');
  });
});
