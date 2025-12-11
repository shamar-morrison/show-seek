import AuthGuardModal from '@/src/components/AuthGuardModal';
import { useAuth } from '@/src/context/auth';
import { useCallback, useState } from 'react';

/**
 * Hook that provides authentication guard functionality for protected actions.
 *
 * A user is considered authenticated if:
 * - `user !== null` AND
 * - `user.isAnonymous === false`
 *
 * Guest users (anonymous) and unauthenticated users will see a modal
 * prompting them to sign in.
 *
 * @example
 * ```tsx
 * const MyComponent = () => {
 *   const { requireAuth, isAuthenticated, AuthGuardModal } = useAuthGuard();
 *
 *   const handleAddToList = () => {
 *     requireAuth(async () => {
 *       await addMovieToList(movieId, listId);
 *     }, 'Sign in to add items to your lists');
 *   };
 *
 *   return (
 *     <>
 *       <Button onPress={handleAddToList}>Add to List</Button>
 *       {AuthGuardModal}
 *     </>
 *   );
 * };
 * ```
 *
 * @example Using in custom hooks
 * ```tsx
 * const useProtectedAddToList = () => {
 *   const { requireAuth } = useAuthGuard();
 *   const addToListMutation = useAddToList();
 *
 *   const addToList = (movieId: string, listId: string) => {
 *     requireAuth(async () => {
 *       await addToListMutation.mutateAsync({ movieId, listId });
 *     }, 'Sign in to manage your lists');
 *   };
 *
 *   return { addToList };
 * };
 * ```
 */
export const useAuthGuard = () => {
  const { user, loading } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState<string | undefined>();

  // A user is authenticated if they exist and are NOT anonymous
  // If still loading, treat as not authenticated to prevent action execution
  const isAuthenticated = !loading && user !== null && user.isAnonymous === false;

  /**
   * Wraps an action with an authentication check.
   * If the user is authenticated, executes the action immediately.
   * If not, shows the auth modal with an optional custom message.
   *
   * @param action - The action to execute if authenticated (sync or async)
   * @param message - Optional custom message for the auth modal
   */
  const requireAuth = useCallback(
    (action: () => void | Promise<void>, message?: string) => {
      if (isAuthenticated) {
        // User is authenticated, execute action immediately
        action();
      } else {
        // User is not authenticated, show modal
        setModalMessage(message);
        setModalVisible(true);
      }
    },
    [isAuthenticated]
  );

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setModalMessage(undefined);
  }, []);

  // The modal component to render in the parent
  const AuthGuardModalElement = (
    <AuthGuardModal visible={modalVisible} onClose={handleCloseModal} message={modalMessage} />
  );

  return {
    /**
     * Wraps an action with authentication check.
     * Shows auth modal if user is not authenticated.
     */
    requireAuth,

    /**
     * Whether the current user is authenticated (non-guest, non-null user).
     */
    isAuthenticated,

    /**
     * The auth guard modal component. Must be rendered in the parent component.
     * @example {AuthGuardModal}
     */
    AuthGuardModal: AuthGuardModalElement,
  };
};
