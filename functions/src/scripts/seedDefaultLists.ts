import * as admin from 'firebase-admin';

interface ScriptOptions {
  apply: boolean;
  uid: string;
}

interface DefaultListDefinition {
  id: string;
  name: string;
}

interface ApplyFailure {
  error: string;
  listId: string;
}

const DEFAULT_LISTS: DefaultListDefinition[] = [
  // Canonical source: ListService.DEFAULT_LISTS in src/services/ListService.ts.
  // Keep this script's DefaultListDefinition + DEFAULT_LISTS aligned with ListService;
  // update ListService first to avoid divergence across app/functions boundaries.
  { id: 'watchlist', name: 'Should Watch' },
  { id: 'currently-watching', name: 'Watching' },
  { id: 'already-watched', name: 'Already Watched' },
  { id: 'favorites', name: 'Favorites' },
  { id: 'dropped', name: 'Dropped' },
];

const parseArgs = (): ScriptOptions => {
  const args = process.argv.slice(2);
  let apply = false;
  let uid: string | null = null;

  for (const arg of args) {
    if (arg === '--apply') {
      apply = true;
      continue;
    }

    if (arg.startsWith('--uid=')) {
      const parsedUid = arg.split('=')[1]?.trim();
      if (parsedUid) {
        uid = parsedUid;
      }
    }
  }

  if (!uid) {
    throw new Error('Missing required argument: --uid=<uid>');
  }

  return { apply, uid };
};

const ensureAdminInitialized = (): void => {
  if (admin.apps.length > 0) {
    return;
  }

  admin.initializeApp();
};

const fetchMissingDefaults = async (
  db: admin.firestore.Firestore,
  uid: string
): Promise<{
  existingCount: number;
  missingDefaults: DefaultListDefinition[];
}> => {
  const snapshot = await db.collection('users').doc(uid).collection('lists').get();
  const existingIds = new Set(snapshot.docs.map((listDoc) => listDoc.id));
  const missingDefaults = DEFAULT_LISTS.filter((list) => !existingIds.has(list.id));

  return {
    existingCount: snapshot.size,
    missingDefaults,
  };
};

const isAlreadyExistsError = (error: unknown): boolean => {
  const code = (error as { code?: string | number })?.code;
  return code === 'already-exists' || code === 6;
};

const run = async (): Promise<void> => {
  const options = parseArgs();
  ensureAdminInitialized();

  const db = admin.firestore();
  const { existingCount, missingDefaults } = await fetchMissingDefaults(db, options.uid);

  console.log('[seedDefaultLists] Scan summary:', {
    mode: options.apply ? 'apply' : 'dry-run',
    scopedUid: options.uid,
    existingListDocs: existingCount,
    missingDefaultDocs: missingDefaults.length,
    missingListIds: missingDefaults.map((list) => list.id),
  });

  if (!options.apply || missingDefaults.length === 0) {
    return;
  }

  let created = 0;
  const skippedAlreadyExists: string[] = [];
  const failures: ApplyFailure[] = [];

  for (const list of missingDefaults) {
    const listRef = db.collection('users').doc(options.uid).collection('lists').doc(list.id);
    const now = Date.now();

    try {
      await listRef.create({
        name: list.name,
        items: {},
        createdAt: now,
        updatedAt: now,
      });
      created += 1;
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        skippedAlreadyExists.push(list.id);
        continue;
      }

      failures.push({
        listId: list.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('[seedDefaultLists] Apply summary:', {
    attempted: missingDefaults.length,
    created,
    skippedAlreadyExists: skippedAlreadyExists.length,
    failed: failures.length,
  });

  if (skippedAlreadyExists.length > 0) {
    console.log('[seedDefaultLists] Skipped existing list IDs:', skippedAlreadyExists);
  }

  if (failures.length > 0) {
    console.error('[seedDefaultLists] Failed writes:', failures.slice(0, 50));
    throw new Error('One or more default list seed writes failed');
  }
};

run().catch((error) => {
  console.error('[seedDefaultLists] Script failed:', error);
  process.exitCode = 1;
});
