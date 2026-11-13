/**
 * Rollout switch for episode list entries written by the server (Trakt sync and ZIP import,
 * IMDb import). App versions before APP_COMPATIBILITY_VERSION 3 can't show or remove episode
 * entries, so until the app update that handles them is out, only the accounts listed in
 * EPISODE_LIST_ENTRIES_UIDS (comma-separated Firebase UIDs, set in the functions' .env file)
 * get them. Everyone else keeps the earlier behavior: Trakt episodes count as their show and
 * IMDb list episodes are skipped.
 *
 * At release, set EPISODE_LIST_ENTRIES_UIDS=* (everyone) and redeploy, or remove this switch.
 */
export const EPISODE_LIST_ENTRIES_UIDS_ENV = 'EPISODE_LIST_ENTRIES_UIDS';

export const canHaveEpisodeListEntries = (userId: string): boolean => {
  const uids = (process.env[EPISODE_LIST_ENTRIES_UIDS_ENV] ?? '')
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean);
  return uids.includes('*') || uids.includes(userId);
};
