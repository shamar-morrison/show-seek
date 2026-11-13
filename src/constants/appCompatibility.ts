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
 *   3 — lists can hold seasons (`season-{tvId}-{n}`) and episodes (`episode-{tvId}-{s}-{e}`).
 *       Older versions show them as the wrong title, and versions before seasons clear the
 *       show's or a movie's legacy numeric key when removing one.
 */
export const APP_COMPATIBILITY_VERSION = 3;
