import type { TvTimeFileEntry } from '../files';
import type { TvTimeLibrary } from '../library';
import { parseCsv, parseTvTimeDate, toImdbId, toPositiveInt, toText, toYear } from '../values';

/**
 * TV Time Data Extractor (`tv-time-export.csv`). Only movie watches are imported:
 * episode rows have never been seen with usable ids (Trakt and others skip them too).
 */
export function parseExtractorExport(entries: TvTimeFileEntry[], library: TvTimeLibrary): void {
  const rows = entries
    .filter((entry) => entry.name === 'tv-time-export.csv')
    .flatMap((entry) => parseCsv(entry.text));

  for (const row of rows) {
    const mediaType = toText(row.media_type);
    // TV rows (labelled episode/show/series depending on version) have no usable ids.
    if (mediaType && mediaType !== 'movie') {
      library.ignore('unsupported_episodes');
      continue;
    }
    if (toText(row.type) !== 'watch' || mediaType !== 'movie') {
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
