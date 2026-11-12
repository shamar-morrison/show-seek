# Showly Import — Implementation Plan

Status: **built 2026-11-12 (steps 0–4); deploy and device testing (step 5) next.** · Approach: **file import only**, through the shared chunked file-import pipeline that TV Time and Simkl already use (`functions/src/fileImport/core.ts`), with the **same rate limiting**.

## Goal

Let users bring their Showly library into ShowSeek from Showly's own backup file: followed shows, watched episodes, watched movies, watchlists, hidden titles, ratings and custom lists.

## Context

- Showly is an Android-only Trakt client. **Trakt now owns it**, and its source is public at `github.com/trakt/showly` (default branch `master`, active as of 2026-11-12).
- **The format below is read from the code that writes it**, not guessed from samples: `ui-backup/…/model/*.kt` (the schema), `features/export/runners/*.kt` (what fills each field), `features/import_/*` (how Showly reads it back), and `data-local/…/database/model/*.kt` (where values come from). "Verified" below means seen in that code.
- **The licence is GPL-3.0. We read it, never copy it.** We only use format facts, which aren't copyrightable, and write our own parser. Same rule as the GPL sources in the Simkl plan.
- **We have one small real export** (`showly_export.json`, 2026-11-12, local-only library: 1 followed show, 1 watchlist show, 3 watched movies, 2 custom lists). It matches the schema in every key. "Confirmed" below means seen in that file. Episodes, ratings, hidden titles, on hold, pinned and `-1` IDs aren't in it yet; a larger export covers them during device testing (see [Rollout](#rollout-order), step 5).
- **How users get the file:** Showly → Settings → **Backup & Restore** → **Export data**. Android's "Save as" dialog saves `showly_export_<yyyyMMddHHmmss>.json` (local time), and Showly also offers to share it. Users can also schedule automatic backups (every 6 hours, daily, every 3 days or weekly) into a folder they choose.
- Showly users who sync with Trakt can already use our Trakt import. This file import is for local-only users and for anything they never synced, such as hidden titles and local custom lists.

## Export format (verified from source)

Compact JSON written by Moshi with `KotlinJsonAdapterFactory`, in UTF-8. Showly reads the version by finding the text after `version":`. **Any version below 2 is treated as v1, and anything else as the current schema.**

```jsonc
{
  "version": 2, "platform": "android", "createdAt": "2026-11-12T05:00:00Z",
  "shows": {
    "cH":   [ { "id": 1390, "tmId": 1399, "t": "Game of Thrones", "a": "<ISO>", "u": "<ISO>" } ], // My Shows
    "cW":   [ …same shape… ],              // Watchlist
    "cHid": [ …same shape… ],              // Hidden (formerly "Archive")
    "pEp":  [ { "id": 73640, "sId": 1390, "stmId": 1399, "sN": 1, "eN": 1, "a": "<ISO>" } ], // watched episodes; "a" absent when unknown
    "pSe":  [ { "id": 3962, "sId": 1390, "stmId": 1399, "sN": 1 } ], // fully watched seasons
    "pP":   [1390],                        // pinned (Trakt IDs)
    "pOH":  [1390],                        // on hold (Trakt IDs)
    "rS":   [ { "id": 1390, "tmId": 1399, "r": 9, "rA": "<ISO>" } ],
    "rSe":  [ { "id": 3962, "sId": 1390, "stmId": 1399, "sN": 1, "r": 8, "rA": "<ISO>" } ],
    "rEp":  [ { "id": 73640, "sId": 1390, "stmId": 1399, "sN": 1, "eN": 1, "r": 10, "rA": "<ISO>" } ]
  },
  "movies": {
    "cH":   [ { "id": 120, "tmId": 120, "t": "The Lord of the Rings…", "a": "<ISO>" } ], // watched
    "cW":   [ … ], "cHid": [ … ], "pP": [ … ],
    "rM":   [ { "id": 120, "tmId": 120, "r": 10, "rA": "<ISO>" } ]
  },
  "lists": { "l": [ {
    "id": 3, "tId": 123456, "sId": "my-list", "n": "Sci-fi", "d": "…", "p": "private",
    "ic": 2, "c": "<ISO>", "u": "<ISO>",
    "it": [ { "id": 9, "lId": 3, "tId": 1390, "tmId": 1399, "t": "show", "r": 1, "l": "<ISO>", "c": "<ISO>", "u": "<ISO>" } ]
  } ] }
}
```

