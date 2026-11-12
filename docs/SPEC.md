# CenterLine in Rust — Product Specification

The Rust rewrite of CenterLine's server and desktop panels. The product does not change: the TypeScript repo (`centerline`, checked out beside this one) is the reference, and its spec is the source of this one. Overview, Philosophy, Roles, Core Concepts, Coverage Rules, Data Model and Not planned are carried from it word for word on 2026-11-12, so the decision ids and paths they cite are that repo's, not this one's. One phrase is reworded: Data Model names that repo's `db:settings` script in words, since this repo has no such script and its gate checks every one a doc names. Stack is rewritten for Rust, and Phases is replaced by this repo's plan.

## Overview

A personal map that shows which streets I've ridden or walked within areas I define — a city, a neighborhood, whatever boundary I care about. It takes in my recorded GPS tracks, matches them against a street database, and displays statistics on my coverage of each area.

It replaces CityStrides, which was rejected because it only ingests from Garmin and because it marks a street complete after touching a few of its nodes. This app counts miles, not streets.

## Philosophy

**The number is honest.** Coverage is miles ridden over miles that exist, clipped to the area. The denominator is real road, it does not move when someone re-tags OSM, and no partial pass gets full credit. A percentage that flatters is worse than none.

**One person, one map.** No accounts, no sharing, no leaderboards. The only user is the one who rode the streets.

**Desktop is a study, the phone is for the ride.** Two separately designed experiences, never one layout reflowed. The phone records a ride or walk and shows the map while riding; the desktop is where the map is studied (`docs/design/mobile-approved.md`, 2026-09-30). Until the 2026-10-01 planning session the phone was "a glance," and desktop the only one built.

**Recording came late, on purpose.** Through Phase 6 the app did not record: Gaia already did that well, and the thing that did not exist was the coverage map. Phase 8 adds a recorder on the phone as a second intake. Nothing in the data model assumes a track arrived as a file.

**This is a fun project.** No deadline, zero or near-zero cost, and self-hosting the app and database is part of the point.

## Stack

What changes is the server and the panels; everything they talk to stays where it is (`docs/PROJECT_PLAN.md` § Starting point). A layer's crate is added in the slice that first needs it, not up front.

- **Language** — Rust, stable, edition 2024. One crate, a library with a thin binary on top.
- **Web framework** — Axum, from slice 1.
- **Panels** — Askama templates with HTMX, one panel at a time, from slice 5. Maud is the alternative, decided then.
- **Database access** — sqlx, from slice 2. Plain runtime queries first; the compile-checked `query!` macros need a database at build time, and are decided at slice 2.
- **Database** — unchanged: Postgres with the PostGIS extension, in Docker Compose. The schema belongs to the TypeScript repo's migrations until cutover; this repo never migrates it.
- **Map matching** — unchanged: the same two Valhalla instances, street and path, called over HTTP from slice 7 behind a `Matcher` trait.
- **Map rendering** — unchanged: the MapLibre client code is reused as plain JavaScript, served by the Rust server from slice 4.
- **Phone app** — unchanged and untouched: the Expo app calls the same URLs and gets the same JSON.
- **Hosting / target** — unchanged: bee-grace, a headless Linux box at home, reachable over Tailscale only. The image becomes one Rust binary. Until cutover the Rust server runs on port 3501 beside the TypeScript one on 3500.
- **Testing** — `cargo test`: unit tests inline, public-API tests in `tests/`, database tests on `#[sqlx::test]` against a real PostGIS, never mocked. One `verify` script gates the doc checks, format, lint, tests and build.

### What PostGIS is

Postgres stores rows. PostGIS is an extension that adds a geometry column type and functions that understand it: how long is this line, where along this street does this point fall, cut this line where it crosses this polygon. Without it those are hand-rolled math on latitude and longitude pairs. With it they are one query each, and a spatial index makes them fast on a whole city. Every measurement below is one of those functions; which ways a ride was on is the matcher's. A reference page for the functions this project uses is written in Phase 1, the first time one is called.

## Roles

- **Rider** — the one user. Imports tracks, defines areas, reads the map and the numbers. There is no other role.

## Core Concepts

