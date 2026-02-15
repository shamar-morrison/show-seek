import { useEnrichedMovieRatings, useEnrichedTVRatings } from '@/src/hooks/useEnrichedRatings';
import { useQuery } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { useRatings } from '@/src/hooks/useRatings';

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
