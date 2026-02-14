import { createUserDocument } from '@/src/firebase/user';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

const mockDoc = doc as jest.Mock;
const mockGetDoc = getDoc as jest.Mock;
const mockSetDoc = setDoc as jest.Mock;
const mockServerTimestamp = serverTimestamp as jest.Mock;

describe('createUserDocument', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockReturnValue('user-ref');
    mockServerTimestamp.mockReturnValue('__serverTimestamp__');
  });

  it('creates a new user document with fallback displayName from email prefix', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => false,
    });

    await createUserDocument({
      uid: 'uid-1',
      displayName: null,
      email: 'new.user@example.com',
      photoURL: null,
    } as any);

    expect(mockSetDoc).toHaveBeenCalledWith('user-ref', {
      uid: 'uid-1',
      displayName: 'new.user',
      email: 'new.user@example.com',
      photoURL: null,
      createdAt: '__serverTimestamp__',
    });
  });

  it('creates a new user document with empty email fallback when email is null', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => false,
    });

    await createUserDocument({
      uid: 'uid-2',
      displayName: null,
      email: null,
      photoURL: 'https://image.example/avatar.png',
    } as any);

    expect(mockSetDoc).toHaveBeenCalledWith('user-ref', {
      uid: 'uid-2',
      displayName: 'User',
      email: '',
      photoURL: 'https://image.example/avatar.png',
      createdAt: '__serverTimestamp__',
    });
  });

  it('updates existing document when normalized displayName or photoURL changed', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        displayName: 'Old Name',
        photoURL: null,
      }),
    });

    await createUserDocument({
      uid: 'uid-3',
      displayName: '  New Name  ',
      email: 'person@example.com',
      photoURL: 'https://image.example/new.png',
    } as any);

    expect(mockSetDoc).toHaveBeenCalledWith(
      'user-ref',
      {
        displayName: 'New Name',
        photoURL: 'https://image.example/new.png',
      },
      { merge: true }
    );
  });

  it('does not write when existing document values are already normalized and unchanged', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        displayName: 'new.user',
        photoURL: 'https://image.example/avatar.png',
      }),
    });

    await createUserDocument({
      uid: 'uid-4',
      displayName: 'new.user',
      email: 'new.user@example.com',
      photoURL: 'https://image.example/avatar.png',
    } as any);

    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});
