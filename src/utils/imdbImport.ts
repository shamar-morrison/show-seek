import Papa from 'papaparse';
import {
  IMDB_IMPORT_CHUNK_SIZE,
  IMDB_RESERVED_FILE_STEMS,
  createEmptyImdbImportStats,
  incrementImportStat,
  mergeImdbImportStats,
  type ImdbImportChunkRequest,
  type ImdbImportEntity,
  type ImdbImportFileKind,
  type ImdbImportIgnoredMetadataKey,
  type ImdbImportSkipReason,
  type ImdbImportStats,
} from '@/functions/src/shared/imdbImport';

export interface RawImdbImportFile {
  content: string;
  fileName: string;
}

export interface PreparedImdbImportFile {
  fileName: string;
  kind: ImdbImportFileKind;
  stats: ImdbImportStats;
  totalRows: number;
}

export interface PreparedImdbImport {
  chunks: ImdbImportChunkRequest[];
  files: PreparedImdbImportFile[];
  stats: ImdbImportStats;
  unsupportedFiles: string[];
}

type ParsedCsvRow = Record<string, string>;

const NORMALIZED_HEADER_KEYS = {
  created: 'created',
  dateRated: 'daterated',
  description: 'description',
  imdbId: 'const',
  modified: 'modified',
  rating: 'yourrating',
  title: 'title',
  titleType: 'titletype',
} as const;

export function prepareImdbImport(files: RawImdbImportFile[]): PreparedImdbImport {
  let aggregateStats = createEmptyImdbImportStats();
  const preparedFiles: PreparedImdbImportFile[] = [];
  const unsupportedFiles: string[] = [];
  const entitiesByImdbId = new Map<string, ImdbImportEntity>();

  files.forEach((file) => {
    const parsedFile = parseImdbImportFile(file);
    if (!parsedFile) {
      unsupportedFiles.push(file.fileName);
      aggregateStats = {
        ...aggregateStats,
        skipped: incrementImportStat(
          aggregateStats.skipped,
          'unsupported_file' satisfies ImdbImportSkipReason
        ),
      };
      return;
    }

    parsedFile.entities.forEach((entity) => {
      const existing = entitiesByImdbId.get(entity.imdbId);
      if (existing) {
        existing.actions.push(...entity.actions);
        return;
      }

      entitiesByImdbId.set(entity.imdbId, {
        ...entity,
        actions: [...entity.actions],
      });
    });

    parsedFile.stats.processedEntities = new Set(
      parsedFile.entities.map((entity) => entity.imdbId)
    ).size;

    preparedFiles.push({
      fileName: file.fileName,
      kind: parsedFile.kind,
      stats: parsedFile.stats,
      totalRows: parsedFile.totalRows,
    });
    aggregateStats = mergeImdbImportStats(aggregateStats, parsedFile.stats);
  });

  const chunks = buildImdbImportChunks([...entitiesByImdbId.values()]);

  return {
    chunks,
    files: preparedFiles,
    stats: aggregateStats,
    unsupportedFiles,
  };
}

export function detectImdbFileKind(
  headers: string[],
  fileName: string
): ImdbImportFileKind | null {
  const normalizedHeaders = headers.map(normalizeHeaderName);
  const headerSet = new Set(normalizedHeaders);

  const has = (key: string) => headerSet.has(key);

  if (
    has(NORMALIZED_HEADER_KEYS.imdbId) &&
    has(NORMALIZED_HEADER_KEYS.rating) &&
    has(NORMALIZED_HEADER_KEYS.dateRated)
  ) {
    return 'ratings';
  }

  if (
    has(NORMALIZED_HEADER_KEYS.imdbId) &&
    has(NORMALIZED_HEADER_KEYS.title) &&
    has(NORMALIZED_HEADER_KEYS.titleType)
  ) {
    const stem = getFileStem(fileName);
    if (stem === IMDB_RESERVED_FILE_STEMS.watchlist) {
      return 'watchlist';
    }
    if (stem === IMDB_RESERVED_FILE_STEMS.checkins) {
      return 'checkins';
    }
    return 'list';
  }

  return null;
}

