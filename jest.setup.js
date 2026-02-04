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

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

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
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  deleteField: jest.fn(() => '__deleteField__'),
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
