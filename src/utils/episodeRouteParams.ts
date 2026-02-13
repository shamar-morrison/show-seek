type RouteParamValue = string | string[] | undefined;

interface EpisodeRouteParamInput {
  id?: RouteParamValue;
  seasonNum?: RouteParamValue;
  episodeNum?: RouteParamValue;
}

export interface EpisodeRouteParams {
  tvId: number;
  seasonNumber: number;
  episodeNumber: number;
  hasValidTvId: boolean;
  hasValidSeasonNumber: boolean;
  hasValidEpisodeNumber: boolean;
  hasValidEpisodeRoute: boolean;
}

const toSingleValue = (value: RouteParamValue): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const parseIntegerParam = (value: RouteParamValue): number => {
  const singleValue = toSingleValue(value);
  if (typeof singleValue !== 'string') {
    return Number.NaN;
  }
  return Number(singleValue);
};

export const parseEpisodeRouteParams = (params: EpisodeRouteParamInput): EpisodeRouteParams => {
  const tvId = parseIntegerParam(params.id);
  const seasonNumber = parseIntegerParam(params.seasonNum);
  const episodeNumber = parseIntegerParam(params.episodeNum);

  const hasValidTvId = Number.isInteger(tvId) && tvId > 0;
  const hasValidSeasonNumber = Number.isInteger(seasonNumber) && seasonNumber >= 0;
  const hasValidEpisodeNumber = Number.isInteger(episodeNumber) && episodeNumber > 0;

  return {
    tvId,
    seasonNumber,
    episodeNumber,
    hasValidTvId,
    hasValidSeasonNumber,
    hasValidEpisodeNumber,
    hasValidEpisodeRoute: hasValidTvId && hasValidSeasonNumber && hasValidEpisodeNumber,
  };
};
