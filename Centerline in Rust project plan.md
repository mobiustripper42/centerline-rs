# Centerline in Rust: project plan

Nov 11, 2026 · @Eric

## Starting point

The Rust version rewrites only the TypeScript server and the React panels; the database, the SQL, Valhalla and the self-hosting all carry over unchanged. Read from the `centerline-main` repo (SPEC.md, 38 decision records, the code), not from memory.

| Piece | Today | In the Rust version |
| --- | --- | --- |
| Schema | 15 migrations, kept as is (your call) | Unchanged. The Rust app never migrates until cutover |
| Coverage logic | PostGIS SQL inside `db/coverage.ts` and neighbors, about 4,500 lines of TS around it (DEC-001, 012, 014) | SQL copied across verbatim; Rust only runs it |
| Map matching | Two Valhalla instances over HTTP, street and path (DEC-011, 037) | Same instances, called from Rust behind a `Matcher` trait |
| API | About a dozen routes, 210 lines; the phone calls `/api/rides` and the basemap routes | Same URLs and JSON, so the Expo app works untouched |
| GPX | Hand-written reader with 11 fixture files (DEC-006) | Ported against the same fixtures |
| Map | MapLibre client code | Reused as plain JavaScript |
| Panels | React, 14 client components, about 4,000 lines under `app/` | Askama templates plus HTMX, one panel at a time |
| Hosting | bee-grace, docker compose, systemd timer watching `origin/production` (DEC-002, 004) | Same shape; the image becomes one Rust binary |
| Tests | 31 database test files, 8 Playwright specs | Old tests become the answer key |

**Parity method.** Both servers run side by side on bee-grace against the same data: old on 3500, new on 3501. Every slice ends with a script that asks both the same question and diffs the answers.

**One rule on writes.** Slices that write (import, matching, coverage) run against a copy of the database, never the live one, so two servers never write the same tables.

## Slices

Eleven slices, each ending with the new server giving an answer the old one gives, checked by a diff. The order runs from least to most dangerous: read-only first, writes last.

| # | Slice | Done when | Rust you meet |
| --- | --- | --- | --- |
| 0 | Paper only: new repo, SPEC and DECISIONS carried over, a Rust notes file | Plan and first decision record exist | Install with `rustup`; `cargo new` |
| 1 | Hello, grace: an Axum server with `/health` showing the git sha, built in Docker, deployed by the existing timer pattern on port 3501 | `curl` over Tailscale answers | `main`, `async fn`, crates and `Cargo.toml` |
| 2 | First database read: `GET /api/areas` from the existing Postgres | JSON identical to the old route | Structs, `Serialize`, `Result` and `?`, sqlx |
| 3 | The other read-only routes, one per session: headline, stats, list, remaining, streets, covered, tracks | A script diffs old against new for every route | Error enums, `Option`, shared state |
| 4 | The map page: MapLibre client reused, basemap tiles served with byte ranges | Cleveland draws from the Rust server | Static files, middleware layers |
| 5 | Panels in Askama and HTMX, one at a time: headline, stats, streets list, areas, then import and look | Each panel matches the old screen | Templates, borrowing in loops |
| 6 | GPX import with no matching: parse, fingerprint, de-duplicate, insert into the database copy | The 11 fixtures pass; a season imports to the same rows | Iterators, unit tests, parsing |
| 7 | `Matcher` trait and a Valhalla client; ports `decodePolyline6` and the piece reader | `track_pieces` equals the old app's for the same rides | Traits, `serde_json`, async HTTP |
| 8 | Coverage rebuild, SQL copied verbatim, in three steps: basics (steps 1 to 4), pairs (5), gap fill (6) | `coverage` rows equal the old app's on a whole season | Little new; consolidation |
| 9 | `/api/rides` complete: upload, match, rebuild; the phone uploads a ride unchanged | A real ride from the Pixel counts | Request bodies, background work |
| 10 | Cutover: Rust takes port 3500, old app retired | Old tests pass or are replaced, and a week of use is clean | Release builds, logs |

Not in the list: your own matcher. It starts after cutover as its own small project, with Valhalla's output as the answer key.

## Rust learning track

Every slice includes a small piece of Rust that you read and a smaller one that you write, so the learning happens on real code instead of in exercises. The concepts are already ordered to match the slices above: ownership and `Result` come first because slices 1 to 3 use them immediately.

- **Before each slice:** a short, conversational explanation of its new concepts, in the same size as our sessions so far. Acronyms are defined when they first appear.
- **During:** Claude writes most of the slice. You write one piece yourself: a handler in slice 2, a test in slice 6, the diff script in slice 3. Claude reviews it, and the compiler's messages come first.
- **After:** three lines per new concept go into `RUST_NOTES.md` in the repo, in your words, so the notes are yours and searchable.
- **Read along:** the official Rust Book (free, online) matches the order of the slices: ownership, enums and `match`, error handling, traits, iterators, then async. Rustlings (small exercises) is an option for off days.
- **Where it gets hard:** traits and async, in slices 7 and 9. Both come with a plain-language walkthrough first, as ownership did.

If a slice stops being fun, it can shrink or be skipped. The old app keeps working, so nothing depends on finishing.

## Decisions deferred, and open questions

Nothing below is decided until its slice needs it; the leanings are only starting guesses.

| Decision | Decide at | Leaning |
| --- | --- | --- |
| New repo, or a folder in the existing one | Slice 0 | New repo, so the old one stays untouched as the reference |
| Compile-checked SQL (`query!`) or plain runtime queries | Slice 2 | Runtime first; the macros need the database at build time |
| Askama or Maud for templates | Slice 5 | Askama, since its templates look like HTML |
| HTMX panels, or keep some React islands | Slice 5 | HTMX; the map stays JavaScript either way |
| Reuse the Playwright specs against the Rust server | Slice 5 | Try it; the selectors may need changes where the markup differs |
| GPX: hand port or a crate | Slice 6 | Hand port; DEC-006 and the fixtures already define the behavior |
| Who runs migrations | Before slice 10 | The old TypeScript migrator until cutover |
| Admin scripts (load streets, add area, cut area) | After slice 8 | Leave them in TypeScript until you want them ported |

**What could bite.** The coverage SQL carries the rulings of DEC-027 through DEC-038, and each one fixed a real ride. Port it as written and diff the results; do not reinterpret it while learning Rust.

**Open questions for you.**

- [ ] Is a new repo right, or do you want `rs/` inside the current one?
- [ ] Is a fresh copy of the database fine for slices 6 to 8 (a `pg_dump` into a second database on bee-grace)?
- [ ] Which routes does the Expo app call besides `/api/rides` and the basemap? I confirmed those two only; slice 3 starts by listing the rest.
