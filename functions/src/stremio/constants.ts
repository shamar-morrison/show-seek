export const STREMIO_COMPLETION_THRESHOLD = 0.9;
export const STREMIO_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export const STREMIO_TOKEN_COLLECTION = 'stremioAddonTokens';
export const STREMIO_TOKEN_CACHE_TTL_MS = 60_000;
export const STREMIO_TOKEN_CACHE_MAX_SIZE = 1024;
export const STREMIO_TOKEN_CREATE_COOLDOWN_MS = 60_000;
export const STREMIO_MAX_FREE_LIST_ITEMS = 50;
export const TMDB_REQUEST_TIMEOUT_MS = 15_000;
export const TMDB_TOTAL_BUDGET_MS = 45_000;
export const TMDB_MAX_RETRIES = 3;

export const STREMIO_MANIFEST = {
  id: 'app.showseek.stremio',
  version: '1.0.0',
  name: 'ShowSeek',
  description: 'Mark completed Stremio playback as watched in ShowSeek.',
  resources: ['player'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: [],
};
