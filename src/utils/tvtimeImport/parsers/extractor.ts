import type { TvTimeFileEntry } from '../files';
import type { TvTimeLibrary } from '../library';
import { parseCsv, parseTvTimeDate, toImdbId, toPositiveInt, toText, toYear } from '../values';

/**
 * TV Time Data Extractor (`tv-time-export.csv`). Only movie watches are imported:
 * episode rows have never been seen with usable ids (Trakt and others skip them too).
 */
export function parseExtractorExport(entries: TvTimeFileEntry[], library: TvTimeLibrary): void {
  const entry = entries.find((candidate) => candidate.name === 'tv-time-export.csv');
  if (!entry) return;

  for (const row of parseCsv(entry.text)) {
    if (toText(row.type) !== 'watch' || toText(row.media_type) !== 'movie') {
      library.skip('malformed_row');
      continue;
    }
    const watchedAt = parseTvTimeDate(row.watched_at, library.now);
    if (watchedAt === null) {
      library.skip('invalid_date');
      continue;
    }
    const movie = library.movie({
      addedAt: watchedAt,
      imdbId: toImdbId(row.imdb_id),
      title: toText(row.title),
      tmdbId: toPositiveInt(row.tmdb_id),
      tvdbId: toPositiveInt(row.tvdb_id),
      year: toYear(row.year),
    });
    movie.watches.add(watchedAt);
  }
}
