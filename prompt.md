## Overview

Implement a notes feature that allows users to write personal notes for movies and TV shows. This is a premium feature that uses Firebase Firestore for storage.

## Implementation Requirements

### 1. TypeScript Types

Create type definitions:

```typescript
export interface Note {
  id: string;
  userId: string;
  mediaType: 'movie' | 'tv';
  mediaId: number;
  content: string;
  posterPath: string | null;
  mediaTitle: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteInput {
  mediaType: 'movie' | 'tv';
  mediaId: number;
  content: string;
  posterPath: string | null;
  mediaTitle: string;
}
```

### 2. Firebase Service

Create Firestore service for notes:

- Collection path: `/users/{userId}/notes/{noteId}`
- Document ID format: `{mediaType}-{mediaId}` (e.g., "movie-550", "tv-1396")
- Functions needed:
  - `saveNote(userId: string, noteData: NoteInput): Promise<void>`
  - `getNote(userId: string, mediaType: string, mediaId: number): Promise<Note | null>`
  - `getNotes(userId: string): Promise<Note[]>` (ordered by createdAt desc)
  - `deleteNote(userId: string, mediaType: string, mediaId: number): Promise<void>`
- Use Firebase Timestamp for dates
- Export all functions

### 3. Custom Hook

Create a hook that:

- Uses `useAuth()` to get current user
- Provides CRUD operations:
  - `saveNote(noteData: NoteInput): Promise<void>`
  - `getNote(mediaType: string, mediaId: number): Promise<Note | null>`
  - `getAllNotes(): Promise<Note[]>`
  - `deleteNote(mediaType: string, mediaId: number): Promise<void>`
- Handles loading states
- Handles errors with try/catch
- Returns: `{ saveNote, getNote, getAllNotes, deleteNote, loading, error }`

### 4. Note Sheet Component

Create a TrueSheet modal component with:

**Props:**

```typescript
interface NoteSheetProps {
  sheetRef: React.RefObject<TrueSheet>;
  mediaType: 'movie' | 'tv';
  mediaId: number;
  posterPath: string | null;
  mediaTitle: string;
  initialNote?: string;
  onSave: () => void;
}
```

**Features:**

- TextInput with multiline, 120 character limit
- Character counter showing "X/120" below textarea (visible as user types)
- "Save" and "Cancel" buttons at bottom
- "Delete" button in top right (only visible if `initialNote` exists)
- Premium gating check before saving (show premium modal if not premium)
- Use `useNotes()` hook for save/delete operations
- Close sheet after successful save/delete
- Use theme colors from `/src/constants/theme.ts`
- Style similar to existing modal components in the project

**Layout:**

```
┌─────────────────────────┐
│  [Notes]      [Delete]  │ <- Header with delete button (conditional)
│                         │
│  ┌───────────────────┐  │
│  │                   │  │
│  │   TextArea        │  │
│  │                   │  │
│  └───────────────────┘  │
│        X/120            │ <- Character counter
│                         │
│  [Save]      [Cancel]   │ <- Action buttons
└─────────────────────────┘
```

### 5. Detail Screen Integration

**Files to modify:**

- `/src/screens/MovieDetailScreen.tsx`
- `/src/screens/TVDetailScreen.tsx`

**Changes:**

1. Import `NoteSheet` and `useNotes` hook
2. Create ref: `const noteSheetRef = useRef<TrueSheet>(null)`
3. Fetch existing note on mount using `getNote()`
4. Add a "Notes" button in the action row (alongside existing action buttons)
5. Button shows pencil/edit icon if note exists, or plus/add icon if no note
6. Tapping button opens `NoteSheet` with appropriate props
7. After save, refetch the note to update button icon

**Button styling:** Match existing action buttons in the detail screens

### 6. Notes Screen

Create a full screen component that:

**Features:**

- Header with title "Notes" and back button
- FlatList/ScrollView showing all user notes (use `getAllNotes()`)
- Empty state when no notes exist
- Loading state while fetching notes

**Each Note Card should show:**

- Media poster image (use existing `MediaImage` component if available)
- Media title
- Note preview (truncated to ~60 chars with "..." if longer)
- Timestamp (format: "X days ago" or actual date)
- Delete icon button in top right corner
- Tapping card opens `NoteSheet` for editing
- Tapping delete icon shows confirmation alert then deletes

**Premium Check:**

- Check `isPremium` on mount
- If not premium, show premium gate/paywall
- Only show notes if user is premium

### 7. Library Screen Integration

**File to modify:** The library screen (likely `/src/screens/LibraryScreen.tsx` or in `app/(tabs)/library.tsx`)

**Changes:**

1. In the "Lists and Stats" section, add a "Notes" button/row
2. Tapping navigates to Notes screen using Expo Router: `router.push('/notes')`
3. Style to match existing list items in that section

### 8. Routing Setup

**File to create:** `app/(tabs)/notes.tsx` or `app/notes.tsx` (depending on where library screen is)

```typescript
import NotesScreen from '@/src/screens/NotesScreen';
export default NotesScreen;
```

## Design & Styling Guidelines

- Use `StyleSheet.create()` for all styles
- Import `COLORS` from `/src/constants/theme.ts`
- Match existing component styling patterns
- Use existing `Button` component from `/src/components/ui/Button.tsx` where appropriate
- Ensure proper spacing, padding, and margins consistent with app design
- TextInput should have clear borders and proper focus states
- Character counter should be subtle but visible

## Premium Gating Implementation

```typescript
import { usePremium } from '@/src/context/PremiumContext';

const { isPremium } = usePremium();

// Before saving note:
if (!isPremium) {
  // Show premium modal/alert
  Alert.alert('Premium Feature', 'Notes are a premium feature. Upgrade to unlock!');
  return;
}
```

## Error Handling

- All Firebase operations should be wrapped in try/catch
- Show user-friendly error messages using Alert or Toast
- Handle network errors gracefully
- Log errors to console for debugging

## Testing Checklist

After implementation, verify:

- [ ] Can create a note from movie detail screen
- [ ] Can create a note from TV detail screen
- [ ] Character limit enforced at 120 chars
- [ ] Character counter updates in real-time
- [ ] Can edit existing notes
- [ ] Can delete notes from sheet modal
- [ ] Can delete notes from notes screen
- [ ] Notes screen shows all user notes correctly
- [ ] Empty state displays when no notes exist
- [ ] Premium gating works (non-premium users blocked)
- [ ] Notes persist after app restart
- [ ] Proper loading states throughout
- [ ] Navigation works correctly

## Additional Notes

- Keep components modular and reusable
- Follow existing code conventions in the project
- Ensure TypeScript types are properly defined
- Add proper comments for complex logic
- Consider accessibility (proper labels, touch targets)

## Firebase Security Rules

Ensure Firestore rules include:

```
match /users/{userId}/notes/{noteId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

---

**Implementation Priority:**

1. Types and Firebase service
2. useNotes hook
3. NoteSheet component
4. Detail screen integration
5. Notes screen
6. Library screen integration
7. Testing and polish

8. this component exists
9. yes this exists, scan the code
10. whatever you recommend
11. in the same row as add to list, rating, etc. but i want you to move all the actions buttons except the "watch trailer" button and put them on a separate row above the "watch trailer" button. so you would have all the other action buttons (rating, add to list, reminder, notes) in one line and then the "watch trailer" button below them on the next line. do you understand?
12. yes explore
