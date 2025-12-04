/**
 * Favorite Person Types
 *
 * Type definitions for favorite persons functionality.
 * Used for storing and managing user's favorite actors/directors in Firestore.
 */

/**
 * Represents a favorited person record
 * Stored at: users/{userId}/favorite_persons/{personId}
 */
export interface FavoritePerson {
  /** TMDB person ID */
  id: number;
  /** Person's name */
  name: string;
  /** Path to profile image */
  profile_path: string | null;
  /** Primary department (e.g., "Acting", "Directing") */
  known_for_department: string;
  /** Timestamp when person was favorited */
  addedAt: number;
}
