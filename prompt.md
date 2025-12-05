# Implement Authentication Guards for Protected Actions

## Context

I have a React Native/Expo app using Firebase for authentication with an existing AuthProvider at `@/src/firebase/AuthProvider`. The app supports email/password and guest login. I need to restrict certain write operations to authenticated (non-guest) users only.

## Current Auth Setup

- Auth state is managed via `AuthProvider` with a `useAuth()` hook
- `useAuth()` returns: `{ user, loading, hasCompletedOnboarding, completeOnboarding, signOut }`
- Guest users are identified by `user.isAnonymous === true`
- Using Expo Router for navigation

## Requirements

### 1. Create Auth Guard Modal Component

Create a reusable modal component that prompts users to sign in when they attempt a protected action.

**Location**: `@/src/components/AuthGuardModal.tsx`

**Features**:

- Show modal with clear messaging explaining why sign-in is required
- Two action buttons:
  - "Sign In" - navigates to login screen
  - "Cancel" or "Maybe Later" - closes modal
- Clean, user-friendly design consistent with app theme
- Configurable message prop for context-specific messaging

### 2. Create useAuthGuard Hook

Create a custom hook that checks if a user is authenticated and shows the modal if not.

**Location**: `@/src/hooks/useAuthGuard.ts`

**Functionality**:

```typescript
const useAuthGuard = () => {
  // Returns:
  // - requireAuth: (action: () => void | Promise<void>, message?: string) => void
  // - isAuthenticated: boolean
  // - AuthGuardModal: JSX.Element component to render in parent
};
```

**Behavior**:

- Check if `user` exists and `user.isAnonymous === false`
- If authenticated: execute the action immediately
- If not authenticated: show modal with optional custom message
- Handle both sync and async actions

### 3. Implementation Pattern

Wrap all protected actions with the auth guard:

**Protected Actions (Non-exhaustive list)**:

- Adding movies/shows/people to lists
- Creating custom lists
- Creating reminders
- Rating movies and shows

**UI Behavior**:

- Keep all UI elements visible (buttons, inputs, etc.)
- On click/interaction, check authentication before executing action
- Show auth modal if user is guest/unauthenticated

### 4. Example Usage Patterns

#### Pattern A: In Component with Button

```typescript
const MyComponent = () => {
  const { requireAuth, AuthGuardModal } = useAuthGuard();

  const handleAddToList = () => {
    requireAuth(async () => {
      // Actual add to list logic
      await addMovieToList(movieId, listId);
    }, "Sign in to add items to your lists");
  };

  return (
    <>
      <Button onPress={handleAddToList}>Add to List</Button>
      {AuthGuardModal}
    </>
  );
};
```

#### Pattern B: In Custom Hook

```typescript
// In a custom hook like useAddToList
const useAddToList = () => {
  const { requireAuth } = useAuthGuard();

  const addToList = (movieId: string, listId: string) => {
    requireAuth(async () => {
      // Firebase logic here
    }, 'Sign in to manage your lists');
  };

  return { addToList };
};
```

### 5. Auth Check Logic

- A user is considered **authenticated** if:
  - `user !== null` AND
  - `user.isAnonymous === false`
- Guest users (`user.isAnonymous === true`) are NOT authenticated
- Loading state should not block actions (assume not authenticated if still loading)

### 6. Navigation

- Use `import { router } from 'expo-router'`
- Navigate to login or appropriate auth screen path
- Modal should close after navigation

## Deliverables

1. `AuthGuardModal.tsx` - Modal component
2. `useAuthGuard.ts` - Custom hook
3. Update at least 3-5 existing components/hooks as examples:
   - List management actions
   - Rating functionality
   - Reminder creation
   - Custom list creation
4. Brief documentation on how to apply this pattern to future protected actions

## Design Considerations

- Modal should be dismissible (user can cancel)
- Don't block UI rendering - guests can see everything, just can't modify
- Provide clear, friendly messaging (not punitive)
- Consider adding custom messages per action type for better UX
- Modal should be accessible (proper focus management, screen reader support)

## Testing Notes

- Test with authenticated user (should execute actions directly)
- Test with guest user (should show modal)
- Test with no user/logged out (should show modal)
- Test navigation flow from modal to login and back