export function formatImportedListName(fileName: string): string {
  const stem = getFileStem(fileName);
  const humanized = stem
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!humanized) {
    return 'Imported List';
  }

  return humanized.replace(/\b\w/g, (match) => match.toUpperCase());
}

export function getFileStem(fileName: string): string {
  return fileName
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

export function normalizeHeaderName(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function parseImdbDateToMs(value: string | null | undefined): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
  const monthFirstDateTime =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
  const isoDateTime = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/;

  let match = raw.match(isoDateOnly);
  if (match) {
    const [, year, month, day] = match;
    return buildValidatedUtcTimestamp({
      day: Number(day),
      hour: 12,
      minute: 0,
      monthIndex: Number(month) - 1,
      second: 0,
      year: Number(year),
    });
  }

  match = raw.match(monthFirstDateTime);
  if (match) {
    const [, month, day, year, hour = '12', minute = '0', second = '0'] = match;
    return buildValidatedUtcTimestamp({
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      monthIndex: Number(month) - 1,
      second: Number(second),
      year: Number(year),
    });
  }

  match = raw.match(isoDateTime);
  if (match) {
    const [, year, month, day, hour, minute, second = '0'] = match;
    return buildValidatedUtcTimestamp({
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      monthIndex: Number(month) - 1,
      second: Number(second),
      year: Number(year),
    });
  }

  const directParse = Date.parse(raw);
  return Number.isNaN(directParse) ? null : directParse;
}

function buildImdbImportChunks(entities: ImdbImportEntity[]): ImdbImportChunkRequest[] {
  const chunks: ImdbImportChunkRequest[] = [];

  for (let index = 0; index < entities.length; index += IMDB_IMPORT_CHUNK_SIZE) {
    chunks.push({
      entities: entities.slice(index, index + IMDB_IMPORT_CHUNK_SIZE),
    });
  }

  return chunks;
}

function incrementIgnoredStat(
  stats: ImdbImportStats,
  key: ImdbImportIgnoredMetadataKey
): ImdbImportStats {
  return {
    ...stats,
    ignored: incrementImportStat(stats.ignored, key),
  };
}

function incrementSkippedStat(
  stats: ImdbImportStats,
  key: ImdbImportSkipReason
): ImdbImportStats {
  return {
    ...stats,
    skipped: incrementImportStat(stats.skipped, key),
  };
}

function parseImdbImportFile(
  file: RawImdbImportFile
): {
  entities: ImdbImportEntity[];
  kind: ImdbImportFileKind;
  stats: ImdbImportStats;
  totalRows: number;
} | null {
  const parsed = Papa.parse<Record<string, string>>(file.content, {
    header: true,
    skipEmptyLines: 'greedy',
  });

  const headers = parsed.meta.fields ?? [];
  const kind = detectImdbFileKind(headers, file.fileName);

  if (!kind) {
    return null;
  }

  const stats = createEmptyImdbImportStats();
  const entities: ImdbImportEntity[] = [];

  parsed.data.forEach((row) => {
    const normalizedRow = normalizeCsvRow(row);
    const imdbId = normalizedRow[NORMALIZED_HEADER_KEYS.imdbId] ?? '';
    const title = normalizedRow[NORMALIZED_HEADER_KEYS.title] ?? 'Untitled';
    const rawTitleType = normalizedRow[NORMALIZED_HEADER_KEYS.titleType] ?? null;

    if (!/^tt\d+$/.test(imdbId)) {
      Object.assign(stats, incrementSkippedStat(stats, 'malformed_row'));
      return;
    }

    if (normalizedRow[NORMALIZED_HEADER_KEYS.description]?.trim()) {
      Object.assign(stats, incrementIgnoredStat(stats, 'item_notes'));
    }

    const baseEntity: Pick<ImdbImportEntity, 'imdbId' | 'rawTitleType' | 'title'> = {
      imdbId,
      rawTitleType,
      title,
    };

    switch (kind) {
      case 'ratings': {
        const rating = parseInt(normalizedRow[NORMALIZED_HEADER_KEYS.rating] ?? '', 10);
        if (!Number.isFinite(rating) || rating < 1 || rating > 10) {
          Object.assign(stats, incrementSkippedStat(stats, 'invalid_rating'));
          return;
        }

        const ratedAt = parseImdbDateToMs(normalizedRow[NORMALIZED_HEADER_KEYS.dateRated]);
        if (ratedAt === null) {
          Object.assign(stats, incrementSkippedStat(stats, 'invalid_date'));
          return;
        }

        entities.push({
          ...baseEntity,
          actions: [
            {
              kind: 'rating',
              ratedAt,
              rating,
              sourceFileName: file.fileName,
            },
          ],
        });
        stats.processedActions += 1;
        stats.processedEntities += 1;
        break;
      }
      case 'watchlist':
      case 'list': {
        if (isClearlyUnsupportedNonTitleType(rawTitleType)) {
          Object.assign(stats, incrementSkippedStat(stats, 'unsupported_non_title_row'));
          return;
        }

        if (isEpisodeTitleType(rawTitleType)) {
          Object.assign(stats, incrementSkippedStat(stats, 'unsupported_list_episode'));
          return;
        }

        const addedAt =
          parseImdbDateToMs(normalizedRow[NORMALIZED_HEADER_KEYS.created]) ??
          parseImdbDateToMs(normalizedRow[NORMALIZED_HEADER_KEYS.modified]) ??
          Date.now();

        entities.push({
          ...baseEntity,
          actions: [
            {
              kind: 'list',
              addedAt,
              isWatchlist: kind === 'watchlist',
              listName:
                kind === 'watchlist'
                  ? IMDB_RESERVED_FILE_STEMS.watchlist
                  : formatImportedListName(file.fileName),
              sourceFileName: file.fileName,
            },
          ],
        });
        stats.processedActions += 1;
        stats.processedEntities += 1;
        break;
      }
      case 'checkins': {
        if (isClearlyUnsupportedNonTitleType(rawTitleType)) {
          Object.assign(stats, incrementSkippedStat(stats, 'unsupported_non_title_row'));
          return;
        }

        const watchedAt =
          parseImdbDateToMs(normalizedRow[NORMALIZED_HEADER_KEYS.created]) ??
          parseImdbDateToMs(normalizedRow[NORMALIZED_HEADER_KEYS.modified]);

        if (watchedAt === null) {
          Object.assign(stats, incrementSkippedStat(stats, 'invalid_date'));
          return;
        }

        entities.push({
          ...baseEntity,
          actions: [
            {
              kind: 'checkin',
              sourceFileName: file.fileName,
              watchedAt,
            },
          ],
        });
        stats.processedActions += 1;
        stats.processedEntities += 1;
        break;
      }
    }
  });

  return {
    entities,
    kind,
    stats,
    totalRows: parsed.data.length,
  };
}

function normalizeCsvRow(row: ParsedCsvRow): ParsedCsvRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      normalizeHeaderName(key),
      typeof value === 'string' ? value.trim() : '',
    ])
  );
}

function isClearlyUnsupportedNonTitleType(rawTitleType: string | null): boolean {
  const normalized = String(rawTitleType ?? '')
    .trim()
    .toLowerCase();

  return (
    normalized.includes('person') || normalized.includes('image') || normalized.includes('video')
  );
}

function isEpisodeTitleType(rawTitleType: string | null): boolean {
  return String(rawTitleType ?? '')
    .trim()
    .toLowerCase()
    .includes('episode');
}

function buildValidatedUtcTimestamp({
  day,
  hour,
  minute,
  monthIndex,
  second,
  year,
}: {
  day: number;
  hour: number;
  minute: number;
  monthIndex: number;
  second: number;
  year: number;
}): number | null {
  const timestamp = Date.UTC(year, monthIndex, day, hour, minute, second);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }

  return timestamp;
}
