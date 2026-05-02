import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { AppState, Platform } from 'react-native';

const mockConfigureRevenueCat = jest.fn();
const mockCreateUserDocument = jest.fn();
const mockGetCachedUserDocument = jest.fn();
const mockGetOfferings = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockLogIn = jest.fn();
const mockLogOut = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockAddCustomerInfoUpdateListener = jest.fn();
const mockRemoveCustomerInfoUpdateListener = jest.fn();
const mockAuditedOnSnapshot = jest.fn();
const mockOnAuthStateChanged = jest.fn();
const mockGetUserNotes = jest.fn();
const mockGetActiveReminders = jest.fn();
const mockGetTrackedCollectionCount = jest.fn();
const mockShowFreemiumLimitAlert = jest.fn();
const mockAppStateListenerRemove = jest.fn();
let mockCurrentUser: { uid: string; email?: string | null; isAnonymous?: boolean } | null = {
  uid: 'premium-user-1',
  email: 'premium@example.com',
  isAnonymous: false,
};
let authStateChangeCallback:
  | ((user: { uid: string; email?: string | null; isAnonymous?: boolean } | null) => void)
  | null = null;

jest.mock('@/src/config/readOptimization', () => ({
  READ_OPTIMIZATION_FLAGS: {
    enablePremiumRealtimeListener: true,
    liteModeEnabled: false,
  },
  READ_QUERY_CACHE_WINDOWS: {
    statusGcTimeMs: 1000,
    statusStaleTimeMs: 0,
  },
}));

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
  db: {},
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: mockCurrentUser,
  }),
}));

jest.mock('@/src/firebase/user', () => ({
  createUserDocument: (...args: unknown[]) => mockCreateUserDocument(...args),
}));

jest.mock('@/src/services/firestoreReadAudit', () => ({
  auditedOnSnapshot: (...args: unknown[]) => mockAuditedOnSnapshot(...args),
}));

jest.mock('@/src/services/revenueCat', () => ({
  configureRevenueCat: (...args: unknown[]) => mockConfigureRevenueCat(...args),
}));

jest.mock('@/src/services/UserDocumentCache', () => ({
  getCachedUserDocument: (...args: unknown[]) => mockGetCachedUserDocument(...args),
}));

jest.mock('@/src/services/ReadBudgetGuard', () => ({
  canUseNonCriticalRead: () => true,
}));

jest.mock('@/src/services/NoteService', () => ({
  noteService: {
    getUserNotes: (...args: unknown[]) => mockGetUserNotes(...args),
  },
}));

jest.mock('@/src/services/ReminderService', () => ({
  reminderService: {
    getActiveReminders: (...args: unknown[]) => mockGetActiveReminders(...args),
  },
}));

jest.mock('@/src/services/CollectionTrackingService', () => ({
  MAX_FREE_COLLECTIONS: 2,
  collectionTrackingService: {
    getTrackedCollectionCount: (...args: unknown[]) => mockGetTrackedCollectionCount(...args),
  },
}));

jest.mock('@/src/utils/premiumAlert', () => ({
  showFreemiumLimitAlert: (...args: unknown[]) => mockShowFreemiumLimitAlert(...args),
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => 'users/premium-user-1'),
}));

jest.mock('react-native-purchases', () => {
  const defaultExport = {
    addCustomerInfoUpdateListener: (...args: unknown[]) =>
      mockAddCustomerInfoUpdateListener(...args),
    getCustomerInfo: (...args: unknown[]) => mockGetCustomerInfo(...args),
    getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
    logIn: (...args: unknown[]) => mockLogIn(...args),
    logOut: (...args: unknown[]) => mockLogOut(...args),
    purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
    removeCustomerInfoUpdateListener: (...args: unknown[]) =>
      mockRemoveCustomerInfoUpdateListener(...args),
    restorePurchases: (...args: unknown[]) => mockRestorePurchases(...args),
  };

  return {
    __esModule: true,
    default: defaultExport,
    PURCHASES_ERROR_CODE: {
      PURCHASE_CANCELLED_ERROR: '1',
    },
  };
});

import { PremiumProvider, usePremium } from '@/src/context/PremiumContext';
import { useCanTrackMoreCollections } from '@/src/hooks/useCollectionTracking';
import { useCanCreateNote } from '@/src/hooks/useNotes';
import { useCanCreateReminder } from '@/src/hooks/useReminders';

const offerings = {
  all: {
    Premium: {
      availablePackages: [
        {
          identifier: '$rc_monthly',
          product: {
            identifier: 'monthly_showseek_sub',
            priceString: '$3.00',
          },
        },
        {
          identifier: '$rc_annual',
          product: {
            identifier: 'showseek_yearly_sub',
            priceString: '$12.00',
          },
        },
      ],
    },
  },
  current: null,
};

const makeCustomerInfo = (isPremium: boolean) => ({
  entitlements: {
    active: isPremium
      ? {
          premium: {
            periodType: 'NORMAL',
            productIdentifier: 'monthly_showseek_sub',
          },
        }
      : {},
    all: isPremium
      ? {
          premium: {
            periodType: 'NORMAL',
            productIdentifier: 'monthly_showseek_sub',
          },
        }
      : {},
  },
  subscriptionsByProductIdentifier: {},
});

const createSnapshot = (premium: Record<string, unknown> = {}) => ({
  data: () => ({ premium }),
  exists: () => true,
});

const createNotesAtLimit = () =>
  Array.from({ length: 15 }, (_, index) => ({
    id: `movie-${index + 1}`,
    mediaId: index + 1,
    mediaType: 'movie',
  }));

const createRemindersAtLimit = () =>
  Array.from({ length: 3 }, (_, index) => ({
    id: `movie-${index + 1}`,
    mediaId: index + 1,
    mediaType: 'movie',
  }));

