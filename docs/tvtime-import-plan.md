# TV Time Import — Implementation Plan

Status: **implemented on `feat/tvtime-import`**: server callable, rate limiting, client parsers for all formats, service, screens, i18n (7 locales) and tests. Not yet run on a device or deployed. · Approach: **single chunked callable** (same pattern as the IMDb import)

## Goal

Let users bring their TV Time history into ShowSeek: watched episodes, watched movies, show status (watching / plan to watch / dropped), favorites, ratings, and custom lists.

## Context

- TV Time has shut down. Trakt's import code describes TV Time data as "frozen by the July 2026 shutdown". Users can only import files they **already exported**, so the importer has to accept every export format in circulation rather than steer people to one.
- Export formats seen in the wild:

| Format                                                 | How users got it       | Files                                                                | IDs                                             |
| ------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| **Export** ("export my data" / TV Time Out by Refract) | Chrome extension       | `tvtime-*.csv` or `tvtime-*.json`, loose or in `tvtime-export-*.zip` | TVDB + IMDb                                     |
| **Liberator** (`Hobo-Ware/tv-time-liberator`)          | Chrome extension / CLI | `shows.json`, `movies.json`, `activity_history.csv` (zip)            | TVDB + IMDb                                     |
| **GDPR**                                               | Official data request  | ZIP of ~50 CSVs, marker `tracking-prod-records*`                     | TVDB shows/episodes only; **movies have no ID** |
| **Extractor** (TV Time Data Extractor)                 | Chrome extension       | `tv-time-export.csv` (`media_type` column)                           | varies                                          |

`amirbrooks/tvtime-backup-extractor` (phone-backup recovery) outputs Liberator-format ZIPs, so supporting Liberator covers those users too.

- **License note:** the best reference implementation (`trakt/trakt-web`, `projects/client/src/lib/sections/settings/import/parsers/TvTime*Parser.ts`) is **GPL-3.0**. Use it only to learn the file formats. Do not copy code or its fixtures. Write our own parsers and our own anonymized fixtures. `gulian/rewatch` `docs/tvtime-export-format.md` is a useful prose description of the GDPR format.

## Architecture

```
Device                                              Cloud Function
──────                                              ──────────────
pick file(s) ─► unzip (fflate) ─► detect format
   ─► parse (papaparse / JSON) ─► normalize
   ─► group by show / movie ─► chunk
   ─► for each chunk: importTvTimeChunk(chunk) ───►  resolve TVDB/IMDb/title → TMDB
                                                    fetch TMDB seasons (cached per call)
                                                    map episodes, write Firestore
      ◄────────────────────────────── stats ◄────  return per-chunk stats
   ─► merge stats, show progress + summary
```

There is one new function (`importTvTimeChunk`), with no Storage upload, task queue, lease, or enrichment pass. Each chunk writes complete records, including TMDB episode IDs, names, air dates and runtimes.

## Shared contract — `functions/src/shared/tvtimeImport.ts`

The app and the function both import this file, as they do with `shared/imdbImport.ts`. The sketch below shows the shape; the file is the source of truth. Differences from the sketch: ratings are `{ value, ratedAt }`, entities carry `addedAt`, and the request carries an `importId` used for rate limiting.

```ts
export const TVTIME_IMPORT_MAX_ENTITIES_PER_CHUNK = 15;
export const TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK = 1500;

export type TvTimeShowStatus = 'watchlist' | 'watching' | 'up_to_date' | 'dropped';

export interface TvTimeEpisodePlay {
  season: number;
  episode: number;
  tvdbEpisodeId?: number; // GDPR v2 `ep_id`; used to fix numbering mismatches
  watchedAt: number; // epoch ms, validated on the client
}

export interface TvTimeShowEntity {
  tvdbId: number | null;
  imdbId: string | null;
  title: string;
  status: TvTimeShowStatus | null;
  favorite: boolean;
  rating: number | null; // already converted to ShowSeek's 1–10 scale
  lists: { name: string; addedAt: number }[];
  plays: TvTimeEpisodePlay[];
  part?: { index: number; total: number }; // set when a long show is split across chunks
}

export interface TvTimeMovieEntity {
  tvdbId: number | null;
  imdbId: string | null;
  title: string;
  altTitle?: string; // GDPR English slug; a second title-search query
  year: number | null;
  watches: number[]; // epoch ms, one entry per play (rewatches kept)
  watchlist: boolean;
  favorite: boolean;
  rating: number | null;
  lists: { name: string; addedAt: number }[];
}

export interface TvTimeImportChunkRequest {
  shows: TvTimeShowEntity[];
  movies: TvTimeMovieEntity[];
}

export interface TvTimeImportStats {
  imported: {
    watchedEpisodes: number;
    watchedMovies: number;
    shows: number;
    ratings: number;
    listItems: number;
    customListsCreated: number;
  };
  skipped: Partial<Record<TvTimeSkipReason, number>>;
  ignored: Partial<Record<'rewatched_episodes' | 'episode_ratings', number>>;
  unresolvedTitles: string[]; // capped (e.g. 25 per chunk) so the summary can list them
  processedEntities: number;
}

export type TvTimeSkipReason =
  | 'unresolved_show'
  | 'unresolved_movie'
  | 'ambiguous_title'
  | 'unmatched_episode'
  | 'invalid_date'
  | 'missing_identifiers';
```

