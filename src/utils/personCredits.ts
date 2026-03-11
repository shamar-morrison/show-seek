import type { Movie, MovieCrewCredit, TVCrewCredit, TVShow } from '@/src/api/tmdb';
import { EXCLUDED_TV_GENRE_IDS } from '@/src/constants/genres';

type MovieCastCredit = Movie & { character?: string };
type TVCastCredit = TVShow & { character?: string };

export interface PersonMovieCreditsResponse {
  cast: MovieCastCredit[];
  crew: MovieCrewCredit[];
}

export interface PersonTVCreditsResponse {
  cast: TVCastCredit[];
  crew: TVCrewCredit[];
}

export const RELEVANT_PERSON_CREW_JOBS = [
  'Director',
  'Writer',
  'Screenplay',
  'Story',
  'Creator',
  'Executive Producer',
] as const;

const dedupeCreditsById = <T extends { id: number }>(credits: T[]): T[] => {
  const uniqueMap = new Map<number, T>();

  credits.forEach((credit) => {
    if (!uniqueMap.has(credit.id)) {
      uniqueMap.set(credit.id, credit);
    }
  });

  return Array.from(uniqueMap.values());
};

const isRelevantCrewCredit = (job?: string) =>
  RELEVANT_PERSON_CREW_JOBS.some((relevantJob) => job?.includes(relevantJob));

const filterScriptedTVCredits = <T extends { genre_ids?: number[] }>(credits: T[]): T[] =>
  credits.filter(
    (credit) => !credit.genre_ids?.some((genreId) => EXCLUDED_TV_GENRE_IDS.includes(genreId))
  );

export const partitionMoviePersonCredits = (
  credits?: Partial<PersonMovieCreditsResponse> | null
) => ({
  acting: dedupeCreditsById(credits?.cast ?? []),
  directedWritten: dedupeCreditsById(
    (credits?.crew ?? []).filter((credit) => isRelevantCrewCredit(credit.job))
  ),
});

export const partitionTVPersonCredits = (credits?: Partial<PersonTVCreditsResponse> | null) => ({
  acting: filterScriptedTVCredits(dedupeCreditsById(credits?.cast ?? [])),
  directedWritten: filterScriptedTVCredits(
    dedupeCreditsById((credits?.crew ?? []).filter((credit) => isRelevantCrewCredit(credit.job)))
  ),
});
