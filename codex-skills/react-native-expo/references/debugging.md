# Debugging checklist (React Native + Expo)

## 1) Capture the right data

- Full error text (copy/paste), not a screenshot.
- Where it appeared:
  - Metro terminal
  - App red screen
  - Xcode build
  - Gradle build
  - EAS build logs
- Platform + device type (simulator/emulator vs physical).
- The exact command that failed.

If you can run commands, gather:

- `node -v`, `pnpm -v` (or `npm -v`/`yarn -v`)
- `npx expo --version`
- `npx expo doctor` (paste output)

## 2) Triage by failure type

### Metro / bundling

Common moves:

- Clear cache: `npx expo start -c`
- Ensure only one Metro is running.
- Check module resolution:
  - Misspelled import path
  - Case sensitivity mismatch (often fails on CI/Android)
  - Duplicate packages via monorepo/workspaces

If a package broke after install/upgrade:

- Verify Expo SDK compatibility (upgrade/downgrade the package or Expo SDK).
- Look for “requires RN >= X” or “requires Expo SDK >= X”.

### Runtime JS error

- Narrow to a specific screen/component by binary search (comment out sections).
- Confirm if it’s platform-specific.
- Validate data assumptions (null/undefined) and parsing.
- If it involves async:
  - confirm loading states
  - guard against unmounted updates

### Native module / config plugin

Symptoms:

- Works in `expo start` (Go) but fails in dev-client/build
- Build-time errors referencing native symbols or pods/gradle

Moves:

- Confirm you’re using a **dev-client** if the package requires native code.
- Re-run prebuild/run:
  - iOS: `npx expo run:ios`
  - Android: `npx expo run:android`
- Check `app.json/app.config.*` plugin configuration and required permissions.

### iOS build (Xcode/CocoaPods)

Common moves:

- If pods are involved, clean and reinstall:
  - `cd ios && pod install` (or `pod deintegrate && pod install` in stubborn cases)
- Ensure Xcode + iOS deployment target aligns with dependencies.
- If Hermes-related, confirm Hermes settings match the Expo/RN version expectations.

### Android build (Gradle)

Common moves:

- Verify Android SDK installed and `ANDROID_HOME` / `ANDROID_SDK_ROOT` is correct.
- Clean gradle: `cd android && ./gradlew clean` then rebuild.
- Watch for:
  - JDK mismatch
  - Kotlin/Gradle plugin version mismatch
  - Duplicate class errors (often multiple versions of the same dependency)

### EAS build / credentials / signing

- Identify: `eas build -p ios|android --profile <name>`
- Paste the **first error** in logs; later errors are usually cascading.
- Confirm `eas.json` profiles and environment variables are set.

