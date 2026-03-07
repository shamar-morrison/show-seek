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
});
