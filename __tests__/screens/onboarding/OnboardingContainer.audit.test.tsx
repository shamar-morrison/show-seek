import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

const mockReplace = jest.fn();
const mockCompletePersonalOnboarding = jest.fn();
const mockSaveOnboarding = jest.fn();
const mockSetRegion = jest.fn();
const mockSetAccentColor = jest.fn();
const mockSetLanguage = jest.fn();

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: {
      View: ({ children, ...props }: any) => React.createElement(View, props, children),
    },
    FadeIn: {
      duration: () => ({}),
    },
    FadeOut: {
      duration: () => ({}),
    },
    useAnimatedStyle: (factory: () => Record<string, unknown>) => factory(),
    useSharedValue: (initialValue: unknown) => ({ value: initialValue }),
    withTiming: (value: unknown) => value,
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: jest.fn(),
  }),
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'user-1', displayName: null, email: 'fallback.user@example.com', isAnonymous: false },
    completePersonalOnboarding: mockCompletePersonalOnboarding,
  }),
}));

jest.mock('@/src/context/RegionProvider', () => ({
  useRegion: () => ({
    setRegion: mockSetRegion,
  }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({
    setAccentColor: mockSetAccentColor,
  }),
}));

jest.mock('@/src/context/LanguageProvider', () => ({
  useLanguage: () => ({
    language: 'en-US',
    setLanguage: mockSetLanguage,
  }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({
    isPremium: false,
    isLoading: false,
  }),
}));

jest.mock('@/src/services/OnboardingService', () => ({
  onboardingService: {
    saveOnboarding: (...args: unknown[]) => mockSaveOnboarding(...args),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/screens/onboarding/WelcomeIntroScreen', () => ({
  __esModule: true,
  default: ({ onComplete }: { onComplete: () => void }) => {
    const React = require('react');
    const { Text } = require('react-native');

    return React.createElement(Text, { onPress: onComplete }, 'Begin onboarding');
  },
}));

jest.mock('@/src/screens/onboarding/RegionStep', () => ({
  __esModule: true,
  default: ({ onSelect }: { onSelect: (region: string) => void }) => {
    const React = require('react');
    const { Text } = require('react-native');

    return React.createElement(Text, { testID: 'select-region', onPress: () => onSelect('CA') }, 'Select region');
  },
}));

jest.mock('@/src/screens/onboarding/DisplayNameStep', () => ({
  __esModule: true,
  default: ({
    displayName,
    onChangeDisplayName,
  }: {
    displayName: string;
    onChangeDisplayName: (name: string) => void;
  }) => {
    const React = require('react');
    const { TextInput } = require('react-native');

    return React.createElement(TextInput, {
      testID: 'display-name-input',
      value: displayName,
      onChangeText: onChangeDisplayName,
    });
  },
}));

jest.mock('@/src/screens/onboarding/StreamingProvidersStep', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, 'Streaming step');
  },
}));

jest.mock('@/src/screens/onboarding/FavoriteListsStep', () => ({
  __esModule: true,
  default: ({
    onSelect,
  }: {
    onSelect: (lists: Array<{ id: string; type: 'tmdb'; label: string }>) => void;
  }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(
      Text,
      {
        testID: 'select-home-lists',
        onPress: () => onSelect([{ id: 'watchlist', type: 'tmdb', label: 'Watchlist' }]),
      },
      'Select home lists'
    );
  },
}));

jest.mock('@/src/screens/onboarding/LanguagesStep', () => ({
  __esModule: true,
  default: ({
    onSelect,
  }: {
    onSelect: (languageCode: 'fr-FR') => Promise<void>;
  }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(
      Text,
      { testID: 'select-language', onPress: () => void onSelect('fr-FR') },
      'Select language'
    );
  },
}));

jest.mock('@/src/screens/onboarding/GenresStep', () => ({
  __esModule: true,
  default: ({
    mediaType,
    onSelect,
  }: {
    mediaType?: 'tv';
    onSelect: (genreIds: number[]) => void;
  }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(
      Text,
      {
        testID: mediaType === 'tv' ? 'select-tv-genres' : 'select-movie-genres',
        onPress: () => onSelect(mediaType === 'tv' ? [10765] : [18, 35]),
      },
      mediaType === 'tv' ? 'Select TV genres' : 'Select movie genres'
    );
  },
}));

jest.mock('@/src/screens/onboarding/TVShowsStep', () => ({
  __esModule: true,
  default: ({
    onSelect,
  }: {
    onSelect: (shows: any[]) => void;
  }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(
      Text,
      {
        testID: 'select-tv-shows',
        onPress: () =>
          onSelect([
            {
              id: 100,
              name: 'Severance',
              poster_path: '/show.jpg',
              vote_average: 8.8,
              first_air_date: '2025-01-01',
              genre_ids: [10765],
            },
          ]),
      },
      'Select tv shows'
    );
  },
}));

