# AI Code Agent Prompt: Implement Trakt Sync in React Native/Expo

## 🎯 Objective

Implement Trakt integration in our React Native/Expo movie/TV tracking app. This includes OAuth authentication flow, sync functionality, and UI components. The backend API is already deployed at `https://trakt-proxy.vercel.app/`.

## 📋 Requirements Overview

### What to Build:

1. **Trakt Settings Screen** - Connect/disconnect Trakt, view sync status
2. **OAuth Flow** - Handle Trakt authentication using WebBrowser
3. **Sync Functionality** - Trigger and monitor data synchronization
4. **Sync Status Indicator** - Show sync progress in UI
5. **Context/State Management** - Manage Trakt connection state

---

## 🏗️ Implementation Details

### 1. Create Trakt Context (State Management)

**File**: `src/context/trakt.tsx`

Create a context to manage Trakt connection state across the app.

**Requirements**:

- Use the same pattern as existing `AuthProvider` (using `@nkzw/create-context-hook`)
- Track: `isConnected`, `isSyncing`, `lastSyncedAt`, `syncStatus`
- Store connection state in AsyncStorage for persistence
- Provide functions: `connectTrakt()`, `disconnectTrakt()`, `syncNow()`, `checkSyncStatus()`

**State Shape**:

```typescript
interface TraktState {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncStatus: {
    status: 'idle' | 'in_progress' | 'completed' | 'failed';
    itemsSynced?: {
      movies: number;
      shows: number;
      episodes: number;
      ratings: number;
      lists: number;
      favorites: number;
      watchlistItems: number;
    };
    errors?: string[];
  } | null;
}
```

**AsyncStorage Keys**:

- `@trakt_connected` - boolean
- `@trakt_last_synced` - ISO date string
- `@trakt_sync_status` - JSON stringified sync status

---

### 2. Create Trakt API Service

**File**: `src/services/trakt.ts`

Create functions to interact with our Next.js backend.

**Required Functions**:

```typescript
/**
 * Initiate OAuth flow
 * Opens Trakt authorization page in browser
 */
export async function initiateOAuthFlow(userId: string): Promise<void>;

/**
 * Trigger data sync
 * Calls POST /api/trakt/sync
 */
export async function triggerSync(userId: string): Promise<void>;

/**
 * Check sync status
 * Calls GET /api/trakt/sync?userId=xxx
 */
export async function checkSyncStatus(userId: string): Promise<SyncStatus>;

/**
 * Disconnect Trakt
 * Calls POST /api/trakt/disconnect
 */
export async function disconnectTrakt(userId: string): Promise<void>;
```

**Implementation Notes**:

- Use `expo-web-browser` for OAuth flow
- Backend URL should come from environment variable or config
- Handle errors gracefully with try/catch
- Use proper TypeScript types

---

### 3. Create Trakt Settings Screen

**File**: `src/screens/TraktSettingsScreen.tsx`

A dedicated screen for Trakt integration settings.

**UI Requirements**:

When **NOT connected**:

```
┌─────────────────────────────────────┐
│  Connect with Trakt                 │
│                                     │
│  [Trakt Logo Icon]                  │
│                                     │
│  Sync your movie and TV show        │
│  history from Trakt.                │
│                                     │
│  ┌─────────────────────────────┐   │
│  │   Connect to Trakt          │   │
│  └─────────────────────────────┘   │
│                                     │
│  What will be synced:               │
│  ✓ Watched movies & shows           │
│  ✓ Ratings                          │
│  ✓ Custom lists                     │
│  ✓ Watchlist                        │
│  ✓ Favorites                        │
│  ✓ Episode progress                 │
└─────────────────────────────────────┘
```

When **connected but not synced yet**:

```
┌─────────────────────────────────────┐
│  Connected to Trakt ✓               │
│                                     │
│  Your Trakt account is connected    │
│  but not synced yet.                │
│                                     │
│  ┌─────────────────────────────┐   │
│  │   Import from Trakt         │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Disconnect]                       │
└─────────────────────────────────────┘
```

When **syncing**:

```
┌─────────────────────────────────────┐
│  Syncing with Trakt...              │
│                                     │
│  [Progress Spinner]                 │
│                                     │
│  Importing your watch history       │
│                                     │
│  This may take a few minutes...     │
└─────────────────────────────────────┘
```

When **synced**:

```
┌─────────────────────────────────────┐
│  Trakt Connected ✓                  │
│                                     │
│  Last synced: 2 hours ago           │
│                                     │
│  Synced Items:                      │
│  • 150 movies                       │
│  • 45 shows                         │
│  • 892 episodes                     │
│  • 120 ratings                      │
│  • 5 lists                          │
│  • 30 favorites                     │
│                                     │
│  ┌─────────────────────────────┐   │
│  │   Sync Now                  │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Disconnect Trakt]                 │
└─────────────────────────────────────┘
```

**Component Structure**:

```tsx
<TraktSettingsScreen>
  {!isConnected && <ConnectSection />}
  {isConnected && !lastSyncedAt && <InitialSyncSection />}
  {isSyncing && <SyncingSection />}
  {isConnected && lastSyncedAt && <SyncedSection />}
</TraktSettingsScreen>
```

---

### 4. Implement OAuth Flow

**Function**: `handleConnectTrakt()` in TraktSettingsScreen

**Steps**:

1. Get current user ID from `useAuth()` context
2. Build authorization URL:
   ```typescript
   const authUrl =
     `https://trakt.tv/oauth/authorize?` +
     `response_type=code&` +
     `client_id=${TRAKT_CLIENT_ID}&` +
     `redirect_uri=${TRAKT_REDIRECT_URI}&` +
     `state=${userId}`;
   ```
3. Open in WebBrowser:
   ```typescript
   const result = await WebBrowser.openAuthSessionAsync(authUrl, TRAKT_REDIRECT_URI);
   ```
4. Handle result:
   - If successful: Backend handles token exchange
   - Wait 2 seconds, then check connection status
   - Update UI accordingly

**Important Constants** (create a config file):

```typescript
// src/config/trakt.ts
export const TRAKT_CONFIG = {
  CLIENT_ID: 'your_trakt_client_id',
  REDIRECT_URI: 'https://trakt-proxy.vercel.app/api/trakt/callback',
  BACKEND_URL: 'https://trakt-proxy.vercel.app/',
};
```

---

### 5. Implement Sync Flow

**Function**: `handleSync()` in TraktSettingsScreen

**Steps**:

1. Set `isSyncing` to true
2. Call `triggerSync(userId)` from service
3. Poll `checkSyncStatus(userId)` every 3 seconds until complete
4. Update UI with progress
5. Set `isSyncing` to false when done
6. Show success/error message

**Polling Logic**:

```typescript
const pollSyncStatus = async () => {
  const interval = setInterval(async () => {
    const status = await checkSyncStatus(userId);

    if (status.status === 'completed' || status.status === 'failed') {
      clearInterval(interval);
      setIsSyncing(false);
      // Update context with final status
    }
  }, 3000); // Poll every 3 seconds
};
```

---

### 6. Add Navigation Entry

**File**: Update your navigation stack

Add Trakt Settings to your app's profile section:

```tsx
// In your  ProfileScreen
<TouchableOpacity onPress={() => navigation.navigate('TraktSettings')}>
  <View style={styles.settingItem}>
    <Icon name="trakt" /> {/* Or use a sync icon */}
    <Text>Trakt Integration</Text>
  </View>
</TouchableOpacity>
```

Register route in navigator:

```tsx
<Stack.Screen name="TraktSettings" component={TraktSettingsScreen} options={{ title: 'Trakt' }} />
```

---

### 7. Optional: Add Sync Indicator Badge

**File**: Add to your app's header/settings icon

Show a small indicator when Trakt is connected:

```tsx
{
  traktConnected && (
    <View style={styles.syncBadge}>
      <Icon name="check-circle" size={12} color="green" />
    </View>
  );
}
```

---

## 🔧 Dependencies to Install

```bash
expo install expo-web-browser
```

Already installed (confirm these exist):

- `@react-native-async-storage/async-storage`
- Your existing context setup

---

## 📝 TypeScript Types

**File**: `src/types/trakt.ts`

```typescript
export interface SyncStatus {
  connected: boolean;
  synced: boolean;
  status?: 'in_progress' | 'completed' | 'failed';
  lastSyncedAt?: string;
  itemsSynced?: {
    movies: number;
    shows: number;
    episodes: number;
    ratings: number;
    lists: number;
    favorites: number;
    watchlistItems: number;
  };
  errors?: string[];
}

