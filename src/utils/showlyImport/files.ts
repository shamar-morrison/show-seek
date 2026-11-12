import { strFromU8 } from 'fflate';

/** A file the user picked: Showly's `showly_export_*.json` backup. */
export interface PickedShowlyFile {
  name: string;
  bytes: Uint8Array;
}

export type ShowlyImportErrorCode =
  | 'empty'
  | 'too_large'
  | 'unreadable_file'
  | 'zip_not_supported'
  | 'no_history'
  | 'simkl_export'
  | 'tvtime_export'
  | 'trakt_export'
  | 'unknown_format';

export class ShowlyImportError extends Error {
  constructor(readonly code: ShowlyImportErrorCode) {
    super(`Showly import failed: ${code}`);
    this.name = 'ShowlyImportError';
  }
}

/**
 * A compact Showly episode entry is ~90–120 bytes, so even 100k watched episodes is
 * ~12MB. Same cap as the Simkl import.
 */
export const SHOWLY_MAX_EXPORT_BYTES = 50 * 1024 * 1024;

const TVTIME_MARKER =
  /^(tracking-prod-records.*\.csv|tvtime-.*\.(csv|json)|tv-time-export\.csv|shows\.json|activity_history\.csv)$/;
const TRAKT_MARKER = /^(watched|ratings|watchlist|lists)-.+\.json$/;

export function basenameOf(path: string): string {
  return (path.split('/').pop() ?? path).trim().toLowerCase();
}

/**
 * Returns the backup's text. Showly writes one plain JSON file, which we recognise by
 * content in `parse.ts` (users rename files, and Android adds " (1)"); here we only
 * refuse what can't be it: nothing picked, too large, a ZIP, or another service's file.
 */
export function readShowlyExportFile(files: PickedShowlyFile[]): string {
  const file = files[0];
  if (!file || file.bytes.byteLength === 0) {
    throw new ShowlyImportError('empty');
  }
  if (file.bytes.byteLength > SHOWLY_MAX_EXPORT_BYTES) {
    throw new ShowlyImportError('too_large');
  }
  if (looksLikeZip(file.bytes)) {
    throw new ShowlyImportError('zip_not_supported');
  }

  const name = basenameOf(file.name);
  if (TVTIME_MARKER.test(name)) throw new ShowlyImportError('tvtime_export');
  if (TRAKT_MARKER.test(name)) throw new ShowlyImportError('trakt_export');

  let text: string;
  try {
    text = strFromU8(file.bytes);
  } catch {
    throw new ShowlyImportError('unreadable_file');
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length > 3 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}
