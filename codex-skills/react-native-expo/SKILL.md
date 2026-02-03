---
name: react-native-expo
description: Build, debug, and ship React Native apps, especially Expo-managed projects (Expo SDK, Expo CLI, expo-router, EAS). Use when asked to implement features or fix issues in React Native/Expo: Metro bundler errors, runtime crashes/red screens, iOS/Android native build failures, dependency/version mismatches, deep linking, permissions, push notifications, performance, and testing.
---

# React Native (Expo)

## Default assumptions

- Prefer **Expo-managed** workflows first; fall back to **bare RN** guidance when a task requires it.
- Prefer **TypeScript** and **pnpm** when a repo already uses them.
- Prefer **small, verifiable changes** (one fix at a time) and provide exact commands.

## First questions to ask (keep to 3)

1. What platform(s): iOS, Android, Web? Simulator/emulator vs device?
2. What is the exact error text + where did it appear (Metro, Xcode, Gradle, runtime)?
3. What is the current workflow: `expo start`, dev-client, or EAS build?

If troubleshooting, request: `package.json`, `app.json/app.config.*`, `expo doctor` output (if available), and the failing command + full log.

## Execution workflow

1. **Identify stack**: Expo SDK version, RN version, router/navigation, package manager, build system (dev-client/EAS/local).
2. **Minimize repro**: smallest screen/component reproducing; confirm platform-specific.
3. **Classify failure**:
   - Metro / JS bundling
   - Runtime JS error
   - Native module / config plugin
   - iOS build (Pods/Xcode)
   - Android build (Gradle/SDK/NDK)
   - EAS build / credentials / signing
4. **Apply fix** with a clear “why”, then **re-run the exact failing command**.
5. **Add guardrails**: type checks, lint/test, small regression test or log assertion where appropriate.

## Quick command snippets (Expo-first)

- Start dev: `pnpm start` or `npx expo start`
- Clear caches: `npx expo start -c`
- iOS run: `npx expo run:ios`
- Android run: `npx expo run:android`
- Doctor: `npx expo doctor`

## References

- Debugging checklist: `references/debugging.md`
- Expo + EAS workflows: `references/expo-eas.md`
- expo-router patterns: `references/expo-router.md`
- Performance: `references/performance.md`
- Testing (Jest + RTL): `references/testing.md`

## Bundled scripts

- Collect basic diagnostics (safe, read-only): `scripts/collect_diagnostics.sh`

