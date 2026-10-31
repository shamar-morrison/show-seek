export const STREMIO_COMPLETION_THRESHOLD = 0.9;
export const STREMIO_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export const STREMIO_TOKEN_COLLECTION = 'stremioAddonTokens';
export const STREMIO_TOKEN_CACHE_TTL_MS = 60_000;
export const STREMIO_TOKEN_CACHE_MAX_SIZE = 1024;
export const STREMIO_TOKEN_CREATE_COOLDOWN_MS = 60_000;
export const STREMIO_STOP_RATE_LIMIT_MAX = 30;
export const STREMIO_STOP_RATE_LIMIT_WINDOW_MS = 10 * 60_000;
export const STREMIO_STOP_RATE_LIMIT_MAX_SIZE = 1024;
export const STREMIO_TMDB_CACHE_MAX_SIZE = 500;
export const STREMIO_TMDB_CACHE_TTL_MS = 10 * 60_000;
export const STREMIO_MAX_FREE_LIST_ITEMS = 50;
export const TMDB_REQUEST_TIMEOUT_MS = 15_000;
export const TMDB_TOTAL_BUDGET_MS = 45_000;
export const TMDB_MAX_RETRIES = 3;
export const ANIME_LIST_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';
export const ANIME_LIST_TTL_MS = 24 * 60 * 60_000;
export const ANIME_LIST_RETRY_AFTER_MS = 10 * 60_000;
export const ANIME_LIST_MIN_ENTRIES = 1000;
export const CINEMETA_META_URL = 'https://v3-cinemeta.strem.io/meta';
export const ANIME_KITSU_META_URL = 'https://anime-kitsu.strem.fun/meta';

export const STREMIO_MANIFEST = {
  id: 'app.showseek.stremio',
  version: '1.1.0',
  name: 'ShowSeek',
  description: 'Mark completed Stremio playback as watched in ShowSeek.',
  resources: ['player'],
  types: ['movie', 'series'],
  // Cinemeta (IMDb) and Anime Kitsu catalog IDs.
  idPrefixes: ['tt', 'kitsu'],
  catalogs: [],
};
