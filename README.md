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
  <a href="#tech-stack">Tech Stack</a>
</p>

---

## Overview

ShowSeek is a modern, feature-rich mobile application built with React Native and Expo that allows users to discover, search, and track movies and TV shows. Powered by The Movie Database (TMDB) API and Firebase, ShowSeek provides a seamless experience for entertainment enthusiasts to manage their watchlists, track episode progress, rate content, and receive release notifications.

## Environment

ShowSeek uses two different environment-variable paths:

- App runtime config lives in the repo root `.env` file. Expo reads `EXPO_PUBLIC_*` variables from this file for the mobile app.
- Firebase Functions secrets such as `TRAKT_CLIENT_SECRET` and `TMDB_API_KEY` are managed with `firebase functions:secrets:set`. These are not stored in repo `.env` files.
- Firebase Functions non-secret runtime variables can be supplied through project-specific files named `functions/.env.<project-id>`. For this project, Firebase CLI loads `functions/.env.showseek-app-2025` during deploys.

Use the root `.env` for app-facing values such as:

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_TRAKT_BACKEND_URL=
EXPO_PUBLIC_TRAKT_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_OMDB_API_KEY=
```

Use `functions/.env.showseek-app-2025` only for non-secret Firebase Functions runtime config that should be applied on deploy, for example:

```bash
TRAKT_SYNC_BYPASS_UIDS=uid1,uid2
TRAKT_ALLOWED_ORIGINS=https://example.com,https://staging.example.com
```

Notes:

- If a functions `.env.<project-id>` file exists only on your machine and is not committed, deploys from your machine will keep using it, but deploys from another machine or CI will not.
- If a value must always be present on future deploys across environments, commit the project-specific functions `.env` file or manage the deploy source another way.
- Do not put secrets in `functions/.env.<project-id>` if they belong in Firebase Functions secrets.

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
