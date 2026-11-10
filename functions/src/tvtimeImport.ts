/**
 * importTvTimeChunk — imports one chunk of a TV Time export that the app has
 * already parsed on-device. See docs/tvtime-import-plan.md.
 *
 * The import itself is the shared file-import core (`./fileImport/core`); this
 * module is TV Time's configuration of it and keeps the original exported names.
 */
import {
  claimImportChunkSlot,
  createFileImportCallable,
  isImportCooldownBypassed,
  markImportFinished,
  parseFileImportChunk,
  type ImportSourceConfig,
} from './fileImport/core';
import { TVTIME_IMPORT_COOLDOWN_MS, type TvTimeImportChunkRequest } from './shared/tvtimeImport';

export { normalizeTitle, pickExactTitleMatch, splitTitleYear } from './fileImport/core';

/** Changing any of these changes stored data or user-facing messages for TV Time. */
export const TVTIME_IMPORT_SOURCE: ImportSourceConfig = {
  displayName: 'TV Time',
  limitDocId: 'tvtime',
  logTag: '[tvtimeImport]',
  movieWatchDocPrefix: 'tvtime-',
};

export const importTvTimeChunk = createFileImportCallable(TVTIME_IMPORT_SOURCE);

/** Emulator and allowlisted testers get the short test cooldown, as in the Trakt ZIP import. */
export function isTvTimeCooldownBypassed(userId: string): boolean {
  return isImportCooldownBypassed(userId);
}

/** See `claimImportChunkSlot`. State lives at users/{uid}/import_limits/tvtime. */
export function claimTvTimeChunkSlot(
  db: FirebaseFirestore.Firestore,
  userId: string,
  importId: string,
  now: number,
  cooldownMs: number = TVTIME_IMPORT_COOLDOWN_MS
): Promise<void> {
  return claimImportChunkSlot(TVTIME_IMPORT_SOURCE, db, userId, importId, now, cooldownMs);
}

/** Marks the import finished after its final chunk succeeds, so a new import isn't refused as `in_progress`. */
export function markTvTimeImportFinished(
  db: FirebaseFirestore.Firestore,
  userId: string,
  importId: string,
  now: number
): Promise<void> {
  return markImportFinished(TVTIME_IMPORT_SOURCE, db, userId, importId, now);
}

export function parseTvTimeImportChunk(data: unknown): TvTimeImportChunkRequest {
  return parseFileImportChunk(data);
}
