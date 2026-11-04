import { strFromU8, unzipSync } from 'fflate';

/** A file the user picked: a ZIP, CSV or JSON. */
export interface PickedTvTimeFile {
  name: string;
  bytes: Uint8Array;
}

/** A decoded export file, keyed by its canonical basename. */
export interface TvTimeFileEntry {
  name: string;
  text: string;
}

export type TvTimeImportErrorCode =
  | 'empty'
  | 'too_large'
  | 'unreadable_zip'
  | 'unreadable_file'
  | 'no_history'
  | 'trakt_export'
  | 'summary_only'
  | 'mixed_formats'
  | 'unknown_format';

export class TvTimeImportError extends Error {
  constructor(readonly code: TvTimeImportErrorCode) {
    super(`TV Time import failed: ${code}`);
    this.name = 'TvTimeImportError';
  }
}

/** Same ceiling as the Trakt ZIP import's uncompressed limit. */
export const TVTIME_MAX_EXPORT_BYTES = 150 * 1024 * 1024;

const GDPR_FILES = new Set([
  'tracking-prod-records-v2.csv',
  'tracking-prod-records.csv',
  'followed_tv_show.csv',
  'user_tv_show_data.csv',
  'user_show_special_status.csv',
  'tv_show_rate.csv',
  'ratings-live-votes.csv',
  'ratings-v2-prod-votes.csv',
  'lists-prod-lists.csv',
]);
const LIBERATOR_FILES = new Set([
  'movies.json',
  'shows.json',
  'activity_history.csv',
  'favorites.json',
  'lists.json',
]);
const EXTRACTOR_FILE = 'tv-time-export.csv';
export const REFRACT_FILE_PATTERN =
  /^tvtime-(series-episodes|series|movies|lists)(?:-\d{4}-\d{2}-\d{2})?\.(csv|json)$/;

// File names that explain *why* an archive has nothing to import.
const GDPR_ACCOUNT_ONLY_MARKERS = ['auth-prod-login.csv', 'gdpr_requests.csv', 'access_token.csv'];
const TRAKT_EXPORT_MARKER = /^(watched|ratings|watchlist|lists)-.+\.json$/;
const SUMMARY_PAGE_MARKER = /^tvtime-summary.*\.html$/;

/**
 * Only these files are ever decompressed or decoded. Everything else in an
 * export — notably GDPR account files (access tokens, logins) — is skipped
 * without being read.
 */
export function isRelevantTvTimeFile(basename: string): boolean {
  return (
    GDPR_FILES.has(basename) ||
    LIBERATOR_FILES.has(basename) ||
    basename === EXTRACTOR_FILE ||
    REFRACT_FILE_PATTERN.test(basename)
  );
}

export function basenameOf(path: string): string {
  return (path.split('/').pop() ?? path).trim().toLowerCase();
}

/**
 * Turns picked files into decoded entries. ZIPs (including ones that nest the
 * export in a folder) are filtered before inflation; loose CSVs with an
 * unrecognised name are identified by their header.
 */
export function readTvTimeExportFiles(files: PickedTvTimeFile[]): TvTimeFileEntry[] {
  if (files.length === 0) {
    throw new TvTimeImportError('empty');
  }

  const totalBytes = files.reduce((total, file) => total + file.bytes.byteLength, 0);
  if (totalBytes > TVTIME_MAX_EXPORT_BYTES) {
    throw new TvTimeImportError('too_large');
  }

  const entries: TvTimeFileEntry[] = [];
  const seenNames: string[] = [];
  // Uncompressed bytes across every picked ZIP, so several archives share one limit.
  const budget = { inflated: 0 };

  for (const file of files) {
    const name = basenameOf(file.name);
    seenNames.push(name);

    if (name.endsWith('.zip') || looksLikeZip(file.bytes)) {
      entries.push(...readZip(file.bytes, seenNames, budget));
      continue;
    }

    if (!name.endsWith('.csv') && !name.endsWith('.json')) {
      continue;
    }

    const text = decodeText(file.bytes);
    const canonical = isRelevantTvTimeFile(name) ? name : sniffCsvName(text);
    if (canonical) {
      entries.push({ name: canonical, text });
    }
  }

  if (entries.length === 0) {
    throw new TvTimeImportError(explainEmpty(seenNames));
  }

  return entries;
}

/**
 * Inflates only files whose name we recognize, so account files (access tokens, logins)
 * are never decompressed. The cost: a renamed tracking CSV inside a ZIP isn't found.
 * Loose renamed CSVs are still identified by their header.
 */
function readZip(
  bytes: Uint8Array,
  seenNames: string[],
  budget: { inflated: number }
): TvTimeFileEntry[] {
  let unzipped: Record<string, Uint8Array>;

  try {
    unzipped = unzipSync(bytes, {
      filter: (file) => {
        const name = basenameOf(file.name);
        seenNames.push(name);
        if (!isRelevantTvTimeFile(name)) {
          return false;
        }
        budget.inflated += file.originalSize;
        if (budget.inflated > TVTIME_MAX_EXPORT_BYTES) {
          throw new TvTimeImportError('too_large');
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof TvTimeImportError) {
      throw error;
    }
    throw new TvTimeImportError('unreadable_zip');
  }

  return Object.entries(unzipped)
    .filter(([path]) => !path.endsWith('/'))
    .map(([path, data]) => ({ name: basenameOf(path), text: decodeText(data) }));
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

/** Identify a renamed CSV by its header columns. */
function sniffCsvName(text: string): string | null {
  const header = new Set(
    (text.split(/\r?\n/, 1)[0] ?? '')
      .split(',')
      .map((column) => column.trim().replace(/^"|"$/g, ''))
  );
  if (header.has('key') && header.has('s_id')) return 'tracking-prod-records-v2.csv';
  if (header.has('type-uuid-n')) return 'tracking-prod-records.csv';
  if (header.has('series_tvdb_id')) return 'tvtime-series-episodes.csv';
  if (header.has('is_watchlisted')) return 'activity_history.csv';
  if (header.has('media_type') && header.has('watched_at')) return EXTRACTOR_FILE;
  return null;
}

function explainEmpty(names: string[]): TvTimeImportErrorCode {
  if (names.some((name) => GDPR_ACCOUNT_ONLY_MARKERS.includes(name))) return 'no_history';
  if (names.some((name) => TRAKT_EXPORT_MARKER.test(name))) return 'trakt_export';
  if (names.some((name) => SUMMARY_PAGE_MARKER.test(name))) return 'summary_only';
  return 'unknown_format';
}
