# CenterLine in Rust — Project Context

Everything specific to **this** project. The `CLAUDE.md` shell reads this file at session start and treats it as authoritative for project-specific facts.

## What We're Building

A Rust rewrite of the web half of CenterLine: the server and the desktop panels. CenterLine is a personal map of which streets the rider has ridden or walked inside areas they define, counted as **miles covered over miles that exist**. The database, the coverage SQL, the Valhalla matchers, the phone app and the hosting all carry over unchanged. The TypeScript app (the `centerline` repo, checked out beside this one) keeps running and is the reference: every phase ends with the Rust server giving an answer the TypeScript one gives, checked by a diff. `docs/SPEC.md` is what we're building; `docs/PROJECT_PLAN.md` is the phases.

**This is a fun project, and a school.** No deadline, no revenue goal. Two goals of equal weight: a working Rust CenterLine, and Spink learning Rust by reading and writing real code on every phase. If a phase stops being fun it shrinks or is skipped; the old app keeps working, so nothing depends on finishing.

**Who is at the keyboard.** Spink (Eric): a retired application developer, 20+ years of TypeScript and C#, new to Rust. So:

- **Explain each new Rust concept briefly and conversationally before using it**, in terms of what he already knows from C# and TypeScript, and say where they differ.
- **Define every acronym the first time it appears.**
- **Keep answers short, and ask instead of guessing.**
- **His notes are his.** After a phase, three lines per new concept go into `docs/RUST_NOTES.md` in his words. Offer the list of concepts; never write the notes.

Roles:
- **Rider** — the one user, and the operator. No other role, no auth, no multi-tenancy.

## Stack

Chosen in `docs/PROJECT_PLAN.md` and `docs/SPEC.md` § Stack. A crate is added in the phase that first needs it, and adding one is Spink's to run (`cargo add` is denied).

- **Language** — Rust, stable, edition 2024 (`Cargo.toml`). One crate: the library in `src/lib.rs`, a thin binary in `src/main.rs`.
- **Web** — Axum, from phase 1.
- **Panels** — Askama templates and HTMX, from phase 5. The map stays MapLibre JavaScript.
- **Database access** — sqlx, from phase 2; plain runtime queries first.
- **Database** — Postgres with PostGIS. Owned by the TypeScript repo: its schema, its migrations, its data. See Migration Protocol (project).
- **Matching** — the TypeScript repo's two Valhalla instances, over HTTP, from phase 7.
- **Hosting/target** — bee-grace, a headless Ubuntu box at home, Tailscale only, docker compose, deployed by a systemd timer watching `origin/production` as the TypeScript app is. Port 3501 until cutover, beside the TypeScript app on 3500.
- **Dev environment** — mill-dev, a VPS on the same Tailscale network. The rider also works from a phone.
- **Testing** — `cargo test`. Workflow tooling (`scripts/*.mjs`) is tested with `node --test`.

## Core Data Model

The tables, their columns and why: `docs/SPEC.md` § Data Model, carried word for word from the TypeScript repo. This repo reads them and, from phase 6, writes them on a database copy; it never changes their shape. The shape a session most needs to hold:

```
areas         one row per polygon (Cleveland, Ohio City) — MultiPolygon
streets       one row per OSM way — does NOT belong to an area; class stored at load
tracks        one row per recorded ride or walk — fingerprint = md5 of the geometry
track_pieces  what the matcher said: a track's runs along OSM ways, kept per track
coverage      street × track → covered geometry + length; cascades both ways
settings      key-value knobs; the code errors on a missing row rather than falling back
```

Which streets are in an area is a **query**, not a column: intersect the street with the polygon plus buffer.

## Commands

The Rust toolchain is installed with `rustup` under `~/.cargo`. `npm` runs only the doc gates and the workflow scripts.

```bash
# Development
cargo build
cargo run                          # the binary; from phase 1, the server
cargo fmt                          # format; the gate checks it
cargo clippy --all-targets -- -D warnings   # lint; every warning is an error

# The gate — what /kill-this runs before committing
npm run verify   # check:decisions, check:dictionary, check:denied, check:context, check:docs, test:scripts, then cargo fmt --check, clippy, test, build

# Testing
cargo test                         # every test in the crate
cargo test <filter>                # tests whose path contains <filter>, e.g. `cargo test gpx::`
cargo test --test <name>           # one integration test file, tests/<name>.rs
npm run test:scripts               # the workflow scripts' own tests

# Workflow scripts
node scripts/lock-tests.mjs snapshot <file>   # fingerprint every test block (used by /build-task)
node scripts/lock-tests.mjs verify <file>     # exit 1 when a test block changed
node scripts/version.mjs get                  # the version in Cargo.toml
node scripts/version.mjs bump patch|minor|major   # used by the version skills, not by hand

# Decision record and dictionary
npm run gen:decisions              # regenerate docs/DECISIONS.md after editing a record
npm run gen:dictionary             # regenerate docs/DICTIONARY.md after editing docs/dictionary.yml
```

## Additional Docs

| File | Purpose |
|------|---------|
| `docs/RUST_NOTES.md` | Spink's Rust notes, three lines per concept, in his words |
| `docs/FUTURE_IDEAS.md` | Ideas caught but not planned. The rider's own matcher, after cutover, starts here |
| `docs/DICTIONARY.md` | The project's words, one meaning each. **Generated** from `docs/dictionary.yml` |

## Workflow Mechanisms

