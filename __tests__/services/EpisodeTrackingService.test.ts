import { getDoc, updateDoc } from 'firebase/firestore';

let mockUserId: string | null = 'test-user-id';
let mockIsAnonymous = false;

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockUserId ? { uid: mockUserId, isAnonymous: mockIsAnonymous } : null;
    },
  },
  db: {},
}));

jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

import { episodeTrackingService } from '@/src/services/EpisodeTrackingService';

describe('EpisodeTrackingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'test-user-id';
    mockIsAnonymous = false;
  });

  it('does not call updateDoc when unwatching a missing document', async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

    await episodeTrackingService.markEpisodeUnwatched(123, 1, 1);

    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('returns null from getShowTracking for anonymous users without reading Firestore', async () => {
    mockIsAnonymous = true;

    const result = await episodeTrackingService.getShowTracking(123);

    expect(result).toBeNull();
    expect(getDoc).not.toHaveBeenCalled();
  });
});