Also export `createEmptyTvTimeImportStats` and `mergeTvTimeImportStats`, mirroring the IMDb helpers.

## Client

### New files

- `src/utils/tvtimeImport/detectFormat.ts`: decides the format from file names and the first row's columns:
  - `tracking-prod-records*` in the ZIP → GDPR
  - `activity_history.csv` or `shows.json` + `movies.json` → Liberator
  - `tv-time-export.csv` or a `media_type` column → Extractor
  - `tvtime-*` names or a `series_tvdb_id` column → Export
  - A Trakt-style export or a ZIP that only contains account data gets a specific error message, not a generic "unsupported file".
- `src/utils/tvtimeImport/parsers/{export,liberator,gdpr,extractor}.ts`: each parser outputs the normalized entities above.
- `src/utils/tvtimeImport/prepare.ts`: merges and dedupes across files (a user might pick both the CSV and the JSON versions of the same export), groups plays by show, validates dates, and builds chunks. Returns `{ chunks, stats }` like `prepareImdbImport`.
- `src/services/TvTimeImportService.ts`: mirrors `ImdbImportService`.
- `src/context/TvTimeImportFlowContext.tsx`, `src/screens/TvTimeImportScreen.tsx`, `src/screens/TvTimeImportProgressScreen.tsx`, plus routes `app/(tabs)/profile/tvtime-import*.tsx` and `src/constants/tvtimeImportRoutes.ts`.

### Format-specific parsing notes

- **GDPR**
  - Episodes come from `tracking-prod-records-v2.csv`, using rows whose `key` starts with `watch-episode-` or `rewatch-episode-`. The episode columns vary between exports: read `s_no ?? season_number`, `ep_no ?? episode_number` and `ep_id ?? episode_id`, taking the first non-empty value.
  - Movies come from `tracking-prod-records.csv` (v1), rows with `entity_type=movie`: `type=watch` means watched and `type=towatch` means watchlist. `release_date` of `0001-01-01` means unknown.
  - Show status comes from v2 `user-series-*` rows (`is_followed`, `is_for_later`, `is_archived`). Use `followed_tv_show.csv` to fill in older follows that lack those flags.
  - Ratings come from `ratings-live-votes.csv`. The last segment of `vote_key` is a rating-set ID that maps to `1→2, 27→4, 28→6, 29→8, 3→10`. Route this file by name, because `emotions-live-votes.csv` has the same header.
  - Lists come from `lists-prod-lists.csv`. The `objects` column holds Go-printed maps; extract the `id:<n> type:<t>` pairs. Rows whose `s_key` starts with `favorite-` are favorites.
- **Export**
  - Show `status`: `not_started_yet` → `watchlist`, `stopped` → `dropped`, `up_to_date` → `up_to_date`, `continuing`/`watching` → `watching`.
- **Liberator**
  - Prefer `activity_history.csv` (it has watchlist flags). An `imdb_id` of `-1` means none.
- **All formats**
  - Drop rows with dates before 1990 or in the future, and count them as `invalid_date`. This guards against known junk values like `50663409-12-05`.
  - **Check rating scales against real files before shipping.** The Export and Liberator samples show both `5` and `8`, which suggests a 1–5 scale for episodes and 1–10 for movies.

### Chunking

