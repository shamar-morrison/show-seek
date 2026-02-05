import { onSnapshot } from 'firebase/firestore';

let mockUserId: string | null = 'test-user-id';

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockUserId ? { uid: mockUserId } : null;
    },
  },
  db: {},
}));

jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

import { collectionTrackingService } from '@/src/services/CollectionTrackingService';

describe('CollectionTrackingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'test-user-id';
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('falls back on timeout when no snapshot event arrives', () => {
    const callback = jest.fn();
    const onError = jest.fn();
    const unsubscribe = jest.fn();

    (onSnapshot as jest.Mock).mockReturnValue(unsubscribe);

    collectionTrackingService.subscribeToTrackedCollections(callback, onError);

    jest.advanceTimersByTime(10000);

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(callback).toHaveBeenCalledWith([]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