jest.mock('@/src/screens/onboarding/MoviesStep', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, 'Movies step');
  },
}));

jest.mock('@/src/screens/onboarding/ActorsStep', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, 'Actors step');
  },
}));

jest.mock('@/src/screens/onboarding/AccentColorStep', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, 'Accent step');
  },
}));

jest.mock('@/src/screens/onboarding/OnboardingPaywallStep', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'complete-paywall', onPress: onClose }, 'Complete paywall');
  },
}));

jest.mock('@/src/screens/onboarding/PersonalizingScreen', () => ({
  __esModule: true,
  default: ({ onDone }: { onDone: () => void }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'finish-personalizing', onPress: onDone }, 'Finish personalizing');
  },
}));

describe('OnboardingContainer audited flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveOnboarding.mockResolvedValue(undefined);
    mockCompletePersonalOnboarding.mockResolvedValue(undefined);
    mockSetLanguage.mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const loadScreen = () =>
    require('@/src/screens/onboarding/OnboardingContainer').default as typeof import('@/src/screens/onboarding/OnboardingContainer').default;

  const completeHappyPath = async (getByText: (text: string) => any, getByTestId: (id: string) => any) => {
    fireEvent.press(getByText('Begin onboarding'));
    fireEvent.press(getByTestId('select-region'));
    fireEvent.press(getByText('Continue'));
    fireEvent.changeText(getByTestId('display-name-input'), 'Jordan');
    fireEvent.press(getByText('Continue'));
    fireEvent.press(getByText('Continue'));
    fireEvent.press(getByTestId('select-home-lists'));
    fireEvent.press(getByText('Continue'));
    fireEvent.press(getByTestId('select-language'));
    await waitFor(() => {
      expect(mockSetLanguage).toHaveBeenCalledWith('fr-FR', { syncToFirebase: false });
    });
    fireEvent.press(getByText('Continue'));
    fireEvent.press(getByTestId('select-movie-genres'));
    fireEvent.press(getByText('Continue'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByTestId('select-tv-genres'));
    fireEvent.press(getByText('Continue'));
    fireEvent.press(getByTestId('select-tv-shows'));
    fireEvent.press(getByText('Continue'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByTestId('complete-paywall'));
    fireEvent.press(getByTestId('finish-personalizing'));
  };

  // Verifies onboarding saves the selected region, language, genre preferences, and favorite shows before personal onboarding is completed.
  it('persists the full happy path before marking personal onboarding complete', async () => {
    const Screen = loadScreen();
    const { getByTestId, getByText } = render(<Screen />);

    await completeHappyPath(getByText, getByTestId);

    await waitFor(() => {
      expect(mockSaveOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'fr-FR',
          region: 'CA',
          selectedGenreIds: [18, 35],
          selectedTVGenreIds: [10765],
          selectedTVShows: [
            expect.objectContaining({
              id: 100,
              name: 'Severance',
            }),
          ],
        })
      );
    });
    expect(mockSetRegion).toHaveBeenCalledWith('CA');
    expect(mockSaveOnboarding.mock.invocationCallOrder[0]).toBeLessThan(
      mockCompletePersonalOnboarding.mock.invocationCallOrder[0]
    );
  });

  // Verifies successful onboarding completion exits the flow and routes the user to the home tab.
  it('navigates to the home tab after successful onboarding completion', async () => {
    const Screen = loadScreen();
    const { getByTestId, getByText } = render(<Screen />);

    await completeHappyPath(getByText, getByTestId);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
    });
  });

  // Verifies skipping optional onboarding steps still saves a structurally valid selections object with required defaults intact.
  it('saves a valid default-shaped payload when optional steps are skipped', async () => {
    const Screen = loadScreen();
    const { getByTestId, getByText } = render(<Screen />);

    fireEvent.press(getByText('Begin onboarding'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Continue'));
    fireEvent.press(getByText('Continue'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Continue'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByTestId('complete-paywall'));
    fireEvent.press(getByTestId('finish-personalizing'));

    await waitFor(() => {
      expect(mockSaveOnboarding).toHaveBeenCalledWith({
        accentColor: null,
        displayName: '',
        homeScreenLists: [],
        language: 'en-US',
        region: null,
        selectedActors: [],
        selectedGenreIds: [],
        selectedMovies: [],
        selectedTVGenreIds: [],
        selectedTVShows: [],
      });
    });
  });

  // Verifies completion failures are surfaced with an alert and do not navigate the user into a broken post-onboarding state.
  it('alerts and stays on onboarding when completePersonalOnboarding fails', async () => {
    mockCompletePersonalOnboarding.mockRejectedValueOnce(new Error('completion failed'));
    const Screen = loadScreen();
    const { getByTestId, getByText } = render(<Screen />);

    await completeHappyPath(getByText, getByTestId);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Something went wrong',
        'Something went wrong'
      );
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
