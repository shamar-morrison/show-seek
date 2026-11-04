import * as admin from 'firebase-admin';
import { onCall } from 'firebase-functions/v2/https';
import { deleteAccountHandler } from './accountDeletion';

admin.initializeApp();

export const deleteAccount = onCall({}, deleteAccountHandler);

export { importImdbChunk } from './imdbImport';
export { importTvTimeChunk } from './tvtimeImport';
// Polar webhook intentionally not exported (web app decommissioned). Re-add this export and recreate the POLAR_* secrets to restore.
export { revenuecatWebhook } from './revenuecatWebhook';
export {
  stremioAddon,
  createStremioAddonToken,
  revokeStremioAddonToken,
} from './stremioAddon';
export {
  runTraktEnrichment,
  runTraktSync,
  runTraktZipImport,
  startTraktZipImport,
  traktApi,
  traktCallback,
} from './trakt';
