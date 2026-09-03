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
    withRepeat: (anim: unknown) => anim,
    withSequence: (...anims: unknown[]) => anims[0],
    cancelAnimation: jest.fn(),
    Easing: {
      inOut: (fn: any) => fn,
      ease: (t: any) => t,
    },
  };
});

jest.mock('expo-blur', () => ({
  BlurView: 'BlurView',
}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidNotificationPriority: { HIGH: 'high' },
}));

jest.mock('@/src/hooks/useOnboardingReengagement', () => ({
  useOnboardingReengagement: jest.fn(),
}));

jest.mock('@/src/utils/onboardingStepCache', () => ({
  persistOnboardingProgress: jest.fn(),
  readOnboardingProgress: jest.fn().mockResolvedValue(null),
  clearOnboardingProgress: jest.fn(),
  cancelPendingReengagementNotification: jest.fn().mockResolvedValue(undefined),
  persistOnboardingStepIndex: jest.fn(),
  readOnboardingStepIndex: jest.fn().mockResolvedValue(null),
  clearOnboardingStepIndex: jest.fn(),
}));

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

const mockTrackOnboardingStepView = jest.fn();
const mockTrackOnboardingComplete = jest.fn();

jest.mock('@/src/services/analytics', () => ({
  trackOnboardingStepView: (...args: unknown[]) => mockTrackOnboardingStepView(...args),
  trackOnboardingComplete: (...args: unknown[]) => mockTrackOnboardingComplete(...args),
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

let mockNotificationPermissionStatus: 'granted' | 'denied' | 'undetermined' | 'checking' =
  'undetermined';

jest.mock('@/src/hooks/useNotificationPermissions', () => ({
  useNotificationPermissions: () => ({
    permissionStatus: mockNotificationPermissionStatus,
    requestPermission: jest.fn(),
  }),
}));

jest.mock('@/src/screens/onboarding/NotificationPermissionStep', () => ({
  __esModule: true,
  default: ({ onPermissionGranted }: { onPermissionGranted?: () => void }) => {
    const React = require('react');
    const { Text } = require('react-native');

    return React.createElement(
      Text,
      {
        testID: 'notifications-step',
        onPress: onPermissionGranted,
      },
      'Notifications step'
    );
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
    const { getByText, getByTestId, queryByTestId } = render(<OnboardingContainer />);

    fireEvent.press(getByText('Begin onboarding'));
    fireEvent.press(getByText('Skip'));
    fireEvent.changeText(getByTestId('display-name-input'), 'Jordan');
    fireEvent.press(getByText('Continue'));

    for (let stepIndex = 0; stepIndex < 10; stepIndex += 1) {
      if (queryByTestId('notifications-step')) {
        fireEvent.press(getByTestId('notifications-step'));
      } else {
        fireEvent.press(getByText('Skip'));
      }
    }

    await waitFor(() => {
      expect(getByTestId('mock-onboarding-paywall-display-name')).toHaveTextContent('Jordan');
    });
  });

  it('falls back to the email prefix on the onboarding paywall when step 2 is skipped', async () => {
    const { getByText, getByTestId, queryByTestId } = render(<OnboardingContainer />);

    fireEvent.press(getByText('Begin onboarding'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Continue'));

    for (let stepIndex = 0; stepIndex < 10; stepIndex += 1) {
      if (queryByTestId('notifications-step')) {
        fireEvent.press(getByTestId('notifications-step'));
      } else {
        fireEvent.press(getByText('Skip'));
      }
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
    const { getByText, getByTestId } = render(<OnboardingContainer />);

    fireEvent.press(getByText('Begin onboarding'));

    expect(getByText('Region step')).toBeTruthy();
    expect(getByText('1/13')).toBeTruthy();

    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Continue'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Skip'));

    expect(getByText('Genres step')).toBeTruthy();

    fireEvent.press(getByText('Skip'));

    expect(getByText('Movies step')).toBeTruthy();

    fireEvent.press(getByText('Skip'));

    expect(getByText('Notifications step')).toBeTruthy();

    // Skip is disabled on notifications step — pressing it stays on step 8
    fireEvent.press(getByText('Skip'));
    expect(getByText('Notifications step')).toBeTruthy();

    // Advancing requires resolving notifications
    fireEvent.press(getByTestId('notifications-step'));

    expect(getByText('TV Genres step')).toBeTruthy();

    fireEvent.press(getByText('Skip'));

    expect(getByText('TV step')).toBeTruthy();
    expect(getByText('10/13')).toBeTruthy();
  });

  it('waits for premium verification before skipping the onboarding paywall', async () => {
    mockPremiumState.isPremium = true;
    mockPremiumState.isLoading = true;

    const rendered = render(<OnboardingContainer />);
    const { getByText, getByTestId, queryByTestId, queryByText, rerender } = rendered;

    fireEvent.press(getByText('Begin onboarding'));
    fireEvent.press(getByText('Skip'));
    fireEvent.press(getByText('Continue'));

    for (let stepIndex = 0; stepIndex < 10; stepIndex += 1) {
      if (queryByTestId('notifications-step')) {
        fireEvent.press(getByTestId('notifications-step'));
      } else {
        fireEvent.press(getByText('Skip'));
      }
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

  it('rehydrates saved selections and step index on mount', async () => {
    const { readOnboardingProgress } = require('@/src/utils/onboardingStepCache');
    readOnboardingProgress.mockResolvedValueOnce({
      stepIndex: 1, // Display name step
      selections: {
        region: 'CA',
        displayName: 'Preloaded Name',
        homeScreenLists: [],
        language: 'en-US',
        selectedGenreIds: [],
        selectedTVGenreIds: [],
        selectedTVShows: [],
        selectedMovies: [],
        selectedActors: [],
        accentColor: null,
      },
    });

    const { getByTestId } = render(<OnboardingContainer />);

    await waitFor(() => {
      expect(getByTestId('display-name-input').props.value).toBe('Preloaded Name');
    });
  });

  it('does not prematurely overwrite saved selections with empty state on deep-link mount', async () => {
    const { persistOnboardingProgress, readOnboardingProgress } = require('@/src/utils/onboardingStepCache');
    readOnboardingProgress.mockResolvedValueOnce(null);

    render(<OnboardingContainer initialStepIndex={5} />);

    // On mount, before any step transition occurs, persist should not have been called with initial empty selections
    expect(persistOnboardingProgress).not.toHaveBeenCalled();
  });

  it('disables Skip and Continue on step 8 when notification permission is undetermined', () => {
    mockNotificationPermissionStatus = 'undetermined';
    const { getByText, queryByText } = render(<OnboardingContainer initialStepIndex={7} />);

    expect(getByText('Notifications step')).toBeTruthy();

    // Skip is pressed, should remain on Notifications step
    fireEvent.press(getByText('Skip'));
    expect(getByText('Notifications step')).toBeTruthy();
    expect(queryByText('TV Genres step')).toBeNull();

    // Continue is pressed, should remain on Notifications step
    fireEvent.press(getByText('Continue'));
    expect(getByText('Notifications step')).toBeTruthy();
    expect(queryByText('TV Genres step')).toBeNull();
  });

  it('disables Skip and Continue on step 8 for a brand new user even if system permission is granted', () => {
    mockNotificationPermissionStatus = 'granted';
    const { getByText, queryByText } = render(<OnboardingContainer initialStepIndex={7} />);

    expect(getByText('Notifications step')).toBeTruthy();

    // Skip is pressed, should remain on Notifications step
    fireEvent.press(getByText('Skip'));
    expect(getByText('Notifications step')).toBeTruthy();
    expect(queryByText('TV Genres step')).toBeNull();

    // Continue is pressed, should remain on Notifications step because user hasn't interacted with step 8
    fireEvent.press(getByText('Continue'));
    expect(getByText('Notifications step')).toBeTruthy();
    expect(queryByText('TV Genres step')).toBeNull();
  });

  it('allows Continue on step 8 after navigating back if notifications were resolved', () => {
    mockNotificationPermissionStatus = 'undetermined';
    const { getByText, getByTestId } = render(<OnboardingContainer initialStepIndex={7} />);

    expect(getByText('Notifications step')).toBeTruthy();

    // Advance by resolving notifications
    fireEvent.press(getByTestId('notifications-step'));
    expect(getByText('TV Genres step')).toBeTruthy();

    // Go back to notifications step
    fireEvent.press(getByText('Back'));
    expect(getByText('Notifications step')).toBeTruthy();

    // Continue should now be enabled and allow proceeding to step 9
    fireEvent.press(getByText('Continue'));
    expect(getByText('TV Genres step')).toBeTruthy();
  });

  it('enables Continue on step 8 after rehydrating when hasInteractedWithNotifications was saved', async () => {
    const { readOnboardingProgress } = require('@/src/utils/onboardingStepCache');
    readOnboardingProgress.mockResolvedValueOnce({
      stepIndex: 7,
      hasInteractedWithNotifications: true,
      selections: {
        region: 'US',
        displayName: 'Test',
        homeScreenLists: [],
        language: 'en-US',
        selectedGenreIds: [],
        selectedTVGenreIds: [],
        selectedTVShows: [],
        selectedMovies: [],
        selectedActors: [],
        accentColor: null,
      },
    });

    const { getByText } = render(<OnboardingContainer initialStepIndex={7} />);

    await waitFor(() => {
      expect(getByText('Notifications step')).toBeTruthy();
    });

    // Continue is enabled because hasInteractedWithNotifications was rehydrated as true
    fireEvent.press(getByText('Continue'));
    expect(getByText('TV Genres step')).toBeTruthy();
  });

  it('tracks onboarding_step_view for step 0 on start and step 1 on continue', async () => {
    const { getByText } = render(<OnboardingContainer />);

    // Dismiss welcome screen
    fireEvent.press(getByText('Begin onboarding'));

    await waitFor(() => {
      expect(mockTrackOnboardingStepView).toHaveBeenCalledWith({
        stepIndex: 0,
        stepId: 'region',
      });
    });

    // Advance to step 1
    fireEvent.press(getByText('Skip'));

    await waitFor(() => {
      expect(mockTrackOnboardingStepView).toHaveBeenCalledWith({
        stepIndex: 1,
        stepId: 'display-name',
      });
    });
  });
});
