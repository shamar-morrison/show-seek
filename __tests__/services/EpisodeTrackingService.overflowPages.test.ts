import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { PAGE_CAPACITY } from '@/functions/src/shared/pagedMap';

jest.mock('@/src/firebase/config', () => ({
  auth: { currentUser: { uid: 'test-user-id', isAnonymous: false } },
  db: {},
}));

jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

import { episodeTrackingService } from '@/src/services/EpisodeTrackingService';

const SHOW = 'users/test-user-id/episode_tracking/42';

const episodesOf = (keys: string[]) =>
  Object.fromEntries(
    keys.map((key) => {
      const [season, episode] = key.split('_').map(Number);
      return [
        key,
        {
          episodeId: season * 1000 + episode,
          tvShowId: 42,
          seasonNumber: season,
          episodeNumber: episode,
          watchedAt: 1,
          episodeName: `E${episode}`,
          episodeAirDate: null,
        },
      ];
    })
  );

const showDoc = (data: Record<string, unknown>) => ({
  exists: () => true,
  id: '42',
  data: () => ({ metadata: { tvShowName: 'Soap', lastUpdated: 1, posterPath: null }, ...data }),
});

interface MockBatch {
  set: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  commit: jest.Mock;
}
let batches: MockBatch[];

beforeEach(() => {
  jest.clearAllMocks();
  episodeTrackingService.clearEpisodeLayouts();
  batches = [];
  (doc as jest.Mock).mockImplementation((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }));
  (collection as jest.Mock).mockImplementation((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }));
  (writeBatch as jest.Mock).mockImplementation(() => {
    const batch: MockBatch = {
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    batches.push(batch);
    return batch;
  });
});

const metadata = { tvShowName: 'Soap', posterPath: null };
const episode = { episodeId: 7, episodeName: 'Pilot', episodeAirDate: null };

