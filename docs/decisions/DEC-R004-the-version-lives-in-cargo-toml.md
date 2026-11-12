---
schema: 1
id: DEC-R004
title: "The version lives in Cargo.toml"
topic: "Repo structure & versioning"
status: "active"
date: "2026-11-12"
ruling: "The project version is the version line in Cargo.toml's [package]. scripts/version.mjs is the only reader and writer, and the three version skills call it instead of npm."
claims:
  - kind: "file"
    target: "scripts/version.mjs"
    note: "get, bump patch|minor|major"
  - kind: "test"
    target: "scripts/version.test.mjs"
  - kind: "file"
    target: ".claude/skills/retro/SKILL.md"
    note: "Step 9 bumps through version.mjs"
revisit_if: "The repo becomes a Cargo workspace with more than one versioned crate, or the binary's version and the release tag need to differ."
---

## DEC-R004: The version lives in Cargo.toml

Jig's version skills read and bump `package.json` with `npm version`. Here the thing that ships
is a Rust binary, and Cargo already gives it a version that the code can read at compile time
(`env!("CARGO_PKG_VERSION")`). Two versions would drift, so there is one.

`package.json` stays, private and with no `version`, to run the doc gates.

`scripts/version.mjs` edits the one `version` line under `[package]`, and refuses if it does not
find exactly one, or finds one it cannot read. Then it runs `cargo check` so `Cargo.lock` follows.
`/bump-major`, `/retro` and `/promote-production` call it, and commit `Cargo.toml` and
`Cargo.lock` where they committed `package.json` and its lockfile.

A Node script, not a Rust one: it is workflow tooling beside the other gates, and it must work
on a tree whose Rust does not build.
