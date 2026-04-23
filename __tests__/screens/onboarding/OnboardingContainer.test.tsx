import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockReplace = jest.fn();
const mockCompletePersonalOnboarding = jest.fn();
const mockSetRegion = jest.fn();
const mockSetAccentColor = jest.fn();
const mockSetLanguage = jest.fn();
const mockPremiumState = {
  isPremium: false,
  isLoading: false,
};
let mockAuthUser = {
  uid: 'user-1',
  displayName: null as string | null,
  email: 'fallback.user@example.com',
  isAnonymous: false,
};

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
    user: mockAuthUser,
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
  usePremium: () => mockPremiumState,
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
  default: () => {
    const React = require('react');
    const { Text } = require('react-native');

    return React.createElement(Text, null, 'Region step');
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
  default: () => {
    const React = require('react');
    const { Text } = require('react-native');

    return React.createElement(Text, null, 'Lists step');
  },
}));

jest.mock('@/src/screens/onboarding/GenresStep', () => ({
  __esModule: true,
  default: ({ mediaType }: { mediaType?: 'movie' | 'tv' }) => {
    const React = require('react');
    const { Text } = require('react-native');

    return React.createElement(Text, null, mediaType === 'tv' ? 'TV Genres step' : 'Genres step');
  },
}));

jest.mock('@/src/screens/onboarding/LanguagesStep', () => ({
  __esModule: true,
  default: ({
    selectedLanguage,
    onSelect,
  }: {
    selectedLanguage: string;
    onSelect: (languageCode: string) => Promise<void>;
  }) => {
    const React = require('react');
    const { Text } = require('react-native');

    return React.createElement(
      Text,
      {
        testID: 'languages-step',
        onPress: () => {
          void onSelect('es-ES');
        },
      },
      `Languages step: ${selectedLanguage}`
    );
  },
}));

jest.mock('@/src/screens/onboarding/TVShowsStep', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    const { Text } = require('react-native');

    return React.createElement(Text, null, 'TV step');
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

jest.mock('@/src/screens/onboarding/PersonalizingScreen', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    const { Text } = require('react-native');

    return React.createElement(Text, null, 'Personalizing');
  },
}));

jest.mock('@/src/screens/onboarding/OnboardingPaywallStep', () => ({
  __esModule: true,
  default: ({ displayName }: { displayName: string }) => {
    const React = require('react');
    const { Text } = require('react-native');

    return React.createElement(Text, { testID: 'mock-onboarding-paywall-display-name' }, displayName);
  },
}));

import OnboardingContainer from '@/src/screens/onboarding/OnboardingContainer';

describe('OnboardingContainer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPremiumState.isPremium = false;
    mockPremiumState.isLoading = false;
    mockAuthUser = {
      uid: 'user-1',
      displayName: null,
      email: 'fallback.user@example.com',
      isAnonymous: false,
    };
  });

  it('passes the collected display name to the onboarding paywall step', async () => {
    const { getByText, getByTestId } = render(<OnboardingContainer />);

    fireEvent.press(getByText('Begin onboarding'));
    fireEvent.press(getByText('Skip'));
    fireEvent.changeText(getByTestId('display-name-input'), 'Jordan');
    fireEvent.press(getByText('Continue'));

    for (let stepIndex = 0; stepIndex < 9; stepIndex += 1) {
      fireEvent.press(getByText('Skip'));
    }

    await waitFor(() => {
      expect(getByTestId('mock-onboarding-paywall-display-name')).toHaveTextContent('Jordan');
    });
  });

  it('falls back to the email prefix on the onboarding paywall when step 2 is skipped', async () => {
    const { getByText, getByTestId } = render(<OnboardingContainer />);

    fireEvent.press(getByText('Begin onboarding'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Continue'));

    for (let stepIndex = 0; stepIndex < 9; stepIndex += 1) {
      fireEvent.press(getByText('Skip'));
    }

    await waitFor(() => {
      expect(getByTestId('mock-onboarding-paywall-display-name')).toHaveTextContent(
        'fallback.user'
      );
    });
  });

  it('applies the selected onboarding language locally before later onboarding steps', async () => {
    const { getByText, getByTestId } = render(<OnboardingContainer />);

    mockSetLanguage.mockResolvedValue(undefined);

    fireEvent.press(getByText('Begin onboarding'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Continue'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Skip'));

    expect(getByTestId('languages-step')).toHaveTextContent('Languages step: en-US');

    fireEvent.press(getByTestId('languages-step'));

    await waitFor(() => {
      expect(mockSetLanguage).toHaveBeenCalledWith('es-ES', { syncToFirebase: false });
      expect(getByTestId('languages-step')).toHaveTextContent('Languages step: es-ES');
    });

    fireEvent.press(getByText('Continue'));

    await waitFor(() => {
      expect(getByText('Genres step')).toBeTruthy();
    });
  });

  it('orders movies before TV genres and TV shows with the updated step count', () => {
    const { getByText } = render(<OnboardingContainer />);

    fireEvent.press(getByText('Begin onboarding'));

    expect(getByText('Region step')).toBeTruthy();
    expect(getByText('1/12')).toBeTruthy();

    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Continue'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Skip'));

    expect(getByText('Genres step')).toBeTruthy();

    fireEvent.press(getByText('Skip'));

    expect(getByText('Movies step')).toBeTruthy();

    fireEvent.press(getByText('Skip'));

    expect(getByText('TV Genres step')).toBeTruthy();

    fireEvent.press(getByText('Skip'));

    expect(getByText('TV step')).toBeTruthy();
    expect(getByText('9/12')).toBeTruthy();
  });

  it('waits for premium verification before skipping the onboarding paywall', async () => {
    mockPremiumState.isPremium = true;
    mockPremiumState.isLoading = true;

    const rendered = render(<OnboardingContainer />);
    const { getByText, getByTestId, queryByText, rerender } = rendered;

    fireEvent.press(getByText('Begin onboarding'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Continue'));

    for (let stepIndex = 0; stepIndex < 9; stepIndex += 1) {
      fireEvent.press(getByText('Skip'));
    }

    await waitFor(() => {
      expect(getByTestId('mock-onboarding-paywall-display-name')).toHaveTextContent(
        'fallback.user'
      );
    });
    expect(queryByText('Personalizing')).toBeNull();

    mockPremiumState.isLoading = false;
    rerender(<OnboardingContainer />);

    await waitFor(() => {
      expect(rendered.getByText('Personalizing')).toBeTruthy();
    });
  });
});
