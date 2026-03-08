import {
  IMDB_IMPORT_CHUNK_SIZE,
  IMDB_IMPORT_MAX_ACTIONS_PER_CHUNK,
} from '@/functions/src/shared/imdbImport';
import {
  detectImdbFileKind,
  formatImportedListName,
  parseImdbDateToMs,
  prepareImdbImport,
} from '@/src/utils/imdbImport';

describe('imdbImport utilities', () => {
  it('detects ratings, watchlist, custom lists, and check-ins from headers and file names', () => {
    const ratingsHeaders = ['Const', 'Your Rating', 'Date Rated', 'Title', 'Title Type'];
    const listHeaders = ['Const', 'Created', 'Modified', 'Description', 'Title', 'Title Type'];

    expect(detectImdbFileKind(ratingsHeaders, 'ratings.csv')).toBe('ratings');
    expect(detectImdbFileKind(listHeaders, 'watchlist.csv')).toBe('watchlist');
    expect(detectImdbFileKind(listHeaders, 'checkins.csv')).toBe('checkins');
    expect(detectImdbFileKind(listHeaders, 'my-favorites.csv')).toBe('list');
  });

  it('formats custom list names from file names', () => {
    expect(formatImportedListName('my-favorites.csv')).toBe('My Favorites');
    expect(formatImportedListName('  weekend_watch  .csv')).toBe('Weekend Watch');
  });

  it('parses common IMDb export date formats', () => {
    expect(parseImdbDateToMs('2024-01-02')).not.toBeNull();
    expect(parseImdbDateToMs('01/02/2024')).not.toBeNull();
    expect(parseImdbDateToMs('Tue, 02 Jan 2024 00:00:00 GMT')).not.toBeNull();
    expect(parseImdbDateToMs('2024-02-31')).toBeNull();
    expect(parseImdbDateToMs('')).toBeNull();
  });

  it('groups rows by IMDb id and records skipped and ignored metadata counts', () => {
    const prepared = prepareImdbImport([
      {
        fileName: 'ratings.csv',
        content: [
          'Const,Your Rating,Date Rated,Title,Title Type',
          'tt0133093,9,2024-01-02,The Matrix,movie',
          'tt0944947,8,2024-01-03,Winter Is Coming,tvEpisode',
        ].join('\n'),
      },
      {
        fileName: 'watchlist.csv',
        content: [
          'Const,Created,Modified,Description,Title,Title Type',
          'tt0133093,2024-01-04,2024-01-04,Remember this one,The Matrix,movie',
          'tt0944947,2024-01-04,2024-01-04,,Winter Is Coming,tvEpisode',
        ].join('\n'),
      },
      {
        fileName: 'unknown.txt',
        content: 'nope',
      },
    ]);

    expect(prepared.files).toHaveLength(2);
    expect(prepared.unsupportedFiles).toEqual(['unknown.txt']);
    expect(prepared.chunks).toHaveLength(1);
    expect(prepared.chunks[0].entities).toHaveLength(2);
    expect(prepared.chunks[0].entities[0].actions.length).toBeGreaterThan(1);
    expect(prepared.stats.ignored.item_notes).toBe(1);
    expect(prepared.stats.skipped.unsupported_list_episode).toBe(1);
    expect(prepared.stats.skipped.unsupported_file).toBe(1);
  });

  it('tracks processed entities per file using unique IMDb ids while preserving actions', () => {
    const prepared = prepareImdbImport([
      {
        fileName: 'ratings.csv',
        content: [
          'Const,Your Rating,Date Rated,Title,Title Type',
          'tt0133093,9,2024-01-02,The Matrix,movie',
          'tt0133093,8,2024-01-03,The Matrix,movie',
        ].join('\n'),
      },
    ]);

    expect(prepared.files).toHaveLength(1);
    expect(prepared.files[0].stats.processedActions).toBe(2);
    expect(prepared.files[0].stats.processedEntities).toBe(1);
    expect(prepared.stats.processedActions).toBe(2);
    expect(prepared.stats.processedEntities).toBe(1);
    expect(prepared.chunks[0].entities).toHaveLength(1);
    expect(prepared.chunks[0].entities[0].actions).toHaveLength(2);
  });

  it('splits oversized grouped entities across chunks to respect the total action cap', () => {
    const rows = [
      'Const,Your Rating,Date Rated,Title,Title Type',
      ...Array.from({ length: IMDB_IMPORT_MAX_ACTIONS_PER_CHUNK + 1 }, (_, index) => {
        const day = String((index % 28) + 1).padStart(2, '0');
        return `tt0133093,9,2024-01-${day},The Matrix,movie`;
      }),
    ];

    const prepared = prepareImdbImport([
      {
        fileName: 'ratings.csv',
        content: rows.join('\n'),
      },
    ]);

    expect(prepared.stats.processedActions).toBe(IMDB_IMPORT_MAX_ACTIONS_PER_CHUNK + 1);
    expect(prepared.stats.processedEntities).toBe(1);
    expect(prepared.chunks).toHaveLength(2);
    expect(prepared.chunks[0].entities).toHaveLength(1);
    expect(prepared.chunks[0].entities[0].imdbId).toBe('tt0133093');
    expect(prepared.chunks[0].entities[0].actions).toHaveLength(IMDB_IMPORT_MAX_ACTIONS_PER_CHUNK);
    expect(prepared.chunks[1].entities).toHaveLength(1);
    expect(prepared.chunks[1].entities[0].imdbId).toBe('tt0133093');
    expect(prepared.chunks[1].entities[0].actions).toHaveLength(1);
  });

  it('still caps chunks at the configured entity count when total actions stay low', () => {
    const rows = [
      'Const,Your Rating,Date Rated,Title,Title Type',
      ...Array.from({ length: IMDB_IMPORT_CHUNK_SIZE + 1 }, (_, index) => {
        const imdbId = `tt${String(index + 1).padStart(7, '0')}`;
        return `${imdbId},8,2024-01-02,Movie ${index + 1},movie`;
      }),
    ];

    const prepared = prepareImdbImport([
      {
        fileName: 'ratings.csv',
        content: rows.join('\n'),
      },
    ]);

    expect(prepared.chunks).toHaveLength(2);
    expect(prepared.chunks[0].entities).toHaveLength(IMDB_IMPORT_CHUNK_SIZE);
    expect(prepared.chunks[1].entities).toHaveLength(1);
    expect(
      prepared.chunks[0].entities.reduce((total, entity) => total + entity.actions.length, 0)
    ).toBe(IMDB_IMPORT_CHUNK_SIZE);
  });
});
