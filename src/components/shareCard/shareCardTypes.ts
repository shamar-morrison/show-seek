export type ShareCardFormat = 'portrait' | 'square' | 'landscape';

export const SHARE_CARD_FORMAT_KEYS: readonly ShareCardFormat[] = [
  'portrait',
  'square',
  'landscape',
];

/** Exported image size in pixels. Each card lays itself out at these dimensions. */
export const SHARE_CARD_DIMENSIONS: Record<ShareCardFormat, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

export const SHARE_CARD_NOTE_MAX_LENGTH = 150;

/** Near-black base every card fades into. */
export const SHARE_CARD_BACKGROUND = '#0C0C0E';

export interface TitleShareCardData {
  kind: 'title';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseYear: string;
  genres: string[];
  /** 0 when the user has not rated the title. */
  userRating: number;
}

export interface EpisodeShareCardData {
  kind: 'episode';
  showTitle: string;
  episodeTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  posterPath: string | null;
  stillPath: string | null;
  backdropPath: string | null;
  /** This episode's own length, not the season's. */
  runtimeMinutes: number | null;
  /** 0 when the user has not rated the episode. */
  userRating: number;
}

export interface ProgressShareCardData {
  kind: 'progress';
  showTitle: string;
  seasonTitle: string;
  seasonYear: string;
  watchedCount: number;
  totalCount: number;
  /** 0 when the user has not rated the season. */
  userRating: number;
  posterPath: string | null;
  backdropPath: string | null;
}

export type ShareCardData = TitleShareCardData | EpisodeShareCardData | ProgressShareCardData;

/** Who the card credits. Deliberately has no email: cards are posted publicly. */
export interface ShareCardIdentity {
  displayName: string | null;
  photoUrl: string | null;
}
