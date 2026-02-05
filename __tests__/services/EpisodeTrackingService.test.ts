import { getDoc, updateDoc } from 'firebase/firestore';

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

import { episodeTrackingService } from '@/src/services/EpisodeTrackingService';

describe('EpisodeTrackingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'test-user-id';
  });

  it('does not call updateDoc when unwatching a missing document', async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

    await episodeTrackingService.markEpisodeUnwatched(123, 1, 1);

    expect(updateDoc).not.toHaveBeenCalled();
  });
});
