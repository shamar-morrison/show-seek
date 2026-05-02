const mockCredential = jest.fn();
const mockConfigure = jest.fn();
const mockGoogleSignIn = jest.fn();
const mockGoogleSignOut = jest.fn();
const mockSignInAnonymously = jest.fn();
const mockSignInWithCredential = jest.fn();

jest.mock('@/src/firebase/config', () => ({
  auth: { name: 'mock-auth' },
}));

jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: {
    credential: (...args: unknown[]) => mockCredential(...args),
  },
  signInAnonymously: (...args: unknown[]) => mockSignInAnonymously(...args),
  signInWithCredential: (...args: unknown[]) => mockSignInWithCredential(...args),
}));

jest.mock('react-native-google-auth', () => ({
  GoogleAuth: {
    configure: (...args: unknown[]) => mockConfigure(...args),
    signIn: (...args: unknown[]) => mockGoogleSignIn(...args),
    signOut: (...args: unknown[]) => mockGoogleSignOut(...args),
  },
  GoogleAuthScopes: {
    EMAIL: 'email',
    PROFILE: 'profile',
  },
}));

describe('firebase auth adapter', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockConfigure.mockResolvedValue(undefined);
    mockCredential.mockImplementation((idToken: string) => ({
      providerId: 'google.com',
      token: idToken,
    }));
    mockSignInWithCredential.mockResolvedValue({
      user: { uid: 'google-user-1', providerId: 'google.com' },
    });
    mockSignInAnonymously.mockResolvedValue({
      user: { uid: 'guest-user-1', isAnonymous: true },
    });
  });

  const loadAuthModule = () => require('@/src/firebase/auth') as typeof import('@/src/firebase/auth');

  // Verifies the Google sign-in adapter configures GoogleAuth, creates the credential, and returns the Firebase user.
  it('returns the expected credential shape for a successful Google sign-in', async () => {
    const { signInWithGoogle } = loadAuthModule();
    mockGoogleSignIn.mockResolvedValueOnce({
      type: 'success',
      data: {
        idToken: 'google-id-token',
      },
    });

    await expect(signInWithGoogle()).resolves.toEqual({
      success: true,
      user: { uid: 'google-user-1', providerId: 'google.com' },
    });
    expect(mockCredential).toHaveBeenCalledWith('google-id-token');
    expect(mockSignInWithCredential).toHaveBeenCalledWith(
      { name: 'mock-auth' },
      { providerId: 'google.com', token: 'google-id-token' }
    );
  });

  // Verifies guest sign-in returns the Firebase anonymous user payload on the happy path.
  it('returns the expected credential shape for a successful guest sign-in', async () => {
    const { signInAsGuest } = loadAuthModule();

    await expect(signInAsGuest()).resolves.toEqual({
      success: true,
      user: { uid: 'guest-user-1', isAnonymous: true },
    });
  });

  // Verifies user-cancelled Google auth is reported as a handled CANCELLED result instead of throwing.
  it('maps a cancelled Google sign-in to the CANCELLED error type', async () => {
    const { signInWithGoogle } = loadAuthModule();
    mockGoogleSignIn.mockResolvedValueOnce({
      type: 'cancelled',
    });

    await expect(signInWithGoogle()).resolves.toEqual({
      success: false,
      cancelled: true,
      errorType: 'CANCELLED',
    });
  });

  // Verifies network failures are normalized into the stable NETWORK_ERROR discriminator.
  it('maps sign-in network failures to the NETWORK_ERROR type', async () => {
    const { signInWithGoogle } = loadAuthModule();
    mockGoogleSignIn.mockRejectedValueOnce({
      code: 'auth/network-request-failed',
      message: 'network down',
    });

    await expect(signInWithGoogle()).resolves.toEqual({
      success: false,
      error: 'Network error. Please check your internet connection.',
      errorType: 'NETWORK_ERROR',
    });
  });

  // Verifies each known Firebase auth code resolves to the intended user-facing Google auth message.
  it('returns the correct user-facing strings for known Google auth error codes', () => {
    const { getGoogleAuthErrorMessage } = loadAuthModule();

    expect(
      getGoogleAuthErrorMessage({ code: 'auth/account-exists-with-different-credential' })
    ).toBe(
      'An account already exists with this email. Please sign in with email/password first.'
    );
    expect(getGoogleAuthErrorMessage({ code: 'auth/credential-already-in-use' })).toBe(
      'This Google account is already linked to another account.'
    );
    expect(getGoogleAuthErrorMessage({ code: 'auth/email-already-in-use' })).toBe(
      'An account with this email already exists. Try signing in with email/password.'
    );
    expect(getGoogleAuthErrorMessage({ code: 'auth/provider-already-linked' })).toBe(
      'This Google account is already linked to your account.'
    );
    expect(getGoogleAuthErrorMessage({ code: 'auth/invalid-credential' })).toBe(
      'Google sign-in failed. Please try again.'
    );
    expect(getGoogleAuthErrorMessage({ code: 'auth/popup-closed-by-user' })).toBe('');
    expect(getGoogleAuthErrorMessage({ code: 'auth/cancelled-popup-request' })).toBe('');
    expect(getGoogleAuthErrorMessage({ code: 'auth/network-request-failed' })).toBe(
      'Network error. Please check your internet connection.'
    );
    expect(getGoogleAuthErrorMessage({ code: 'auth/too-many-requests' })).toBe(
      'Too many attempts. Please try again later.'
    );
    expect(getGoogleAuthErrorMessage({ code: 'auth/operation-not-allowed' })).toBe(
      'Google sign-in is not enabled. Please contact support.'
    );
  });
});
