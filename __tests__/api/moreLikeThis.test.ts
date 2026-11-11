const mockGet = jest.fn();
jest.mock('@/src/api/tmdb', () => ({
  tmdbClient: { get: (...args: unknown[]) => mockGet(...args) },
}));

import {
  fetchMoreLikeThisPage,
  genreTiers,
  meaningfulKeywords,
  resolveMoreLikeThisPlan,
} from '@/src/api/moreLikeThis';

const page = (total: number, ids: number[] = []) => ({
  page: 1,
  total_pages: Math.ceil(total / 20),
  total_results: total,
  results: ids.map((id) => ({ id })),
});

const details = (genres: number[], keywords: { id: number; name: string }[], tv = false) => ({
  data: {
    genres: genres.map((id) => ({ id })),
    keywords: tv ? { results: keywords } : { keywords },
  },
});

describe('meaningfulKeywords', () => {
  it('drops keywords about how a title was made', () => {
    expect(
      meaningfulKeywords([
        { id: 1, name: 'based on novel or book' },
        { id: 2, name: 'dragon' },
        { id: 3, name: 'aftercreditsstinger' },
        { id: 4, name: 'Sequel' },
        { id: 5, name: 'kingdom' },
      ]).map((k) => k.name)
    ).toEqual(['dragon', 'kingdom']);
  });
});

describe('genreTiers', () => {
  it('relaxes from all genres to the first two to the first', () => {
    expect(genreTiers([28, 878, 80])).toEqual([[28, 878, 80], [28, 878], [28]]);
    expect(genreTiers([18, 53])).toEqual([[18, 53], [18]]);
    expect(genreTiers([18])).toEqual([[18]]);
    expect(genreTiers([])).toEqual([]);
  });
});

describe('resolveMoreLikeThisPlan', () => {
  beforeEach(() => mockGet.mockReset());

  it('asks Discover for all genres and any meaningful keyword, most voted, without animation', async () => {
    mockGet
      .mockResolvedValueOnce(
        details(
          [18, 53],
          [
            { id: 9748, name: 'support group' },
            { id: 818, name: 'based on novel or book' },
            { id: 1721, name: 'fight' },
          ]
        )
      )
      .mockResolvedValueOnce({ data: page(97, [550, 1, 2]) });

    const plan = await resolveMoreLikeThisPlan('movie', 550);

    expect(mockGet).toHaveBeenNthCalledWith(1, '/movie/550', {
      params: { append_to_response: 'keywords' },
    });
    expect(mockGet).toHaveBeenNthCalledWith(2, '/discover/movie', {
      params: {
        include_adult: false,
        sort_by: 'vote_count.desc',
        'vote_count.gte': 50,
        without_genres: 16,
        with_keywords: '9748|1721',
        with_genres: '18,53',
        page: 1,
      },
    });
    expect(plan.firstPage.total_results).toBe(97);
  });

  it('relaxes the genres until there are at least 20 matches', async () => {
    mockGet
      .mockResolvedValueOnce(details([28, 878, 80], [{ id: 1, name: 'dream' }]))
      .mockResolvedValueOnce({ data: page(9) })
      .mockResolvedValueOnce({ data: page(39) });

    const plan = await resolveMoreLikeThisPlan('movie', 27205);

    expect(plan.params.with_genres).toBe('28,878');
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it('keeps animation for animated titles and reads TV keywords', async () => {
    mockGet
      .mockResolvedValueOnce(details([16, 10759], [{ id: 2, name: 'pirate' }], true))
      .mockResolvedValueOnce({ data: page(137) });

    const plan = await resolveMoreLikeThisPlan('tv', 37854);

    expect(plan.params).not.toHaveProperty('without_genres');
    expect(plan.params.with_keywords).toBe('2');
    expect(mockGet).toHaveBeenLastCalledWith('/discover/tv', expect.anything());
  });

  it('uses the last, loosest rule when none reach 20', async () => {
    mockGet
      .mockResolvedValueOnce(details([18, 53], [{ id: 1, name: 'x' }]))
      .mockResolvedValueOnce({ data: page(3) })
      .mockResolvedValueOnce({ data: page(7) });

    const plan = await resolveMoreLikeThisPlan('movie', 1);
    expect(plan.params.with_genres).toBe('18');
    expect(plan.firstPage.total_results).toBe(7);
  });
});

describe('fetchMoreLikeThisPage', () => {
  beforeEach(() => mockGet.mockReset());

  it('reuses the first page and fetches later ones with the same filters', async () => {
    const plan = { params: { with_genres: '18' }, firstPage: page(40, [1]) as never };

    expect(await fetchMoreLikeThisPage('movie', plan, 1)).toBe(plan.firstPage);
    expect(mockGet).not.toHaveBeenCalled();

    mockGet.mockResolvedValueOnce({ data: page(40, [2]) });
    await fetchMoreLikeThisPage('movie', plan, 2);
    expect(mockGet).toHaveBeenCalledWith('/discover/movie', {
      params: { with_genres: '18', page: 2 },
    });
  });
});
