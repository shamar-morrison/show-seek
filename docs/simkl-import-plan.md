# Simkl Import — Implementation Plan

Status: **planning, nothing built. Step 0 (a real export) done 2026-11-10.** · Approach: **file import only (no Simkl API, no sync)**, reusing the TV Time chunked-import pipeline.

## Goal

Let users bring their Simkl library into ShowSeek from the files Simkl lets them download: watched episodes, watched movies, show status and ratings (plus memos from the CSV, in phase 2).

## Context

- Simkl's exports live on the website only, under **Apps → Export** (`https://simkl.com/apps/backup/`). The mobile apps can't export.
- We use **no Simkl API**. Simkl's API rules (attribution, the "trackers must offer Simkl sync" rule, the commercial licence over $150/month) apply to API use, not to a file the user downloaded themselves.
- **We have a real backup.** On 2026-11-10 we loaded a test library into a free test account through Simkl's own CSV importer, marked a few episodes by hand, and downloaded the JSON backup (10 shows, 7 anime, 8 movies). "Confirmed" below means seen in that file. Other details come from Simkl's documentation, open-source tools, and one real captured library response from 2020 (`srgsf/simkl-client`, Unlicense; see [Sources](#sources)). The CSV backup (Pro-only) and VIP rewatch rows are still unseen.

### Export formats

| Format                | How users get it                                          | Who can                                                                                 | Contents                                                                                         |
| --------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **JSON backup** (ZIP) | Apps → Export → ".zip archive with .json file"            | **Free and Pro: once every 30 days** (VIP: unlimited). Confirmed on Simkl's upsell page | `SimklBackup.zip` holding **only** `SimklBackup.json`. Served as `text/json` despite being a ZIP |
| **CSV backup**        | Apps → Export → "Simple .CSV file backup"                 | Pro / VIP only                                                                          | One row per title. **Only the last watched episode**, no per-episode history                     |
| Third-party JSON      | Exporter tools that call Simkl's API (SimklExpoGter etc.) | Anyone                                                                                  | Same structure as the JSON backup, sometimes without episode lists                               |
| Simkl-import CSV      | Converters that produce Simkl's _import_ format           | Anyone                                                                                  | Same idea as the CSV backup, with a different header                                             |

`SimklBackup.json` has the structure of Simkl's `GET /sync/all-items?extended=full&episode_watched_at=yes` response, pretty-printed with 4-space indents. Abridged from the real backup:

```jsonc
{
  "shows": [ {
    "added_to_watchlist_at": "2026-11-10T05:38:36Z",
    "last_watched_at": "2026-11-10T05:39:00Z",
    "user_rated_at": null, "user_rating": 8,   // rated_at can be null even when rated
    "status": "watching",                      // plantowatch | watching | hold | completed | dropped
    "last_watched": "S01E08", "next_to_watch": "S01E09",   // anime: "E120"
    "watched_episodes_count": 8, "total_episodes_count": 164, "not_aired_episodes_count": 0,
    "show": { "title": "Futurama", "poster": "13\/1338682908d9da5ca1", "year": 1999, "runtime": 22,
              "ids": { "simkl": 3407, "slug": "futurama", "imdb": "tt0149460", "tmdb": "615", "tvdb": "73871",
                       "tvdbslug": "futurama", "traktslug": "futurama" } },
    "is_rewatch": false,
    "seasons": [ { "number": 1, "episodes": [
      { "number": 6, "watched_at": "1970-01-01T00:00:01Z" },   // Simkl's "I don't remember"
      { "number": 8, "watched_at": "1999-05-11T11:00:00Z" }    // "original air date" choice
    ] } ]                                       // absent on completed entries
  } ],
  "anime":  [ { …same fields…, "anime_type": "tv", "show": { "title": "Shingeki no Kyojin Season 3", "year": 2019,
                "ids": { "simkl": 931899, "mal": "38524", "anilist": "104578", "kitsu": "41982", "anidb": "14444" } } } ],
  "movies": [ { …same fields without seasons/last_watched…, "movie": { "title": "The Godfather", "year": 1972,
                "ids": { "simkl": 53434, "imdb": "tt0068646", "tmdb": "238", "tvdb": "275", "letterboxd": "the-godfather" } } } ]
}
```

CSV headers seen (matched by name, case-insensitive):

| Variant                     | Header                                                                                                                                                   | Seen in                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Backup CSV (**"Simkl v1"**) | `SIMKL_ID,Title,Type,Year,Watchlist,LastEpWatched,WatchedDate,Rating,Memo,TVDB,TMDB,IMDB[,MAL_ID]`; `WatchedDate` as `02-28-2017 15:58:41` (month first) | TMDB's importer calls this format "Simkl v1"; a sample in `Mormani/movies-list-csv-converter`; CrossWatch, animeManga-autoBackup |
| Import CSV (converters)     | `simkl_id,TVDB_ID,TMDB,IMDB_ID,MAL_ID,Type,Title,Year,LastEpWatched,Watchlist,WatchedDate,Rating,Memo`                                                   | pogdesign-to-simkl, TV-Time-to-SIMKL                                                                                             |
| Import CSV (Simkl's docs)   | as above with `SIMKL_ID`, `TMDB_ID`; `WatchedDate` as `DD-MM-YYYY` or `MM/DD/YYYY`                                                                       | Simkl's CSV import page (via GoodWatch notes)                                                                                    |

### Format quirks

**Confirmed in the real backup (2026-11-10):**

- **Completed entries have no `seasons` at all.** Breaking Bad (62/62), Cowboy Bebop (26/26) and Attack on Titan (25/25) carry only counts. Watching, on-hold and dropped entries do list their episodes. So "watched through" expansion is required, not an edge case.
- **No memos.** The backup has no `memo` key at all, although the memos were saved on Simkl. Memos only reach us through the CSV (phase 2).
- **No episode IDs** (`ids.tvdb_id`) on episodes. The numbering fallback can't use TVDB episode IDs for Simkl backups.
- **`user_rated_at` is null** for ratings set through Simkl's importer. Fall back to other dates.
- **`1970-01-01T00:00:01Z` is Simkl's "I don't remember"** option in its "When did you watch this?" dialog. Treat it as no date.
- **Episodes Simkl's importer created** count back one second per episode from the import date (S1E1 `23:59:55` … S1E6 `00:00:00`). Users who imported into Simkl from elsewhere will have these.
- **Imported `not interesting` becomes `dropped`.** No `notinteresting` status in the file.
- **Movies can be `hold`** (Terminator 3), although Simkl's docs say they can't. Accept any status for any type.
- **Movies carry TVDB _movie_ IDs** (The Godfather `"tvdb": "275"`). Never send a movie's TVDB ID to TMDB's `/find?external_source=tvdb_id`, which is for series and episodes.
- **Anime entries can have no TMDB, TVDB or IMDb ID.** Attack on Titan Season 3 Part 2 is `"Shingeki no Kyojin Season 3"` (2019) with only MAL/AniList/Kitsu/AniDB IDs. Anime titles are romaji (`"Kimi no Na wa."`, `"Shingeki no Kyojin"`), so title search must not expect English names.
- **Anime numbering:** one season (`1`), episodes numbered within the entry; One Piece lists episodes 1–120 with `last_watched: "E120"`.
- **Anime movies** are in `anime` with a `show` object and `anime_type: "movie"` (Your Name, with its TMDB _movie_ ID). The OAD is `anime_type: "ova"`.
- **Old dates are real** (The Godfather watched `1985-06-01`). No 1990 floor like TV Time's.
- **IDs are strings**, except `simkl` (a number). Extra ID keys to ignore: `slug`, `tvdbslug`, `traktslug`, `letterboxd`, `kitsu`.
- **Slashes are escaped** (`"13\/1338…"`); standard JSON parsing handles it. No BOM.
- **Free accounts get no rewatch rows**; every entry has `"is_rewatch": false`.
- **`watching` with nothing watched is common** (pre-existing items in the test account, and 54 of 57 watching shows in the 2020 capture). Status only.
- **Dates are often midnight UTC** for imported or date-only watches. Keep them as is.

**From other sources, not seen in our backup:**

- Top-level keys appear only when non-empty; an empty library is `{}` (Simkl's API docs).
- Episodes without dates (2020 capture, made without per-episode dates): the season list then holds exactly the watched episodes. Rule: if the listed count is at most `watched_episodes_count`, every listed episode is watched (undated ones take `last_watched_at`); otherwise keep only the dated ones.
- Cours of one series can share the parent's TMDB ID (Simkl's anime guide: all six Attack on Titan entries share TMDB 1429), but as the real backup shows, many cour entries carry no TMDB ID at all.
- VIP rewatch rows (`is_rewatch: true`, `rewatch_id`) and `ids.tvdb_id` on episodes come from API options; handle them if present.

## Architecture

```
Device                                                   Cloud Function
──────                                                   ──────────────
pick .zip / .json / .csv ─► unzip (fflate, SimklBackup.json only)
   ─► detect format ─► parse ─► normalize to the shared contract
   ─► group anime cours ─► chunk
   ─► for each chunk: importSimklChunk(chunk) ─────────►  resolve TMDB id → TVDB → IMDb → title
                                                         map episodes / expand "watched through"
                                                         write episodes, lists, ratings, notes
      ◄─────────────────────────────────── stats ◄────  per-chunk stats
   ─► progress + summary (reused TV Time screens)
```

Same pattern as TV Time: one chunked callable, idempotent writes, no Storage upload or task queue.

## Refactor first — share the TV Time pipeline

The TV Time import already does TMDB resolution, episode mapping, never-overwrite writes, status lists, rate limiting, chunking and the progress UI. Simkl reuses it rather than copying it.

1. **Neutral contract.** Move `functions/src/shared/tvtimeImport.ts` to `functions/src/shared/fileImport.ts` with source-neutral names (`FileImportShowEntity`, `FileImportStats`, …). Keep `shared/tvtimeImport.ts` re-exporting the old names so existing app code is untouched. No behaviour change.
2. **Server core.** Extract the handler body of `functions/src/tvtimeImport.ts` into `functions/src/fileImport/core.ts`, parameterised by a source config:

   ```ts
   interface ImportSourceConfig {
     id: 'tvtime' | 'simkl';
     movieWatchDocPrefix: string; // 'tvtime-' | 'simkl-'
     limitDocId: string; // users/{uid}/import_limits/{id}
     premiumMessage: string;
   }
   ```

   `importTvTimeChunk` becomes a thin wrapper; `importSimklChunk` is a second one.

3. **Client.** Generalise `TvTimeImportScreen` / `TvTimeImportProgressScreen` / `TvTimeImportFlowContext` / `TvTimeImportService` into source-configured components (title, logo, instructions, accepted file types, `prepare()`), with TV Time as the first config.

All existing TV Time tests must pass unchanged after each step.

## Shared contract additions

All optional and backward compatible; the TV Time client never sets them.

```ts
interface FileImportShowEntity {
  // existing: tvdbId, imdbId, title, status, favorite, rating, lists, addedAt, plays, part
  tmdbId?: number; // tried first when present
  year?: number | null; // first-air year for title search when the title has no "(YYYY)" (±1)
  /** Episodes known only as "watched up to here" (CSV, summary-only JSON, completed without seasons). */
  watchedThrough?: { kind: 'all' } | { kind: 'through'; season: number; episode: number };
  watchedThroughAt?: number; // epoch ms, the one date to stamp on expanded episodes
  /** Anime numbering: plays are per Simkl entry, not TMDB seasons. */
  anime?: { entryEpisodeTotal: number | null; groupedEntries: number };
  note?: { content: string; updatedAt: number }; // phase 2: only the CSV carries memos
}

interface FileImportMovieEntity {
  // existing fields, including tmdbId. tvdbId stays null for Simkl movies (TVDB movie IDs don't work with TMDB /find).
  note?: { content: string; updatedAt: number }; // phase 2
}
```

Plays reuse the existing `tvdbEpisodeId` field, filled from an episode's `ids.tvdb_id` when the export has it.

New stats keys: skipped `unmatched_anime_episode`, `existing_note`; ignored `anime_extras`, `dropped_movies`, `summary_only_episodes`. New stats list `unmatchedEpisodeTitles` (show names with unmatched episodes, capped like `unresolvedTitles`) so the summary can name them.

Validation follows the existing rules in `parseTvTimeImportChunk` (strict types, the same entity/play/list caps). `note.content` is capped at 1,000 characters (Simkl memos are ≤140).

## Client — `src/utils/simklImport/`

### Files

- `files.ts`: accepts a `.zip`, `.json` or `.csv`, **detected by content, not extension or MIME type** (Simkl serves the ZIP as `text/json`, and some phones save it with odd names). In a ZIP, inflate **only** `SimklBackup.json` (any folder) or, failing that, one `.csv`. The real ZIP holds nothing else, but Simkl's docs mention profile data, so ignore any other entry.
  - **50MB cap** on both the picked file and the inflated JSON. A watched episode is about 50 bytes of JSON, so even a 100k-episode library is ~5–6MB; 50MB leaves 10× headroom and keeps the worst case far below TV Time's 150MB.
  - **Release memory as we go:** drop the raw bytes once inflated, and the parsed JSON once it's converted to entities.
- `detect.ts`:
  - JSON with any of `movies` / `shows` / `anime` arrays → `json` (backup or third-party; same parser).
  - CSV whose header has `simkl_id` and `Title` (any case) → `csv`.
  - A TV Time or Trakt export, or `{}` → a specific error, not "unknown format".
- `parsers/json.ts`, `parsers/csv.ts` → normalized entities.
- `prepare.ts`: chunking with its own chunker (TV Time's is left untouched): ≤ 15 entities, ≤ 1,500 listed plays, and ≤ ~1,500 _expected_ episode writes, counting "watched up to" expansion from `watched_episodes_count`. Long shows split by season into parts, "watched up to" on part 0 only. (Deduping and anime grouping live in `parsers/json.ts`.)

### Mapping

| Simkl                                   | ShowSeek contract                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `plantowatch`                           | `watchlist`                                                                                                 |
| `watching`                              | `watching`                                                                                                  |
| `hold`                                  | `watching` (ShowSeek has no on-hold list; the user meant to come back)                                      |
| `completed` (shows)                     | `up_to_date` → server's existing split: TMDB Ended/Canceled → Already Watched, otherwise Watching           |
| `dropped`, `notinteresting`             | `dropped`                                                                                                   |
| `user_rating` (1–10)                    | `rating` as-is, `ratedAt` = `user_rated_at` ?? `last_watched_at` ?? `added_to_watchlist_at`                 |
| `seasons[].episodes[]`                  | `plays`, using the listed-count rule under [Format quirks](#format-quirks); `ids.tvdb_id` → `tvdbEpisodeId` |
| no `seasons`, `completed`               | `watchedThrough: { kind: 'all' }`, `watchedThroughAt` = `last_watched_at`; counted `summary_only_episodes`  |
| no `seasons`, `last_watched: "S04E08"`  | `watchedThrough: { kind: 'through', season: 4, episode: 8 }`                                                |
| `is_rewatch` rows                       | merged into the main entry: extra episode plays (server keeps the latest), extra movie watches              |
| CSV `Memo` (phase 2; the JSON has none) | `note`                                                                                                      |
| movie `ids.tvdb`                        | dropped (a TVDB _movie_ ID; resolve movies by TMDB → IMDb → title + year)                                   |
| movie `completed`                       | one watch at `last_watched_at`; falls back to `added_to_watchlist_at` when missing or a placeholder         |
| movie `plantowatch` or `hold`           | `watchlist: true`                                                                                           |
| movie `dropped`                         | not imported, counted `dropped_movies` (no movie status in the contract)                                    |

### Anime

No licence-free dataset maps cours onto TMDB seasons (Anime-Lists and Fribb have no licence; Kometa's MIT list has no season offsets). So:

- `anime_type: "movie"` → a movie entity (TMDB → IMDb → title + year).
- `ova`, `ona`, `special`, `music video` → not imported, counted `anime_extras`. Their IDs often point at the parent show, so applying their status there would be wrong.
- `tv` entries sharing a TMDB or TVDB ID are **grouped into one show** (the cours of one series). Status and rating come from the entry with the latest activity (`last_watched_at`, then `added_to_watchlist_at`).
- **Cour entries with only anime IDs** (MAL/AniList/Kitsu/AniDB, as with Attack on Titan Season 3 Part 2 in the real backup) can't be grouped or resolved by ID. They go to title search with their romaji title and year; if there's no exact match they're `unresolved_show` and named in the summary. We don't guess, because a near-match would land on the parent show and mark the wrong episodes.
- Episodes:
  - **One entry for the show** → plays keep Simkl numbering with `anime.entryEpisodeTotal`. The server maps them only if that total equals TMDB's regular-season episode total, numbering straight through TMDB's seasons. One Piece-style absolute numbering and single-cour shows work; anything else is `unmatched_anime_episode`.
  - **Several entries (cours)** → show-level data only; every play is `unmatched_anime_episode`.
- Anime with no TMDB, TVDB or IMDb ID is resolved by title + year like any other show.

The summary screen tells the user how many anime episodes couldn't be placed, so the loss is visible.

### CSV specifics (phase 2)

- `Type`: `movie`/`movies` → movie; `tv`, `tv show`, `show`, `shows` → show; `anime` → anime show.
- `Watchlist`: `completed`, `watching`, `plan to watch`/`plantowatch`, `on hold`/`hold`, `dropped`/`notinteresting`. CrossWatch-style `1` means plan to watch.
- `LastEpWatched`: `S04E08`, `s4e8`, `4x08` → `watchedThrough`; anime `E12` or `s1e12` → entry numbering.
- `WatchedDate`: ISO first. Otherwise `NN-NN-YYYY` / `NN/NN/YYYY` with an optional `HH:MM:SS`, treated as UTC. The order is **decided per file**, not per row: the "Simkl v1" sample is month-first with dashes (`02-28-2017`), while Simkl's import page mentions `DD-MM-YYYY`, so the separator can't decide. If any row's first part is over 12, the file is day-first; if any second part is over 12, month-first; if no row settles it, month-first (the observed backup format), and the preview flags that the dates were ambiguous.
- A `completed` show with no `LastEpWatched` → `watchedThrough: all`.

### Dates

- Unparseable, more than a day in the future, or at/below `1970-01-02` (placeholder) → no date.
- A watched episode without a usable date (none, or Simkl's "I don't remember") is kept and stamped with the entry's `last_watched_at`, falling back to `added_to_watchlist_at`; only with neither is it dropped and counted `invalid_date`. Dropping it would lose real watch progress.
- Item-level dates fall back as in the table.
- No lower floor otherwise.

## Server — `importSimklChunk`

Same `onCall` settings as `importTvTimeChunk` (`concurrency: 1`, `maxInstances: 10`, `memory: '512MiB'`, `timeoutSeconds: 300`, `TMDB_API_KEY`), same auth → validate → premium → rate-limit order.

Differences from TV Time, all in the shared core behind optional entity fields (which only the Simkl client sends) or per-source flags (`episodeGroupFallback`, `reportUnmatchedEpisodeTitles`; both off for TV Time). TV Time's behaviour is pinned by `__tests__/utils/tvtimeImportGolden.test.ts` and must not change:

1. **Resolution order** `tmdbId` → `tvdbId` → `imdbId` → title (+ year). A `tmdbId` that 404s falls through to the next ID.
2. **`watchedThrough` expansion.** Fetch TMDB seasons (already cached per call). Mark every regular-season episode (season ≥ 1) with an air date on or before `watchedThroughAt`, and, for `through`, up to the given episode. Explicit `plays` win over expanded ones. Expanded episodes follow never-overwrite like any other. Without `watchedThroughAt` there's no expansion: the client only sends `watchedThrough` with a date (`last_watched_at`, falling back to `added_to_watchlist_at`), so a show with neither gets status only. Each call expands at most 20,000 episodes in total (above the longest daily soaps, ~15,000), so a crafted chunk can't make one call write without bound.
3. **Anime mapping** as above.
4. **Episode-numbering fallback.** Simkl numbers TV like TVDB; TMDB sometimes differs (Futurama, Doctor Who, reordered specials). For each show:
   1. **Detect** a mismatch: a play whose season/episode doesn't exist on TMDB (after step 2).
   2. **TVDB episode IDs first.** Plays with `tvdbEpisodeId` go through TV Time's existing `/find` repair (capped per call).
   3. **TMDB episode groups.** For a still-flagged show, fetch `/tv/{id}/episode_groups` and look for a group named like "TVDB order". If there is one, map **every** play of that show through it, not only the missing ones, so numbering stays consistent, and use that result only if it places more plays than TMDB's own numbering. Two extra requests per flagged show, at most 10 shows per call.
   4. **Report the rest** as `unmatched_episode`, with the show name in `unmatchedEpisodeTitles`.

   This could also help TV Time's Refract and Liberator imports (TVDB numbering without episode IDs), but it's off for TV Time: turning it on would be a deliberate TV Time change with re-recorded golden files.

5. **Notes (phase 2, CSV only).** Write `users/{uid}/notes/{tv|movie}-{tmdbId}` with the same fields `NoteService` writes (`userId`, `mediaType`, `mediaId`, `content`, `posterPath`, `mediaTitle`, `createdAt`, `updatedAt`). Skip as `existing_note` if the doc exists.
6. **Movie watch docs** use the `simkl-` prefix: `watched_movies/{id}/watches/simkl-{tmdbId}-{watchedAt}`.
7. **Rate limit** in `users/{uid}/import_limits/simkl`, so a Simkl import isn't blocked by a recent TV Time import. Same rules and constants. Add the Firestore owner-read rule and confirm account deletion removes it.

Everything else (never-overwrite episodes and ratings, list writes, `up_to_date` split, rewatch collapse, idempotent keys) is the existing TV Time behaviour.

## UI

- **Entry point:** "Import from Simkl" next to IMDb and TV Time (`useProfileLogic.ts`, after `handleTvTimeImport`). Needs a Simkl logo asset; check Simkl's media kit for usage terms.
- **Import screen:** short steps: "On a computer, open simkl.com → Apps → Export → Download backup (.zip)". A button opens `https://simkl.com/apps/backup/`. Note that free accounts can download the JSON **once every 30 days** (so tell users to pick the file they already have rather than download again), and the CSV needs Simkl Pro and has less detail. File picker for `.zip`, `.json`, `.csv`.
- **Preview** before writing: format, counts (shows, episodes, anime, movies, ratings, notes) and pre-skips. A CSV import warns that only "watched up to" progress is available.
- **Progress / summary:** the generalised TV Time screens. The summary lists unresolved titles, the shows with unmatched episodes (by name, so users can fix those few by hand) and the anime-episode count.
- **i18n:** a `simklImport` section in all 7 locales in `src/i18n/locales/`.

## Test fixtures

Same approach as `__tests__/fixtures/tvtime/`:

- **Built in step 3:** `__tests__/fixtures/simkl/` holds the two real files (`real-backup-2026/`, `real-api-2020/`) and the CSVs used to make the backup (`source/`), with a README. Edge cases the real files don't cover are inline in `__tests__/utils/simklImport.test.ts`; `__tests__/utils/simklImportEndToEnd.test.ts` runs the real backup through the parser, chunker and `importSimklChunk`.
- **Deferred to phase 2 (CSV):** `scripts/generate-simkl-fixtures.mjs`, which renders one synthetic library into every CSV variant (and the JSON) with an `expected.json`. `--zip <dir>` writes importable files for manual QA; `--stress` adds a heavy library (~3,000 titles, ~100k episodes, a 1,100-episode One Piece) for the on-device memory test.
- Folders: `backup/` (`SimklBackup.json` + a profile file holding `FIXTURE-SECRET-MUST-NOT-BE-READ`), `backup-summary/` (third-party, no `seasons`), `csv-backup/` ("Simkl v1", month-first dashed dates), `csv-import/`, `csv-import-docs/` (day-first and slash dates).
- `real-backup-2026/`: **the real `SimklBackup.zip` from our test account** (2026-11-10), committed as is. It contains only titles, IDs, statuses, ratings and dates from a throwaway account, no personal data. Hand-check its `expected.json` entry rather than generating it. The synthetic `backup/` fixture should mirror its exact shape (key order, 4-space indent, escaped slashes, completed entries without `seasons`).
- `real-api-2020/`: the real captured library from `srgsf/simkl-client`, committed as is (Unlicense, public domain) with its source noted. Hand-check its `expected.json` entry. It covers the date-less episode lists, extra ID keys, escaped slashes, a `hold` movie and many empty `watching` shows.
- The test library itself is reproducible: `test-library-import.csv` (in the scratchpad today; commit it as `__tests__/fixtures/simkl/source/`) loaded through Simkl's CSV importer, plus Futurama S1E6 "I don't remember", S1E7 "just now", S1E8 "original air date" marked by hand.
- Real public catalog IDs (several come straight from Simkl's API examples) so files resolve against live TMDB. Invented users, dates and history.
- Scenario coverage:
  - Futurama `watching` with per-episode dates and a `last_watched` that disagrees with the episode list
  - The Walking Dead with no TMDB ID (TVDB/IMDb resolution) and one episode without `watched_at`
  - Game of Thrones `completed` with a VIP rewatch row
  - A `completed` show with no `seasons` (expansion)
  - Charmed `plantowatch`, one `hold`, one `dropped`, one legacy `notinteresting`
  - Movies: The Godfather `completed` with a 1994 date and a rewatch; Pulp Fiction `dropped`; Inception rated with a memo; Interstellar `plantowatch`; one with the `1970-01-01T00:00:01Z` placeholder
  - Anime: Cowboy Bebop (only MAL/AniDB/AniList IDs, single entry); Attack on Titan S1 + Season 3 Part 2 sharing TMDB 1429 (→ grouped) **and** the real-backup variant where Season 3 Part 2 has only anime IDs and a romaji title (→ unresolved); One Piece absolute-numbered; Your Name (`anime_type: movie`, TMDB movie ID); one OVA (ignored)
  - A completed show with no `seasons` (Breaking Bad shape from the real backup), episodes counted back one second each (Simkl-importer shape), and a movie with a TVDB movie ID that must not be used
  - String and number IDs, escaped slashes, titles with commas and quotes (CSV), a UTF-8 BOM (CSV)

## Testing

- **Parser tests** (`__tests__/utils/simklImport.test.ts`): each fixture folder against `expected.json`; chunks pass the real server validator; the planted secret never appears in a payload.
- **Function tests** (`__tests__/functions/simklImport.test.ts`, fetch mocked like the TV Time tests):
  - TMDB-ID-first resolution and 404 fallthrough
  - `watchedThrough` expansion: `all`, `through`, air-date cutoff, no-date → status only, plays override
  - anime: matching-total mapping, mismatched total → unmatched, grouped cours → show-level only
  - numbering fallback: mismatch detection, TVDB-episode-ID repair, "TVDB order" episode group remaps the whole show, no group → `unmatchedEpisodeTitles`, per-call cap
  - (phase 2) notes written once, `existing_note` on re-run
  - `simkl-` watch prefix, per-source rate-limit doc
  - idempotent re-run
- **Refactor safety:** every TV Time test passes unchanged after the refactor steps.
- **Manual QA:** the real export from step 0 and the generated ZIPs. No emulator testing on our side; the user tests on device, including the `--stress` file on a low-end Android phone.

## Rollout order

0. ~~**Real export.**~~ Done 2026-11-10; findings are under [Format quirks](#format-quirks). Still open: measure how many Futurama / Doctor Who episodes end up unmatched or misplaced, which needs the importer (step 3). The CSV backup and VIP rewatch rows stay unseen unless a Pro/VIP account is used. A free account's backup can only be downloaded once every 30 days, so don't probe the download URL (even a `HEAD` request counts).
1. ~~Refactor: neutral contract and server core (TV Time tests green).~~ Done; the client screens were left alone and Simkl got its own in step 4. A golden comparison test (`__tests__/utils/tvtimeImportGolden.test.ts`) pins TV Time's behaviour to the pre-refactor code.
2. ~~Contract additions + `importSimklChunk` + function tests.~~ Done.
3. ~~JSON parser, prepare/chunking + parser tests and real fixtures.~~ Done.
4. ~~Integrations entry, Simkl screens, service, i18n.~~ Done (Simkl's own screens and service; TV Time's unchanged).
5. **CSV parser — deferred**, see [Later](#later).
6. Deploy the functions, then real-file QA on a device (the real backup, plus one TV Time import to confirm the shared core), before releasing the app.

## Decisions (recommended defaults)

1. **Files only.** No Simkl API, OAuth or sync.
2. **Share the TV Time pipeline** rather than copy it; neutral names, per-source config.
3. **Premium required**, same as the other imports.
4. **Never overwrite** existing ShowSeek data (episodes, ratings, notes, list memberships), as with TV Time.
5. **`hold` → Watching.** **`completed` → the existing Ended/Canceled split.**
6. **Summary-only entries are expanded** to every aired episode up to the watched point, stamped with the one date we have. Without a date, status only.
7. **JSON only for now; the CSV is deferred.** The JSON is free for every account (Pro included) and complete; the CSV is Pro-only and holds only "watched up to". Picking a CSV shows a message pointing to the JSON backup.
8. **Anime: licence-free rules only.** Movies, single-entry shows whose episode total matches TMDB, and status/rating/notes for everything else. No unlicensed mapping lists.
9. **Memos become ShowSeek notes, with the CSV (deferred).** The JSON backup doesn't include memos.
10. **Per-source rate limits** (`import_limits/simkl`).
11. **Dropped movies and anime extras are counted, not imported.**
12. **Numbering fallback in v1:** TVDB episode IDs when present, then TMDB "TVDB order" episode groups, then name the show in the summary. No TVDB API in v1.
13. **50MB file cap** for Simkl, with memory released between stages.

## Risks and open questions

- **Episode numbering.** Mitigated by the fallback in [Server](#server--importsimklchunk), step 4. The real backup has no TVDB episode IDs, so for Simkl it rests on TMDB "TVDB order" episode groups. Shows with a mismatch and no such group are named in the summary. Measure with the real backup once the importer exists.
- **Anime cours without TMDB/TVDB IDs** will mostly come out unresolved. Visible in the summary; the TVDB API wouldn't fix this either.
- **Memory.** Low risk at realistic sizes (see the 50MB cap). Verified with the `--stress` file on a low-end Android phone. If that struggles, read the picked file straight into bytes instead of base64 (`TvTimeImportService.ts` decodes a base64 string today); that would help the TV Time import too, so it's a follow-up rather than a v1 requirement.
- **To confirm with the real export:** see step 0.

## Later

- **Simkl CSV backup (was step 5).** Deferred on 2026-11-10 because it adds little: every Simkl account, Pro included, can download the free JSON backup, which has every episode with its own date; the CSV is Pro-only and holds only the last episode watched per title. Picking a CSV today shows `csv_not_supported` pointing to the JSON. Build it if users ask. The spec is under [CSV specifics](#csv-specifics-phase-2) (header aliases, per-file date order, "watched up to" from `LastEpWatched`, memos → notes). How to test it:
  - **Without a real file:** the "Simkl v1" header that several independent tools agree on, the `Mormani/movies-list-csv-converter` sample, and Simkl's official import sample (`__tests__/fixtures/simkl/source/`; add a `.gitattributes` `-text` rule first so its CRLF line endings stay byte-exact). Use Simkl's own CSV importer as a check: import a CSV into a fresh free account, download that account's free JSON backup, and compare what the CSV parser produces against what the (tested) JSON parser reads from Simkl's result. One fresh account per check, because of the 30-day download limit.
  - **What only a real file proves:** the exact header and date format of the CSV Simkl's export page produces (sources disagree on day- vs month-first). Get one with a month of Simkl Pro on the test account, or an anonymised file from Simkl's Discord or subreddit, before release.
  - **Risk to keep in mind:** a file whose dates never exceed 12 in either position can't be told apart; default to month-first and say so in the preview.
- **TVDB API for numbering.** Simkl's numbering is TVDB's, so TVDB's episode list (season, number, air date, episode ID) maps every Simkl episode exactly: match to TMDB by air date (episode order breaks same-day ties), falling back to the TVDB episode ID. It would slot into the same detection point as the v1 fallback and help the TV Time import too. It does little for anime: TVDB doesn't know Simkl's cour splits; only shows numbered straight through (One Piece) gain, because TVDB's absolute numbers would line up even when episode totals drift.
  - **Cost:** TVDB has no public commercial pricing ("Contact Us", discounts for open-source projects); attribution "with a direct link to TheTVDB.com" is required wherever its metadata is shown, which may not apply to matching-only use but needs confirming with them. Another API key in Functions, another rate limit, and 1–2 extra requests per flagged show.
  - **Decide on it when** step 0 or post-launch numbers show either: more than ~2% of imported TV episodes ending unmatched or misplaced after the v1 fallback, or more than ~5% of imported shows named in the unmatched summary. Ask TVDB for pricing in parallel so the decision isn't blocked on a quote.
- **Anime cour mapping** if a licensed dataset appears or Anime-Lists/Fribb add a licence.
- **Episode memos**: not in the JSON backup, and the CSV has only title-level memos.
- **Simkl custom lists** aren't in the backup; nothing to do unless that changes.

## Sources

Checked 2026-11-09/10.

| Source                                                                                                       | What it gives                                                                                                          | Licence       | Use                     |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------- |
| Simkl help: _Export Options_, _Export Data Formats_ (docs.simkl.org)                                         | Export routes, tiers, CSV limits, JSON contents                                                                        | —             | Facts                   |
| Simkl API reference: `GET /sync/all-items` (api.simkl.org)                                                   | Authoritative field list and example responses                                                                         | —             | Facts, fixture shapes   |
| **Our real `SimklBackup.zip`** (free test account, 2026-11-10) and Simkl's official `import-data.csv` sample | Authoritative backup shape; importer CSV conventions (bare anime episode numbers, `not interesting`, `M/D/YYYY`, CRLF) | —             | Committed as fixtures   |
| `srgsf/simkl-client` `src/test/resources/json/all_items.json`                                                | **Real** captured library (2020): 58 shows, 59 movies                                                                  | Unlicense     | Committed as a fixture  |
| `hugoalves-dev/simkl-mcp-cloudflare-workers` `tests/fixtures/library-items.json`                             | Episodes with `ids.tvdb_id`, empty `memo: {}`                                                                          | MIT           | Reference               |
| `Mormani/movies-list-csv-converter` `data/templates/simkl_v1.csv`; `rohzzn/basicfolio`                       | "Simkl v1" CSV header and month-first dashed dates (TMDB import format name)                                           | None / MIT    | Facts                   |
| TheTVDB API information (thetvdb.com/api-information)                                                        | Licensing, attribution                                                                                                 | —             | Facts                   |
| `bokusu/animeManga-autoBackup`                                                                               | Builds `SimklBackup.zip` from the API response; backup-CSV column list                                                 | MIT           | Reference               |
| `Soviann/trackarr`                                                                                           | Reads ZIP/JSON/CSV backups; string-or-number IDs                                                                       | MIT           | Reference               |
| `jakejarvis/sofa`, `ggerame/TV-Time-to-SIMKL`, `cloudsmaker/pogdesign-to-simkl`                              | Entry shapes, import-CSV header and values                                                                             | MIT           | Reference               |
| `alp82/goodwatch-monorepo` issues #608, #372, #621 and research doc                                          | Live export page details, tiers, placeholder dates, anime licence note                                                 | (issues/docs) | Facts                   |
| `cenodude/CrossWatch`, `itsdankai/media-trove`, `PranshulGG/WatchMaster`                                     | Backup-CSV header, parsing notes                                                                                       | AGPL / GPL    | Read only, never copied |
| `Aunali321/tally`, `leopluradon/SeenIt`                                                                      | Backup parsing, CSV aliases                                                                                            | None stated   | Read only, never copied |
| `Anime-Lists/anime-lists`, `Fribb/anime-lists`                                                               | Anime → TMDB season/offset mapping                                                                                     | **None**      | Not used                |
| `Kometa-Team/Anime-IDs`                                                                                      | AniDB ↔ MAL/TVDB/TMDB IDs, no offsets                                                                                 | MIT           | Not needed for v1       |