describe('EpisodeTrackingService overflow pages', () => {
  it('merges episode pages into the show, reading pages only when the show has them', async () => {
    (getDoc as jest.Mock).mockResolvedValue(showDoc({ episodes: episodesOf(['1_1']), pageCount: 1 }));
    (getDocs as jest.Mock).mockResolvedValue({
      size: 1,
      docs: [{ id: '1', data: () => ({ episodes: episodesOf(['1_2', '1_3']) }) }],
    });

    const tracking = await episodeTrackingService.getShowTracking(42);

    expect(Object.keys(tracking!.episodes).sort()).toEqual(['1_1', '1_2', '1_3']);
    expect((getDocs as jest.Mock).mock.calls[0][0]).toEqual({ path: `${SHOW}/episode_pages` });
  });

  it('writes a show that fits in its document exactly as before', async () => {
    (getDoc as jest.Mock).mockResolvedValue(showDoc({ episodes: episodesOf(['1_1']) }));
    await episodeTrackingService.getShowTracking(42);

    await episodeTrackingService.markEpisodeWatched(42, 1, 2, episode, metadata);

    expect(setDoc).toHaveBeenCalledWith(
      { path: SHOW },
      { episodes: { '1_2': expect.objectContaining({ episodeId: 7 }) }, metadata: expect.any(Object) },
      { merge: true }
    );
    expect(batches).toHaveLength(0);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('puts new episodes of a very long show on its overflow page', async () => {
    (getDoc as jest.Mock).mockResolvedValue(
      showDoc({
        episodes: episodesOf(Array.from({ length: PAGE_CAPACITY }, (_, i) => `1_${i + 1}`)),
        pageCount: 1,
      })
    );
    (getDocs as jest.Mock).mockResolvedValue({
      size: 1,
      docs: [{ id: '1', data: () => ({ episodes: episodesOf(['2_1']) }) }],
    });
    await episodeTrackingService.getShowTracking(42);

    await episodeTrackingService.markEpisodeWatched(42, 2, 2, episode, metadata);

    expect(setDoc).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
    expect(batches[0].set).toHaveBeenCalledWith(
      { path: SHOW },
      { metadata: expect.objectContaining({ tvShowName: 'Soap' }) },
      { merge: true }
    );
    expect(batches[0].set).toHaveBeenCalledWith(
      { path: `${SHOW}/episode_pages/1` },
      { episodes: { '2_2': expect.objectContaining({ episodeId: 7 }) }, updatedAt: expect.any(Number) },
      { merge: true }
    );
  });

  it('spills into a new page when the show document turns out to be full', async () => {
    (setDoc as jest.Mock).mockRejectedValueOnce({
      code: 'invalid-argument',
      message: 'Document cannot be written because its size (1,048,700 bytes) exceeds the maximum allowed size of 1,048,576 bytes.',
    });
    (getDoc as jest.Mock).mockResolvedValue(showDoc({ episodes: episodesOf(['1_1']) }));
    const transaction = {
      get: jest.fn().mockResolvedValue({ exists: () => true, data: () => ({}) }),
      update: jest.fn(),
    };
    (runTransaction as jest.Mock).mockImplementation(async (_db, run) => run(transaction));

    await episodeTrackingService.markEpisodeWatched(42, 3, 1, episode, metadata);

    expect(transaction.update).toHaveBeenCalledWith({ path: SHOW }, { pageCount: 1 });
    expect(batches[0].set).toHaveBeenCalledWith(
      { path: `${SHOW}/episode_pages/1` },
      {
        episodes: { '3_1': expect.objectContaining({ episodeId: 7 }) },
        updatedAt: expect.any(Number),
        createdAt: expect.any(Number),
      },
      { merge: true }
    );
  });

  it('unwatches an episode in the document and every page', async () => {
    (getDoc as jest.Mock).mockResolvedValue(showDoc({ episodes: {}, pageCount: 2 }));

    await episodeTrackingService.markEpisodeUnwatched(42, 1, 5);

    expect(updateDoc).not.toHaveBeenCalled();
    expect(batches[0].update).toHaveBeenCalledWith(
      { path: SHOW },
      { 'episodes.1_5': '__deleteField__', 'metadata.lastUpdated': expect.any(Number) }
    );
    expect(batches[0].set.mock.calls.map(([ref]) => ref.path)).toEqual([
      `${SHOW}/episode_pages/1`,
      `${SHOW}/episode_pages/2`,
    ]);
  });

  it('deletes a show together with its episode pages', async () => {
    (getDocs as jest.Mock).mockResolvedValue({
      size: 1,
      docs: [{ id: '1', ref: { path: 'page-1' } }],
    });

    await episodeTrackingService.deleteShowTracking(42);

    expect(batches[0].delete.mock.calls.map(([ref]) => ref.path)).toEqual(['page-1', SHOW]);
  });

  it('moves one existing episode onto the first page so pageCount fits a byte-full show', async () => {
    (setDoc as jest.Mock).mockRejectedValueOnce({
      code: 'invalid-argument',
      message: 'Document cannot be written because its size (1,048,570 bytes) exceeds the maximum allowed size of 1,048,576 bytes.',
    });
    (getDoc as jest.Mock).mockResolvedValue(showDoc({ episodes: episodesOf(['1_1', '1_2']) }));
    const transaction = {
      get: jest
        .fn()
        .mockResolvedValue({ exists: () => true, data: () => ({ episodes: episodesOf(['1_1', '1_2']) }) }),
      set: jest.fn(),
      update: jest.fn(),
    };
    (runTransaction as jest.Mock).mockImplementation(async (_db, run) => run(transaction));

    await episodeTrackingService.markEpisodeWatched(42, 3, 1, episode, metadata);

    expect(transaction.set).toHaveBeenCalledWith(
      { path: `${SHOW}/episode_pages/1` },
      expect.objectContaining({ episodes: { '1_1': expect.any(Object) } }),
      { merge: true }
    );
    expect(transaction.update).toHaveBeenCalledWith(
      { path: SHOW },
      { pageCount: 1, 'episodes.1_1': '__deleteField__' }
    );
  });
});
