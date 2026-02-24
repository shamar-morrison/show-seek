import * as admin from 'firebase-admin';
import * as fs from 'node:fs/promises';
import {
  fetchRevenueCatSubscriber,
  resolveRevenueCatPremiumState,
} from '../shared/revenuecatSubscriber';
import {
  DEFAULT_LEGACY_LIFETIME_PRODUCT_ID,
  isLegacyLifetimeProductId,
} from '../shared/premiumProducts';

interface RunOptions {
  allowDowngrade: boolean;
  uids: string[];
}

interface ExistingPremiumData {
  basePlanId?: string | null;
  expireAt?: admin.firestore.Timestamp | null;
  expiredAt?: admin.firestore.Timestamp | null;
  expiresAt?: admin.firestore.Timestamp | null;
  hasUsedTrial?: boolean;
  isPremium?: boolean;
  orderId?: string | null;
  productId?: string | null;
  purchaseDate?: admin.firestore.Timestamp | null;
  purchaseToken?: string | null;
  subscriptionState?: string | null;
  subscriptionType?: 'monthly' | 'yearly' | null;
  trialConsumedAt?: admin.firestore.Timestamp | null;
  trialStartAt?: admin.firestore.Timestamp | null;
}

const parseArgs = async (): Promise<RunOptions> => {
  const args = process.argv.slice(2);
  const directUids = new Set<string>();
  const fileUids = new Set<string>();
  let allowDowngrade = false;

  for (const arg of args) {
    if (arg === '--allow-downgrade') {
      allowDowngrade = true;
      continue;
    }

    if (arg.startsWith('--uids=')) {
      const value = arg.split('=')[1] ?? '';
      for (const uid of value.split(',')) {
        const trimmed = uid.trim();
        if (trimmed) {
          directUids.add(trimmed);
        }
      }
      continue;
    }

    if (arg.startsWith('--uids-file=')) {
      const value = arg.split('=')[1] ?? '';
      if (!value.trim()) {
        continue;
      }

      const fileContents = await fs.readFile(value.trim(), 'utf8');
      for (const uid of fileContents.split(/\s+/)) {
        const trimmed = uid.trim();
        if (trimmed) {
          fileUids.add(trimmed);
        }
      }
    }
  }

  return {
    allowDowngrade,
    uids: Array.from(new Set([...directUids, ...fileUids])),
  };
};

const toTimestamp = (millis: number | null): admin.firestore.Timestamp | null => {
  if (millis === null) {
    return null;
  }

  return admin.firestore.Timestamp.fromMillis(millis);
};

const resolveHasUsedTrial = (existingPremium: ExistingPremiumData): boolean => {
  return existingPremium.hasUsedTrial === true || existingPremium.trialConsumedAt != null;
};

const buildNonePayload = (
  existingPremium: ExistingPremiumData,
  reconciledAt: admin.firestore.FieldValue
): Record<string, unknown> => {
  const expiresAt = existingPremium.expiresAt ?? null;
  const fallbackExpiredAt =
    existingPremium.expiredAt ??
    existingPremium.expireAt ??
    (expiresAt && expiresAt.toMillis() <= Date.now() ? expiresAt : null);

  return {
    isPremium: false,
    entitlementType: 'none',
    purchaseToken: existingPremium.purchaseToken ?? null,
    productId: existingPremium.productId ?? null,
    orderId: existingPremium.orderId ?? null,
    purchaseDate: existingPremium.purchaseDate ?? admin.firestore.FieldValue.serverTimestamp(),
    subscriptionState: existingPremium.subscriptionState ?? 'EXPIRED',
    expiresAt,
    basePlanId: existingPremium.basePlanId ?? null,
    subscriptionType: existingPremium.subscriptionType ?? null,
    isInTrial: false,
    trialStartAt: null,
    trialEndAt: null,
    hasUsedTrial: resolveHasUsedTrial(existingPremium),
    trialConsumedAt: existingPremium.trialConsumedAt ?? existingPremium.trialStartAt ?? null,
    expiredAt: fallbackExpiredAt,
    expireAt: fallbackExpiredAt,
    lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
    reconciledAt,
    reconciliationSource: 'repairRevenueCatPremiumStatus',
  };
};

