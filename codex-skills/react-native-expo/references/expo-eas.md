# Expo + EAS workflows

## Local dev (Expo-managed)

- Start: `npx expo start`
- Clear caches: `npx expo start -c`

## Dev client (recommended when using native modules)

1. Install dev-client dependency in the project.
2. Build/run locally:
   - iOS: `npx expo run:ios`
   - Android: `npx expo run:android`
3. Start Metro: `npx expo start --dev-client`

## EAS builds (CI / cloud)

- Build: `eas build -p ios|android --profile <profile>`
- If a build fails:
  - confirm Expo SDK + dependency compatibility
  - confirm `eas.json` profile settings (env, build type, credentials)
  - check config plugin output (missing permissions, invalid config)

## Upgrades (high-level)

- Prefer upgrading Expo SDK via Expo’s upgrade workflow.
- After upgrading:
  - run `npx expo doctor`
  - re-run the native build (`run:ios` / `run:android`) if you use dev-client
  - test on both iOS and Android for platform regressions

