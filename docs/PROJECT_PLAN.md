# Centerline in Rust: project plan

Nov 11, 2026. Approved by Spink the same day. The last section records decisions made after approval.

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

**Parity method.** Both servers run side by side on bee-grace against the same data: old on 3500, new on 3501. Every phase ends with a script that asks both the same question and diffs the answers.

**One rule on writes.** Phases that write (import, matching, coverage) run against a copy of the database, never the live one, so two servers never write the same tables.

## Phases

Eleven phases, each ending with the new server giving an answer the old one gives, checked by a diff. The order runs from least to most dangerous: read-only first, writes last.

| # | Phase | Done when | Rust you meet |
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

Each phase gets its own section below, with its task table, when it starts. `/start-phase` reads that table and makes one issue per row; `/retro` closes it.

## Phase 0 — Paper and the workflow

| Task | Description | Points | Status | Notes |
| --- | --- | --- | --- | --- |
| 0.1 | Scaffold from jig generation 6 and adapt the workflow for Rust | 8 | [x] PR #1 | No issue: done before `/start-phase` existed here. Re-pointed at retro if 8 is wrong |

## Phase 1 — Hello, grace

An Axum server with `/health` showing the git sha, built in Docker, deployed on bee-grace by the TypeScript app's timer pattern on port 3501. Done when `curl` over Tailscale answers.

| Task | Description | Points | Status | Notes |
| --- | --- | --- | --- | --- |
| 1.1 | Axum server answering `GET /health` with the git sha, on port 3501 | 3 | [ ] | The handler is a natural `(yours)` criterion. First `async fn` |
| 1.2 | Dockerfile: a multi-stage build to one binary, the git sha baked in at build time | 3 | [ ] | |
| 1.3 | Deploy on bee-grace: a compose service on 3501 and the TypeScript app's systemd timer pattern, watching this repo's `production` branch | 5 | [ ] | Sized before reading the TypeScript repo's deploy folder; re-point at spec if it is bigger |
| 1.4 | The `production` branch, and a post-promote check that waits for `/health` to report the pushed sha | 2 | [ ] | Needs 1.3 |

## Rust learning track

Every phase includes a small piece of Rust that you read and a smaller one that you write, so the learning happens on real code instead of in exercises. The concepts are already ordered to match the phases above: ownership and `Result` come first because phases 1 to 3 use them immediately.

- **Before each phase:** a short, conversational explanation of its new concepts, in the same size as our sessions so far. Acronyms are defined when they first appear.
- **During:** Claude writes most of the phase. You write one piece yourself: a handler in phase 2, a test in phase 6, the diff script in phase 3. Claude reviews it, and the compiler's messages come first.
- **After:** three lines per new concept go into `RUST_NOTES.md` in the repo, in your words, so the notes are yours and searchable.
- **Read along:** the official Rust Book (free, online) matches the order of the phases: ownership, enums and `match`, error handling, traits, iterators, then async. Rustlings (small exercises) is an option for off days.
- **Where it gets hard:** traits and async, in phases 7 and 9. Both come with a plain-language walkthrough first, as ownership did.

If a phase stops being fun, it can shrink or be skipped. The old app keeps working, so nothing depends on finishing.

## Decisions deferred, and open questions

Nothing below is decided until its phase needs it; the leanings are only starting guesses.

| Decision | Decide at | Leaning |
| --- | --- | --- |
| New repo, or a folder in the existing one | Phase 0 | New repo, so the old one stays untouched as the reference |
| Compile-checked SQL (`query!`) or plain runtime queries | Phase 2 | Runtime first; the macros need the database at build time |
| Askama or Maud for templates | Phase 5 | Askama, since its templates look like HTML |
| HTMX panels, or keep some React islands | Phase 5 | HTMX; the map stays JavaScript either way |
| Reuse the Playwright specs against the Rust server | Phase 5 | Try it; the selectors may need changes where the markup differs |
| GPX: hand port or a crate | Phase 6 | Hand port; DEC-006 and the fixtures already define the behavior |
| Who runs migrations | Before phase 10 | The old TypeScript migrator until cutover |
| Admin scripts (load streets, add area, cut area) | After phase 8 | Leave them in TypeScript until you want them ported |

**What could bite.** The coverage SQL carries the rulings of DEC-027 through DEC-038, and each one fixed a real ride. Port it as written and diff the results; do not reinterpret it while learning Rust.

**Open questions for you.**

- [ ] Is a new repo right, or do you want `rs/` inside the current one?
- [ ] Is a fresh copy of the database fine for phases 6 to 8 (a `pg_dump` into a second database on bee-grace)?
- [ ] Which routes does the Expo app call besides `/api/rides` and the basemap? I confirmed those two only; phase 3 starts by listing the rest.

## Decisions made after approval (2026-11-11)

These supersede the matching lines above.

1. **Repo.** New repo, `centerline-rs`. The old repo stays untouched as the reference. Answers the first open question.
2. **Workflow.** The repo starts as a copy of jig's scaffolding (jig generation 6) and is then edited freely. Jig itself is not changed, and nothing syncs back. Whether to merge the two later, or keep two versions, is decided later.
3. **Phase 0 is bigger.** It now also includes adapting the copied workflow for Rust, as task 0.1, before any app code. Phase 1 starts after that merges.
4. **Tests follow Rust convention.** Unit tests sit inline in `#[cfg(test)] mod tests` blocks; tests of the public API go in `tests/`; database tests use `#[sqlx::test]` against a real PostGIS. The workflow bends to this: the test lock hashes the test blocks instead of listing test files.
5. **"You write one piece" becomes a criterion marked `(yours)`.** On a task where Spink wants the practice, `@test-writer` writes that criterion's test and stub, `@implementer` builds the rest first, and the task then waits while Spink writes the code. It is optional per task.
6. **Versioning** reads and bumps `Cargo.toml`, through a small script that replaces the `package.json` calls in the three version skills.
7. **Still open:** the database copy for phases 6 to 8, and the full list of routes the Expo app calls.
8. **Slices are phases** (2026-11-12). The workflow's skills, labels and retros all say phase, so the plan does too, and `docs/dictionary.yml` forbids the old word.
