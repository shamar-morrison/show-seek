import { buildCollectionShareCard, getCollectionYearRange } from '@/src/utils/collectionShareCard';

const movie = (
  id: number,
  release_date: string | null,
  poster_path: string | null = `/${id}.jpg`
) => ({
  id,
  release_date,
  poster_path,
});

describe('getCollectionYearRange', () => {
  it('spans the first and last release years', () => {
    expect(
      getCollectionYearRange([
        movie(1, '1980-05-21'),
        movie(2, '1977-05-25'),
        movie(3, '2019-12-18'),
      ])
    ).toBe('1977–2019');
  });

  it('shows one year when they all match, and nothing when none has a date', () => {
    expect(getCollectionYearRange([movie(1, '2001-01-01'), movie(2, '2001-12-01')])).toBe('2001');
    expect(getCollectionYearRange([movie(1, null), movie(2, '')])).toBe('');
  });
});

describe('buildCollectionShareCard', () => {
  const resolvePosterPath = (_type: 'movie', id: number, path: string | null) =>
    id === 2 ? '/custom.jpg' : path;

  it('builds the card with up to three distinct posters, applying custom posters', () => {
    const card = buildCollectionShareCard({
      name: 'Star Wars Collection',
      backdropPath: '/b.jpg',
      movies: [
        movie(1, '1977-05-25'),
        movie(2, '1980-05-21'),
        movie(3, '1983-05-25', null),
        movie(4, '1999-05-19', '/1.jpg'),
        movie(5, '2002-05-16'),
        movie(6, '2005-05-19'),
      ],
      resolvePosterPath,
    });

    expect(card).toEqual({
      kind: 'collection',
      collectionName: 'Star Wars Collection',
      movieCount: 6,
      yearRange: '1977–2005',
      posterPaths: ['/1.jpg', '/custom.jpg', '/5.jpg'],
      backdropPath: '/b.jpg',
    });
  });

  it('includes progress only when given', () => {
    const base = {
      name: 'Toy Story Collection',
      backdropPath: null,
      movies: [movie(1, '1995-11-22')],
      resolvePosterPath,
    };

    expect(
      buildCollectionShareCard({ ...base, progress: { watched: 1, total: 4 } }).progress
    ).toEqual({
      watched: 1,
      total: 4,
    });
    expect(buildCollectionShareCard({ ...base, progress: null })).not.toHaveProperty('progress');
  });
});
