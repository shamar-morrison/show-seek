import { act, renderHook } from '@testing-library/react-native';

const mockAuthState = {
  user: null as null | { isAnonymous?: boolean },
  loading: false,
};

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/components/AuthGuardModal', () => () => null);

import { useAuthGuard } from '@/src/hooks/useAuthGuard';

describe('useAuthGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = null;
    mockAuthState.loading = false;
  });

  it('executes action immediately when authenticated', () => {
    mockAuthState.user = { isAnonymous: false };

    const { result } = renderHook(() => useAuthGuard());
    const action = jest.fn();

    act(() => {
      result.current.requireAuth(action, 'Sign in');
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.AuthGuardModal.props.visible).toBe(false);
  });

  it('shows modal with message for unauthenticated users and clears on close', () => {
    mockAuthState.user = null;

    const { result } = renderHook(() => useAuthGuard());

    act(() => {
      result.current.requireAuth(jest.fn(), 'Custom message');
    });

    expect(result.current.AuthGuardModal.props.visible).toBe(true);
    expect(result.current.AuthGuardModal.props.message).toBe('Custom message');

    act(() => {
      result.current.AuthGuardModal.props.onClose();
    });

    expect(result.current.AuthGuardModal.props.visible).toBe(false);
    expect(result.current.AuthGuardModal.props.message).toBeUndefined();
  });
});
