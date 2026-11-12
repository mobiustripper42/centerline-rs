---
name: bump-major
description: Manually bump the project's major version. Use for breaking changes — new data model, removed feature, anything users would notice on upgrade. Versioned projects only (requires a `version` line in `Cargo.toml`'s `[package]`, read by `scripts/version.mjs`). Writes a CHANGELOG.md entry and tags on the active trunk (`main`).
---

You are bumping the project's major version. Major bumps are manual because they signal a breaking change — there's no automatic trigger that knows what counts as breaking.

## Step 0 — Sanity gate

Run `node scripts/version.mjs get`. If it exits non-zero, STOP and show the user what it printed — `Cargo.toml` is missing, has no `[package]` version, or has one the script refuses to read. Do not proceed.

**The version lives in `Cargo.toml`, not `package.json`** (DEC-R004). This repo's `package.json` is a private, version-less manifest for the doc gates; the app is the Rust crate. `scripts/version.mjs` is the only thing that reads or writes the version, so all three version skills agree on where it is.

## Step 1 — Resolve working branch

```
WORKING_BRANCH=main
```
The active trunk is always `main`. `production` (if any) only moves at `/promote-production`.

`BRANCH=$(git branch --show-current)`.

If `BRANCH != $WORKING_BRANCH`: STOP. Major bumps must run on the working branch (otherwise the bump lands on a feature branch and gets orphaned at PR merge). Tell the user: "Switch to `$WORKING_BRANCH` and re-run /bump-major." Wait.

## Step 2 — Confirm the bump

Read the current version:
```
CURRENT_VERSION=$(node scripts/version.mjs get)
```
If it exits non-zero, STOP and surface what it printed.

Compute the new version: split `CURRENT_VERSION` on `.`, increment the first segment, set the other two to `0`. Hold as `NEW_VERSION`.

Ask the user: **"Bump v$CURRENT_VERSION → v$NEW_VERSION? Tell me the breaking change in one line — it goes into CHANGELOG.md."** Wait for both confirmation and the rationale string. Hold the rationale as `RATIONALE`.

If the user declines, stop with no changes.

## Step 3 — Bump

```
BUMPED=$(node scripts/version.mjs bump major)
```

It zeros minor + patch (e.g. `1.7.3 → 2.0.0`), edits the one `version` line in `Cargo.toml`'s `[package]`, and runs `cargo check` so `Cargo.lock` follows. A non-zero exit: STOP and surface what it printed. Verify `BUMPED` matches `NEW_VERSION` from Step 2; if not (someone modified `Cargo.toml` mid-flight), STOP and surface the discrepancy.

## Step 4 — CHANGELOG entry

If `CHANGELOG.md` doesn't exist, create with `# Changelog\n\n`. If it exists but doesn't start with the literal `# Changelog\n` header (e.g. setext form, `# CHANGELOG`, or notes above the header), STOP and surface to the user — do not guess where to insert. Otherwise prepend after the `# Changelog` header (newest at top):

```
## [<NEW_VERSION>] - <YYYY-MM-DD> — Major release
- BREAKING: <RATIONALE>
```

## Step 5 — Commit + tag + push

```
git add Cargo.toml Cargo.lock CHANGELOG.md
git commit -m "Bump major version to v$NEW_VERSION — <RATIONALE>"
```

**Tag:**
```
git tag "v$NEW_VERSION"
```
Tags land on the trunk at bump time. Promotion to `production` (if the project has it) carries the already-tagged commit — `/promote-production` does not tag.

**Push:**
```
git push origin "$WORKING_BRANCH"
```
If a tag was created: `git push origin "v$NEW_VERSION"`.

## Step 6 — Summary

```
v<CURRENT_VERSION> → v<NEW_VERSION> (major)
Branch: <WORKING_BRANCH>
Tag: v<NEW_VERSION>
CHANGELOG.md updated.
```

Remind the user: a major bump usually deserves a release note beyond the CHANGELOG line — consider drafting one before the next deploy.
