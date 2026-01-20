---
trigger: model_decision
description: Activate these rules when the user requests feature implementation, complex refactoring, or architectural changes. specifically involving Expo Router, Firebase, or the TMDB API. Do not apply for simple bug fixes, one-off scripts or general questions
---

# Development Rules for ShowSeek

These rules must be followed when implementing features or refactoring code to ensure consistency, performance, and maintainability.

## 1. Architecture & State Management

- **Server State (React Query):** use `@tanstack/react-query` for all async data fetching (TMDB, Trakt).
  - Define query keys consistently (e.g., `['movie', id, 'details']`).
  - Use `staleTime` and `gcTime` appropriately to cache data.
- **Global State (Context):** Use React Context only for truly global app state (e.g., `AuthContext`, `ThemeContext`, `TabContext`). Avoid putting frequently changing data in Context to prevent unnecessary re-renders.
- **Local State:** Use `useState` or `useReducer` for component-local state.
- **Separation of Concerns:**
  - **API Layer (`src/api/`):** Pure functions that make HTTP requests. No React logic.
  - **Services (`src/services/`):** Business logic and Firebase interactions. No UI code.
  - **Hooks (`src/hooks/`):** Connects components to API/Services/Context. Handles side effects and data transformation.
  - **Screens (`src/screens/` or `app/`):** Composes components and hooks. Minimal logic.
  - **Components (`src/components/`):** Reusable UI elements. Receives data via props.

## 2. Navigation (Expo Router)

- **Structure:** Follow the file-based routing in `app/`.
- **Type Safety:** Use typed routes where possible, though Expo Router is dynamic.
- **Navigation:** Use `useRouter` hook.
  - `router.push('/path')` for navigating forward.
  - `router.replace('/path')` for redirects.
  - `router.back()` for going back.
- **Deep Linking:** Ensure screens handle params (e.g., `id`) gracefully using `useLocalSearchParams`.

## 3. Styling & Theming

- **Strict Constants:** **NEVER** hardcode hex colors or magic numbers. Always use:
  - `COLORS` from `@/src/constants/theme`
  - `SPACING` from `@/src/constants/theme`
  - `BORDER_RADIUS` from `@/src/constants/theme`
  - `FONT_SIZE` from `@/src/constants/theme`
- **StyleSheets:** Use `StyleSheet.create({})` for performance. Avoid inline styles unless dynamic (e.g., animations).
- **Dark Mode:** The app is "Netflix-inspired" dark mode by default. Ensure high contrast and correct text colors (`COLORS.text` vs `COLORS.textSecondary`).
- **SafeArea:** Use `SafeAreaView` (from `react-native-safe-area-context`) or handle insets manually for full-screen immersive views.

## 4. Components & UI Patterns

- **Functional Components:** Use `export default function ComponentName() {}`.
- **Icons:** Use `lucide-react-native` as the primary icon set.
- **Lists:**
  - Use `FlashList` (from `@shopify/flash-list`) for long lists (performance).
  - Use `FlatList` or `ScrollView` for simpler, shorter lists.
- **Images:** Use `Expo Image` (`expo-image`) for better caching and performance.
- **Animations:** Use `react-native-reanimated` for complex animations.

## 5. Firebase & Backend

- **Security:** Never expose API keys or sensitive logic on the client.
- **Services:** Encapsulate Firestore operations in `src/services/`.
  - Example: `RatingService.ts` handles `setDoc`, `deleteDoc`.
- **Optimistic Updates:** When mutating data (e.g., rating a movie), update the UI immediately using React Query's `onMutate` before the server responds.

## 6. TypeScript

- **Strict Typing:** No `any`. Define interfaces in `src/types/`.
- **Props:** Define `interface Props` for all components.
- **API:** ensure API responses are typed (e.g., `MovieDetails`, `PaginatedResponse<T>`).

## 7. Implementation Workflow

For complex features, follow this sequence:

1.  **Types:** Define data structures in `src/types/`.
2.  **API/Service:** Implement data fetching or backend logic.
3.  **Hooks:** Create custom hooks to expose data/logic to components.
4.  **Components:** Build reusable UI blocks.
5.  **Screen:** Assemble the screen.
6.  **Integration:** Add to `app/` router.

## 8. Error Handling

- **User Feedback:** Use `Toast` (ref) for success/error messages.
- **Fallbacks:** Show `Skeleton` loaders while loading and Error states (with "Retry" button) on failure.
- **Console:** Log errors with descriptive tags (e.g., `[MovieDetailScreen] Failed to load...`).
