/**
 * User preferences types
 */

export interface UserPreferences {
  autoAddToWatching: boolean;
  // Future preferences will be added here
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoAddToWatching: true,
};
