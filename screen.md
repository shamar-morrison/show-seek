# Feature Specification: Default Launch Screen

## Objective
Implement a feature allowing authenticated users (non-guest) to customize which screen the application opens to upon launch (e.g., Home, Discover, Library). This preference must be persisted to Firestore and applied during the initial app routing.

## 1. Data Model & Types

**File:** `src/types/preferences.ts`

- Define the valid routes for launch.
- Update `UserPreferences` interface.
- Update `DEFAULT_PREFERENCES`.

```typescript
export type LaunchScreenRoute = 
  | '/(tabs)/home' 
  | '/(tabs)/discover' 
  | '/(tabs)/search' 
  | '/(tabs)/library' 
  | '/(tabs)/profile';

export interface UserPreferences {
  // ... existing properties
  defaultLaunchScreen?: LaunchScreenRoute;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  // ... existing defaults
  defaultLaunchScreen: '/(tabs)/home',
};
```

## 2. Service Layer Updates

**File:** `src/services/PreferencesService.ts`

- Ensure the `subscribeToPreferences` method maps the new `defaultLaunchScreen` field from the Firestore snapshot to the local state object.

## 3. UI Implementation

### A. New Selection Screen
**File:** `app/(tabs)/profile/default-launch-screen.tsx` (Create this file)

- **Layout:** Similar to `LanguageSettingsScreen` or `LanguageSelectorModal`.
- **Content:** A list of available tabs with friendly names.
- **Functionality:**
    - Use `usePreferences` to get current value.
    - Use `useUpdatePreference` to save selection.
    - Show a checkmark next to the active selection.
- **Options List:**
  ```typescript
  const SCREEN_OPTIONS = [
    { label: 'Home', value: '/(tabs)/home', icon: Home }, // Import Lucide icons
    { label: 'Discover', value: '/(tabs)/discover', icon: Compass },
    { label: 'Search', value: '/(tabs)/search', icon: Search },
    { label: 'Library', value: '/(tabs)/library', icon: Bookmark },
    { label: 'Profile', value: '/(tabs)/profile', icon: User },
  ];
  ```

### B. Profile Screen Entry Point
**File:** `app/(tabs)/profile/index.tsx`

- Add a new `TouchableOpacity` item in the "Preferences" section.
- **Visibility:** Only show for authenticated users (hide if `user.isAnonymous` is true).
- **Interaction:** Navigate to `/(tabs)/profile/default-launch-screen` on press.
- Display the currently selected screen name (e.g., "Home") on the right side of the button using the `languageIndicator` style for consistency.

## 4. App Launch Logic

**File:** `app/_layout.tsx`

- Locate the `RootLayoutNav` component.
- Currently, the redirect logic hardcodes the destination:
  ```typescript
  router.replace('/(tabs)/home');
  ```
- **Update Logic:**
  1. Fetch `preferences` using the `usePreferences` hook inside `RootLayoutNav`.
  2. Modify the redirect to use `preferences.defaultLaunchScreen`.
  3. Ensure a fallback to `'/(tabs)/home'` if the preference is undefined or if the user is a guest (since preferences might default or not be fully loaded).

## 5. Acceptance Criteria

1.  **Persistence:** Changing the setting updates Firestore and persists across app restarts.
2.  **Access Control:** Available to all logged-in users. Hidden or disabled for Guest users.
3.  **Routing:** Killing the app and reopening it (while logged in) redirects the user to the selected screen instead of always defaulting to Home.
4.  **UI Consistency:** The selection screen matches the design of other settings screens (e.g., Language Settings).
