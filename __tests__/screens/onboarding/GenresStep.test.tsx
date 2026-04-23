import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockUseQuery = jest.fn();
const mockUseQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueries: (...args: unknown[]) => mockUseQueries(...args),
}));

jest.mock('@/src/api/tmdb', () => ({
  TMDB_IMAGE_SIZES: {
    backdrop: {
      medium: '/w780',
    },
  },
  getImageUrl: jest.fn((path: string | null, size: string) =>
    path ? `https://image.tmdb.org/t/p${size}${path}` : null
  ),
  tmdbApi: {
    getGenres: jest.fn(),
    getMovieDetails: jest.fn(),
    getTVShowDetails: jest.fn(),
  },
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({
    accentColor: '#E50914',
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: {
      View: ({ children, ...props }: any) => React.createElement(View, props, children),
    },
    FadeInDown: {
      duration: () => ({ delay: () => ({}) }),
    },
  };
});

import GenresStep from '@/src/screens/onboarding/GenresStep';
import { getImageUrl, tmdbApi } from '@/src/api/tmdb';

describe('GenresStep', () => {
  const genres = [
    { id: 28, name: 'Action' },
    { id: 35, name: 'Comedy' },
    { id: 10749, name: 'Romance' },
    { id: 878, name: 'Science Fiction' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: genres,
      isLoading: false,
    });
    mockUseQueries.mockReturnValue(genres.map(() => ({ data: null })));
    (tmdbApi.getMovieDetails as jest.Mock).mockResolvedValue({ backdrop_path: '/movie.jpg' });
    (tmdbApi.getTVShowDetails as jest.Mock).mockResolvedValue({ backdrop_path: '/tv.jpg' });
  });

  it('renders movie-specific title and subtitle copy', () => {
    const { getByText } = render(<GenresStep selectedGenreIds={[]} onSelect={jest.fn()} />);

    expect(getByText('What movie genres do you love?')).toBeTruthy();
    expect(
      getByText("Pick up to 3 movie genres to help us find movies you'll enjoy.")
    ).toBeTruthy();
  });

  it('renders genre cards as accessible selectable buttons', () => {
    const { getByLabelText } = render(<GenresStep selectedGenreIds={[28]} onSelect={jest.fn()} />);

    const actionCard = getByLabelText('Action');
    const comedyCard = getByLabelText('Comedy');

    expect(actionCard.props.accessibilityRole).toBe('button');
    expect(actionCard.props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(comedyCard.props.accessibilityState).toEqual({ selected: false, disabled: false });
  });

  it('calls onSelect when a genre card is pressed', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(<GenresStep selectedGenreIds={[28]} onSelect={onSelect} />);

    fireEvent.press(getByLabelText('Comedy'));

    expect(onSelect).toHaveBeenCalledWith([28, 35]);
  });

  it('disables unselected genre cards after the max selection is reached', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <GenresStep selectedGenreIds={[28, 35, 10749]} onSelect={onSelect} />
    );

    const disabledCard = getByLabelText('Science Fiction');

    expect(disabledCard.props.accessibilityState).toEqual({ selected: false, disabled: true });

    fireEvent.press(disabledCard);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('fetches TV genres when configured for TV genre selection', () => {
    render(<GenresStep selectedGenreIds={[]} onSelect={jest.fn()} mediaType="tv" />);

    const queryOptions = mockUseQuery.mock.calls[0][0] as {
      queryFn: () => unknown;
      queryKey: unknown[];
    };

    expect(queryOptions.queryKey).toEqual(['onboarding', 'tvGenres']);

    queryOptions.queryFn();

    expect(tmdbApi.getGenres).toHaveBeenCalledWith('tv');
  });

  it('fetches current movie backdrops from curated movie IDs', async () => {
    mockUseQuery.mockReturnValue({
      data: [{ id: 28, name: 'Action' }],
      isLoading: false,
    });
    mockUseQueries.mockReturnValue([{ data: '/dynamic-action-backdrop.jpg' }]);

    render(<GenresStep selectedGenreIds={[]} onSelect={jest.fn()} />);

    expect(getImageUrl).toHaveBeenCalledWith('/dynamic-action-backdrop.jpg', '/w780');

    const queryOptions = mockUseQueries.mock.calls[0][0] as {
      queries: { queryFn: () => Promise<string | null>; queryKey: unknown[] }[];
    };

    expect(queryOptions.queries[0].queryKey).toEqual([
      'onboarding',
      'genreBackdrop',
      'movie',
      28,
      'movie',
      155,
    ]);

    await queryOptions.queries[0].queryFn();

    expect(tmdbApi.getMovieDetails).toHaveBeenCalledWith(155);
    expect(tmdbApi.getTVShowDetails).not.toHaveBeenCalled();
  });

  it('fetches current TV backdrops from curated TV IDs, including distinct Family and Kids IDs', async () => {
    mockUseQuery.mockReturnValue({
      data: [
        { id: 10751, name: 'Family' },
        { id: 10762, name: 'Kids' },
      ],
      isLoading: false,
    });
    mockUseQueries.mockReturnValue([
      { data: '/dynamic-family-backdrop.jpg' },
      { data: '/dynamic-kids-backdrop.jpg' },
    ]);

    render(<GenresStep selectedGenreIds={[]} onSelect={jest.fn()} mediaType="tv" />);

    expect(getImageUrl).toHaveBeenCalledWith('/dynamic-family-backdrop.jpg', '/w780');
    expect(getImageUrl).toHaveBeenCalledWith('/dynamic-kids-backdrop.jpg', '/w780');

    const queryOptions = mockUseQueries.mock.calls[0][0] as {
      queries: { queryFn: () => Promise<string | null>; queryKey: unknown[] }[];
    };

    expect(queryOptions.queries[0].queryKey).toEqual([
      'onboarding',
      'genreBackdrop',
      'tv',
      10751,
      'tv',
      82728,
    ]);
    expect(queryOptions.queries[1].queryKey).toEqual([
      'onboarding',
      'genreBackdrop',
      'tv',
      10762,
      'tv',
      502,
    ]);

    await queryOptions.queries[0].queryFn();
    await queryOptions.queries[1].queryFn();

    expect(tmdbApi.getTVShowDetails).toHaveBeenCalledWith(82728);
    expect(tmdbApi.getTVShowDetails).toHaveBeenCalledWith(502);
    expect(tmdbApi.getMovieDetails).not.toHaveBeenCalled();
  });

  it('keeps genre cards accessible when backdrop fetching fails or returns no image', async () => {
    mockUseQuery.mockReturnValue({
      data: [
        { id: 28, name: 'Action' },
        { id: 35, name: 'Comedy' },
      ],
      isLoading: false,
    });
    mockUseQueries.mockReturnValue([{ data: null }, { data: null }]);
    (tmdbApi.getMovieDetails as jest.Mock)
      .mockRejectedValueOnce(new Error('missing backdrop'))
      .mockResolvedValueOnce({ backdrop_path: null });

    const { getByLabelText } = render(<GenresStep selectedGenreIds={[]} onSelect={jest.fn()} />);

    expect(getByLabelText('Action').props.accessibilityState).toEqual({
      selected: false,
      disabled: false,
    });
    expect(getByLabelText('Comedy').props.accessibilityState).toEqual({
      selected: false,
      disabled: false,
    });
    expect(getImageUrl).not.toHaveBeenCalledWith(null, '/w780');

    const queryOptions = mockUseQueries.mock.calls[0][0] as {
      queries: { queryFn: () => Promise<string | null> }[];
    };

    await expect(queryOptions.queries[0].queryFn()).resolves.toBeNull();
    await expect(queryOptions.queries[1].queryFn()).resolves.toBeNull();
  });

  it('fetches movie Documentary artwork from Planet Earth as a TV source', async () => {
    mockUseQuery.mockReturnValue({
      data: [{ id: 99, name: 'Documentary' }],
      isLoading: false,
    });
    mockUseQueries.mockReturnValue([{ data: '/planet-earth-still.jpg' }]);

    render(<GenresStep selectedGenreIds={[]} onSelect={jest.fn()} />);

    expect(getImageUrl).toHaveBeenCalledWith('/planet-earth-still.jpg', '/w780');

    const queryOptions = mockUseQueries.mock.calls[0][0] as {
      queries: { queryFn: () => Promise<string | null>; queryKey: unknown[] }[];
    };

    expect(queryOptions.queries[0].queryKey).toEqual([
      'onboarding',
      'genreBackdrop',
      'movie',
      99,
      'tv',
      1044,
    ]);

    await queryOptions.queries[0].queryFn();

    expect(tmdbApi.getTVShowDetails).toHaveBeenCalledWith(1044);
    expect(tmdbApi.getMovieDetails).not.toHaveBeenCalled();
  });
});
