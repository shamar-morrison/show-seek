# RevenueCat Android Migration

## App Changes

- Premium purchases now use `react-native-purchases` in `/src/context/PremiumContext.tsx`.
- RevenueCat is configured with `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_KEY`.
- Firebase user id is linked to RevenueCat via `Purchases.logIn(user.uid)`.
- Entitlement reads are RevenueCat-first with temporary Firestore fallback (`users/{userId}.premium`).
- Premium paywall trial toggle was removed. Trial eligibility is automatic from Google Play / RevenueCat.

## Backend Changes

- Added `revenuecatWebhook` in `/functions/src/revenuecatWebhook.ts`.
- Webhook security uses the `REVENUECAT_WEBHOOK_AUTH` secret via `Authorization` header.
- Webhook writes directly from payload to `users/{userId}.premium` (no per-event REST fetch).
- Added idempotency via `revenuecatWebhookEvents/{eventId}`.
- Added stale-event guard using `premium.rcLastEventTimestampMs`.
- Added legacy lifetime protection for `premium_unlock` users.

## Migration Script

- Script: `/functions/src/scripts/migrateRevenueCatSubscribers.ts`
- Build + run command:

```bash
npm --prefix functions run migrate:revenuecat -- --dry-run
npm --prefix functions run migrate:revenuecat -- --checkpoint=/tmp/revenuecat-checkpoint.json --output=/tmp/revenuecat-report.json
```

- Required env var when not dry-run:

```bash
REVENUECAT_API_KEY=<your_secret_api_key>
```

## Required Secrets

```bash
firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH --project showseek-app-2025
firebase functions:secrets:set REVENUECAT_API_KEY --project showseek-app-2025
```

## Deploy

```bash
firebase deploy --only functions:revenuecatWebhook --project showseek-app-2025
```

Configure RevenueCat webhook URL to the deployed function and set header:

- Header: `Authorization`
- Value: `<REVENUECAT_WEBHOOK_AUTH>`

## Validation Checklist

- [ ] New Android purchase grants `premium` entitlement in RevenueCat.
- [ ] Webhook updates `users/{userId}.premium` correctly.
- [ ] Existing migrated subscribers resolve premium after login.
- [ ] No app calls to old callable functions for purchase sync/validation.
