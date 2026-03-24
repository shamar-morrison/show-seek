# Firestore Read Incident Runbook

## Alert thresholds

- 30k reads/day: investigate active callers and verify `/runtime-config.json`
- 40k reads/day: flip `disableNonCriticalReads=true`
- 45k reads/day: flip `firestoreClientEnabled=false` if the slope is still rising

## Runtime config response

Edit `hosting/runtime-config.json` and deploy Hosting:

```bash
firebase deploy --only hosting
```

Emergency modes:

- Premium-only mode:
  - `firestoreClientEnabled: true`
  - `disableNonCriticalReads: true`
  - keeps premium realtime only
- Full client shutdown:
  - `firestoreClientEnabled: false`
  - blocks Firestore-backed client features with a maintenance screen

## Firestore rules lockdown

If the caller still looks client-side, replace `firestore.rules` with a temporary deny-all and deploy:

```bash
firebase deploy --only firestore:rules
```

## Backend containment

If reads continue after client lockdown, assume Admin SDK or backend traffic.

Primary checks:

- Cloud Functions / Cloud Run logs for active endpoints
- Firestore Data Read audit logs
- Any external service accounts with Firestore access

If needed, remove or disable the Firestore-touching functions until the source is identified.

## Attribution query

Enable Firestore `Data Read` audit logs, then use Logs Explorer:

```text
protoPayload.serviceName="firestore.googleapis.com"
```

Filter further by caller identity:

```text
protoPayload.authenticationInfo.principalEmail=...
```

## Restore steps

1. Restore normal `firestore.rules`.
2. Restore `hosting/runtime-config.json` to normal operation.
3. Redeploy:

```bash
firebase deploy --only firestore:rules,hosting
firebase deploy --only functions
```

4. Watch reads for at least one hour after restore.
