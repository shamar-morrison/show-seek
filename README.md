# ShowSeek

<p align="center">
  <img src="./assets/images/icon.png" alt="ShowSeek Logo" width="120" height="120" />
</p>

<p align="center">
  <strong>Discover, Track & Never Miss Your Favorite Movies and TV Shows</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#project-structure">Project Structure</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Overview

ShowSeek is a modern, feature-rich mobile application built with React Native and Expo that allows users to discover, search, and track movies and TV shows. Powered by The Movie Database (TMDB) API and Firebase, ShowSeek provides a seamless experience for entertainment enthusiasts to manage their watchlists, track episode progress, rate content, and receive release notifications.

## Features

### 🎬 **Discover & Search**

- Browse trending, popular, and top-rated movies and TV shows
- Advanced search with filters for genres, release dates, and ratings
- Discover new content with personalized recommendations
- View detailed information including cast, crew, trailers, and reviews

### 📺 **TV Show Episode Tracking**

- Track watched episodes on a per-episode basis
- View progress for individual seasons and overall show completion
- Season-by-season breakdown with episode details
- Automatic exclusion of unaired episodes from progress calculations

### 📋 **Custom Lists**

- Create and manage custom lists (beyond favorites and watchlist)
- Default lists: Favorites, Watchlist, and Dropped
- Add movies and TV shows to multiple lists
- Organize your entertainment library your way

### ⭐ **Ratings System**

- Rate movies and TV shows on a 10-star scale
- View your rating history sorted by most recent
- Track all your rated content in one place

### 🔔 **Release Reminders**

- Set reminders for upcoming movie releases
- TV show reminders with flexible frequency options:
  - Every episode notifications
  - Season premiere notifications
- Customizable reminder timing (1 day before, 1 week before, on release day)

### 👤 **Person Profiles**

- Explore detailed actor and crew profiles
- View filmography and known works
- Add favorite actors/directors for quick access

### 🎨 **Premium UI/UX**

- Netflix-inspired dark theme design
- Smooth animations and transitions
- Performance-optimized lists with FlashList
- Image lightbox for photos and backdrops
- Video trailers with in-app playback

### 🔐 **User Accounts**

- Firebase Authentication (Email/Password, Guest mode)
- Real-time data sync across devices
- Secure user data with Firestore
- Guest users can browse; authenticated users can save data

## Tech Stack

### Core Framework

| Technology   | Version | Purpose              |
| ------------ | ------- | -------------------- |
| React Native | 0.81.5  | Mobile app framework |
| Expo         | 54.0    | Development platform |
| React        | 19.1    | UI library           |
| TypeScript   | 5.9     | Type safety          |

### Navigation & State

| Technology     | Purpose                                 |
| -------------- | --------------------------------------- |
| Expo Router    | File-based navigation with typed routes |
| TanStack Query | Server state management & caching       |

### Backend Services

| Technology      | Purpose              |
| --------------- | -------------------- |
| Firebase Auth   | User authentication  |
| Cloud Firestore | Real-time database   |
| TMDB API        | Movie & TV show data |

### UI & Performance