**v1** (old backups, still accepted by Showly): no `platform` or `createdAt`, no ratings (`rS`/`rSe`/`rEp`/`rM`), no `stmId` on episodes or seasons, and no `tmId` on list items. Shows and movies do have `tmId`.

### Format quirks (verified)

- **The same key means different things in different places.** `id` is a Trakt ID on shows, movies, episodes and ratings, but Showly's **local row ID** on lists and list items. `t` is a **title** on shows and movies, but the item **type** (`"show"`/`"movie"`) on list items. Parse each section with its own schema.
- **Nulls are left out, not written.** Moshi's default skips null values, so an episode with no watch date has **no `a` key**, and a local-only list has no `tId` and possibly no `d`. Treat a missing key and `null` the same way.
- **`-1` means "unknown TMDB ID".** Showly writes `-1` whenever its local table doesn't have the title: on ratings, list items and seasons. Trakt can also give `0` or nothing, so treat any value ≤ 0 as missing.
- **Dates** use `DateTimeFormatter.ISO_INSTANT`. That prints fractional seconds **only when they aren't zero** (`…T10:00:00Z` vs `…T10:00:00.123Z`). Its database default timestamp `-1` comes out as `1969-12-31T23:59:59.999Z`, which is a placeholder, not a date.
- **What each date means:**
  - Shows: `a` is when the show was added (`createdAt`), `u` is `updatedAt`.
  - **Watched movies: `a` is `updatedAt`**, the last change to the watched record, which is effectively the watch date. Showly keeps **one watch per movie**, with no rewatch history.
  - Episodes: `a` is `lastWatchedAt`, which can be null.