describe('premium entitlement gate integration', () => {
  const originalPlatform = Platform.OS;

  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 0,
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    });

    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <PremiumProvider>{children}</PremiumProvider>
      </QueryClientProvider>
    );
  };

  const useGateSnapshot = () => ({
    canCreateNote: useCanCreateNote(),
    canCreateReminder: useCanCreateReminder(),
    collections: useCanTrackMoreCollections(),
    premium: usePremium(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = 'android';
    mockCurrentUser = {
      uid: 'premium-user-1',
      email: 'premium@example.com',
      isAnonymous: false,
    };
    authStateChangeCallback = null;
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    mockConfigureRevenueCat.mockResolvedValue(true);
    mockCreateUserDocument.mockResolvedValue(undefined);
    mockGetCachedUserDocument.mockResolvedValue({
      premium: { hasUsedTrial: false, isPremium: false },
    });
    mockGetOfferings.mockResolvedValue(offerings);
    mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
    mockLogIn.mockResolvedValue({ created: false, customerInfo: makeCustomerInfo(false) });
    mockLogOut.mockResolvedValue(makeCustomerInfo(false));
    mockPurchasePackage.mockResolvedValue({
      customerInfo: makeCustomerInfo(true),
      productIdentifier: 'monthly_showseek_sub',
    });
    mockRestorePurchases.mockResolvedValue(makeCustomerInfo(true));
    mockGetUserNotes.mockResolvedValue(createNotesAtLimit());
    mockGetActiveReminders.mockResolvedValue(createRemindersAtLimit());
    mockGetTrackedCollectionCount.mockResolvedValue(2);

    mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
      authStateChangeCallback = callback;
      callback(mockCurrentUser);
      return jest.fn();
    });

    (AppState.addEventListener as jest.Mock).mockImplementation(() => ({
      remove: mockAppStateListenerRemove,
    }));

    mockAuditedOnSnapshot.mockImplementation((_ref, onNext) => {
      onNext(createSnapshot({ hasUsedTrial: false, isPremium: false }));
      return jest.fn();
    });
  });

  afterAll(() => {
    (Platform as { OS: string }).OS = originalPlatform;
  });

  // Verifies a successful purchase updates PremiumContext immediately and removes notes, reminders, and collection limits without remounting.
  it('removes all freemium gates immediately after a successful purchase', async () => {
    const { result } = renderHook(() => useGateSnapshot(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.premium.isLoading).toBe(false);
      expect(result.current.collections.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(
        result.current.canCreateNote({
          mediaId: 999,
          mediaType: 'movie',
        })
      ).resolves.toBe(false);
      await expect(
        result.current.canCreateReminder({
          mediaId: 999,
          mediaType: 'movie',
        })
      ).resolves.toBe(false);
    });

    expect(result.current.premium.isPremium).toBe(false);
    expect(result.current.collections.canTrackMore).toBe(false);
    expect(mockShowFreemiumLimitAlert).toHaveBeenNthCalledWith(1, 'notes', 15);
    expect(mockShowFreemiumLimitAlert).toHaveBeenNthCalledWith(2, 'reminders', 3);
    expect(mockGetUserNotes).toHaveBeenCalledTimes(1);
    expect(mockGetActiveReminders).toHaveBeenCalledTimes(1);

    await act(async () => {
      await expect(result.current.premium.purchasePremium('monthly')).resolves.toBe(true);
    });

    await waitFor(() => {
      expect(result.current.premium.isPremium).toBe(true);
      expect(result.current.collections.canTrackMore).toBe(true);
    });

    const alertsAfterPurchase = mockShowFreemiumLimitAlert.mock.calls.length;

    await act(async () => {
      await expect(
        result.current.canCreateNote({
          mediaId: 1000,
          mediaType: 'movie',
        })
      ).resolves.toBe(true);
      await expect(
        result.current.canCreateReminder({
          mediaId: 1000,
          mediaType: 'movie',
        })
      ).resolves.toBe(true);
    });

    expect(mockPurchasePackage).toHaveBeenCalledTimes(1);
    expect(mockShowFreemiumLimitAlert).toHaveBeenCalledTimes(alertsAfterPurchase);
    expect(mockGetUserNotes).toHaveBeenCalledTimes(1);
    expect(mockGetActiveReminders).toHaveBeenCalledTimes(1);
  });

  // Verifies a successful restore updates PremiumContext immediately and removes all free-tier gates without requiring a reload.
  it('removes all freemium gates immediately after a successful restore', async () => {
    const { result } = renderHook(() => useGateSnapshot(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.premium.isLoading).toBe(false);
      expect(result.current.collections.isLoading).toBe(false);
    });

    expect(result.current.premium.isPremium).toBe(false);
    expect(result.current.collections.canTrackMore).toBe(false);

    await act(async () => {
      await expect(result.current.premium.restorePurchases()).resolves.toBe(true);
    });

    await waitFor(() => {
      expect(result.current.premium.isPremium).toBe(true);
      expect(result.current.collections.canTrackMore).toBe(true);
    });

    await act(async () => {
      await expect(
        result.current.canCreateNote({
          mediaId: 2000,
          mediaType: 'movie',
        })
      ).resolves.toBe(true);
      await expect(
        result.current.canCreateReminder({
          mediaId: 2000,
          mediaType: 'movie',
        })
      ).resolves.toBe(true);
    });

    expect(mockRestorePurchases).toHaveBeenCalledTimes(1);
    expect(mockShowFreemiumLimitAlert).not.toHaveBeenCalled();
    expect(mockGetUserNotes).not.toHaveBeenCalled();
    expect(mockGetActiveReminders).not.toHaveBeenCalled();
  });
});
