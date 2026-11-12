# [Project Name] — Decisions

Decisions about [Project Name], each with an id (`DEC-###`). Ids are burned and never reused.

**Every record is schema v1** and the corpus started empty, so there are no frozen records.
`ruling` is the one line a person reads; `claims` say what the record asserts about the spec or
the tree; the body stays under 2000 bytes.

**One decision, one file**, at `docs/decisions/DEC-###-<slug>.md`. This index is generated: edit a
record and run `npm run gen:decisions`. `npm run check:decisions` fails the build on a stale index.

**Topics** are declared in `docs/decisions/_config.json`, in reading order. Add one when the first
record that needs it is written.
