import type { CollectionShareCardData } from '@/src/components/shareCard/shareCardTypes';

const FAN_POSTER_COUNT = 3;

interface CollectionMovie {
  id: number;
  poster_path: string | null;
  release_date?: string | null;
}

interface BuildCollectionShareCardInput {
  name: string;
  backdropPath: string | null;
  /** The collection's movies in the order the page shows them (release order). */
  movies: CollectionMovie[];
  /** Applies the person's custom posters. */
  resolvePosterPath: (mediaType: 'movie', id: number, posterPath: string | null) => string | null;
  /** Watched progress, only when the collection is being tracked. */
  progress?: { watched: number; total: number } | null;
}

/** "1977–2019" from the movies' release years, one year when they match, empty when none has one. */
export function getCollectionYearRange(movies: CollectionMovie[]): string {
  const years = movies
    .map((movie) => Number(movie.release_date?.slice(0, 4)))
    .filter((year) => Number.isFinite(year) && year > 0);
  if (years.length === 0) return '';
  const first = Math.min(...years);
  const last = Math.max(...years);
  return first === last ? String(first) : `${first}–${last}`;
}

export function buildCollectionShareCard({
  name,
  backdropPath,
  movies,
  resolvePosterPath,
  progress,
}: BuildCollectionShareCardInput): CollectionShareCardData {
  // Movies can share a custom poster, and the fan should show distinct ones.
  const posterPaths = [
    ...new Set(
      movies
        .map((movie) => resolvePosterPath('movie', movie.id, movie.poster_path))
        .filter((path): path is string => !!path)
    ),
  ].slice(0, FAN_POSTER_COUNT);

  return {
    kind: 'collection',
    collectionName: name,
    movieCount: movies.length,
    yearRange: getCollectionYearRange(movies),
    posterPaths,
    backdropPath,
    ...(progress ? { progress } : {}),
  };
}
