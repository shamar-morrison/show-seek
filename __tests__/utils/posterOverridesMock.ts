export function posterOverridesMock() {
  return {
    usePosterOverrides: () => ({
      overrides: {} as Record<string, string>,
      resolvePosterPath: (
        _mediaType: 'movie' | 'tv',
        _mediaId: number,
        fallbackPosterPath: string | null
      ) => fallbackPosterPath,
    }),
  };
}
