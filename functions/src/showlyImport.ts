/**
 * importShowlyChunk — imports one chunk of a Showly backup (`showly_export_*.json`)
 * that the app has already parsed on-device. See docs/showly-import-plan.md.
 *
 * The import itself is the shared file-import core (`./fileImport/core`), the same one
 * TV Time and Simkl use, including its rate limits (users/{uid}/import_limits/showly);
 * this module is Showly's configuration of it.
 */
import { createFileImportCallable, type ImportSourceConfig } from './fileImport/core';

/** Changing any of these changes stored data or user-facing messages for Showly. */
export const SHOWLY_IMPORT_SOURCE: ImportSourceConfig = {
  displayName: 'Showly',
  limitDocId: 'showly',
  logTag: '[showlyImport]',
  movieWatchDocPrefix: 'showly-',
  // Showly numbers episodes like Trakt, which usually matches TMDB; the TMDB "TVDB order"
  // episode group is tried only for shows with plays TMDB's numbering can't place.
  episodeGroupFallback: true,
  reportUnmatchedEpisodeTitles: true,
};

export const importShowlyChunk = createFileImportCallable(SHOWLY_IMPORT_SOURCE);
