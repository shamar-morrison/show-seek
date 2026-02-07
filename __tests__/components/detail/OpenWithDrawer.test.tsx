import OpenWithDrawer from '@/src/components/detail/OpenWithDrawer';
import { getTraktSlugByTmdbId } from '@/src/api/trakt';
import { tmdbApi } from '@/src/api/tmdb';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

const mockSheetPresent = jest.fn(async () => {});
const mockSheetDismiss = jest.fn(async () => {});

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    Linking: {
      openURL: jest.fn(() => Promise.resolve()),
    },
  };
});

jest.mock('@lodev09/react-native-true-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  const TrueSheet = React.forwardRef(({ children, onDidDismiss }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: mockSheetPresent,
      dismiss: async () => {
        await mockSheetDismiss();
        onDidDismiss?.();
      },
    }));

    return <View>{children}</View>;
  });

  return { TrueSheet };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');
  return {
    GestureHandlerRootView: ({ children }: any) => <View>{children}</View>,
    Pressable,
  };
});

jest.mock('@/src/components/icons/TraktLogo', () => ({
  TraktLogo: () => {
    const React = require('react');
    const { View } = require('react-native');
    return <View testID="trakt-logo" />;
  },
}));

jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getMovieExternalIds: jest.fn(),
    getTVExternalIds: jest.fn(),
  },
}));

jest.mock('@/src/api/trakt', () => ({
  getTraktSlugByTmdbId: jest.fn(),
}));

describe('OpenWithDrawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (tmdbApi.getMovieExternalIds as jest.Mock).mockResolvedValue({
      imdb_id: 'tt0137523',
      facebook_id: null,
      instagram_id: null,
      twitter_id: null,
    });
    (getTraktSlugByTmdbId as jest.Mock).mockResolvedValue('fight-club-1999');
  });

  it('renders header and all service rows', () => {
    const { getByText, getByTestId } = render(
      <OpenWithDrawer
        visible={true}
        onClose={jest.fn()}
        mediaId={550}
        mediaType="movie"
        title="Fight Club"
      />
    );

    expect(getByText('Open with')).toBeTruthy();
    expect(getByTestId('open-with-item-imdb')).toBeTruthy();
    expect(getByTestId('open-with-item-trakt')).toBeTruthy();
    expect(getByTestId('open-with-item-tmdb')).toBeTruthy();
    expect(getByTestId('open-with-item-rottenTomatoes')).toBeTruthy();
    expect(getByTestId('open-with-item-metacritic')).toBeTruthy();
    expect(getByTestId('open-with-item-wikipedia')).toBeTruthy();
    expect(getByTestId('open-with-item-webSearch')).toBeTruthy();
  });

  it('opens each service destination URL when pressed', async () => {
    const { getByTestId } = render(
      <OpenWithDrawer
        visible={true}
        onClose={jest.fn()}
        mediaId={550}
        mediaType="movie"
        title="Fight Club"
        year="1999"
      />
    );

    await waitFor(() => {
      expect(tmdbApi.getMovieExternalIds).toHaveBeenCalledWith(550);
      expect(getTraktSlugByTmdbId).toHaveBeenCalledWith(550, 'movie');
    });

    fireEvent.press(getByTestId('open-with-item-imdb'));
    fireEvent.press(getByTestId('open-with-item-trakt'));
    fireEvent.press(getByTestId('open-with-item-tmdb'));
    fireEvent.press(getByTestId('open-with-item-rottenTomatoes'));
    fireEvent.press(getByTestId('open-with-item-metacritic'));
    fireEvent.press(getByTestId('open-with-item-wikipedia'));
    fireEvent.press(getByTestId('open-with-item-webSearch'));

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith('https://www.imdb.com/title/tt0137523/');
      expect(Linking.openURL).toHaveBeenCalledWith('trakt://movies/fight-club-1999');
      expect(Linking.openURL).toHaveBeenCalledWith('https://www.themoviedb.org/movie/550');
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://www.rottentomatoes.com/search?search=Fight%20Club%201999'
      );
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://www.metacritic.com/search/Fight%20Club%201999/'
      );
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://en.wikipedia.org/w/index.php?search=Fight%20Club%201999'
      );
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://www.google.com/search?q=Fight%20Club%201999'
      );
    });
  });

  it('falls back to Trakt website when app deep link fails', async () => {
    (Linking.openURL as jest.Mock).mockImplementation((url: string) => {
      if (url.startsWith('trakt://')) {
        return Promise.reject(new Error('No app installed'));
      }
      return Promise.resolve();
    });

    const { getByTestId } = render(
      <OpenWithDrawer
        visible={true}
        onClose={jest.fn()}
        mediaId={550}
        mediaType="movie"
        title="Fight Club"
      />
    );

    await waitFor(() => {
      expect(tmdbApi.getMovieExternalIds).toHaveBeenCalledWith(550);
    });

    fireEvent.press(getByTestId('open-with-item-trakt'));

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith('trakt://movies/fight-club-1999');
      expect(Linking.openURL).toHaveBeenCalledWith('https://trakt.tv/movies/fight-club-1999');
    });
  });

  it('uses fallback URLs immediately when direct IDs are unavailable', async () => {
    let resolveExternalIds: ((value: any) => void) | null = null;
    let resolveTraktSlug: ((value: any) => void) | null = null;

    (tmdbApi.getMovieExternalIds as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExternalIds = resolve;
        })
    );

    (getTraktSlugByTmdbId as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTraktSlug = resolve;
        })
    );

    const { getByTestId } = render(
      <OpenWithDrawer
        visible={true}
        onClose={jest.fn()}
        mediaId={550}
        mediaType="movie"
        title="Fight Club"
        year="1999"
      />
    );

    fireEvent.press(getByTestId('open-with-item-imdb'));

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://www.imdb.com/find/?q=Fight%20Club%201999&s=tt'
      );
    });

    await act(async () => {
      resolveExternalIds?.({
        imdb_id: null,
        facebook_id: null,
        instagram_id: null,
        twitter_id: null,
      });
      resolveTraktSlug?.(null);
    });
  });
});
