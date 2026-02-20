import { deleteField, getDoc, updateDoc } from 'firebase/firestore';

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

  it('does not call updateDoc when bulk unwatching a missing document', async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

    await episodeTrackingService.markAllEpisodesUnwatched(123, 1, [
      { id: 1, episode_number: 1 } as any,
      { id: 2, episode_number: 2 } as any,
    ]);

    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('uses a single updateDoc call to bulk unwatch all episodes in a season', async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => true });

    await episodeTrackingService.markAllEpisodesUnwatched(123, 2, [
      { id: 10, episode_number: 1 } as any,
      { id: 11, episode_number: 3 } as any,
    ]);

    expect(updateDoc).toHaveBeenCalledTimes(1);

    const updatePayload = (updateDoc as jest.Mock).mock.calls[0][1];
    expect(updatePayload['episodes.2_1']).toBe('__deleteField__');
    expect(updatePayload['episodes.2_3']).toBe('__deleteField__');
    expect(typeof updatePayload['metadata.lastUpdated']).toBe('number');
    expect(deleteField).toHaveBeenCalledTimes(2);
  });

  it('returns null from getShowTracking for anonymous users without reading Firestore', async () => {
    mockIsAnonymous = true;

    const result = await episodeTrackingService.getShowTracking(123);

    expect(result).toBeNull();
    expect(getDoc).not.toHaveBeenCalled();
  });
});
