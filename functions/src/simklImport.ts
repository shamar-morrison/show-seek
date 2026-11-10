/**
 * importSimklChunk — imports one chunk of a Simkl backup (SimklBackup.json, later the
 * CSV) that the app has already parsed on-device. See docs/simkl-import-plan.md.
 *
 * The import itself is the shared file-import core (`./fileImport/core`), the same one
 * TV Time uses; this module is Simkl's configuration of it.
 */
import { createFileImportCallable, type ImportSourceConfig } from './fileImport/core';

/** Changing any of these changes stored data or user-facing messages for Simkl. */
export const SIMKL_IMPORT_SOURCE: ImportSourceConfig = {
  displayName: 'Simkl',
  limitDocId: 'simkl',
  logTag: '[simklImport]',
  movieWatchDocPrefix: 'simkl-',
  // Simkl numbers TV like TVDB and has no TVDB episode ids, so retry mismatched shows
  // through TMDB's "TVDB order" episode group, and name what still can't be placed.
  episodeGroupFallback: true,
  reportUnmatchedEpisodeTitles: true,
};

export const importSimklChunk = createFileImportCallable(SIMKL_IMPORT_SOURCE);
