import {
  EnrichedMovieRating,
  EnrichedTVRating,
  useEnrichedMovieRatings,
  useEnrichedTVRatings,
} from '@/src/hooks/useEnrichedRatings';
import { useQuery } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { useRatings } from '@/src/hooks/useRatings';
import { RatingItem } from '@/src/services/RatingService';

const mockUseQuery = useQuery as jest.Mock;
const mockUseRatings = useRatings as jest.Mock;

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'test-user-id' } }),
}));

jest.mock('@/src/hooks/useRatings', () => ({
  useRatings: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

const createRating = (overrides: Partial<RatingItem>): RatingItem =>
  ({
    id: '1',
    mediaType: 'movie',
    rating: 8,
    ratedAt: 123,
    ...overrides,
  }) as RatingItem;

const createMovieEnrichedRating = (rating: RatingItem, title: string): EnrichedMovieRating => ({
  rating,
  movie: {
    id: Number(rating.id),
    title,
  } as any,
});

const createTvEnrichedRating = (rating: RatingItem, name: string): EnrichedTVRating => ({
  rating,
  tvShow: {
    id: Number(rating.id),
    name,
  } as any,
});

describe('useEnrichedRatings refetch behavior', () => {
  const ratingsRefetch = jest.fn();
  const enrichedRefetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    ratingsRefetch.mockResolvedValue({});
    enrichedRefetch.mockResolvedValue({});

    mockUseRatings.mockReturnValue({
      data: [{ id: '1', mediaType: 'movie', rating: 8, ratedAt: 123 }],
      isLoading: false,
      error: null,
      refetch: ratingsRefetch,
    });

    mockUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isPending: false,
      error: null,
      refetch: enrichedRefetch,
    });
  });

  it('composes movie refetch with base ratings refetch first', async () => {
    const { result } = renderHook(() => useEnrichedMovieRatings());

    await act(async () => {
      await result.current.refetch();
    });

    expect(ratingsRefetch).toHaveBeenCalledTimes(1);
    expect(enrichedRefetch).toHaveBeenCalledTimes(1);
    expect(ratingsRefetch.mock.invocationCallOrder[0]).toBeLessThan(
      enrichedRefetch.mock.invocationCallOrder[0]
    );
  });

  it('composes TV refetch with base ratings refetch first', async () => {
    mockUseRatings.mockReturnValue({
      data: [{ id: '2', mediaType: 'tv', rating: 7, ratedAt: 456 }],
      isLoading: false,
      error: null,
      refetch: ratingsRefetch,
    });

    const { result } = renderHook(() => useEnrichedTVRatings());

    await act(async () => {
      await result.current.refetch();
    });

    expect(ratingsRefetch).toHaveBeenCalledTimes(1);
    expect(enrichedRefetch).toHaveBeenCalledTimes(1);
    expect(ratingsRefetch.mock.invocationCallOrder[0]).toBeLessThan(
      enrichedRefetch.mock.invocationCallOrder[0]
    );
  });
});

