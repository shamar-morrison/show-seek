# Technology Stack

## Core Framework
- **Runtime:** React Native (via Expo SDK 54)
- **Language:** TypeScript
- **Navigation:** Expo Router (File-based routing)

## State Management
- **Server State:** React Query (`@tanstack/react-query`) for API data caching and synchronization.
- **Client State:** React Context (for global app state like Authentication and Theme).

## Backend & Services
- **Backend-as-a-Service:** Firebase
  - **Authentication:** Firebase Auth (Google Sign-In, Email/Password, Anonymous)
  - **Database:** Cloud Firestore
  - **Serverless:** Cloud Functions (Node.js)
- **External APIs:**
  - **TMDB:** Primary source for Movie and TV metadata.
  - **Trakt:** Two-way synchronization for watch history and ratings.

## UI & UX
- **Component Library:** React Native Paper (Base), Custom Components
- **Icons:** Lucide React Native, Expo Vector Icons
- **Lists:** `@shopify/flash-list` for high-performance large lists.
- **Animations:** React Native Reanimated
- **Styling:** StyleSheet (Native)

## Data Fetching
- **Client:** Axios

## Development Tooling
- **Package Manager:** pnpm
- **Build Service:** EAS (Expo Application Services)
