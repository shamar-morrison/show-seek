import * as admin from 'firebase-admin';

interface ScriptOptions {
  apply: boolean;
  uid: string | null;
}

interface Candidate {
  descriptionPreview: string;
  descriptionType: string;
  listId: string;
  userId: string;
}

interface RepairFailure {
  error: string;
  listId: string;
  userId: string;
}

const parseArgs = (): ScriptOptions => {
  const args = process.argv.slice(2);

  const options: ScriptOptions = {
    apply: false,
    uid: null,
  };

  for (const arg of args) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg.startsWith('--uid=')) {
      const uid = arg.split('=')[1]?.trim();
      if (uid) {
        options.uid = uid;
      }
      continue;
    }
  }

  return options;
};

const ensureAdminInitialized = (): void => {
  if (admin.apps.length > 0) {
    return;
  }

  admin.initializeApp();
};

const hasOwn = (obj: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

const isValidDescription = (value: unknown): boolean =>
  typeof value === 'string' && value.length <= 120;

const toPreview = (value: unknown): string => {
  if (typeof value === 'string') {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    return trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed;
  }

  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'object') {
    return '[object]';
  }

  return String(value);
};

const fetchCandidates = async (
  db: admin.firestore.Firestore,
  options: ScriptOptions
): Promise<{
  candidates: Candidate[];
  refsByKey: Map<string, admin.firestore.DocumentReference>;
  scannedCount: number;
}> => {
  const docsWithUser: Array<{ doc: admin.firestore.QueryDocumentSnapshot; userId: string }> = [];

  if (options.uid) {
    const snapshot = await db.collection('users').doc(options.uid).collection('lists').get();
    for (const doc of snapshot.docs) {
      docsWithUser.push({ doc, userId: options.uid });
    }
  } else {
    const snapshot = await db.collectionGroup('lists').get();
    for (const doc of snapshot.docs) {
      const userId = doc.ref.parent.parent?.id;
      if (!userId) {
        continue;
      }
      docsWithUser.push({ doc, userId });
    }
  }

  const candidates: Candidate[] = [];
  const refsByKey = new Map<string, admin.firestore.DocumentReference>();

  for (const { doc, userId } of docsWithUser) {
    const data = doc.data() as Record<string, unknown>;
    if (!hasOwn(data, 'description')) {
      continue;
    }

    const description = data.description;
    if (isValidDescription(description)) {
      continue;
    }

    const listId = doc.id;
    const key = `${userId}/${listId}`;
    candidates.push({
      userId,
      listId,
      descriptionType: description === null ? 'null' : typeof description,
      descriptionPreview: toPreview(description),
    });
    refsByKey.set(key, doc.ref);
  }

  return {
    candidates,
    refsByKey,
    scannedCount: docsWithUser.length,
  };
};

const run = async (): Promise<void> => {
  const options = parseArgs();
  ensureAdminInitialized();

  const db = admin.firestore();
  const { candidates, refsByKey, scannedCount } = await fetchCandidates(db, options);

  console.log('[repairListDescriptions] Scan summary:', {
    mode: options.apply ? 'apply' : 'dry-run',
    scopedUid: options.uid ?? 'all-users',
    scannedListDocs: scannedCount,
    invalidDescriptionDocs: candidates.length,
  });

  if (candidates.length > 0) {
    console.log(
      '[repairListDescriptions] Invalid candidates (first 25):',
      candidates.slice(0, 25)
    );
  }

  if (!options.apply || candidates.length === 0) {
    return;
  }

  const failures: RepairFailure[] = [];
  let repairedCount = 0;

  for (const candidate of candidates) {
    const key = `${candidate.userId}/${candidate.listId}`;
    const ref = refsByKey.get(key);
    if (!ref) {
      failures.push({
        userId: candidate.userId,
        listId: candidate.listId,
        error: 'Missing document reference for candidate',
      });
      continue;
    }

    try {
      await ref.update({
        description: admin.firestore.FieldValue.delete(),
      });
      repairedCount += 1;
    } catch (error) {
      failures.push({
        userId: candidate.userId,
        listId: candidate.listId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('[repairListDescriptions] Apply summary:', {
    attempted: candidates.length,
    repaired: repairedCount,
    failed: failures.length,
  });

  if (failures.length > 0) {
    console.error('[repairListDescriptions] Failed repairs:', failures.slice(0, 50));
    throw new Error('One or more list description repairs failed');
  }
};

run().catch((error) => {
  console.error('[repairListDescriptions] Script failed:', error);
  process.exitCode = 1;
});