describe('useEnrichedRatings placeholder behavior', () => {
  const ratingsRefetch = jest.fn();
  const enrichedRefetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    ratingsRefetch.mockResolvedValue({});
    enrichedRefetch.mockResolvedValue({});
  });

  it('reuses filtered movie placeholder data and keeps loading false while rating ids shrink', () => {
    const currentRatings = [
      createRating({ id: '2', mediaType: 'movie', rating: 9, ratedAt: 300 }),
      createRating({ id: '1', mediaType: 'movie', rating: 7, ratedAt: 200 }),
    ];

    const previousData = [
      createMovieEnrichedRating(createRating({ id: '1', mediaType: 'movie', rating: 8 }), 'Movie One'),
      createMovieEnrichedRating(createRating({ id: '2', mediaType: 'movie', rating: 6 }), 'Movie Two'),
      createMovieEnrichedRating(createRating({ id: '3', mediaType: 'movie', rating: 5 }), 'Movie Three'),
    ];

    mockUseRatings.mockReturnValue({
      data: currentRatings,
      isLoading: false,
      error: null,
      refetch: ratingsRefetch,
    });

    mockUseQuery.mockImplementation((options: any) => ({
      data: options.placeholderData?.(previousData),
      isLoading: true,
      isPending: true,
      error: null,
      refetch: enrichedRefetch,
    }));

    const { result } = renderHook(() => useEnrichedMovieRatings());

    expect(result.current.data).toEqual([
      {
        rating: currentRatings[0],
        movie: previousData[1].movie,
      },
      {
        rating: currentRatings[1],
        movie: previousData[0].movie,
      },
    ]);
    expect(result.current.data?.map((item) => item.rating.id)).toEqual(['2', '1']);
    expect(result.current.isLoading).toBe(false);
  });

  it('reuses filtered TV placeholder data and keeps loading false while rating ids shrink', () => {
    const currentRatings = [
      createRating({ id: '20', mediaType: 'tv', rating: 10, ratedAt: 400 }),
      createRating({ id: '10', mediaType: 'tv', rating: 7, ratedAt: 250 }),
    ];

    const previousData = [
      createTvEnrichedRating(createRating({ id: '10', mediaType: 'tv', rating: 8 }), 'Show One'),
      createTvEnrichedRating(createRating({ id: '20', mediaType: 'tv', rating: 6 }), 'Show Two'),
      createTvEnrichedRating(createRating({ id: '30', mediaType: 'tv', rating: 4 }), 'Show Three'),
    ];

    mockUseRatings.mockReturnValue({
      data: currentRatings,
      isLoading: false,
      error: null,
      refetch: ratingsRefetch,
    });

    mockUseQuery.mockImplementation((options: any) => ({
      data: options.placeholderData?.(previousData),
      isLoading: true,
      isPending: true,
      error: null,
      refetch: enrichedRefetch,
    }));

    const { result } = renderHook(() => useEnrichedTVRatings());

    expect(result.current.data).toEqual([
      {
        rating: currentRatings[0],
        tvShow: previousData[1].tvShow,
      },
      {
        rating: currentRatings[1],
        tvShow: previousData[0].tvShow,
      },
    ]);
    expect(result.current.data?.map((item) => item.rating.id)).toEqual(['20', '10']);
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps movie ratings loading when placeholder data has no renderable movies', () => {
    const currentRatings = [createRating({ id: '4', mediaType: 'movie', rating: 7, ratedAt: 300 })];

    mockUseRatings.mockReturnValue({
      data: currentRatings,
      isLoading: false,
      error: null,
      refetch: ratingsRefetch,
    });

    mockUseQuery.mockImplementation((options: any) => ({
      data: options.placeholderData?.([
        {
          rating: createRating({ id: '4', mediaType: 'movie', rating: 6, ratedAt: 200 }),
          movie: null,
        },
      ]),
      isLoading: true,
      isPending: true,
      error: null,
      refetch: enrichedRefetch,
    }));

    const { result } = renderHook(() => useEnrichedMovieRatings());

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('keeps TV ratings loading when placeholder data has no renderable shows', () => {
    const currentRatings = [createRating({ id: '40', mediaType: 'tv', rating: 7, ratedAt: 300 })];

    mockUseRatings.mockReturnValue({
      data: currentRatings,
      isLoading: false,
      error: null,
      refetch: ratingsRefetch,
    });

    mockUseQuery.mockImplementation((options: any) => ({
      data: options.placeholderData?.([
        {
          rating: createRating({ id: '40', mediaType: 'tv', rating: 6, ratedAt: 200 }),
          tvShow: null,
        },
      ]),
      isLoading: true,
      isPending: true,
      error: null,
      refetch: enrichedRefetch,
    }));

    const { result } = renderHook(() => useEnrichedTVRatings());

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });
});