| Technology              | Purpose                 |
| ----------------------- | ----------------------- |
| FlashList               | High-performance lists  |
| Expo Image              | Optimized image loading |
| Lucide React Native     | Icon library            |
| Expo Notifications      | Push notifications      |
| React Native Reanimated | Smooth animations       |
| Expo Video              | Video playback          |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator
- TMDB API Key ([Get one here](https://www.themoviedb.org/settings/api))
- Firebase Project ([Create one here](https://console.firebase.google.com/))

### Installation

1.  **Clone the repository**

    ```bash
    git clone https://github.com/yourusername/show-seek.git
    cd show-seek
    ```

2.  **Install dependencies**

    ```bash
    npm install
    ```

3.  **Configure environment variables**

    Create a `.env` file in the root directory:

    ```env
    EXPO_PUBLIC_TMDB_API_KEY=your_tmdb_api_key
    EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
    EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
    EXPO_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
    ```

4.  **Start the development server**

    ```bash
    npm start
    ```

5.  **Run on your device**
    - Press `i` for iOS Simulator
    - Press `a` for Android Emulator
    - Scan QR code with Expo Go app for physical device

### Available Scripts

```bash
# Start development server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Run on web
npm run web

# Lint code
npm run lint

# Format code
npm run format
```

## Project Structure

```
show-seek/
├── app/                          # Expo Router pages
│   ├── (auth)/                   # Authentication screens
│   │   ├── sign-in.tsx
│   │   └── sign-up.tsx
│   ├── (tabs)/                   # Bottom tab navigation
│   │   ├── home/                 # Home tab with nested stack
│   │   │   ├── index.tsx         # Home screen
│   │   │   ├── movie/[id]/       # Movie details
│   │   │   ├── tv/[id]/          # TV show details
│   │   │   └── person/[id]/      # Person details
│   │   ├── search/               # Search tab
│   │   ├── discover/             # Discover tab
│   │   ├── library/              # Library tab
│   │   └── profile.tsx           # Profile screen
│   ├── _layout.tsx               # Root layout
│   ├── onboarding.tsx            # Onboarding flow
│   └── manage-lists.tsx          # List management
│
├── src/
│   ├── api/
│   │   └── tmdb.ts               # TMDB API client & types
│   │
│   ├── components/
│   │   ├── ui/                   # Reusable UI primitives
│   │   ├── detail/               # Detail screen components
│   │   ├── library/              # Library-specific components
│   │   ├── cards/                # Card components
│   │   └── reminder/             # Reminder components
│   │
│   ├── constants/
│   │   └── theme.ts              # Design system tokens
│   │
│   ├── context/
│   │   └── auth.ts               # Authentication context
│   │
│   ├── firebase/
│   │   ├── config.ts             # Firebase initialization
│   │   └── firestore.ts          # Firestore helpers
│   │
│   ├── hooks/                    # Custom React hooks
│   │   ├── useLists.ts           # List management
│   │   ├── useRatings.ts         # Rating system
│   │   ├── useEpisodeTracking.ts # Episode tracking
│   │   ├── useReminders.ts       # Release reminders
│   │   └── useAuthGuard.tsx      # Protected actions
│   │
│   ├── screens/                  # Screen components
│   │   ├── MovieDetailScreen.tsx
│   │   ├── TVDetailScreen.tsx
│   │   ├── PersonDetailScreen.tsx
│   │   └── ...
│   │
│   ├── services/                 # Business logic services
│   │   ├── ListService.ts        # Custom lists
│   │   ├── RatingService.ts      # Ratings
│   │   ├── EpisodeTrackingService.ts
│   │   ├── ReminderService.ts    # Notifications
│   │   └── ...
│   │
│   └── types/                    # TypeScript type definitions
│
├── assets/
│   └── images/                   # App icons and images
│
├── firestore.rules               # Firebase security rules
├── firebase.json                 # Firebase configuration
├── app.json                      # Expo configuration
└── package.json                  # Dependencies
```

## Architecture Highlights

### Navigation Pattern

ShowSeek uses **nested tab navigation** where each tab maintains its own navigation stack. This allows users to browse content within each tab without losing their position in other tabs.

### State Management

- **TanStack Query**: All TMDB API data with 5-minute stale time and 2 retries
- **Firebase Subscriptions**: Real-time updates for user data (lists, ratings, etc.)

### Data Flow

```
TMDB API ─────────────────┐
                          │
                          ▼
              ┌───────────────────┐
              │   TanStack Query  │  ◄── Caching & Refetching
              └───────────────────┘
                          │
                          ▼
              ┌───────────────────┐
              │   React Components│
              └───────────────────┘
                          │
                          ▼
              ┌───────────────────┐
              │  Firebase Services│  ◄── Real-time Subscriptions
              └───────────────────┘
                          │
                          ▼
              ┌───────────────────┐
              │    Firestore DB   │
              └───────────────────┘
```

### Design System

All styling constants are centralized in `constants/theme.ts`:

- **Colors**: Netflix-inspired dark theme (Primary: #E50914)
- **Spacing**: 4px to 48px scale
- **Typography**: 12px to 40px scale
- **Border Radius**: Consistent rounded corners

## Firebase Data Structure

```
users/{userId}/
├── displayName, email, photoURL, preferences
├── lists/{listId}
│   └── name, items: { [mediaId]: ListMediaItem }, createdAt
├── ratings/{mediaType-mediaId}
│   └── rating, ratedAt
├── episode_tracking/{tvShowId}
│   └── episodes: { [seasonNum_episodeNum]: EpisodeData }, metadata
├── reminders/{reminderId}
│   └── mediaType, mediaId, title, releaseDate, reminderTiming, status
└── favorite_persons/{personId}
    └── id, name, addedAt
```

## Security

- All Firestore operations include 10-second timeout protection
- Firebase security rules ensure users can only access their own data
- Guest users have read-only access; write operations require authentication
- Auth guards protect sensitive actions with user-friendly prompts

## Building for Production

### Android

```bash
# Install EAS CLI
npm install -g eas-cli

# Build for Android
eas build --platform android
```