- **No year, IMDb ID or TVDB ID anywhere.** Each title has a Trakt ID and a TMDB ID, and only the collections carry a title. So resolving uses TMDB ID first, then title only.
- **Episode numbers are Trakt's** (season and episode from Trakt's seasons API). Our Trakt ZIP import already sends Trakt numbers to TMDB unchanged, and that works.
- **`pSe` is redundant.** A season counts as watched only when every one of its episodes is also listed in `pEp`.
- **`pOH` and `pP` hold only Trakt IDs**, and they overlap with My Shows. They're flags on top of My Shows, not separate lists.
- **Ratings are whole numbers from 1 to 10** (Trakt's scale), the same as ShowSeek's. Season and episode ratings can have `sN`/`eN` of `-1`.
- **Custom lists hold only `show` and `movie` items** in Showly's export code. Be defensive anyway, because the items come from Trakt lists, which can also hold seasons, episodes and people.
- **Each section can contain the same title more than once.** Showly's own import skips anything already in a collection, but a hand-merged or restored file can repeat titles.

### Confirmed in the real export (2026-11-12)

- **One line of compact JSON, no BOM, no trailing newline.** Keys appear in schema order, and every section is present even when empty (`"pEp":[]`).
- **Both date forms appear in one file:** `2026-11-12T06:08:24.343Z` and `2026-07-17T01:00:00Z`.
- **The "no date" placeholder is also `1970-01-01T00:00:00Z`** (epoch 0), not only the `-1` default. The followed show's `u` was exactly that, so **a show's `u` can't be trusted as an episode-date fallback without the placeholder check.**
- **A followed show can have no watched episodes** (VisionQuest is in `cH`, and `pEp` is empty). With the `following` rule it goes to Watching.
- **Watched movies carry the date the user chose:**
  - The Odyssey `2026-07-17T01:00:00Z` is its release date, from Showly's "release date" option.
  - Resident Evil carries the time it was marked.
  - **Other Mommy is `2026-11-21T06:09:00Z`, 9 days after the export.** Showly accepts future watch dates.
- **A local-only list has no `tId` key** (nulls are left out, confirmed) but **`sId` is `""`**, an empty string rather than missing.
- **`ic` is stale:** `0` on both lists although they hold 3 and 2 items. Count from `it`.
- **List items are often titles that are in no collection.** All three listed movies are on lists only. They carry `tmId` but **no title**, so shared-core change 1 (an entity with only a TMDB ID) is needed for ordinary files, not just edge cases.
- **One title can be on several lists** (TMDB 969681 and 1375441 are on both), so one entity gets two list memberships.
- Lists aren't in ID order (`id` 2 comes before 1). Order doesn't matter.

## Architecture

```
Device                                                    Cloud Function
──────                                                    ──────────────
pick .json ─► sniff (Showly schema) ─► parse v1/v2
   ─► join by Trakt ID (fill missing TMDB IDs, titles)
   ─► merge into show/movie entities ─► chunk
   ─► for each chunk: importShowlyChunk(chunk) ──────────►  resolve TMDB id → title
                                                           write episodes, lists, ratings
      ◄──────────────────────────────── stats ◄──────────  per-chunk stats
   ─► progress + summary
```

Same pattern as Simkl: one chunked callable, writes that are safe to repeat, no Storage upload.

## Server — `functions/src/showlyImport.ts`

A configuration of the shared core, like `simklImport.ts`:

```ts
export const SHOWLY_IMPORT_SOURCE: ImportSourceConfig = {
  displayName: 'Showly',
  limitDocId: 'showly', // users/{uid}/import_limits/showly
  logTag: '[showlyImport]',
  movieWatchDocPrefix: 'showly-', // watched_movies/{id}/watches/showly-…
  episodeGroupFallback: true, // only kicks in for plays TMDB doesn't have
  reportUnmatchedEpisodeTitles: true,
};
export const importShowlyChunk = createFileImportCallable(SHOWLY_IMPORT_SOURCE);
```

Export it from `functions/src/index.ts`. It uses the same `onCall` settings as the other imports (they come from `createFileImportCallable`).

### Rate limiting (identical to TV Time and Simkl)

Nothing new. `createFileImportCallable` already applies `claimImportChunkSlot` / `markImportFinished` with the shared constants from `functions/src/shared/fileImport.ts`. Showly gets its own document, `users/{uid}/import_limits/showly`, so a recent Simkl or TV Time import doesn't block it, exactly as Simkl got `import_limits/simkl`.

| Rule                                                                  | Constant                              | Refusal                                                           |
| --------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| At most 30 chunk calls a minute                                       | `FILE_IMPORT_MAX_CALLS_PER_MINUTE`    | `resource-exhausted`, `reason: 'burst'`, `retryAfterMs`           |
| One import at a time (another run with a chunk in the last 15 min)    | `FILE_IMPORT_SESSION_STALE_MS`        | `already-exists`, `reason: 'in_progress'`                         |
| 6h cooldown, counted from a run's **start**                           | `FILE_IMPORT_COOLDOWN_MS`             | `resource-exhausted`, `reason: 'cooldown'`, `nextAllowedImportAt` |
| 10s cooldown on the emulator and for `TRAKT_SYNC_BYPASS_UIDS` testers | `TEST_FILE_IMPORT_COOLDOWN_MS`        | —                                                                 |
| A run's `importId` stays valid for 24h, so retries continue it        | `FILE_IMPORT_SESSION_MAX_LIFETIME_MS` | —                                                                 |
| At most 600 chunks per run                                            | `FILE_IMPORT_MAX_CHUNKS_PER_SESSION`  | `resource-exhausted`, `reason: 'session_chunks'`                  |
| `final: true` on the last chunk ends the run                          | `markImportFinished`                  | —                                                                 |

- **Firestore rules:** the existing `match /import_limits/{source}` (owner can read, only the server writes) already covers `showly`. No rule change.
- **Account deletion:** `recursiveDelete(users/{uid})` already removes the document. Add a check for it to the account-deletion test.
- **Client:** behaves like `SimklImportService`. It reads `import_limits/showly` to show when the next import is allowed. It waits out `burst` refusals (up to 5 times, ≤60s each). It retries transient errors (`unavailable`, `deadline-exceeded`, `internal`) with 2s and 5s backoff. It resumes a stopped run with the same `importId` when the file's fingerprint matches. Errors map to messages the way `simklImportError.ts` does: cooldown, too large, rate limited, in progress elsewhere, premium required, sign-in required, backend unavailable, invalid data.

### Shared-core changes (small and backward compatible)

TV Time's behaviour is pinned by `__tests__/utils/tvtimeImportGolden.test.ts` and must not change. Simkl's tests must stay green.

1. **Count `tmdbId` as an identifier.** `assertHasIdentifier` currently needs a TVDB ID, IMDb ID or title, so an entity with only a TMDB ID is refused as `invalid-argument`. Showly ratings and list items can have a TMDB ID but no title. TV Time and Simkl always send a title or another ID, so they aren't affected.
2. **New show status `following`** (only the Showly client sends it). Showly has no "completed" status: My Shows mixes shows the user is in the middle of with shows they finished long ago. The server picks the list:
   - **Already Watched** when TMDB says Ended/Canceled **and** every aired regular-season episode is watched once this chunk's plays are written. Count the user's existing ShowSeek episodes too, which `readEpisodeTracking` already loads.
   - Otherwise **Watching**.

   A long show split across chunks is decided on its last part, so all of its plays are counted first. That needs `part` handling, because status is currently written on part 0. Alternative if this is too much: send `watching` for every My Show (see [Decisions](#decisions-recommended-defaults) 3).

3. **New "ignored" stat keys:** `hidden_movies`, `season_ratings`, `pinned_items`, `non_media_list_items`. Reuse the existing `episode_ratings`, `duplicate_plays` and `missing_identifiers`.

Everything else is existing behaviour:

- Resolution goes TMDB ID first, then title. A TMDB ID that 404s falls through to the title.
- Existing episodes, ratings and list memberships are never overwritten.
- Custom lists are matched by name, ignoring case.
- Movie watch documents are safe to repeat (`showly-{tmdbId}-{watchedAt}`).

## Client — `src/utils/showlyImport/`

- `files.ts`: accepts **one `.json`**, recognised by **content, not file name**, because users rename files and Android adds ` (1)`.
  - Strip a UTF-8 BOM if present.
  - **50MB cap**, the same as Simkl. A compact episode entry is about 90–120 bytes, so even 100k episodes is ~12MB.
  - Recognised when: it's an object with a numeric `version` and at least one of `shows`/`movies`/`lists` as an object, using Showly's short keys (`cH`, `pEp`, `l`…).
  - Specific errors for a **Simkl** backup (`shows`/`movies`/`anime` as arrays), a **Trakt** or **TV Time** export, a **ZIP** (ask for the `.json`), an **empty** library, and anything else (`unknown_format`).
- `parse.ts`: v1 and v2 readers producing one internal model, then the joins and merges below.
- `prepare.ts`: produces `FileImportChunkRequest`s with **its own chunker**, `buildShowlyChunks` (≤15 entities, ≤1,500 plays, long shows split by season into parts), plus a preview summary. Simkl's `buildSimklChunks` sorts parts by weight, which can send a show's last part before a middle one; the `following` decision needs a show's parts in order, so Showly keeps them consecutive and in index order. Later parts don't repeat the rating or lists.
- `ShowlyImportService.ts`, `ShowlyImportFlowContext.tsx`, `ShowlyImportScreen.tsx`, `ShowlyImportProgressScreen.tsx`, `src/utils/showlyImportError.ts` and the routes `app/(tabs)/profile/showly-import*.tsx`: each mirrors its Simkl counterpart. Simkl's files stay as they are, as Simkl did with TV Time's.

### Mapping

| Showly                             | ShowSeek contract                                                                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shows.cH` (My Shows)              | status `following` (server: Already Watched or Watching, see above); `addedAt` = `a`                                                                                                   |
| `shows.pOH` (on hold)              | nothing extra; they're already My Shows (ShowSeek has no on-hold list, and Simkl's `hold` maps to Watching too)                                                                        |
| `shows.cW`, `movies.cW`            | status `watchlist` / `watchlist: true` (Should Watch)                                                                                                                                  |
| `shows.cHid`                       | status `dropped`                                                                                                                                                                       |
| `movies.cHid`                      | not imported, counted as `hidden_movies` (the contract has no movie status; hidden means "don't show me this")                                                                         |
| `shows.pEp`                        | `plays` (`season` = `sN`, `episode` = `eN`, `watchedAt` = `a`, see [Dates](#dates))                                                                                                    |
| `shows.pSe`                        | not used (comes from `pEp`)                                                                                                                                                            |
| `movies.cH`                        | one watch at `a`                                                                                                                                                                       |
| `rS`, `rM` (1–10)                  | `rating` unchanged, `ratedAt` = `rA`                                                                                                                                                   |
| `rSe`, `rEp`                       | not imported, counted as `season_ratings` / `episode_ratings` (the contract has no season or episode ratings)                                                                          |
| `lists.l[].it[]` (`show`/`movie`)  | `lists: [{ name: n, addedAt: l }]` on that title's entity                                                                                                                              |
| `pP` (pinned)                      | not imported, counted as `pinned_items`                                                                                                                                                |
| list `d` (description)             | the list's description (≤120 characters, as in the app), written only on a list the import creates. Existing ShowSeek lists are never changed (`ListService` lists have `description`) |
| list `p`, `sId`, `tId`, `r` (rank) | not imported (no privacy setting or manual order on ShowSeek lists through import)                                                                                                     |

## Edge cases

### IDs and resolution

- **Build a Trakt ID → `{ tmdbId, title, type }` lookup** from every section that has both (`cH`, `cW` and `cHid` for shows and movies, `stmId` on episodes, `tmId` on ratings and list items). Use it to fill missing TMDB IDs and titles everywhere else. Shows and movies have separate Trakt ID ranges, so key the lookup by type.
- **v1 episodes** have no `stmId`. Take the TMDB ID from their show through `sId`. If the show is in no section (an orphan), the episodes can't be resolved: count them as `missing_identifiers`.
- **v1 list items** have no `tmId`. Fill them through the lookup, and drop the rest as `missing_identifiers`.
- **Ratings and list items with `-1` and no lookup match** are dropped as `missing_identifiers`, and the preview shows the count. A Trakt-ID lookup through Trakt's API could rescue them, but that's [Later](#later). Measure how often it happens with the real export first.
- **Show or movie with `tmId` ≤ 0 but a title**: falls back to a title-only search (there's no year). The core's exact-match rule then either finds one match or marks it `ambiguous_title` and names it in the summary. We never guess.
- **Two Trakt IDs with the same TMDB ID** (Trakt merges duplicates): merge them into one entity on the client. The merged entity keeps both titles' plays, ratings (first one wins) and lists.
- **The same TMDB ID as both a show and a movie**: TMDB IDs aren't shared between types, so these are separate entities.
- **An entity with only a TMDB ID** (from a rating or list item): needs shared-core change 1.

### Conflicts between sections

- **A show in more than one section**: My Shows beats Watchlist, which beats Hidden. That's the order Showly's own importer uses, since each step skips titles already added.
- **A movie both watched and on the watchlist**: send `watchlist: false`. Showly normally removes a watched movie from its watchlist, and ShowSeek removes it from Should Watch on a watch anyway.
- **A watched movie that's also hidden**: import the watch and ignore hidden.
- **Episodes for a show that's only on the Watchlist or Hidden**: import the plays. The status stays what the section says (Watchlist or Dropped), as with Simkl.
- **Episodes for a show in no section** (v2, with `stmId`): import the plays with status `null`. Use a title from the lookup if there is one; otherwise leave it empty (shared-core change 1).

### Episodes

- **Duplicates** (same show, season and episode): keep one play with the latest date, and count `duplicate_plays`.
- **Season 0 (specials)**: send them as they are. Trakt and TMDB number specials differently more often than regular seasons, so expect some `unmatched_episode`. The summary names those shows.
- **`eN` or `sN` below 0, or above the core's caps**: `malformed_row`.
- **Numbering mismatches** (Trakt vs TMDB): the TMDB "TVDB order" episode-group fallback runs only for shows with plays TMDB doesn't have. It's kept only if it places more plays. What's left is named in the summary.
- **Very long shows** (daily soaps, One Piece): split into parts by `buildShowlyChunks`, sent in order. Rating and lists go on part 0; the `following` decision waits for the last part. If an earlier part fails and is retried after the last part, the show is decided without it and lands in Watching. That's rare, and safe.

### Dates

- Parse ISO 8601 with **or without** fractional seconds, and with `Z` or an offset.
- **No date**: a missing `a`, unparseable text, anything up to `1970-01-02` (Showly writes both `1970-01-01T00:00:00Z`, confirmed, and `1969-12-31T23:59:59.999Z` for its `-1` default), or more than a day after the file's `createdAt` (confirmed: Showly accepts future watch dates). Compare against `createdAt` rather than the import time, so an old backup isn't judged by today's date. Without `createdAt` (v1), compare against the import time.
- **An episode with no date is kept, not dropped.** Use the show's `u`, then its `a`, then the file's `createdAt`. Only if all are missing is it dropped as `invalid_date`. This follows the Simkl rule: losing watch progress is worse than an approximate date.
- **A movie with no date**: use the file's `createdAt`; if that's missing too, drop it as `invalid_date`.
- **Ratings with no date**: use `ratedAt` = the item's `a`, then the file's `createdAt`.
- No lower limit otherwise, since Trakt history can go back decades.

### Lists

- **Matched to existing lists by name, ignoring case** (`ensureCustomList`). A Showly list named like an existing ShowSeek custom list is merged into it, not duplicated. Default lists (Should Watch, Watching, …) are never matched by name, because the core leaves them out of the name lookup, so a Showly list called "Favorites" becomes a custom list called "Favorites".
- **Two Showly lists with the same name** end up merged, which is the existing behaviour.
- **Names**: trimmed. An empty name becomes "Showly list". Names are capped at the core's limit.
- **Empty lists** aren't created, because the contract creates lists through their items. The preview says how many were skipped.
- **Items other than `show`/`movie`**: counted as `non_media_list_items`.
- **More than 50 lists on one title** (`FILE_IMPORT_MAX_LISTS_PER_ENTITY`): keep the 50 most recently added and drop the rest silently (no stat key fits). This should almost never happen.
- `ic` (item count) is ignored. Count from `it`, because `ic` can be stale.

### Ratings

- Must be whole numbers from 1 to 10, otherwise `malformed_row`.
- Never overwrites an existing ShowSeek rating (`existing_rating`, existing behaviour).

### The file

- **An unknown future `version`** (3 or higher): parse it like v2 and ignore unknown keys, as Showly does. If the required keys are missing, fail with `unknown_format`.
- **A missing section** (`lists` absent, `movies: {}`): treat it as empty. Moshi's defaults mean Showly itself writes empty arrays, but third-party or older files may not.
- **Wrong types inside one item** (a string `tmId`, missing `sN`): skip that item and count `malformed_row`. Never fail the whole file over one bad item.
- **Scheduled backups**: a folder can hold many `showly_export_*.json` files. The import screen tells users to pick the newest. The file name carries the date and time.
- **iOS**: Showly is Android-only, but someone moving to an iPhone may transfer the file. The picker accepts any file type, so it works there too.
- **Importing the same file again** is safe: plays, ratings and memberships are never overwritten, and movie watch IDs are deterministic. The cooldown still applies to a new run.

## UI

- **Entry point:** "Import from Showly" in the Integrations section, beside Simkl and TV Time (`IntegrationsSection.tsx`, `useProfileLogic.ts`). Needs a Showly logo. Check whether Trakt's brand guidelines now cover it.
- **Import screen:** "In Showly: Settings → Backup & Restore → Export data, save the file, then pick it here." Then a file picker. Mention scheduled backups (pick the newest) and that the import is Premium-only, like the others.
- **Preview** before anything is written:
  - Counts: shows (following, watchlist, dropped), episodes, movies (watched, watchlist), ratings, custom lists and items.
  - What won't be imported: hidden movies, season and episode ratings, pinned items, items with no TMDB ID, empty lists.
  - The cooldown note, read from `import_limits/showly`.
- **Progress and summary:** Showly's own copies of the Simkl screens. The summary names unresolved titles and shows with unmatched episodes.
- **i18n:** a `showlyImport` section in all 7 locales under `src/i18n/locales/`.

## Test fixtures

- `__tests__/fixtures/showly/real-v2-small/`: **the real `showly_export.json` from 2026-11-12** (test library, no personal data: titles, IDs, dates and two test list names). Committed as is when building starts, with a hand-checked `expected.json`. The second export from step 0 goes in `real-v2-full/`.
- `__tests__/fixtures/showly/synthetic/`: hand-written v1 and v2 files built from the schema above, using real public TMDB and Trakt IDs so they resolve against live TMDB. Scenarios:
  - My Shows: one finished ended show (→ Already Watched), one ended show half-watched (→ Watching), one running show (→ Watching), and one long show split across chunks.
  - Episodes: some without `a`, a `-1`-default date, fractional and whole-second dates, a duplicate play, specials, and a Trakt/TMDB numbering mismatch.
  - v1: episodes with no `stmId` (joined through `sId`), and an orphan episode with no show (→ `missing_identifiers`).
  - Movies: watched, watchlist, watched + watchlist, hidden, and a hidden show.
  - Ratings: show and movie ratings, one with `tmId: -1` that the lookup fills, one it can't fill, and season and episode ratings (ignored).
  - Lists: mixed show and movie items, an empty list, two lists with the same name, a name matching an existing ShowSeek list, and a v1 list item with no `tmId`.
  - The same title under two Trakt IDs, and a show in both `cH` and `cHid`.
  - Wrong files: a Simkl backup, a Trakt export, a ZIP, `{}`, and an unknown `version: 3` file that otherwise has v2 keys.
- **Tests:**
  - `__tests__/utils/showlyImport.test.ts`: every fixture against `expected.json`, and the chunks pass the real server validator.
  - `__tests__/functions/showlyImport.test.ts`, with fetch mocked like the Simkl tests:
    - the `following` split, including split shows;
    - entities with only a TMDB ID;
    - the `showly-` watch prefix;
    - `import_limits/showly`, with each refusal reason;
    - re-running the same import is harmless.
  - TV Time's golden tests and the Simkl tests pass unchanged.

## Rollout order

0. ~~**Real export.**~~ Done 2026-11-12 (see [Confirmed in the real export](#confirmed-in-the-real-export-2026-11-12)). It confirmed the date forms, omitted nulls, list `t` values and stale `ic`. That is enough to build: the sections it lacks are written by the same code, and the parser handles each uncertain case either way. The larger export is a **pre-release check in step 5**, not a blocker.
1. ~~Shared-core changes 1–3 and their tests.~~ Done; TV Time's golden tests and the Simkl tests pass unchanged.
2. ~~`importShowlyChunk`, its export from `index.ts`, and the function tests.~~ Done (`__tests__/functions/showlyImport.test.ts`).
3. ~~The parser, joins and chunking, with fixtures and tests.~~ Done (`__tests__/utils/showlyImport.test.ts`, and `showlyImportEndToEnd.test.ts`, which runs the real export through the parser, chunker and `importShowlyChunk`).
4. ~~The Integrations entry, screens, service, error mapping and i18n.~~ Done, with Showly's own screens and service (Simkl's unchanged) and the Showly app icon from its repository.
5. Deploy the functions, then test on a device before releasing the app: the small real export, plus **a second, larger export** from the same phone that covers:
   - **Watched episodes**: a few in a running show, a whole ended show (for the `following` → Already Watched case), a special (season 0), and one marked with each date option (now, release date, custom, and "don't remember" if Showly has it).
   - **Ratings**: one show, one movie, one season and one episode.
   - **Hidden**: one show and one movie. Plus **one show on hold** and **one pinned item**.
   - **A list item that's also in a collection**, and a show on a list.
   - Then sign in to Trakt once and export again, to see whether synced data changes any field or makes `-1` IDs appear.

   Add that export as `__tests__/fixtures/showly/real-v2-full/`. Anything unexpected in it is a parser fix, not a redesign. Also run one Simkl and one TV Time import to confirm the shared-core changes.

## Decisions (recommended defaults)

1. **The file only.** No Trakt API calls in v1.
2. **Shared pipeline and the same rate limiting**, with its own `import_limits/showly` document. Premium required.
3. **My Shows → `following`**, so the server decides between Already Watched and Watching. Fallback if that's too much core change: everything to Watching.
4. **Hidden shows → Dropped. Hidden movies aren't imported.**
5. **Pinned and on-hold aren't imported** (no ShowSeek equivalent). On-hold shows still arrive as followed shows.
6. **Season and episode ratings aren't imported** (the contract has no place for them). They're counted.
7. **Undated episodes are kept** with the show's date as a fallback.
8. **JSON only.** A ZIP gets a clear "pick the .json" error.

## Risks and open questions

- **Only a small real file so far.** It matched the source-derived schema exactly. Episodes, ratings, hidden titles and `-1` IDs are confirmed by the larger export during device testing (step 5).
- **Items with no TMDB ID** (`-1` that the lookup can't fill) are lost in v1. Measure how often with the real export; if it's common, do the Trakt-ID lookup ([Later](#later)).
- **Title-only fallback** without a year will often be ambiguous. These cases are named in the summary, never guessed.
- **Trakt and TMDB number specials and some anime differently.** Mitigated by the episode-group fallback; the rest are named.
- **The `following` split adds core logic.** Keep it behind the new status value so TV Time and Simkl never reach it.
- **Showly may change its schema** now that Trakt owns it. The version check and the "parse like v2" rule cover additions; anything more gets a specific error.

## Later

- **Trakt-ID → TMDB lookup on the server**, for items Showly left at `-1`, using the existing `TRAKT_CLIENT_ID` secret and Trakt's `/search/trakt/{id}?type=…` (no OAuth). Needs a per-call cap and its own throttle. Decide once step 0 and launch numbers show how many items it would rescue.
- **Season ratings** if ShowSeek ever supports them.
- **ZIP support**, if users actually send zipped exports.

## Sources

Checked 2026-11-12.

| Source                                                                                 | What it gives                                              | Licence | Use                      |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------- | ------------------------ |
| `trakt/showly` `ui-backup/…/model/*.kt`, `model/v1/*.kt`, `BackupConfig.kt`            | v1 and v2 schema and JSON keys                             | GPL-3.0 | Facts only, never copied |
| `…/features/export/runners/*.kt`, `BackupFileName.kt`, `BackupExportScheduleWorker.kt` | What fills each field, `-1` defaults, file name, schedules | GPL-3.0 | Facts only               |
| `…/features/import_/*`                                                                 | Version detection, section precedence                      | GPL-3.0 | Facts only               |
| `data-local/…/database/model/*.kt`, `common/…/DateExtensions.kt`                       | Where timestamps come from, `ISO_INSTANT` output           | GPL-3.0 | Facts only               |
| `ui-backup` / `ui-settings` `strings.xml`                                              | Menu names for the in-app instructions                     | GPL-3.0 | Facts only               |
