# Minimum app version (Update required)

ShowSeek can block app versions that would misread or damage data, showing a full-screen
"Update required". The **Update ShowSeek** button installs an available OTA update, or opens
the Play Store (on iOS, the App Store link from `ios.appStoreUrl`, if one is set).

## How it works

- Every build's JavaScript carries `APP_COMPATIBILITY_VERSION`
  (`src/constants/appCompatibility.ts`). OTA updates carry it too.
- The Firestore document `config/app` holds `minimumCompatibilityVersion` (a number).
  It's public-read and can only be edited in the Firebase console.
- On launch, and when the app returns to the foreground (at most hourly), the app compares the
  two. Below the minimum, it's blocked.
- If `config/app` can't be read (offline), the app uses the last minimum it saw. With nothing
  known, it is never blocked.

App versions released before the gate existed (compatibility level 1) can't be blocked: they
don't contain the check. They are reached by OTA updates instead (every build shares
`runtimeVersion` 1.0.0).

## Raising the minimum

1. In the release that changes the data format, bump `APP_COMPATIBILITY_VERSION` and add a line
   to its history comment.
2. Ship it (store build and/or `eas update` to production).
3. Once it's live, set `config/app.minimumCompatibilityVersion` to the new number in the
   Firebase console. Don't raise it before the release is available, or users will be blocked
   with nothing to update to.

## Current level

`APP_COMPATIBILITY_VERSION = 2`: list items and watched episodes can live in overflow pages
(`item_pages`, `episode_pages`). Versions before this read only the first page of very large
lists and long shows.
