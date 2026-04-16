type MarkerEntry = {
  entry: {
    key: string;
    airingAt: number;
  };
};

export type NowMarkerPlacement =
  | 'hidden'
  | 'before-first'
  | 'after-last'
  | `after-entry:${string}`;

export const getNowMarkerPlacement = (params: {
  entries: ReadonlyArray<MarkerEntry>;
  currentTime: number;
  showMarker: boolean;
}): NowMarkerPlacement => {
  if (!params.showMarker || params.entries.length === 0) {
    return 'hidden';
  }

  const currentEpochSeconds = Math.floor(params.currentTime / 1000);
  const [firstEntry] = params.entries;

  if (!firstEntry || currentEpochSeconds < firstEntry.entry.airingAt) {
    return 'before-first';
  }

  for (let index = params.entries.length - 1; index >= 0; index -= 1) {
    const candidate = params.entries[index];

    if (candidate && currentEpochSeconds >= candidate.entry.airingAt) {
      return index === params.entries.length - 1
        ? 'after-last'
        : `after-entry:${candidate.entry.key}`;
    }
  }

  return 'hidden';
};
