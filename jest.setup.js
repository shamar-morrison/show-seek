/* eslint-disable */
import '@testing-library/jest-native/extend-expect';

// Mock react-i18next
jest.mock('react-i18next', () => {
  const enUS = require('./src/i18n/locales/en-US.json');

  // Helper to get nested translation value
  const getNestedValue = (obj, path, params) => {
    const value = path.split('.').reduce((current, key) => current?.[key], obj);
    if (typeof value !== 'string') return path; // Return key if not found

    // Handle interpolation like {{count}}, {{number}}, etc.
    if (params) {
      return value.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? '');
    }
    return value;
  };

  return {
    useTranslation: () => ({
      t: (key, params) => getNestedValue(enUS, key, params),
      i18n: {
        language: 'en-US',
        changeLanguage: jest.fn(),
      },
    }),
    Trans: ({ children }) => children,
    initReactI18next: {
      type: '3rdParty',
      init: jest.fn(),
    },
  };
});

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  return {
    LinearGradient: ({ children, ...props }) =>
      React.createElement('LinearGradient', props, children),
  };
});

// Mock expo-updates
jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn(() => Promise.resolve()),
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  usePathname: () => '/',
  Link: 'Link',
  Stack: {
    Screen: 'Screen',
  },
}));

// Toggle this flag in tests to simulate a video load failure
global.__EXPO_VIDEO_FORCE_ERROR = false;

// Mock expo-video
jest.mock('expo-video', () => {
  const React = require('react');

  const createMockPlayer = (source) => ({
    source,
    loop: false,
    muted: false,
    play: jest.fn(),
    pause: jest.fn(),
    addListener: jest.fn((eventName, callback) => {
      if (eventName === 'statusChange' && global.__EXPO_VIDEO_FORCE_ERROR) {
        callback({ status: 'error', error: { message: 'Mock video error' } });
      }
      return { remove: jest.fn() };
    }),
  });

  return {
    useVideoPlayer: (source, setup) => {
      const playerRef = React.useRef(null);
      if (!playerRef.current) {
        playerRef.current = createMockPlayer(source);
        if (setup) {
          setup(playerRef.current);
        }
      }
      return playerRef.current;
    },
    VideoView: ({ children, ...props }) => React.createElement('VideoView', props, children),
  };
});

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidNotificationPriority: {
    HIGH: 'high',
  },
  SchedulableTriggerInputTypes: {
    DATE: 'date',
  },
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

// Mock react-native-svg (required for lucide-react-native icons)
jest.mock('react-native-svg', () => {
  const React = require('react');
  const createMockComponent = (name) => (props) => React.createElement(name, props, props.children);

  return {
    __esModule: true,
    default: createMockComponent('Svg'),
    Svg: createMockComponent('Svg'),
    Circle: createMockComponent('Circle'),
    Ellipse: createMockComponent('Ellipse'),
    G: createMockComponent('G'),
    Text: createMockComponent('Text'),
    TSpan: createMockComponent('TSpan'),
    TextPath: createMockComponent('TextPath'),
    Path: createMockComponent('Path'),
    Polygon: createMockComponent('Polygon'),
    Polyline: createMockComponent('Polyline'),
    Line: createMockComponent('Line'),
    Rect: createMockComponent('Rect'),
    Use: createMockComponent('Use'),
    Image: createMockComponent('Image'),
    Symbol: createMockComponent('Symbol'),
    Defs: createMockComponent('Defs'),
    LinearGradient: createMockComponent('LinearGradient'),
    RadialGradient: createMockComponent('RadialGradient'),
    Stop: createMockComponent('Stop'),
    ClipPath: createMockComponent('ClipPath'),
    Pattern: createMockComponent('Pattern'),
    Mask: createMockComponent('Mask'),
  };
});

// Mock Firebase Auth
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    currentUser: { uid: 'test-user-id', email: 'test@example.com' },
  })),
  onAuthStateChanged: jest.fn((auth, callback) => {
    callback({ uid: 'test-user-id', email: 'test@example.com' });
    return jest.fn();
  }),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
}));

// Mock Firebase Firestore
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(() => '__serverTimestamp__'),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  deleteField: jest.fn(() => '__deleteField__'),
  arrayUnion: jest.fn((value) => `__arrayUnion__${value}`),
  arrayRemove: jest.fn((value) => `__arrayRemove__${value}`),
  onSnapshot: jest.fn(() => jest.fn()),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  Timestamp: {
    now: jest.fn(() => ({ toDate: () => new Date() })),
    fromDate: jest.fn((date) => ({ toDate: () => date })),
  },
}));

// Mock the internal firebase config
jest.mock('@/src/firebase/config', () => ({
  auth: {
    currentUser: { uid: 'test-user-id', email: 'test@example.com' },
  },
  db: {},
}));

// Mock AccentColorProvider context
jest.mock('@/src/context/AccentColorProvider', () => ({
  AccentColorProvider: ({ children }) => children,
  AccentColorContext: require('react').createContext(null),
  useAccentColor: () => ({
    accentColor: '#6B46C1',
    isAccentReady: true,
    setAccentColor: jest.fn(),
  }),
  SUPPORTED_ACCENT_COLORS: [],
}));

// Selectively suppress known expected warnings
// This preserves real errors for debugging while filtering noise
const originalWarn = console.warn;
const originalError = console.error;

const SUPPRESSED_WARNINGS = [
  'ReactNative: Reanimated',
  'Animated: `useNativeDriver`',
  'componentWillReceiveProps has been renamed',
  'componentWillMount has been renamed',
];

global.console = {
  ...console,
  warn: (...args) => {
    const message = args[0]?.toString() || '';
    if (!SUPPRESSED_WARNINGS.some((w) => message.includes(w))) {
      originalWarn.apply(console, args);
    }
  },
  error: (...args) => {
    const message = args[0]?.toString() || '';
    // Only suppress specific known test environment errors
    const SUPPRESSED_ERRORS = [
      'Warning: ReactDOM.render is no longer supported',
      'act(...) is not supported in production builds',
      'react-test-renderer is deprecated',
    ];
    if (!SUPPRESSED_ERRORS.some((e) => message.includes(e))) {
      originalError.apply(console, args);
    }
  },
};

// Mock __DEV__ for production-like testing
global.__DEV__ = false;