const run = async (): Promise<void> => {
  const options = await parseArgs();
  if (options.uids.length === 0) {
    throw new Error('Missing user ids. Pass --uids=<uid1,uid2> or --uids-file=<path>.');
  }

  const apiKey = process.env.REVENUECAT_API_KEY ?? '';
  if (!apiKey) {
    throw new Error('Missing REVENUECAT_API_KEY environment variable.');
  }

  if (admin.apps.length === 0) {
    admin.initializeApp();
  }

  const db = admin.firestore();

  let repaired = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of options.uids) {
    const uidSuffix = userId.slice(-6);
    const nowIso = new Date().toISOString();

    try {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      const existingPremium = (userDoc.data()?.premium ?? {}) as ExistingPremiumData;
      const beforeIsPremium = existingPremium.isPremium === true;

      const subscriberLookup = await fetchRevenueCatSubscriber(apiKey, userId);

      if (subscriberLookup.statusCode === 404 || !subscriberLookup.subscriber) {
        if (!options.allowDowngrade) {
          skipped += 1;
          console.log(
            `[repair][skip] ${uidSuffix} subscriber missing. pass --allow-downgrade to apply none.`
          );
          continue;
        }

        const payload = buildNonePayload(
          existingPremium,
          admin.firestore.FieldValue.serverTimestamp()
        );

        await userRef.set(
          {
            premium: {
              ...payload,
              rcCanonicalAppUserId: userId,
              rcOriginalAppUserId: null,
            },
          },
          { merge: true }
        );

        repaired += 1;
        console.log(
          JSON.stringify({
            action: 'repair',
            afterIsPremium: false,
            beforeIsPremium,
            status: 'applied-none-subscriber-missing',
            timestamp: nowIso,
            uidSuffix,
          })
        );
        continue;
      }

      if (subscriberLookup.statusCode >= 400) {
        failed += 1;
        console.error(
          `[repair][failed] ${uidSuffix} revenuecat status ${subscriberLookup.statusCode}`
        );
        continue;
      }

      const resolvedState = resolveRevenueCatPremiumState(subscriberLookup.subscriber, Date.now());
      if (!resolvedState.isPremium && !options.allowDowngrade) {
        skipped += 1;
        console.log(
          `[repair][skip] ${uidSuffix} resolved non-premium. pass --allow-downgrade to apply none.`
        );
        continue;
      }

      const hasUsedTrial = resolveHasUsedTrial(existingPremium) || resolvedState.hasUsedTrial;
      const trialConsumedAt =
        existingPremium.trialConsumedAt ??
        existingPremium.trialStartAt ??
        toTimestamp(resolvedState.trialStartAtMs ?? resolvedState.purchaseAtMs);
      const purchaseDate =
        toTimestamp(resolvedState.purchaseAtMs) ??
        existingPremium.purchaseDate ??
        admin.firestore.Timestamp.now();

      const payload =
        resolvedState.entitlementType === 'none'
          ? buildNonePayload(existingPremium, admin.firestore.FieldValue.serverTimestamp())
          : {
              isPremium: true,
              entitlementType:
                resolvedState.entitlementType === 'lifetime' ? 'lifetime' : 'subscription',
              purchaseToken: existingPremium.purchaseToken ?? null,
              productId:
                resolvedState.productId ??
                existingPremium.productId ??
                (resolvedState.entitlementType === 'lifetime'
                  ? DEFAULT_LEGACY_LIFETIME_PRODUCT_ID
                  : null),
              orderId: existingPremium.orderId ?? null,
              purchaseDate,
              subscriptionState:
                resolvedState.entitlementType === 'lifetime'
                  ? null
                  : (resolvedState.subscriptionState ?? 'ACTIVE'),
              expiresAt:
                resolvedState.entitlementType === 'lifetime'
                  ? null
                  : toTimestamp(resolvedState.expiresAtMs),
              basePlanId: existingPremium.basePlanId ?? null,
              subscriptionType:
                resolvedState.entitlementType === 'lifetime'
                  ? null
                  : (resolvedState.subscriptionType ?? existingPremium.subscriptionType ?? null),
              isInTrial: resolvedState.entitlementType === 'subscription' && resolvedState.isInTrial,
              trialStartAt:
                resolvedState.entitlementType === 'subscription' && resolvedState.isInTrial
                  ? toTimestamp(resolvedState.trialStartAtMs ?? resolvedState.purchaseAtMs)
                  : null,
              trialEndAt:
                resolvedState.entitlementType === 'subscription' && resolvedState.isInTrial
                  ? toTimestamp(resolvedState.trialEndAtMs ?? resolvedState.expiresAtMs)
                  : null,
              hasUsedTrial,
              trialConsumedAt: hasUsedTrial ? trialConsumedAt : null,
              expiredAt: null,
              expireAt: null,
              lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
              reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
              reconciliationSource: 'repairRevenueCatPremiumStatus',
            };

      await userRef.set(
        {
          premium: {
            ...payload,
            rcCanonicalAppUserId: userId,
            rcOriginalAppUserId: resolvedState.originalAppUserId,
          },
        },
        { merge: true }
      );

      repaired += 1;
      console.log(
        JSON.stringify({
          action: 'repair',
          afterEntitlementType: resolvedState.entitlementType,
          afterIsPremium: resolvedState.isPremium,
          beforeIsPremium,
          timestamp: nowIso,
          uidSuffix,
          lifetimeProductResolved: isLegacyLifetimeProductId(resolvedState.productId),
        })
      );
    } catch (error) {
      failed += 1;
      console.error(`[repair][failed] ${uidSuffix}`, error);
    }
  }

  console.log('Repair complete.');
  console.log(`Repaired: ${repaired}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
};

void run().catch((error) => {
  console.error('Repair script failed:', error);
  process.exitCode = 1;
});