| Slot | What it answers | This project |
|---|---|---|
| **Proof** | What counts as a check written before the change | A `cargo test` test, placed by Rust convention (DEC-R002): a unit test in the `#[cfg(test)] mod tests` block of the file it tests; a test of the public API in `tests/`; a database test on `#[sqlx::test]` against a real PostGIS, never mocked. Its name starts with the acceptance criterion's id in snake case (`ac2_rejects_a_ride_with_no_points`). How a test database gets the TypeScript repo's schema is decided at phase 2; until then there are no database tests. Workflow scripts are proven by `node --test` suites beside them. |
| **Proof command** | How to run the checks covering what you touched | `cargo test <filter>`, the filter naming the module or test that covers the change; `cargo test --test <name>` for one file in `tests/`; `npm run test:scripts` for a workflow script. |

**The gate** is `npm run verify`, run by `/kill-this`.

## Median gaps

| Gap | Why the default is wrong here |
|---|---|
| Write the whole task | A `(yours)` criterion is Spink's to write (DEC-R003). The default finishes the job; here the run stops, names the test and the stub, and waits. A sketch, a hint in code or a "here's roughly how" is writing it |
| Use the idiomatic Rust right away | Explain it first. A competent default writes good Rust without comment; here every new concept is explained before it appears in code, so the code can be read |
| Improve the SQL while porting it | The coverage SQL carries rulings that each fixed a real ride (the TypeScript repo's DEC-027 to DEC-038). It is copied verbatim and the results diffed; reinterpreting it while learning Rust is how a ruling gets lost |
| Add a migration for a schema change | The schema belongs to the TypeScript repo until cutover. This repo never migrates, and never runs `sqlx migrate` against a shared database |
| Write to the live database | Phases that write (import, matching, coverage) run against a copy, never the live one, so two servers never write the same tables (`docs/PROJECT_PLAN.md` § Starting point) |
| A street belongs to an area | It does not. Membership is a spatial query, so a shared boundary road counts for both sides. A `street.area_id` is a defect (`docs/SPEC.md` § Data Model) |
| Coverage is a count of streets done | It is miles, measured by PostGIS on a geography cast, never in Rust, so there is one definition of a mile (`docs/SPEC.md` § Coverage Rules) |
| Sum coverage across areas for a grand total | There is no grand total. Shared roads double-count by design; each area is an independent goal |
| Mock the database in tests | PostGIS functions are the logic under test. Database tests run against the real thing |
| A route's JSON can be tidied | It cannot. The phone app calls these routes unchanged, so the URLs and JSON match the TypeScript app's byte for byte, and the phase's diff script is what proves it |

## Blast-Radius Triggers

Read by `/kill-this`, which answers a hit with `/security-review`. There is no money and no auth: the app is reachable over Tailscale only, with one user and no sign-in, as the TypeScript app is.

| Trigger | Paths |
|---|---|
| Money moving or computed | none: nothing here takes, pays or totals money |
| Auth / capability URL | none: no sign-in, no tokens, no signed links. The first one adds its path here in the same pull request |

## Migration Protocol (project)

N/A here until cutover: the TypeScript repo owns the schema and its migrations, and runs them on every deploy. This repo adds no migration files and never runs a migration. A change the Rust app needs in the schema is made as a migration in the TypeScript repo, by its own workflow. Who runs migrations after cutover is decided before phase 10 (`docs/PROJECT_PLAN.md` § Decisions deferred).

### Production write protection

On bee-grace the database has no host port: only an app container reaches it. The discipline is that a session never points a connection string at bee-grace, and that the writing phases (6 to 8) use a copy of the database, never the live one. There is no mechanism behind either yet. What this does not cover: a shell on bee-grace itself, and the Rust container once phase 1 gives it a connection string, which is why the read-only phases come first.

## Conventions

- **Format and lint** — `cargo fmt` defaults; `cargo clippy --all-targets -- -D warnings` clean. No `#[allow(...)]` without a comment saying why.
- **Structure** — library code in `src/`, one module per concern; `src/main.rs` only starts things. Split a module on responsibility, not on a line count.
- **Error handling** — functions that can fail return `Result` and pass errors up with `?`. No `.unwrap()` or `.expect()` outside tests and the startup in `main`. The error type of a route is decided at phase 3.
- **Geometry** — every geometry is SRID 4326 (plain longitude and latitude). Lengths and spatial tests are PostGIS calls in SQL, never Rust arithmetic.
- **SQL** — ported from the TypeScript repo verbatim, as a string the Rust code runs. A query is changed only with a diff showing the same rows come back.
- **Naming** — Rust's: `snake_case` functions, modules and files, `CamelCase` types. Database names are the TypeScript repo's, unchanged.
- **Testing layout** — see the Proof slot. Fixtures for `tests/` live under `tests/`, so the test lock covers them.
- **User-facing text** — inline: no catalog. The panels' wording matches the TypeScript app's screens.

## Workflow Notes (project)

- **`cargo: command not found` in a session.** The session's shell started before `rustup` added `~/.cargo/bin` to the path. `source ~/.cargo/env` in the same command fixes that call; a new session picks it up from the profile.
- **The PostGIS image is `-alpine` on purpose** (the TypeScript repo's Workflow Notes). The Debian `postgis/postgis:17-3.5` image ships GEOS 3.9.0, on which `ST_Intersection` of a line inside a polygon returns `LINESTRING EMPTY`. Any test database this repo starts uses the alpine image.
- **Timestamps are stored UTC and displayed in `America/New_York`.** An evening ride starts after midnight UTC, so a UTC-formatted day files it under the wrong date. Anything that renders a date converts first.
- **Never `curl`.** It is denied, and it takes the whole command down with it. A parity diff against the TypeScript server is a script, not a `curl` line.
