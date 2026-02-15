import * as admin from 'firebase-admin';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as https from 'node:https';

const MONTHLY_SUBSCRIPTION_PRODUCT_ID = 'monthly_showseek_sub';
const YEARLY_SUBSCRIPTION_PRODUCT_ID = 'showseek_yearly_sub';
const SUPPORTED_PRODUCT_IDS = new Set([
  MONTHLY_SUBSCRIPTION_PRODUCT_ID,
  YEARLY_SUBSCRIPTION_PRODUCT_ID,
]);
const RECEIPTS_API_URL = 'https://api.revenuecat.com/v1/receipts';

interface ActiveSubscriber {
  userId: string;
  purchaseToken: string;
  productId: string;
}

interface MigrationReport {
  failed: Array<{ reason: string; userId: string }>;
  skipped: Array<{ reason: string; userId: string }>;
  succeeded: string[];
}

interface ScriptOptions {
  checkpointFile: string;
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  outputFile: string;
}

const parseArgs = (): ScriptOptions => {
  const args = process.argv.slice(2);

  const options: ScriptOptions = {
    checkpointFile: '/tmp/revenuecat-migration-checkpoint.json',
    dryRun: false,
    force: false,
    limit: null,
    outputFile: '/tmp/revenuecat-migration-report.json',
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        options.limit = value;
      }
      continue;
    }

    if (arg.startsWith('--checkpoint=')) {
      const value = arg.split('=')[1];
      if (value) {
        options.checkpointFile = value;
      }
      continue;
    }

    if (arg.startsWith('--output=')) {
      const value = arg.split('=')[1];
      if (value) {
        options.outputFile = value;
      }
      continue;
    }
  }

  return options;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const ensureAdminInitialized = (): void => {
  if (admin.apps.length > 0) {
    return;
  }

  admin.initializeApp();
};

const readProcessedUserIds = async (checkpointFile: string): Promise<Set<string>> => {
  try {
    const data = await fs.readFile(checkpointFile, 'utf8');
    const parsed = JSON.parse(data) as { processedUserIds?: string[] };
    return new Set(parsed.processedUserIds ?? []);
  } catch {
    return new Set();
  }
};

const writeProcessedUserIds = async (
  checkpointFile: string,
  processedUserIds: Set<string>
): Promise<void> => {
  const directory = path.dirname(checkpointFile);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    checkpointFile,
    JSON.stringify({ processedUserIds: Array.from(processedUserIds) }, null, 2),
    'utf8'
  );
};

const writeReport = async (outputFile: string, report: MigrationReport): Promise<void> => {
  const directory = path.dirname(outputFile);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(report, null, 2), 'utf8');
};

const exportActiveSubscribers = async (limit: number | null): Promise<ActiveSubscriber[]> => {
  const db = admin.firestore();
  const querySnapshot = await db.collection('users').where('premium.isPremium', '==', true).get();

  const subscribers: ActiveSubscriber[] = [];
  for (const doc of querySnapshot.docs) {
    const premium = (doc.data().premium ?? {}) as {
      productId?: unknown;
      purchaseToken?: unknown;
    };

    const productId = String(premium.productId ?? '');
    const purchaseToken = String(premium.purchaseToken ?? '');

    if (!SUPPORTED_PRODUCT_IDS.has(productId)) {
      continue;
    }

    if (!purchaseToken) {
      continue;
    }

    subscribers.push({
      userId: doc.id,
      productId,
      purchaseToken,
    });

    if (limit !== null && subscribers.length >= limit) {
      break;
    }
  }

  return subscribers;
};

const postReceiptToRevenueCat = async (
  apiKey: string,
  subscriber: ActiveSubscriber
): Promise<{ body: string; statusCode: number }> => {
  const body = JSON.stringify({
    app_user_id: subscriber.userId,
    fetch_token: subscriber.purchaseToken,
    product_id: subscriber.productId,
  });

  return await new Promise((resolve, reject) => {
    const request = https.request(
      RECEIPTS_API_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Platform': 'android',
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf8');
          resolve({
            body: responseBody,
            statusCode: response.statusCode ?? 0,
          });
        });
      }
    );

    request.on('error', (error) => reject(error));
    request.write(body);
    request.end();
  });
};

const importSubscriberWithRetry = async (
  apiKey: string,
  subscriber: ActiveSubscriber
): Promise<void> => {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await postReceiptToRevenueCat(apiKey, subscriber);
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return;
      }

      if (attempt === maxAttempts) {
        throw new Error(
          `RevenueCat receipts API failed (${response.statusCode}): ${response.body.slice(0, 300)}`
        );
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
    }

    await sleep(1000 * attempt);
  }
};

const run = async (): Promise<void> => {
  const options = parseArgs();
  const report: MigrationReport = {
    failed: [],
    skipped: [],
    succeeded: [],
  };

  ensureAdminInitialized();

  const apiKey = process.env.REVENUECAT_API_KEY ?? '';
  if (!options.dryRun && !apiKey) {
    throw new Error('Missing REVENUECAT_API_KEY environment variable.');
  }

  const processedUserIds = await readProcessedUserIds(options.checkpointFile);
  const subscribers = await exportActiveSubscribers(options.limit);

  console.log(`Found ${subscribers.length} active subscribers eligible for migration.`);
  if (options.force) {
    console.log('Force mode enabled: will reprocess users even if already in checkpoint.');
  }

  for (const subscriber of subscribers) {
    if (!options.force && processedUserIds.has(subscriber.userId)) {
      report.skipped.push({
        reason: 'already_processed',
        userId: subscriber.userId,
      });
      continue;
    }

    if (options.dryRun) {
      console.log(`[DRY RUN] Would migrate ${subscriber.userId} (${subscriber.productId}).`);
      report.succeeded.push(subscriber.userId);
      processedUserIds.add(subscriber.userId);
      continue;
    }

    try {
      await importSubscriberWithRetry(apiKey, subscriber);
      console.log(`Migrated ${subscriber.userId}`);
      report.succeeded.push(subscriber.userId);
      processedUserIds.add(subscriber.userId);
      await writeProcessedUserIds(options.checkpointFile, processedUserIds);
      await sleep(300);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed ${subscriber.userId}: ${message}`);
      report.failed.push({ reason: message, userId: subscriber.userId });
      processedUserIds.add(subscriber.userId);
      await writeProcessedUserIds(options.checkpointFile, processedUserIds);
    }
  }

  await writeReport(options.outputFile, report);

  console.log('Migration finished.');
  console.log(`Succeeded: ${report.succeeded.length}`);
  console.log(`Failed: ${report.failed.length}`);
  console.log(`Skipped: ${report.skipped.length}`);
  console.log(`Report: ${options.outputFile}`);
};

void run().catch((error) => {
  console.error('Migration script failed:', error);
  process.exitCode = 1;
});
