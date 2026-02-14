# Functions Setup Notes

## Play Purchase Validation Credentials

Google Play validation in `validatePurchase` and `syncPremiumStatus` uses a dedicated
service account JSON from Secret Manager:

- Secret name: `PLAY_VALIDATOR_SERVICE_ACCOUNT_JSON`
- Expected value: full JSON key for
  `purchase-validator-showseek@crafty-coral-481307-m4.iam.gserviceaccount.com`

This secret is required in deployed environments. The functions fail fast with a
`failed-precondition` error when the secret is missing or invalid:

- `PLAY_VALIDATOR_CREDENTIALS_MISSING`
- `PLAY_VALIDATOR_CREDENTIALS_INVALID`

This is intentional to prevent silent fallback to project default runtime credentials.

## Set or Rotate the Secret

```bash
firebase functions:secrets:set PLAY_VALIDATOR_SERVICE_ACCOUNT_JSON --project showseek-app-2025
```

After updating the secret, redeploy affected functions:

```bash
firebase deploy --only functions:validatePurchase,functions:syncPremiumStatus --project showseek-app-2025
```