- Packs shows and movies into chunks of at most 15 entities and 1,500 plays.
- Splits a show with more than 1,500 plays (e.g. One Piece) by season ranges into `part`s. Each part repeats the show's metadata; the server writes list/status/rating only for `part.index === 0`.
- Sorts shows by play count, largest first, so slow chunks run early while the user is still watching the progress screen.

### Service behaviour

- Generates an `importId` (UUID) when a run starts and **persists it** (AsyncStorage) until the run completes. Every chunk, retry and resume after an app restart reuses it, so the run is never counted as a new import (see Rate limiting). It's cleared only when the run finishes.
- Handles rate-limit errors (`details: TvTimeRateLimitDetails`):
  - `resource-exhausted` + `burst` → wait `retryAfterMs` and continue.
  - `resource-exhausted` + `cooldown` → stop and show "You can import again at {nextAllowedImportAt}".
  - `already-exists` + `in_progress` → another device is importing; stop and say so.
  - `resource-exhausted` + `session_chunks` → stop (the import is over the size cap).
- Before showing the file picker, reads `users/{uid}/import_limits/tvtime` (owner-readable). If a different import's cooldown is still running, it shows the time instead of letting the user parse a file for nothing.
- `httpsCallable(functions, 'importTvTimeChunk', { timeout: 300_000 })`. The client SDK's **default timeout is 70s**, which is shorter than the server's limit. (The IMDb callable uses that default against a 120s server timeout, which may be worth fixing while you're in there.)
- Runs chunks one at a time. Retries up to 2 times with backoff on `unavailable`, `deadline-exceeded` and `internal`. This is safe because writes are idempotent.
- Unlike the IMDb service, which logs and swallows chunk failures, it tracks failed chunks and offers a **"Retry failed items"** button on the summary screen.
- Keeps the screen awake while importing (`expo-keep-awake`, which needs to be added). Warns that leaving the app pauses the import.
- Unzips with `fflate` (needs to be added; `adm-zip` in the root `package.json` only runs in Node). Read the file with `expo-file-system` as base64 → `Uint8Array`, and use `unzipSync` with a `filter` so only the needed entries are inflated. Reject files over about 150MB.

### UI

- Entry point: an "Import from TV Time" row next to IMDb import (`useProfileLogic.ts`, `handleImdbImport`).
- The import screen explains which files are accepted, with short instructions for each format, and uses a multi-file picker (`.zip`, `.csv`, `.json`).
- Before importing, show a preview: detected format, counts (shows, episodes, movies, lists) and pre-skips. The user confirms before anything is written.
- The progress screen reuses the layout of `ImdbImportProgressScreen`. The final summary lists imported counts, skip reasons, and the unresolved titles so users can add them by hand.
- Add i18n keys to all 7 locales in `src/i18n/locales/`.

## Server — `functions/src/tvtimeImport.ts`

```ts
export const importTvTimeChunk = onCall(
  {
    concurrency: 1,
    maxInstances: 10,
    memory: '512MiB',
    timeoutSeconds: 300,
    secrets: [TMDB_API_KEY],
  },
  handler
);
```

`maxInstances: 10` lets several users import at once (the IMDb function's `1` makes users queue behind each other). With `concurrency: 1` and 4 parallel TMDB requests per call, the function never has more than about 40 TMDB requests in flight.

### Steps per call

1. **Auth and gating:** reject anonymous users, validate the payload strictly (entity, play, watch and list limits), then `assertPremiumUser`, then **claim a rate-limit slot** (see Rate limiting). All of this happens before any TMDB request.
2. **Resolve shows to TMDB** (cached for the duration of the call, with about 6 concurrent requests):
   1. `tvdbId` → `/find/{id}?external_source=tvdb_id` → `tv_results[0]`. **Ignore `tv_episode_results`**: TVDB show and episode IDs overlap, so an episode hit is wrong here.
   2. `imdbId` → `/find?external_source=imdb_id`.
   3. Title → `/search/tv`. Accept only an exact normalized-title match, then retry with any `(YYYY)` suffix removed. If there are several exact matches and no year to choose between them → `ambiguous_title`.
   4. If nothing matches → `unresolved_show`, and add the title to `unresolvedTitles`.
3. **Map episodes:**
   - Fetch `/tv/{id}?append_to_response=season/1,…` (at most 20 seasons per request), which gives each episode's `id`, `name`, `air_date` and `runtime`.
   - If the play's `(season, episode)` exists on TMDB, map it directly.
   - Otherwise, if it has a `tvdbEpisodeId`, call `/find?external_source=tvdb_id` and accept the `tv_episode_results` hit only when its `show_id` matches. This fixes TVDB/TMDB numbering differences without a lookup per episode. Cap these fallback lookups (about 150 per call) so a call stays under its timeout.
   - Anything left → `unmatched_episode`.
   - ShowSeek stores one `watchedAt` per episode, so collapse multiple plays of the same episode to the latest one and count the extras as `rewatched_episodes`.
4. **Write episodes:** read `users/{uid}/episode_tracking/{tmdbShowId}` once per show, then do **one** `set(..., { merge: true })` covering all of its episodes. The IMDb import does a read and a write per episode, which is too slow at TV Time volumes. Never overwrite (see Decisions): only episodes missing from the doc are written; existing ones count as `already_tracked_episode`. Set `runtimeMinutes` from TMDB and update `metadata` (`tvShowName`, `posterPath`, `lastUpdated`).
5. **Show lists** (only for `part.index === 0`):
   - `watchlist` → `watchlist`
   - `watching` → `currently-watching`
   - `dropped` → `dropped`
   - `up_to_date` → `already-watched` if TMDB `status` is Ended/Canceled, otherwise `currently-watching`
   - `favorite` → `favorites`
   - Custom list names → `ensureCustomList`
6. **Movies:**
   - Resolve via `imdbId` → `tvdbId` (verify TMDB's `/find` supports TVDB IDs for movies) → `/search/movie` with `title`, then `altTitle`. Accept exact normalized matches only, preferring a year match (±1).
   - If the movie already has a watch in ShowSeek that didn't come from a TV Time import, skip its watches (`already_tracked_movie`), following the never-overwrite decision. Otherwise write each watch to `watched_movies/{id}/watches/tvtime-{tmdbId}-{watchedAt}`.
   - Add the movie to `already-watched`, plus the watchlist, favorites, rating and custom lists as applicable.
7. **Ratings:** write to `users/{uid}/ratings/{movie|tv}-{id}`, keeping the newer `ratedAt`. Episode ratings are counted under `ignored`.
8. Return `TvTimeImportStats`.

### Refactor first

**Done.** Moved the reusable helpers out of `functions/src/imdbImport.ts` into `functions/src/importWrites.ts`, with no behaviour change. It sits outside `shared/` because the app imports `shared/` and this file is server-only.

- `requestTmdb` (with its 429 retry)
- `assertPremiumUser`
- `loadUserListCache`
- `ensureCustomList`
- `upsertListMembership`
- `upsertMovieOrTvRating`
- `upsertMovieWatch`, with the doc-ID prefix passed in
- `requireSignedInUser`, and a new `requestTmdbOrNull` that returns null on a 404 (missing seasons)

`upsertMovieOrTvRating` takes a conflict policy: `'newer'` for IMDb (unchanged behaviour), `'never'` for TV Time. The IMDb and TV Time imports now share one write path.

## Rate limiting

This follows the Trakt ZIP import's model (one import at a time, 6h cooldown, tester bypass), adapted for chunks. State lives in `users/{uid}/import_limits/tvtime`. Only the server writes it, the owner can read it (Firestore rule added), and account deletion's recursive delete removes it. Each check runs in a transaction in `claimTvTimeChunkSlot`:

| Rule                                   | Limit                                                                                 | Trakt ZIP equivalent                            |
| -------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Same `importId` → continue that import | Always allowed within 24h of its start                                                | — (single task)                                 |
| A different import while one is active | `already-exists` until the active one has had no chunk for 15 min                     | `isZipImportActive` with stale detection        |
| A different import during the cooldown | `resource-exhausted` + `nextAllowedImportAt`; **6h from the previous import's start** | 6h `nextAllowedImportAt`, timed from completion |
| Burst                                  | ≤ 30 chunk calls per rolling minute                                                   | — (the server sets the pace)                    |
| Per-import size                        | ≤ 600 chunks (about 9,000 shows and movies)                                           | ZIP size limits                                 |
| Tester bypass                          | Emulator or `TRAKT_SYNC_BYPASS_UIDS` → 10s cooldown                                   | Same env var and cooldown                       |

**Why the cooldown runs from the start, not the end:** Trakt's worker knows when the import finishes. With chunks, only the client knows, and a client that never reported finishing would never trigger the cooldown. Because a resumed import (same `importId`) is always allowed, legitimate users aren't locked out by a crash or a retry.

**Global TMDB protection:** `maxInstances: 10` × `concurrency: 1` × 4 TMDB requests per call, plus the 429 backoff in `requestTmdb`, which honours `retry-after`. If logs show sustained 429s, the next step would be a shared token bucket, which isn't needed for launch.

### Idempotency

Every write uses a deterministic key: the `S_E` key on episodes, `tvtime-{tmdbId}-{watchedAt}` on movie watches, and the media key on lists and ratings. Re-running an import, or retrying a chunk, never creates duplicates.

### Limits

- **Firestore 1MiB document limit:** an `episode_tracking` doc takes about 250 bytes per episode, so even a show with 2,000 or more episodes fits.
- **TMDB rate limits:** around 50 requests/s is fine at 6 concurrent requests per call. The 429 backoff in `requestTmdb` is the safety net.
- **Typical cost:** a heavy library of about 300 shows and 15k plays is around 25 chunks and around 1–2k TMDB requests, which should take about 2–4 minutes.

## Testing

- **Parser unit tests** (`__tests__/utils/tvtimeImport/*.test.ts`): run each parser over `__tests__/fixtures/tvtime/<format>/` and assert against `expected.json`. The fixtures are generated by `scripts/generate-tvtime-fixtures.mjs` from one synthetic library rendered into all five export shapes (GDPR, a pruned GDPR variant, Refract, Liberator, Data Extractor), with every real-world quirk found so far. See `__tests__/fixtures/tvtime/README.md` for sources and the remaining unverified assumptions. Also assert that `FIXTURE-SECRET-MUST-NOT-BE-READ` (planted in the GDPR account files) never appears in a chunk payload.
- **Function tests** (`__tests__/functions/tvtimeImport.test.ts`): mock `fetch` the way `imdbImport.test.ts` does. Cover:
  - TVDB → TMDB resolution, including ignoring episode hits
  - title fallback and ambiguity
  - the numbering-mismatch fallback through `tvdbEpisodeId`
  - collapsing rewatches
  - the single write per show
  - status → list mapping
  - idempotent re-runs
  - payload validation errors
- **Refactor safety:** the existing IMDb tests must still pass after the helpers move.
- **Emulator end-to-end:** run a synthetic 20k-play export with a 1,600-play show through the real chunker to check chunk timing against the 300s limit.
- **Manual QA:** `node scripts/generate-tvtime-fixtures.mjs --zip <dir>` writes importable ZIPs (add `--stress` for a 1,600-play show that gets split) that resolve against live TMDB. We have no real export, so if a beta user has one, test it before release, especially for the items the fixture README marks as inferred.

## Rollout order

1. ~~Refactor the shared import helpers (IMDb tests green).~~ Done.
2. ~~Shared contract plus `importTvTimeChunk`, with rate limiting and function tests.~~ Done (`__tests__/functions/tvtimeImport.test.ts`, 27 tests).
3. ~~Client parsers for all four tools (`src/utils/tvtimeImport/`), tested against the fixtures and the server's own payload validator.~~ Done.
4. ~~Service (`src/services/TvTimeImportService.ts`), screens, i18n, and the profile entry point.~~ Done.
5. Emulator end-to-end, real-file QA, then deploy the function before releasing the app.

## Decisions

1. **Premium required.** Same gate as the IMDb and Trakt ZIP imports (`assertPremiumUser`).
2. **Never overwrite existing data.** This differs from IMDb, which keeps the newer date. The TV Time import only fills gaps:
   - An episode already in `episode_tracking` is left alone, whatever its `watchedAt`.
   - An existing rating doc is left alone (skipped as `existing_rating`).
   - List memberships already skip existing items. Movie watches are separate docs, so they don't conflict.
3. **`up_to_date` split.** Ended or Canceled on TMDB → `already-watched`; otherwise → `currently-watching`.

## Later

- **Cross-user ID cache.** A Firestore `tvdb→tmdb` map would speed up repeat lookups across users. Not needed for launch.
