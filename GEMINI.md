# ShowSeek Context for Gemini

## Project Overview

**ShowSeek** is a comprehensive mobile application for discovering, tracking, and managing movies and TV shows. It allows users to browse trending content, maintain watchlists and favorites, rate media, and sync their history with Trakt.

The application is built with **React Native** and **Expo**, utilizing **Firebase** for backend services (Authentication, Firestore) and **TMDB** (The Movie Database) for rich media data. It features a Netflix-inspired dark UI, smooth animations, and native integrations like home screen widgets and quick actions.

## Technology Stack

### Core

- **Framework:** React Native (via Expo SDK 54)
- **Language:** TypeScript
- **Navigation:** Expo Router (File-based routing)
- **State Management:** React Context (Auth, Global State) + React Query (Server State)
- **Build Tooling:** EAS (Expo Application Services)

### Backend & Data

- **Firebase:**
  - **Auth:** Google Sign-In, Email/Password, Anonymous (Guest)
  - **Firestore:** User data (lists, ratings, history)
  - **Cloud Functions:** Backend logic (in `functions/` directory)
- **APIs:**
  - **TMDB:** Primary source for Movie/TV metadata, images, and credits.
  - **Trakt:** Two-way sync for watch history and ratings.

### UI & UX

- **Styling:** Custom "Netflix-inspired" dark theme (managed in `src/constants/theme.ts`).
- **Components:** FlashList (high performance lists), Expo Image, Reanimated 2.
- **Icons:** Lucide React Native, Expo Vector Icons.

### Native Features

- **Notifications:** Release reminders via Expo Notifications.
- **Widgets:** Android home screen widgets (via `@bittingz/expo-widgets`).
- **Quick Actions:** App shortcuts (Expo Quick Actions).
- **Auth:** Native Google Sign-In (Credential Manager).

## Architecture & Directory Structure

The project follows a standard Expo Router structure with source code separation in `src/`.

- **`app/`**: Contains the routing logic and screen entry points.
  - `_layout.tsx`: Root layout and global providers.
  - `(tabs)/`: Main app tab navigation (Home, Discover, Search, Library, Profile).
  - `(auth)/`: Authentication screens (Sign In, Sign Up).
  - `[...unmatched].tsx`: 404 handling.
- **`src/`**: Core application logic.
  - **`api/`**: API clients (e.g., `tmdb.ts` for TMDB endpoints).
  - **`components/`**: Reusable UI components (Modals, Cards, Sections).
  - **`config/`**: App-wide configuration (Trakt, Firebase constants).
  - **`constants/`**: Theme colors, static lists, layout constants.
  - **`context/`**: React Context providers (`auth.ts`, `TraktContext.tsx`).
  - **`firebase/`**: Firebase SDK initialization and helper collections.
  - **`hooks/`**: Custom React hooks (`useLists`, `useReminders`).
  - **`native-widgets/`**: Android widget XML configuration.
  - **`screens/`**: Detailed screen implementations (often imported by `app/` routes).
  - **`services/`**: Business logic classes (`TraktService`, `ListService`).
  - **`types/`**: TypeScript interfaces and types.
  - **`utils/`**: Helper functions.
- **`functions/`**: Firebase Cloud Functions source code (Node.js).

## Key Workflows

### Authentication

- Handled via `src/context/auth.ts`.
- Supports **Google Sign-In** (Native), **Email/Password**, and **Guest Mode**.
- **Per-action auth checks**: Write operations (ratings, lists, etc.) use the `useAuth` hook and `Alert.alert()` within handlers to prompt guest users to sign in.
- Session persistence handled by `AsyncStorage`.

### Data Fetching

- **TMDB Data:** Fetched using `axios` in `src/api/tmdb.ts`. Cached and managed via **React Query** (see hooks like `useMovies`, `useTVShows` - inferred).
- **User Data:** Real-time listeners on Firestore collections (`users/{uid}/...`) via `onSnapshot` in custom hooks (e.g., `useLists`, `useRatings`).

### Trakt Sync

- Logic in `src/services/TraktService.ts`.
- Uses a backend proxy (configured in `src/config/trakt.ts`) to handle OAuth and syncing to avoid exposing secrets.
- Syncs history, ratings, and lists.

## Development Commands

- **Start Dev Server:** `npm start` (or `npx expo start`)
- **Run on Android:** `npm run android`
- **Run on iOS:** `npm run ios`
- **Run on Web:** `npm run web`
- **Linting:** `npm run lint`
- **Formatting:** `npm run format`

## Conventions

- **Imports:** Use absolute path aliases (e.g., `@/src/...`) where possible.
- **Components:** Functional components with Hooks.
- **Styling:** Use `COLORS` from `src/constants/theme.ts` to maintain the dark mode aesthetic.
- **Async Logic:** Prefer `async/await`. Use React Query for server state and Context for global app state.
- **Environment:** Environment variables are managed via `.env` files (accessed via `process.env.EXPO_PUBLIC_...`).
