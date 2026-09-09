import { resolveMissingRuntimes } from '@/src/services/WatchTimeBackfill';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...segments: unknown[]) => ({ segments })),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/src/firebase/config', () => ({ db: { __mockDb: true } }));

jest.mock('@/src/services/serviceSupport', () => ({
  getSignedInUser: () => ({ uid: 'user-1' }),
}));

const flushStamps = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('WatchTimeBackfill Firestore stamps', () => {
  it('stamps episode runtimes with setDoc merge:true to avoid clobbering concurrent writes', async () => {
    await resolveMissingRuntimes(
      [{ tvShowId: 500, episodeKey: '1_2', watchedAt: 1000 }],
      [],
      { getShowRuntime: async () => 42 }
    );
    await flushStamps();

    expect(setDoc).toHaveBeenCalledTimes(1);
    const [, data, options] = (setDoc as jest.Mock).mock.calls[0];
    expect(data).toEqual({ episodes: { '1_2': { runtimeMinutes: 42 } } });
    expect(options).toEqual({ merge: true });
    expect(doc).toHaveBeenCalledWith(
      expect.anything(),
      'users',
      'user-1',
      'episode_tracking',
      '500'
    );
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('stamps list item runtimes with updateDoc on dotted runtimeMinutes paths', async () => {
    await resolveMissingRuntimes(
      [],
      [
        {
          listId: 'already-watched',
          itemKey: 'movie-101',
          mediaType: 'movie',
          mediaId: 101,
          addedAt: 1000,
        },
      ],
      { getMovieRuntime: async () => 120 }
    );
    await flushStamps();

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [, updates] = (updateDoc as jest.Mock).mock.calls[0];
    expect(updates).toEqual({ 'items.movie-101.runtimeMinutes': 120 });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('issues no writes when nothing measured was resolved', async () => {
    await resolveMissingRuntimes(
      [{ tvShowId: 500, episodeKey: '1_1', watchedAt: 1000 }],
      [],
      { getShowRuntime: async () => null }
    );
    await flushStamps();

    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });
});
