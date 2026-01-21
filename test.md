# Testing Implementation Plan

This document outlines the plan to implement a robust testing suite for the ShowSeek application. The goal is to establish confidence in the codebase through Unit Testing (logic/utils) and Integration/Component Testing (UI/Interactions).

## Context & Tech Stack
- **Framework:** React Native (Expo)
- **State:** React Context, React Query
- **External Services:** Firebase (Auth, Firestore), TMDB API
- **Testing Tools:** 
  - `jest` (Test Runner)
  - `jest-expo` (Expo preset for Jest)
  - `@testing-library/react-native` (Component mounting & interaction)
  - `@testing-library/jest-native` (Custom matchers)

---

## Phase 1: Infrastructure & Configuration

**Objective:** Install dependencies and configure the test environment to work with Expo and TypeScript.

### 1.1 Install Dependencies
Install the following as `devDependencies`:
- `jest`
- `jest-expo`
- `@testing-library/react-native`
- `@testing-library/jest-native`
- `react-test-renderer` (must match React version)
- `@types/jest`
- `ts-jest` or `babel-jest` (usually handled by `jest-expo`)

### 1.2 Configuration
1.  **`package.json`**: Add a `test` script: `"test": "jest"`.
2.  **`jest.config.js`**: Create the config file using the `jest-expo` preset.
    -   Setup `transformIgnorePatterns` to handle Expo and React Native libraries.
    -   Configure `setupFilesAfterEnv` for global mocks.
3.  **`jest.setup.js`**: Create a setup file to:
    -   Mock `AsyncStorage`.
    -   Mock `react-native-reanimated`.
    -   Mock `expo-router` navigation.
    -   Extend matchers from `@testing-library/jest-native`.

---

## Phase 2: Unit Testing (Logic & Hooks)

**Objective:** Verify business logic isolated from the UI.

### 2.1 Utility Functions
Target directory: `src/utils/`
-   **Tests to write:**
    -   Date formatters (check for different locales).
    -   Data transformers (e.g., mapping TMDB responses).
    -   Validation helpers.

### 2.2 Custom Hooks
Target directory: `src/hooks/`
-   **Strategy:** Use `renderHook` from `@testing-library/react-native`.
-   **Tests to write:**
    -   `useLists`: Mock Firestore responses and verify list processing.
    -   `useReminders`: Test scheduling logic (mocking `expo-notifications`).
    -   **Important:** Mock `react-query`'s `useQuery` / `useMutation` where used inside hooks.

---

## Phase 3: Component Testing (UI Library)

**Objective:** Ensure reusable components render correctly and handle user interactions.

Target directory: `src/components/`
-   **Strategy:** Use `render` and `fireEvent`.
-   **Key Components to Test:**
    -   `RatingButton.tsx`: Check render states (rated vs unrated) and press events.
    -   `SeasonCard.tsx`: Verify prop display (title, episode count).
    -   `VideoPlayerModal.tsx`: Ensure modal visibility toggles correctly.

---

## Phase 4: Integration Testing (Screens & Context)

**Objective:** Test flows that involve multiple components and context providers.

### 4.1 Mocking the Network & Context
-   **Providers:** Create a `renderWithProviders` helper that wraps the component in:
    -   `QueryClientProvider` (with a test client).
    -   `LanguageProvider` (mocked).
    -   `AuthContext` (mocked user state).
-   **APIs:** Mock `src/api/tmdb.ts` and `src/firebase/*` functions. Do *not* make real network requests.

### 4.2 Screen Tests
Target directory: `src/screens/` or `app/`
-   **Tests to write:**
    -   **Sign In Screen:** Fill inputs -> Press Submit -> Verify Auth function called.
    -   **Movie Detail Screen:** Pass a mock movie ID -> Verify API call -> Check title/description render.

---

## Execution Guidelines for AI Agent

1.  **Mock Early:** Since the app relies heavily on Firebase and TMDB, ensure a `__mocks__` folder or manual mocks are established for these services immediately to avoid network errors during tests.
2.  **Snapshot Testing:** Use snapshots sparingly (e.g., for static icons or simple UI cards) to avoid brittle tests. Prefer asserting on text content or accessibility labels.
3.  **File Structure:** Place tests alongside source files (e.g., `src/utils/date.ts` -> `src/utils/__tests__/date.test.ts`) or in a root `__tests__` directory mirroring the source structure.
