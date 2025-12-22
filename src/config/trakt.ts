/**
 * Trakt Integration Configuration
 */

export const TRAKT_CONFIG = {
  /**
   * Your Trakt application Client ID
   * Get this from https://trakt.tv/oauth/applications
   */
  CLIENT_ID: process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID || '',

  /**
   * OAuth redirect URI - must match the callback URL configured in your Trakt app
   */
  REDIRECT_URI:
    process.env.EXPO_PUBLIC_TRAKT_REDIRECT_URI ||
    'https://trakt-proxy.vercel.app/api/trakt/callback',

  /**
   * Backend URL for the Trakt proxy server
   */
  BACKEND_URL: process.env.EXPO_PUBLIC_TRAKT_BACKEND_URL || 'https://trakt-proxy.vercel.app',

  /**
   * Minimum time (in milliseconds) between automatic syncs
   * Prevents rapid syncing when user opens/closes app quickly
   * Default: 1 hour (3600000ms)
   */
  AUTO_SYNC_COOLDOWN_MS: 60 * 60 * 1000, // 1 hour

  /**
   * Polling interval for checking sync status (in milliseconds)
   */
  SYNC_STATUS_POLL_INTERVAL_MS: 3000, // 3 seconds
} as const;

// AsyncStorage keys for Trakt state persistence
export const TRAKT_STORAGE_KEYS = {
  CONNECTED: '@trakt_connected',
  LAST_SYNCED: '@trakt_last_synced',
  SYNC_STATUS: '@trakt_sync_status',
} as const;
