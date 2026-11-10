# Simkl export fixtures

Files for the Simkl importer (see `docs/simkl-import-plan.md`). Nothing here is generated; edge cases the real files don't cover are built inline in `__tests__/utils/simklImport.test.ts`.

| File                                      | What it is                                                                                                                                                                                                                                                                                                       | Source                                                         | Licence                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------- |
| `real-backup-2026/SimklBackup.zip`        | **A real Simkl JSON backup**, exactly as downloaded from Apps → Export (2026-11-10). 10 shows, 7 anime, 8 movies. Contains only titles, ids, statuses, ratings and dates; no account data.                                                                                                                       | A throwaway Simkl test account                                 | Ours                       |
| `real-api-2020/all_items.json`            | A real captured Simkl library response from 2020 (58 shows, 59 movies), same structure as the backup. Made **without** per-episode dates, so its episode lists carry no `watched_at`.                                                                                                                            | `srgsf/simkl-client`, `src/test/resources/json/all_items.json` | Unlicense (public domain)  |
| `source/test-library-import.csv`          | The library loaded into the test account through Simkl's own CSV importer (Apps → Import → .csv) to make the backup above. After the import, Futurama S1E6 was marked "I don't remember", S1E7 "just now" and S1E8 "original air date" by hand. The account also had a few titles from before (e.g. Bridgerton). | Written for this project                                       | Ours                       |
| `source/simkl-official-import-sample.csv` | Simkl's own sample for its CSV importer (`simkl.com/ajax/apps/import-data.csv`): bare anime episode numbers (`100`), `not interesting`, `M/D/YYYY` dates, CRLF line endings. For the phase-2 CSV parser.                                                                                                         | simkl.com                                                      | Simkl's sample; facts only |

## What the real backup shows

- The ZIP holds only `SimklBackup.json` (no profile file). Simkl serves it as `text/json`.
- Completed entries (Breaking Bad, Cowboy Bebop, Attack on Titan) have **no `seasons`**, only counts.
- No `memo` key at all, and no `ids.tvdb_id` on episodes.
- `user_rated_at` is null for ratings set through Simkl's importer.
- `1970-01-01T00:00:01Z` is Simkl's "I don't remember" (Futurama S1E6).
- Episodes Simkl's importer created count back one second per episode from the import date.
- `not interesting` (CSV) is stored as `dropped`; movies can be `hold`.
- Movies carry TVDB _movie_ ids (`"tvdb": "275"`).
- Attack on Titan Season 3 Part 2 is `"Shingeki no Kyojin Season 3"` with only MAL/AniList/Kitsu/AniDB ids.
- Anime movies sit under `anime` with a `show` object and `anime_type: "movie"`; the OAD is `ova`.

To refresh the backup: free accounts can download it once every 30 days, and any request to the download URL counts (even `HEAD`), so don't probe it.
