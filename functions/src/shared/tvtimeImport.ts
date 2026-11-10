/**
 * Contract between the app (which parses TV Time exports on-device) and the
 * `importTvTimeChunk` callable. Imported by both sides — keep it dependency-free.
 *
 * The contract is shared by every file import and lives in `./fileImport`; this
 * module keeps the original TV Time names so existing code is unchanged.
 */

export {
  FILE_IMPORT_COOLDOWN_MS as TVTIME_IMPORT_COOLDOWN_MS,
  FILE_IMPORT_ID_PATTERN as TVTIME_IMPORT_ID_PATTERN,
  FILE_IMPORT_MAX_CALLS_PER_MINUTE as TVTIME_IMPORT_MAX_CALLS_PER_MINUTE,
  FILE_IMPORT_MAX_CHUNKS_PER_SESSION as TVTIME_IMPORT_MAX_CHUNKS_PER_SESSION,
  FILE_IMPORT_MAX_ENTITIES_PER_CHUNK as TVTIME_IMPORT_MAX_ENTITIES_PER_CHUNK,
  FILE_IMPORT_MAX_LISTS_PER_ENTITY as TVTIME_IMPORT_MAX_LISTS_PER_ENTITY,
  FILE_IMPORT_MAX_MOVIE_WATCHES as TVTIME_IMPORT_MAX_MOVIE_WATCHES,
  FILE_IMPORT_MAX_PLAYS_PER_CHUNK as TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK,
  FILE_IMPORT_MAX_UNRESOLVED_TITLES_PER_CHUNK as TVTIME_IMPORT_MAX_UNRESOLVED_TITLES_PER_CHUNK,
  FILE_IMPORT_MAX_UNRESOLVED_TITLES_TOTAL as TVTIME_IMPORT_MAX_UNRESOLVED_TITLES_TOTAL,
  FILE_IMPORT_SESSION_MAX_LIFETIME_MS as TVTIME_IMPORT_SESSION_MAX_LIFETIME_MS,
  FILE_IMPORT_SESSION_STALE_MS as TVTIME_IMPORT_SESSION_STALE_MS,
  TEST_FILE_IMPORT_COOLDOWN_MS as TEST_TVTIME_IMPORT_COOLDOWN_MS,
  createEmptyFileImportCounts as createEmptyTvTimeImportCounts,
  createEmptyFileImportStats as createEmptyTvTimeImportStats,
  incrementFileImportStat as incrementTvTimeStat,
  mergeFileImportStats as mergeTvTimeImportStats,
} from './fileImport';

export type {
  FileImportChunkRequest as TvTimeImportChunkRequest,
  FileImportChunkResult as TvTimeImportChunkResult,
  FileImportCounts as TvTimeImportCounts,
  FileImportEpisodePlay as TvTimeEpisodePlay,
  FileImportIgnoredReason as TvTimeIgnoredReason,
  FileImportLimitDoc as TvTimeImportLimitDoc,
  FileImportListMembership as TvTimeListMembership,
  FileImportMovieEntity as TvTimeMovieEntity,
  FileImportRateLimitDetails as TvTimeRateLimitDetails,
  FileImportRating as TvTimeRating,
  FileImportShowEntity as TvTimeShowEntity,
  FileImportShowStatus as TvTimeShowStatus,
  FileImportSkipReason as TvTimeSkipReason,
  FileImportStats as TvTimeImportStats,
} from './fileImport';
