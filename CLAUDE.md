# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShowSeek is a React Native mobile application built with Expo that allows users to discover, search, and track movies and TV shows. It integrates with The Movie Database (TMDB) API for content data and Firebase for authentication and user data persistence.

## Key Technologies

- **Framework**: Expo (React Native ~0.81, React 19.1)
- **Navigation**: Expo Router (file-based routing with nested tab stacks)
- **State Management**: TanStack Query (@tanstack/react-query) for server state, Zustand for client state
- **Backend Services**: Firebase (Authentication + Firestore)
- **External API**: The Movie Database (TMDB) API
- **UI**: React Native with custom components, @shopify/flash-list for performance, lucide-react-native for icons

## Development Commands

```bash
# Start development server
npm start

# Run on specific platforms
npm run android
npm run ios
npm run web

# Linting and formatting
npm run lint
npm run format

# Reset project (removes example code)
npm run reset-project
```

## Architecture Overview

### Routing Structure (Expo Router)

The app uses **nested tab navigation** where each tab has its own navigation stack:

- `app/_layout.tsx` - Root Stack with QueryClient, AuthProvider, and protected routing logic
- `app/(tabs)/_layout.tsx` - Bottom tab navigator (Home, Search, Discover, Library, Profile)
- `app/(tabs)/home/_layout.tsx` - Nested Stack for Home tab
  - `app/(tabs)/home/index.tsx` - Home screen
  - `app/(tabs)/home/movie/[id]/index.tsx` - Movie details (within Home tab)
  - `app/(tabs)/home/tv/[id]/index.tsx` - TV show details (within Home tab)
  - `app/(tabs)/home/person/[id]/index.tsx` - Person details (within Home tab)
  - `app/(tabs)/home/movie/[id]/cast.tsx` - Cast modal (presentation: modal)
  - `app/(tabs)/home/tv/[id]/cast.tsx` - TV cast modal (presentation: modal)
- Each tab (search, discover, library) has identical nested structures

**Key Navigation Pattern**: Detail screens (movie, TV, person) are duplicated under each tab to maintain independent navigation stacks. This allows users to browse content within each tab without losing their position in other tabs.

### Authentication & Navigation Flow

The root layout (`app/_layout.tsx`) implements protected routing logic:

1. **Onboarding Check**: First-time users are redirected to `/onboarding`
2. **Auth Check**: Onboarded but unauthenticated users go to `/(auth)/sign-in`
3. **Authenticated**: Logged-in users access `/(tabs)/home` main navigation

Onboarding status is stored in AsyncStorage (`hasCompletedOnboarding` key).

**Development Navigation Utilities** (`src/utils/dev-navigation.ts`):

- Optional dev-only navigation helpers for bypassing auth/onboarding during development
- Requires `src/config/dev-config.ts` file (git-ignored) with `ENABLE_DEV_NAVIGATION: true`
- Can force specific screens, skip onboarding, or mock authenticated users
- Automatically disabled in production builds

### State Management Pattern

**TanStack Query** is used for all TMDB API data fetching:

- Configured in `app/_layout.tsx` with 2 retries and 5-minute stale time
- All TMDB API calls should use React Query hooks for caching and automatic refetching

**Firebase Realtime Subscriptions** via custom hooks:

- `src/hooks/useFirestore.ts` exports `useFavorites()`, `useWatchlist()`, and `useRatings()`
- These hooks subscribe to Firestore collections and update in real-time
- Automatically clean up subscriptions when user logs out

### Data Layer Structure

#### TMDB API (`src/api/tmdb.ts`)

- Single source for all TMDB interactions
- Pre-configured axios client with API key from env
- Type definitions for all API responses (Movie, TVShow, Person, etc.)
- Image URL helper: `getImageUrl(path, size)`
- Main API methods exported as `tmdbApi` object

#### Firebase (`src/firebase/`)

- `config.ts` - Firebase initialization (auth, firestore)
- `firestore.ts` - Helper functions for favorites, watchlist, and ratings
- User data structure: `users/{userId}/{favorites|watchlist|ratings}/{mediaId}`

#### Authentication Context (`src/context/auth.ts`)

- Provides: `user`, `loading`, `hasCompletedOnboarding`, `signOut()`, `completeOnboarding()`
- Uses `@nkzw/create-context-hook` pattern for cleaner context creation
- Auto-syncs with Firebase Auth state changes

### Styling System

All styling constants are centralized in `src/constants/theme.ts`:

- **COLORS**: Netflix-inspired dark theme (primary: #E50914)
- **SPACING**: xs (4px) to xxl (48px)
- **BORDER_RADIUS**: s (4px) to round (9999px)
- **FONT_SIZE**: xs (12px) to hero (40px)

Always import and use these constants rather than hardcoding values.

### Component Architecture

**UI Components** (`src/components/ui/`):

- Reusable primitives (Button, LoadingSkeleton)
- Should not contain business logic

**Feature Components** (`src/components/`):

- Domain-specific (MovieCard, TVShowCard, VideoPlayerModal, DiscoverFilters, ImageLightbox)
- Can use hooks and contain feature logic

**Performance Optimization**:

- Use `@shopify/flash-list` (FlashList) instead of FlatList for long lists
- Lazy load images with `expo-image` (Image component)
- Screen freezing enabled via `freezeOnBlur: true` in Stack navigators (prevents unnecessary re-renders)
- Tab screens use `detachInactiveScreens: true` to unmount inactive tabs
- Profile tab uses `unmountOnBlur: true` for privacy/performance

### Tab-Aware Navigation

**TabContext** (`src/contexts/TabContext.tsx`):

- Provides current tab name to nested screens via `useCurrentTab()` hook
- Each tab's `_layout.tsx` wraps its Stack in `<TabProvider tabName="home">` (or search/discover/library)

### TypeScript Configuration

- Path alias `@/*` maps to project root
- Strict mode enabled
- Typed routes enabled (`experiments.typedRoutes: true` in app.json)
- React Compiler experiment enabled (`experiments.reactCompiler: true`)
- New Architecture enabled (`newArchEnabled: true`)

### Environment Variables

Required in `.env` (use `EXPO_PUBLIC_` prefix for client access):

```
EXPO_PUBLIC_TMDB_API_KEY=your_tmdb_api_key
EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
```

## Common Patterns

### Adding a New API Integration

1. Add TypeScript interface to `src/api/tmdb.ts`
2. Create API method in `tmdbApi` object
3. Use with TanStack Query in component: `useQuery({ queryKey: ['...'], queryFn: tmdbApi.method })`

### Adding User Data Persistence

1. Add Firestore helper to `src/firebase/firestore.ts`
2. Create subscription function following `subscribeFavorites` pattern
3. Create custom hook in `src/hooks/useFirestore.ts`
4. Use hook in components for real-time data

### Creating New Screens

**For Tab-Specific Screens** (screens that appear in tab navigation):

1. Identify which tabs need the screen (usually all 4: home, search, discover, library)
2. Add the route file under each tab's directory:
   - `app/(tabs)/home/your-route/[id]/index.tsx`
   - `app/(tabs)/search/your-route/[id]/index.tsx`
   - `app/(tabs)/discover/your-route/[id]/index.tsx`
   - `app/(tabs)/library/your-route/[id]/index.tsx`
3. Configure screen options in each tab's `_layout.tsx` (e.g., `app/(tabs)/home/_layout.tsx`)
4. For modals (like cast lists), use `presentation: 'modal'` option
5. Import `COLORS` from `@/src/constants/theme` for consistent styling

**For Global Screens** (outside tab navigation):

1. Add file directly to `app/` directory
2. Configure in root `app/_layout.tsx`
3. Use `useAuth()` for protected routes

### Working with Media Items

- Movies use `title` and `release_date`
- TV shows use `name` and `first_air_date`
- Check media type: `'title' in item ? 'movie' : 'tv'`

### Navigating Between Screens

**From Tab-Specific Components** (MovieCard, TVShowCard used in multiple tabs):

```typescript
import { useRouter } from 'expo-router';
import { useCurrentTab } from '@/src/hooks/useNavigation';

const router = useRouter();
const currentTab = useCurrentTab();

// Navigate to movie detail within current tab
const path = currentTab ? `/(tabs)/${currentTab}/movie/${movieId}` : `/movie/${movieId}`;
router.push(path as any);
```

**From Tab Root Screens** (where tab is known):

```typescript
import { useRouter } from 'expo-router';

const router = useRouter();
// Direct navigation - path includes tab
router.push(`/(tabs)/home/movie/${movieId}`);
```

## Code Quality Notes

- The app uses React 19.1 with the new React Compiler experiment enabled
- Expo Router's typed routes provide type-safe navigation
- Firebase queries should always clean up subscriptions (return unsubscribe function)
- All TMDB images need full URL construction via `getImageUrl()`
- When creating duplicate screens across tabs, extract shared logic into reusable components to avoid code duplication
