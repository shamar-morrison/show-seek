import { strFromU8, unzipSync } from 'fflate';

/** A file the user picked: Simkl's backup ZIP, the JSON inside it, or a Simkl CSV. */
export interface PickedSimklFile {
  name: string;
  bytes: Uint8Array;
}

export type SimklExportFile = { kind: 'json'; text: string } | { kind: 'csv'; text: string };

export type SimklImportErrorCode =
  | 'empty'
  | 'too_large'
  | 'unreadable_zip'
  | 'unreadable_file'
  | 'no_history'
  | 'csv_not_supported'
  | 'tvtime_export'
  | 'trakt_export'
  | 'unknown_format';

export class SimklImportError extends Error {
  constructor(readonly code: SimklImportErrorCode) {
    super(`Simkl import failed: ${code}`);
    this.name = 'SimklImportError';
  }
}

/**
 * A watched episode is ~50 bytes of JSON, so even a 100k-episode library is ~5–6MB.
 * The cap applies to the picked files and, separately, to the decompressed backup.
 */
export const SIMKL_MAX_EXPORT_BYTES = 50 * 1024 * 1024;

const BACKUP_JSON = 'simklbackup.json';
// File names that tell us the user picked another service's export.
const TVTIME_MARKER =
  /^(tracking-prod-records.*\.csv|tvtime-.*\.(csv|json)|tv-time-export\.csv|shows\.json|activity_history\.csv)$/;
const TRAKT_MARKER = /^(watched|ratings|watchlist|lists)-.+\.json$/;

export function basenameOf(path: string): string {
  return (path.split('/').pop() ?? path).trim().toLowerCase();
}

/**
 * Finds the Simkl data in the picked files, identified by content rather than name or
 * MIME type (Simkl serves its ZIP as `text/json`). In a ZIP only `SimklBackup.json`, or
 * failing that a single CSV, is ever decompressed; anything else (Simkl's docs mention
 * profile data) is skipped unread.
 */
export function readSimklExportFile(files: PickedSimklFile[]): SimklExportFile {
  if (files.length === 0) {
    throw new SimklImportError('empty');
  }
  const totalBytes = files.reduce((total, file) => total + file.bytes.byteLength, 0);
  if (totalBytes > SIMKL_MAX_EXPORT_BYTES) {
    throw new SimklImportError('too_large');
  }

  const seenNames: string[] = [];
  let csv: SimklExportFile | null = null;

  for (const file of files) {
    seenNames.push(basenameOf(file.name));

    if (looksLikeZip(file.bytes)) {
      const found = readZip(file.bytes, seenNames);
      if (found?.kind === 'json') return found;
      csv = csv ?? found;
      continue;
    }

    const text = decodeText(file.bytes);
    const kind = sniffText(text);
    if (kind === 'json') return { kind, text };
    if (kind === 'csv') csv = csv ?? { kind, text };
  }

  if (csv) return csv;
  throw new SimklImportError(explainUnrecognized(seenNames));
}

function readZip(bytes: Uint8Array, seenNames: string[]): SimklExportFile | null {
  const inflate = (wanted: (name: string) => boolean) => {
    let inflated = 0;
    try {
      return unzipSync(bytes, {
        filter: (file) => {
          const name = basenameOf(file.name);
          if (!wanted(name)) return false;
          inflated += file.originalSize;
          if (inflated > SIMKL_MAX_EXPORT_BYTES) throw new SimklImportError('too_large');
          return true;
        },
      });
    } catch (error) {
      if (error instanceof SimklImportError) throw error;
      throw new SimklImportError('unreadable_zip');
    }
  };

  // Record every entry name (without inflating anything) to explain an unrecognized ZIP.
  inflate((name) => {
    seenNames.push(name);
    return false;
  });

  const backup = Object.values(inflate((name) => name === BACKUP_JSON))[0];
  if (backup) {
    return { kind: 'json', text: decodeText(backup) };
  }
  const csvEntries = Object.values(inflate((name) => name.endsWith('.csv')));
  if (csvEntries.length === 1) {
    const text = decodeText(csvEntries[0]);
    if (sniffText(text) === 'csv') return { kind: 'csv', text };
  }
  return null;
}

/** JSON when it opens with `{`; a Simkl CSV when its header has `simkl_id` and `title`. */
function sniffText(text: string): 'json' | 'csv' | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) return 'json';
  const header = (trimmed.split(/\r?\n/, 1)[0] ?? '')
    .split(',')
    .map((column) => column.trim().replace(/^"|"$/g, '').toLowerCase());
  return header.includes('simkl_id') && header.includes('title') ? 'csv' : null;
}

function explainUnrecognized(names: string[]): SimklImportErrorCode {
  if (names.some((name) => TVTIME_MARKER.test(name))) return 'tvtime_export';
  if (names.some((name) => TRAKT_MARKER.test(name))) return 'trakt_export';
  return 'unknown_format';
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

function decodeText(bytes: Uint8Array): string {
  const text = strFromU8(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
