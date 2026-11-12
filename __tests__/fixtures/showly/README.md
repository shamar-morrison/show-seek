# Showly fixtures

- `real-v2-small/showly_export.json`: a real export from Showly's Settings → Backup & Restore →
  Export data, made 2026-11-12 from a local-only test library (no Trakt sign-in, no personal
  data: titles, IDs, dates and two test list names). Committed byte for byte. It has 1 show in
  My Shows, 1 on the watchlist, 3 watched movies (one dated 9 days after the export) and 2
  custom lists whose items are all list-only movies.

Sections the real file doesn't cover (episodes, ratings, hidden titles, on hold, pinned, `-1`
IDs, v1 backups) are built inline in `__tests__/utils/showlyImport.test.ts` from the schema in
`docs/showly-import-plan.md`. A larger real export is added as `real-v2-full/` during device
testing.
