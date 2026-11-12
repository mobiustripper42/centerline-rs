---
schema: 1
id: DEC-R002
title: "Tests follow Rust convention; the lock hashes test blocks"
topic: "Testing"
status: "active"
date: "2026-11-12"
ruling: "Unit tests sit inline in #[cfg(test)] blocks, public-API tests in tests/, database tests on #[sqlx::test] against real PostGIS. /build-task locks tests by fingerprinting test blocks, not by listing files."
claims:
  - kind: "file"
    target: "scripts/lock-tests.mjs"
    note: "snapshot and verify"
  - kind: "test"
    target: "scripts/lock-tests.test.mjs"
  - kind: "file"
    target: ".claude/skills/build-task/SKILL.md"
    note: "Steps 0, 2 and 4 use the lock"
revisit_if: "The lock misses an edit to a test, or refuses Rust it should read often enough that test-writer starts shaping tests around it."
---

## DEC-R002: Tests follow Rust convention; the lock hashes test blocks

Jig's `/build-task` committed the test files and failed if any changed. Rust puts a unit test in
the file it tests, so that rule either locks the implementation too or locks nothing. The workflow
bends to the language rather than the other way round.

`scripts/lock-tests.mjs` reads Rust well enough to find test code: comments (nested), strings
(raw ones included), character literals against lifetimes. It fingerprints every `#[cfg(test)]`
item and every test-attributed function with the attributes in front of it, so an `#[ignore]` is
caught, and every file under `tests/`. Anything it cannot classify is an error, never a skip.

The tests commit stays, now with the stubs in it, because it is what undoes a violation. The
fingerprints are what detect one.

The fingerprint is of exact bytes, so tests are formatted before they are locked.

See also jig's DEC-J015 and DEC-J024, whose split and stubs this keeps.