- **Area** — a polygon with a name, a kind and a one-line note. Areas are built by the admin with scripts from the OSM extract on disk, never drawn in the app, and the rider chooses which are on their list (Phase 9, `docs/design/areas-approved.md`). Three kinds, and the kind decides what counts: a **city** is an OSM administrative boundary and counts streets; a **part** is a city cut along OSM lines (Cleveland West and East, on the Cuyahoga) and counts streets; a **park** is a park's shape and counts trails only. Areas are rows, not config. They may overlap, and each is an independent goal, so no grand total is ever summed across them. Every ride counts in every area it touches, on the list or not.
- **Street** — a named road: every way that shares its name, clipped to an area with a few meters of buffer. OSM splits a road wherever a tag changes, so "Detroit Ave" is one street made of many ways. Miles are the unit, and the clipping is what makes a shared boundary road count fully for both areas.
- **Way** — one OSM line: one row of the `streets` table. Coverage is computed and stored per way, and a street's miles are its ways' miles.
- **Track** — one recorded GPS line with a date, activity type, distance and duration. A track is the same thing whether it came from a Gaia file, an API, or a future recorder. Where it comes from is a separate concept.
- **Intake** — the path a track arrives by. Gaia GPX file import is the first; the phone's recorder is the second (Phase 8). A new path adds an intake, not a new kind of track.
- **Coverage** — how much of a given way a given track covered. Valhalla's two matchers match each track once, when it is imported, into pieces of OSM ways, which are kept per matcher (DEC-013, DEC-037); a street, sliver or alley takes its credit only from the street matcher's pieces, a cycleway or trail only from the path matcher's; PostGIS lays each piece on its way and measures it (DEC-014). A track's kind — ride, walk, untagged — does not change what it covers. Everything displayed derives from this table. Until task 6.5b it was a join in PostGIS with a 25 m tolerance (DEC-009, superseded).
- **Street class** — which OSM tags count as streets, and the side categories kept apart from them: alleys, slivers (street ways of 15 m or less, issue #195) and cycleways, all drawn on the map and none counted in a city's percentage, and from task 9.5 trails (footways, paths, bridleways, tracks and steps, not sidewalks or crossings), which count only in a park.

## Coverage Rules

Settled in full in the handoff. Restated here because it is the part most likely to be quietly gotten wrong.

**Metric is distance.** Total centerline miles in an area versus miles covered. Never street count as the primary number. A street count may appear as a secondary, gamified stat.

**Unit is the OSM way geometry, not lane-miles.** A two-way street is one line; ride it once in either direction and it is done. A divided boulevard is two lines in OSM and both count, and riding one side credits the other where they run alongside (task 6.8, DEC-033): "For any person ... Euclid is one street." Two lines are a divided road's sides when they share a name, run one-way in opposite directions, and lie side by side within `pair_distance_m` (60 m): the shorter one's midpoint lies beside the longer, or at least 10 m of the shorter lies beside it (issue #212, DEC-036), which catches a road OSM breaks into sides at different points. A path beside a road is a pair too, along the stretch where they run together (issue #208, DEC-034): a cycleway or trail and the street or sliver beside it, riding either credits the other. The path is sampled every 10 m; a sample pairs with its nearest street within `gap_fill_m` (30 m) when the two run within 30 degrees of parallel and no street, sliver, alley, cycleway or trail lies between (an excluded way, a sidewalk or a service road, blocks nothing); a run of 80 m or more along one path line (the ways sharing a `STREET_KEY`) beside one street line pairs. A sidewalk (excluded) and an alley never pair.

**A corridor is one thing to ride** (issue #208, AC19). A road, both its sides if it is divided, and the paths alongside them are one corridor: riding any one way through it credits all of them, along the stretch they share. Credit hops from the way ridden to the ways paired with it, and on from there, cut at each hop to where the two run together. Pairing never takes away credit that the gap fill gives without it (AC20): the fill runs over the credit as it stood before path pairing and again over the credit with it, and keeps both.

**Counted as streets:** `highway=residential`, `unclassified`, `primary`, `secondary`, `tertiary`, `living_street`. `pedestrian` was added 2026-09-21 at task 1.2 and taken out again 2026-09-30 at task 6.5b: every track is matched as a bike, so nothing could credit Cleveland's 28 pedestrian streets (1.48 mi, Market Avenue, West 24th Place), and how walks should count is not decided (`docs/FUTURE_IDEAS.md`, DEC-014).

**Excluded:** everything else — `highway=motorway`, `motorway_link`, `trunk`, `trunk_link`, sidewalks and crossings (`footway=sidewalk`, `footway=crossing`), `service` that is not an alley, every `*_link` ramp — `highway=pedestrian`, for now (above) — and anything with `access=private` or `access=no`, checked before any other rule so a private cycleway is excluded rather than a cycleway. Checked with it: a way where bikes are banned and walking is too — `bicycle=no` with `foot` = `no`, `customers` or `private` (issue #46, the airport roads). Either ban alone leaves a way counted.

**Alleys** (`highway=service` + `service=alley`) are out of the main number, but in their own class rather than lumped in with the excluded roads, so counting them later is a change to one query and not a reload of the streets. There is no switch for them: moved to `docs/FUTURE_IDEAS.md` on 2026-09-24 at task 4.4 — "still doing the min build."

**Slivers** (issue #195, DEC-028) are street ways of 15 m or less, the pieces OSM leaves between a divided road's sides and at odd junctions. A way that would be a street but is 15 m or shorter, by the length the row stores, is class `sliver` instead: drawn faint like an alley, counted by nothing, never credited and never colored. Only streets become slivers; a short alley, cycleway, trail or excluded way keeps its class. A real 15 m piece of a street the rider rode stops counting too, which the rider accepted.

**Cycleways** (`highway=cycleway`, and `highway=path` + `bicycle=designated`) render on the map and sit outside the street percentage. Their own stat line moved to `docs/FUTURE_IDEAS.md` with the alley switch.

**Trails** (`highway=footway`, `path`, `bridleway`, `track` and `steps`, task 9.5) are what a park counts with its cycleways (DEC-018). A sidewalk or a crossing is part of the street beside it and stays excluded; the access rules come first, so a bridleway that bans bikes and walking both is excluded. Tracks and steps are in on the rider's call, to come out if they turn out wrong. A city neither counts nor draws them, so its numbers are the same as before they existed. Golf courses are cut out of a park, cart paths and all. A ride the matcher put on a trail covers it; most hiking trails the bicycle costing cannot reach (issue #144).

**Clipping.** Street geometry is clipped to the area polygon with a buffer of a few meters. A street on a shared boundary counts fully for both areas. A street that pokes one block into an area contributes only that block. Summing across areas double-counts shared roads, which is accepted; there is no grand total.

**Edge cases handled explicitly:** cul-de-sacs (the true mileage is in and back out), pedestrian-only streets (excluded for now, above), GPS drift (the matcher's search radius, a setting, not buried in a query), a loop street ridden across where it starts (the stretch either side, not the loop), a gap in a street's credit (one tolerance, `gap_fill_m`, 30 m; issue #199, DEC-030, replacing the end snaps of task 6.6 and DEC-029: a hole between two stretches, a turn short of a corner or a dead end's end, a ride that stopped at an OSM split — one rule. A street is the ways of one name and class joined where they meet at a node, each unnamed way its own; an uncredited piece of it no longer than G, with credit 10 m or longer touching it on that street, is credited, to every ride whose credit touches it. A piece that runs on into a longer unridden piece is that piece and stays. A divided road's side is a street of its own, filled after pairing. The map, the miles and "finished" all read the filled credit), and pauses (the straight line from where a recording stopped to where it resumed is neither ridden nor distance; task 6.2). A ride is matched once per segment, cut at its pauses and nowhere else; the credit across a detour or a turn lane was dropped because two matchers left it nothing to credit, and the cuts at U-turns and at held breaks because the rider chose to give them up, at 0.4 mi of Cleveland (issue #219, DEC-038).

## Data Model

Five tables, reviewed one at a time in task 0.2 (2026-09-20), a sixth, `track_pieces`, in task 6.5b, a seventh, `street_pairs`, in task 6.8, and an eighth, `path_pairs`, in issue #208. This is the shape a person can disagree with, so it lives here; `.claude/CLAUDE-context.md` points at it, and the DDL is `ls db/migrations/`.

- **areas** — one row per polygon. Cleveland is a row. Lakewood is a row. Columns: name, kind (city / part / park from task 9.2; city / neighborhood / custom before it), a one-line note, whether it is on the rider's list, source (`osm` / `drawn` / `cut` / `operator`, the last an area made from every polygon one OSM operator runs, task 9.5), the OSM relation id when the source is one OSM relation, `geometry(MultiPolygon, 4326)`. MultiPolygon so a city with an exclave, or every Metroparks reservation, is one row and one percentage. The area the map shows is the `current_area` setting, so the phone and the desktop open on the same one. The streets load for a shape larger than any area — Cuyahoga County plus Hinckley Reservation, from task 9.1 — and that shape is not an area.
- **streets** — one row per OSM way; the table is named for what its rows add up to. Columns: OSM way id (unique, so reloads are idempotent), name, the `highway` tag copied out, every tag as `jsonb`, the ruleset's verdict as `class` (street / alley / sliver / cycleway / trail / excluded) stored at load, `geometry(LineString, 4326)`, length in meters computed by PostGIS. A way does not belong to an area.
- **tracks** — one row per recorded ride or walk. Columns: a fingerprint (md5 of the geometry bytes, unique, so re-importing a file is a no-op, except that it fills in the pauses and each point's time of a row imported before they were kept), name, start time, duration, distance computed by PostGIS, activity (bike / walk / unknown, editable), intake (`gaia_gpx`; the phone's value comes in Phase 8), source filename, `geometry(LineString, 4326)`, the pieces of that line that are pauses (task 6.2), and the extract of the matcher that matched it, null until it is (task 6.5b). Each point's time is kept in `point_ms`, milliseconds since `started_at`, beside the line, so no fingerprint changes (issue #170, DEC-019).
- **track_pieces** — what the matcher said about a track: one row per run of it along one OSM way, in order, as the path along that way (task 6.5b, DEC-013). No foreign key to `streets`, so a piece on a way the streets do not have is kept and counted. Replaced whole when a track is matched again.
- **street_pairs** — the two sides of a divided road, two street ids (task 6.8, DEC-033). Derived from `streets` by `db/divided-pairs.ts` and rewritten at every street load.
- **path_pairs** — a stretch of a cycleway or trail way beside a stretch of a street or sliver way (issue #208, DEC-034): path id, road id, each way's stretch as fractions (`path_lo`, `path_hi`, `road_lo`, `road_hi`, `0 <= lo < hi <= 1`), `created_at`; key `(path_id, road_id, path_lo)`, both ids cascading on delete. One row per stretch of one path way paired with one road way. Derived from `streets` by `db/path-pairs.ts` and rewritten at every street load.
- **coverage** — one row per way a track touched. Columns: street id (the way's row), track id, the covered part as `geometry(MultiLineString, 4326)`, its length. Both keys cascade on delete, so recompute-all is a truncate. The geometry is stored, not only the length, so a half-covered way draws as half.
- **settings** — key-value, one row per knob: `match_search_radius_m` (50; the matcher's, replacing the join's `match_tolerance_m` at task 6.5b), `gap_fill_m` (30; DEC-030, above; `end_snap_m` and `dead_end_snap_m` are retired, left in the table and read by nothing), `clip_buffer_m` (5), `alleys_on` (false; read by nothing yet, kept for the alley switch in Future Ideas), and `streets_source`, the extract the streets were loaded from, which the map matcher must share (task 6.5a). The radius is never a literal in a request. Each knob and its default is listed in `db/settings.ts`, and the TypeScript repo’s npm script db:settings adds a missing one, on every deploy, never overwriting a value set by hand; a migration never adds a settings row (task 6.6). The code errors on a missing row rather than falling back.

Every table has `created_at`. `updated_at` only where a row is edited in place: areas, tracks, settings. No `created_by`; multi-user is a product change in Future Ideas, and a user column is one additive migration when that is designed.

Which streets are in an area is a query, not a column: intersect the street with the polygon plus buffer, and the length of what survives is that way's contribution to the area's denominator. That is how one row counts for both Cleveland and Lakewood without being stored twice.

Streets are loaded once by a setup script. Nothing touches the Overpass API at request time; two earlier prototypes failed exactly there, on partial results returned silently.

## Phases

The slices, what each one is done when, and the Rust each one meets are in `docs/PROJECT_PLAN.md`. Each slice ends with the Rust server giving an answer the TypeScript one gives, checked by a diff.

## Not planned

Everything below lives in `docs/FUTURE_IDEAS.md`, where nothing is a promise. This list exists so a session checking scope finds the answer here without opening that file.

- **Zip code areas** — not in OSM.
- **Any intake other than Gaia GPX and the phone's recorder** — no API.
- **Route finder.**
- **Second city** — the setup script targets Cleveland.
- **iOS** — Android first. The recorder's one interface is shaped so iOS is one Swift module, not a second app (DEC-016).
- **Public exposure** — Tailscale only, the phone included. Opening the app to the internet is its own decision, not a config flag.
