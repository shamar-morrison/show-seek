/**
 * A one-off request for Discover to show one genre, made by tapping a genre pill on a movie or TV
 * page. Handed over here instead of through route params so opening Discover never stacks a second
 * copy of it; Discover takes it when it next comes into view.
 */
export interface DiscoverGenreIntent {
  mediaType: 'movie' | 'tv';
  genreId: number;
}

let pending: DiscoverGenreIntent | null = null;

export function requestDiscoverGenre(intent: DiscoverGenreIntent): void {
  pending = intent;
}

/** The pending request, if any, cleared so it's applied once. */
export function takeDiscoverGenreRequest(): DiscoverGenreIntent | null {
  const intent = pending;
  pending = null;
  return intent;
}
