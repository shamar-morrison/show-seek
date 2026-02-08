/**
 * Favorite Episode Types
 */

export interface FavoriteEpisode {
  id: string; // Format: "tvId-seasonNumber-episodeNumber"
  tvShowId: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string;
  showName: string;
  posterPath: string | null; // TV show poster
  addedAt: number;
}
