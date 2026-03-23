# Functions Setup Notes

## RevenueCat Secrets

RevenueCat integration uses these Firebase Functions secrets:

- `REVENUECAT_WEBHOOK_AUTH`: shared auth token expected in webhook `Authorization` header.
- `REVENUECAT_API_KEY`: RevenueCat secret API key used by `reconcilePremiumStatus` and the
  RevenueCat migration/repair scripts.

Set them with:

```bash
firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH --project showseek-app-2025
firebase functions:secrets:set REVENUECAT_API_KEY --project showseek-app-2025
```

Deploy the RevenueCat functions:

```bash
firebase deploy --only functions:revenuecatWebhook,functions:reconcilePremiumStatus --project showseek-app-2025
```

## Trakt Functions Secrets

The Trakt integration now runs entirely from Firebase Functions:

- `traktApi`: app-facing HTTP backend for OAuth start, sync, status, disconnect, and enrichment
- `traktCallback`: Trakt OAuth callback page + token exchange
- `runTraktSync`: Cloud Tasks-backed worker for durable sync execution
- `runTraktEnrichment`: Cloud Tasks-backed worker for queued TMDB enrichment jobs

These functions require the following secrets:

- `TRAKT_CLIENT_ID`
- `TRAKT_CLIENT_SECRET`
- `TRAKT_REDIRECT_URI`

Set them with:

```bash
firebase functions:secrets:set TRAKT_CLIENT_ID --project showseek-app-2025
firebase functions:secrets:set TRAKT_CLIENT_SECRET --project showseek-app-2025
firebase functions:secrets:set TRAKT_REDIRECT_URI --project showseek-app-2025
```

The Trakt enrichment endpoints also use TMDB metadata. If `TMDB_API_KEY` is not
already configured for other functions in this project, set it as well:

```bash
firebase functions:secrets:set TMDB_API_KEY --project showseek-app-2025
```

When deploying `traktApi` for web callers, configure the runtime environment
variable `TRAKT_ALLOWED_ORIGINS` with a comma-separated allowlist of trusted
origins so CORS responses only reflect approved origins.

Deploy the Trakt backend:

```bash
firebase deploy --only functions:traktApi,functions:traktCallback,functions:runTraktSync,functions:runTraktEnrichment --project showseek-app-2025
```

`deleteAccount` no longer depends on a separate Trakt backend or shared internal
delete token. It now deletes Firestore/Auth data directly within Firebase.