export interface TraktContextValue {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncStatus: SyncStatus | null;
  connectTrakt: () => Promise<void>;
  disconnectTrakt: () => Promise<void>;
  syncNow: () => Promise<void>;
  checkSyncStatus: () => Promise<void>;
}
```

---

## 🎨 Styling Guidelines

- Use your existing theme/colors
- Match your app's design system
- For the Trakt logo, use a simple sync/link icon or download Trakt's official icon
- Make buttons prominent and easy to tap
- Show clear loading states with ActivityIndicator
- Use your existing spacing/padding conventions

---

## ⚠️ Error Handling

Handle these scenarios gracefully:

1. **Network errors**: Show "Check your connection" message
2. **Sync already in progress**: Show "Sync in progress" message
3. **User cancels OAuth**: Don't show error, just return to screen
4. **Backend timeout**: Show "Sync taking longer than expected"
5. **Partial sync failure**: Show which items synced successfully

---

## ✅ Testing Checklist

After implementation, test:

- [ ] Connect to Trakt button works
- [ ] OAuth flow opens browser
- [ ] Successful OAuth redirects back to app
- [ ] Connection status updates in UI
- [ ] Sync button triggers sync
- [ ] Sync progress shows in UI
- [ ] Sync completes and shows summary
- [ ] Disconnect removes connection
- [ ] State persists after app restart
- [ ] Works on Android (we dont care about iOS)

---

## 🔄 Integration with Existing Code

**With AuthContext**:

```tsx
const { user } = useAuth();
const { connectTrakt } = useTrakt();

// Use user.uid when calling Trakt functions
await connectTrakt(user.uid);
```

**Firestore Updates**:
The backend handles all Firestore writes. Your app just needs to:

1. Read the synced data normally from Firestore
2. Show appropriate UI based on Trakt connection status

**No changes needed to existing Firestore listeners** - they'll automatically pick up synced data!

---

## 📚 Additional Notes

1. **Privacy**: Let users know data is imported read-only (for MVP)
2. **First Sync**: Can take 1-5 minutes for large libraries
3. **Subsequent Syncs**: Much faster (only new items)
4. **Conflict Resolution**: Not needed for one-way import
5. **Offline Mode**: Disable Trakt features when offline

---

## 🎯 Success Criteria

Implementation is complete when:
✅ User can connect their Trakt account via OAuth  
✅ Initial sync imports all watch history  
✅ Synced items appear in the app's existing lists  
✅ User can manually trigger re-sync  
✅ User can disconnect Trakt  
✅ State persists across app restarts  
✅ Clear error messages for all failure cases

---

## 💡 Pro Tips

1. **Show estimated time**: "This usually takes 2-3 minutes"
2. **Allow cancellation**: Add "Cancel Sync" button during sync
3. **Empty state**: If user has no Trakt data, show friendly message
4. **Deep linking**: Handle `yourapp://trakt/success` redirect properly

---

## 🐛 Debugging

**Check these if issues occur**:

1. Verify backend URL in config
2. Check user is authenticated before connecting
3. Verify Trakt Client ID matches backend
4. Check network requests in debugger
5. Look at backend logs in Vercel
6. Ensure AsyncStorage permissions are granted

**Useful debug logs**:

```typescript
console.log('[Trakt] Initiating OAuth for user:', userId);
console.log('[Trakt] Sync triggered, polling for status...');
console.log('[Trakt] Sync complete:', status);
```

---

## 📞 Questions to Ask Before Starting

Before you begin implementation, confirm:

1. Where should the Trakt settings screen be accessible from? (Settings tab? Profile screen?)
2. Should there be a badge/indicator showing Trakt is connected?
3. Any specific design preferences for the connection screen?
4. Should sync happen automatically on app launch (after initial import)?
5. Do you want push notifications when sync completes?
