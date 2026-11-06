import { updateUserProfile } from '@/src/services/ProfileService';
import { updateProfile, User } from 'firebase/auth';
import { setDoc } from 'firebase/firestore';
import { deleteObject, listAll, uploadBytesResumable } from 'firebase/storage';

const mockResize = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      resize: mockResize,
      renderAsync: jest.fn(() =>
        Promise.resolve({
          saveAsync: jest.fn(() => Promise.resolve({ uri: 'file:///resized.jpg' })),
        })
      ),
    })),
  },
}));
jest.mock('@/src/firebase/config', () => ({ db: {}, storage: {} }));
jest.mock('@/src/services/UserDocumentCache', () => ({ mergeUserDocumentCache: jest.fn() }));
jest.mock('firebase/auth', () => ({ updateProfile: jest.fn(() => Promise.resolve()) }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => 'user-doc'),
  setDoc: jest.fn(() => Promise.resolve()),
}));
jest.mock('firebase/storage', () => ({
  ref: jest.fn((_storage: unknown, path: string) => ({ fullPath: path })),
  uploadBytesResumable: jest.fn(() => Promise.resolve()),
  getDownloadURL: jest.fn(() => Promise.resolve('https://storage.example/new.jpg')),
  listAll: jest.fn(),
  deleteObject: jest.fn(() => Promise.resolve()),
}));

const user = {
  uid: 'user-1',
  isAnonymous: false,
  displayName: 'Old Name',
  photoURL: 'https://example.com/old.jpg',
} as unknown as User;

const uploadedPath = () => (uploadBytesResumable as jest.Mock).mock.calls[0][0].fullPath as string;

describe('updateUserProfile', () => {
  beforeEach(() => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(() =>
      Promise.resolve({ blob: () => Promise.resolve('blob') })
    );
    (listAll as jest.Mock).mockResolvedValue({ items: [] });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('rejects guests without changing anything', async () => {
    await expect(
      updateUserProfile({ ...user, isAnonymous: true } as User, {
        displayName: 'Name',
        photo: { type: 'keep' },
      })
    ).rejects.toThrow();

    expect(updateProfile).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('changes only the name when the photo is kept', async () => {
    await updateUserProfile(user, { displayName: 'New Name', photo: { type: 'keep' } });

    expect(updateProfile).toHaveBeenCalledWith(user, {
      displayName: 'New Name',
      photoURL: 'https://example.com/old.jpg',
    });
    expect(setDoc).toHaveBeenCalledWith(
      'user-doc',
      { displayName: 'New Name', photoURL: 'https://example.com/old.jpg' },
      { merge: true }
    );
    expect(uploadBytesResumable).not.toHaveBeenCalled();
    expect(listAll).not.toHaveBeenCalled();
  });

  it("resizes and uploads a new photo to the user's own folder as a JPEG", async () => {
    await updateUserProfile(user, {
      displayName: 'Old Name',
      photo: { type: 'replace', uri: 'file:///picked.jpg' },
    });

    expect(mockResize).toHaveBeenCalledWith({ width: 512 });
    expect(fetch).toHaveBeenCalledWith('file:///resized.jpg');
    expect(uploadedPath()).toMatch(/^users\/user-1\/profile\/\d+\.jpg$/);
    expect(uploadBytesResumable).toHaveBeenCalledWith(expect.anything(), 'blob', {
      contentType: 'image/jpeg',
    });
    expect(updateProfile).toHaveBeenCalledWith(user, {
      displayName: 'Old Name',
      photoURL: 'https://storage.example/new.jpg',
    });
  });

  it('deletes older photos but keeps the new one', async () => {
    const old = { fullPath: 'users/user-1/profile/1.jpg' };
    (listAll as jest.Mock).mockImplementation(async () => ({
      items: [old, { fullPath: uploadedPath() }],
    }));

    await updateUserProfile(user, {
      displayName: 'Old Name',
      photo: { type: 'replace', uri: 'file:///picked.jpg' },
    });

    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(deleteObject).toHaveBeenCalledWith(old);
  });

  it('clears the photo and deletes stored copies when removing', async () => {
    const stored = { fullPath: 'users/user-1/profile/1.jpg' };
    (listAll as jest.Mock).mockResolvedValue({ items: [stored] });

    await updateUserProfile(user, { displayName: 'Old Name', photo: { type: 'remove' } });

    expect(updateProfile).toHaveBeenCalledWith(user, { displayName: 'Old Name', photoURL: null });
    expect(setDoc).toHaveBeenCalledWith(
      'user-doc',
      { displayName: 'Old Name', photoURL: null },
      { merge: true }
    );
    expect(deleteObject).toHaveBeenCalledWith(stored);
  });

  it('leaves the profile untouched when the upload fails', async () => {
    (uploadBytesResumable as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    await expect(
      updateUserProfile(user, {
        displayName: 'New Name',
        photo: { type: 'replace', uri: 'file:///picked.jpg' },
      })
    ).rejects.toThrow('offline');

    expect(updateProfile).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('keeps the old photos when the auth update fails, since they are still in use', async () => {
    (updateProfile as jest.Mock).mockRejectedValueOnce(new Error('auth failed'));

    await expect(
      updateUserProfile(user, {
        displayName: 'Old Name',
        photo: { type: 'replace', uri: 'file:///picked.jpg' },
      })
    ).rejects.toThrow('auth failed');

    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('does not wait forever on the document write while offline', async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      (setDoc as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
      const save = updateUserProfile(user, { displayName: 'New', photo: { type: 'keep' } });

      await jest.advanceTimersByTimeAsync(10000);

      await expect(save).resolves.toBeUndefined();
    } finally {
      warn.mockRestore();
      jest.useRealTimers();
    }
  });

  it('still succeeds when the document write or photo cleanup fails', async () => {
    (setDoc as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    (listAll as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    await expect(
      updateUserProfile(user, { displayName: 'Old Name', photo: { type: 'remove' } })
    ).resolves.toBeUndefined();
  });
});
