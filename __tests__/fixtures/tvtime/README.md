# TV Time export fixtures

Synthetic TV Time exports for the TV Time importer (see `docs/tvtime-import-plan.md`).
**Generated — do not edit by hand.** Regenerate with:

```sh
node scripts/generate-tvtime-fixtures.mjs                      # rewrite this folder
node scripts/generate-tvtime-fixtures.mjs --zip <dir>          # + importable ZIPs for manual QA
node scripts/generate-tvtime-fixtures.mjs --zip <dir> --stress # + a 1,600-play One Piece history (split across chunks)
```

A single synthetic user library (`SCENARIO` in the generator) is rendered into every export format still in circulation after TV Time shut down in July 2026. `expected.json` states what a correct parser should recover from each format, normalized to the `functions/src/shared/tvtimeImport.ts` contract. The parser tests should assert against it.

IDs are **real public catalog IDs** (TVDB/IMDb), so the ZIPs resolve end-to-end against live TMDB. Synthetic TVDB _episode_ IDs are in the 90M–99M range, far above real ones (about 11M in 2026). The user, UUIDs, timestamps and watch history are invented. No third-party fixture data is copied.

## Formats

| Folder          | Source tool                               | Files                                                                                          | Manual-QA ZIP                                   |
| --------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `gdpr/`         | Official GDPR data request                | ~14 CSVs, including decoys                                                                     | `tvtime-gdpr-data.zip` (nested in `gdpr-data/`) |
| `gdpr-minimal/` | GDPR, pruned real-world variant           | v2 + lists only, different column set                                                          | `tvtime-gdpr-minimal.zip`                       |
| `refract/`      | TV Time Out by Refract ("export my data") | `tvtime-*-2026-07-01.{csv,json}` + summary HTML                                                | `tvtime-export-2026-07-01.zip`                  |
| `liberator/`    | TV Time Liberator (extension / CLI)       | `movies.json`, `shows.json`, `activity_history.csv`, `favorites.*`, `lists.json`, `list_*.csv` | `tv-time-export.zip`                            |
| `extractor/`    | TV Time Data Extractor                    | `tv-time-export.csv` (movies only)                                                             | `tv-time-export.csv`                            |

## Where each shape comes from (checked 2026-11-04)

