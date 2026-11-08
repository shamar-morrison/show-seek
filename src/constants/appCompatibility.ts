/**
 * The data-compatibility level of this build's JavaScript (store builds and OTA updates alike).
 *
 * Bump it when a release stores data in a way older app versions would misread or damage.
 * Once that release (store build and/or OTA update) is out, raise `minimumCompatibilityVersion`
 * in the Firestore document `config/app`: anything older is blocked with "Update required".
 * See docs/minimum-app-version.md.
 *
 * History:
 *   1 — before the version gate existed (no app build before 2 can check it).
 *   2 — list items and watched episodes can live in overflow pages.
 */
export const APP_COMPATIBILITY_VERSION = 2;
