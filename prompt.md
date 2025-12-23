## 7. Add TMDB Enrichment Feature

After the initial Trakt sync completes, users should have the option to enrich their data with TMDB metadata (posters, ratings, genres).

### Update TraktContext State

Add enrichment state to your context:

```typescript
interface TraktState {
  isConnected: boolean;
  isSyncing: boolean;
  isEnriching: boolean; // NEW
  lastSyncedAt: Date | null;
  lastEnrichedAt: Date | null; // NEW
  syncStatus: {
    /* ... */
  };
}
```

### Add Enrichment Functions to Service

**File**: `src/services/trakt.ts`

Add these new functions:

```typescript
/**
 * Trigger TMDB enrichment
 */
export async function triggerEnrichment(
  userId: string,
  options?: {
    lists?: string[];
    includeEpisodes?: boolean;
  }
): Promise {
  const response = await fetch(`${BACKEND_URL}/api/trakt/enrich`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      lists: options?.lists || ['already-watched', 'watchlist', 'favorites'],
      includeEpisodes: options?.includeEpisodes || false,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to trigger enrichment');
  }

  return response.json();
}

/**
 * Check enrichment status
 */
export async function checkEnrichmentStatus(userId: string): Promise {
  const response = await fetch(`${BACKEND_URL}/api/trakt/enrich?userId=${userId}`);

  if (!response.ok) {
    throw new Error('Failed to check enrichment status');
  }

  return response.json();
}
```

### Add Enrichment to TraktContext

```typescript
const enrichData = async () => {
  if (!user?.uid) return;

  try {
    setIsEnriching(true);

    await triggerEnrichment(user.uid, {
      includeEpisodes: false, // Set true for episode enrichment (slower)
    });

    // Wait a bit for enrichment to complete
    setTimeout(async () => {
      const status = await checkEnrichmentStatus(user.uid);
      const hasPosters = Object.values(status.lists).some((list: any) => list.hasPosters);

      if (hasPosters) {
        setIsEnriching(false);
        const now = new Date();
        setLastEnrichedAt(now);
        await AsyncStorage.setItem('@trakt_last_enriched', now.toISOString());
        Alert.alert('Success!', 'Your library now has posters and ratings! 🎉');
      }
    }, 10000); // Check after 10 seconds
  } catch (error) {
    console.error('Enrichment error:', error);
    setIsEnriching(false);
    Alert.alert('Enrichment Failed', 'Please try again later.');
  }
};
```

### Option 1: Manual Enrichment Button (Recommended)

Add to your TraktSettingsScreen after sync completes:

```tsx
{isConnected && lastSyncedAt && !lastEnrichedAt && (

    ✨ Add Posters & Ratings

      Enhance your library with movie posters and ratings from TMDB.



      {isEnriching ? (
        <>

          Enriching...
        </>
      ) : (
        Enrich My Library
      )}


    Takes 1-5 minutes for large libraries

)}
```

### Option 2: Automatic After Sync

To automatically prompt after sync:

```typescript
// After sync completes successfully
if (syncCompleted && !errors.length) {
  Alert.alert('Sync Complete!', 'Would you like to add posters and ratings to your library?', [
    { text: 'Not Now', style: 'cancel' },
    {
      text: 'Yes, Enrich',
      onPress: () => enrichData(),
    },
  ]);
}
```

### Show Enrichment Progress

```tsx
{isEnriching && (


    Enriching Your Library...

      Fetching posters, ratings, and genres


)}
```