| Detail                                                                                                                                                                                                                       | Source                                                                                                | Licence                                    | Confidence            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------- |
| GDPR v2 columns (both variants), `user-series`/`watch-episode`/`rewatch-episode`/`tracking-stats` rows, rewatch `-N` key suffix + `gsi`, `bulk_type`, Go-map `most_recent_ep_watched`                                        | Real export in `raffleberry/riptvtime` testdata; anonymized real export in `trakt/trakt-web` fixtures | AGPL-3.0 / GPL-3.0 (read only, not copied) | **Real**              |
| GDPR `lists-prod-lists.csv`: `collection` row holding list names, `count` row, `favorite-series` (TVDB IDs), `favorite-movies` (**TV Time UUIDs only**)                                                                      | Same two real exports                                                                                 | as above                                   | **Real**              |
| Refract CSV + JSON columns, statuses (`continuing`/`up_to_date`/`not_started_yet`/`stopped`), unwatched episode rows, `special`, year-numbered seasons, mixed date formats                                                   | `trakt/trakt-web` real-export fixtures                                                                | GPL-3.0 (read only)                        | **Real**              |
| Refract list JSON `[{ name, items: [{ type, tvdb_id, uuid, name, custom_order }] }]`                                                                                                                                         | `Kaen89/tvtime-export-fix`                                                                            | MIT                                        | Inferred from parser  |
| Refract date-suffixed file names (`tvtime-movies-2026-07-01.csv`), GDPR nested `gdpr-data/` folder, account files in the ZIP, shared-timestamp duplicate rewatches, impossible dates, `stars_wording_scalev2-<id>` vote keys | `alp82/goodwatch-monorepo` import tests                                                               | MIT                                        | Inferred from tests   |
| GDPR v1 header, `followed_tv_show.csv`, `user_tv_show_data.csv` (`is_favorited`), `user_show_special_status.csv`, `tv_show_rate.csv` (**half stars, 1–5**), comment files                                                    | `devpro/keeptrack` fixture builder ("a real export's case")                                           | unstated                                   | Inferred from tests   |
| v1 movie rows: `alpha_range_key` English slug vs localized `movie_name`, `watch_date_range_key`, `0001-01-01` unknown release date, `watch`/`rewatch`/`towatch`/`follow` types                                               | `trakt/trakt-web` GDPR parser, GoodWatch tests, `joh-klein/tvtime-to-couchtimes`                      | GPL-3.0 / MIT / MIT                        | Inferred from parsers |
| Rating-set IDs `1→bad, 27→ok, 28→good, 29→great, 3→wow`                                                                                                                                                                      | `trakt/trakt-web` (checked against TV Time's ratings API before shutdown)                             | GPL-3.0 (fact only)                        | High                  |
| Liberator file names, JSON types, `activity_history.csv` columns, ratings already doubled to 1–10, ISO-ms dates, ZIP name `tv-time-export.zip`                                                                               | `Hobo-Ware/tv-time-liberator` source                                                                  | MIT                                        | **Source code**       |
| Data Extractor header `type,media_type,tmdb_id,imdb_id,tvdb_id,title,year,season,episode,watched_at,rating,review`                                                                                                           | `trakt/trakt-web` Extractor parser tests                                                              | GPL-3.0 (read only)                        | Inferred from tests   |

### Still inferred, not seen in a real file

- **`favorites.json` (Liberator):** assumed to be `{ shows, movies }`, because the CLI passes it to `toCsv`, which takes that shape.
- **Refract favorites and ratings:** no evidence the export contains either, so the fixtures have none.
- **Data Extractor episode rows:** never observed with usable IDs. Trakt and GoodWatch import only movies from this tool, and so do we.
- **`ratings-live-votes.csv` vs `ratings-v2-prod-votes.csv`:** both names appear in different sources, with the same columns. The fixture uses the first; the parser should accept either.

## Quirks the fixtures exercise

**GDPR**

- Columns are matched by name. `gdpr/` and `gdpr-minimal/` use two different real column sets and orders.
- Both `ep_id`/`s_no`/`ep_no` and the legacy `episode_id`/`season_number`/`episode_number` columns. Ray Donovan's 2016-era rows have `ep_id` empty and `s_no`/`ep_no` = `0`.
- Rewatches with real timestamps (`-1`, `-2` key suffixes), including one exact duplicate of the original play (You S1E3), which must collapse.
- An impossible date (`2016-02-30`) and a garbage date (`50663409-12-05`), which must be skipped as `invalid_date`.
- `series_name` with a year suffix (`Bodyguard (2018)`).
- A show TV Time lost (blank name, unknown TVDB ID) and a year-numbered season (`Mah-e Asal` season 1386).
- Halo is followed only in `followed_tv_show.csv`, with no v2 row, so it becomes a watchlist item.
- Movies only in v1, with no external IDs. One has a localized title (`승리호`) and an English slug (`space sweepers`); another needs year disambiguation (`The Lion King`, 2019).
- A list whose name exists only in the `collection` row ("Best of Korea"). List and favorite movies are referenced by UUID and must be joined against v1.
- Show ratings in half stars (4.5 → 9). Movie ratings come from vote IDs. One episode rating is ignored.
- **Decoys:** `emotions-live-votes.csv` has the same header as ratings, plus comment files. `access_token.csv` and `auth-prod-login.csv` contain `FIXTURE-SECRET-MUST-NOT-BE-READ`. A test should assert that string never reaches a callable payload.

**Refract**

- CSV and JSON versions of the same data, which must dedupe.
- Unwatched episodes listed with `is_watched=false`.
- Titles with commas (CSV quoting) and curly apostrophes.
- Microsecond timestamps.
- An HTML summary file to ignore.

**Liberator**

- A show row's `is_watchlisted` means "has unwatched episodes", not a watchlist. Show status must come from `status`.
- Episode ratings are present and ignored.
- A list file name with `&` (`list_fantasy_&_sci-fi.csv`).

## Format limits (why `expected.json` differs between formats)

|                     | GDPR             | GDPR minimal | Refract    | Liberator  | Extractor |
| ------------------- | ---------------- | ------------ | ---------- | ---------- | --------- |
| Rewatch timestamps  | ✅               | ✅           | count only | count only | —         |
| `up_to_date` status | — (→ `watching`) | —            | ✅         | ✅         | —         |
| Show ratings        | ✅ (half stars)  | —            | —          | —          | —         |
| Movie ratings       | ✅               | —            | —          | ✅         | —         |
| Favorites           | ✅               | shows only   | —          | ✅         | —         |
| Movie history       | ✅ (no IDs)      | —            | ✅         | ✅         | ✅        |
| Movie year          | ✅               | —            | ✅         | —          | ✅        |
| Custom lists        | ✅               | shows only   | ✅         | ✅         | —         |
