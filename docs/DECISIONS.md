# CenterLine in Rust — Decisions

Decisions about the Rust rewrite, each with an id `DEC-R###`. Ids are burned and never reused.

**Why the `R`.** The TypeScript repo's records are `DEC-001` to `DEC-038`, and `docs/SPEC.md` carries
sections from it that cite them; jig's are `DEC-J###`. This repo's own ids are prefixed so none of
the three can be mistaken for another, and only `DEC-R` ids are checked here: a bare `DEC-027` is
the TypeScript repo's, and resolves there.

**Every record is schema v1** and the corpus started empty, so there are no frozen records.
`ruling` is the one line a person reads; `claims` say what the record asserts about the spec or
the tree; the body stays under 2000 bytes.

**One decision, one file**, at `docs/decisions/DEC-R###-<slug>.md`. This index is generated: edit a
record and run `npm run gen:decisions`. `npm run check:decisions` fails the build on a stale index.

**Topics** are declared in `docs/decisions/_config.json`, in reading order. Add one when the first
record that needs it is written.

## Index

### Workflow
- DEC-R001 — The workflow is a fork of jig generation 6, owned here
- DEC-R003 — A (yours) criterion is written by the operator

### Testing
- DEC-R002 — Tests follow Rust convention; the lock hashes test blocks

### Repo structure & versioning
- DEC-R004 — The version lives in Cargo.toml

_**This file is GENERATED** by `npm run gen:decisions` —
edit `docs/decisions/DEC-*.md`, not this file. `npm run check:decisions` fails on a stale index, a
duplicate id, an unknown topic, an unlanded SPEC amendment, or a reference to a decision
that does not exist._
