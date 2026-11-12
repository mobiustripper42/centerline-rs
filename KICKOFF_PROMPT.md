# Kickoff: centerline-rs, task 0.1 — scaffold from jig and adapt the workflow for Rust

You are starting a new repo, `centerline-rs`: a Rust rewrite of the web half of Centerline. Read this whole file and `PROJECT_PLAN.md` (beside it, the approved plan) before doing anything. Both are untracked files in the repo root; do not commit this prompt, and move `PROJECT_PLAN.md` to `docs/PROJECT_PLAN.md` in Step C.

## Who this is for

Spink (Eric): retired application developer, 20+ years, TypeScript and C#, new to Rust. This is a fun project with no deadline and no revenue goal. Two goals: a working Rust version of Centerline, and Spink learning Rust by reading and writing real code on every slice. So: explain each new Rust concept briefly and conversationally before you use it, define acronyms the first time, keep answers short, and ask instead of guessing.

## Sibling checkouts (read-only)

- `../jig`: the workflow fixture, generation 6 (its `jig-version` file). The template. **Do not modify it.**
- `../centerline`: the existing TypeScript app. The reference, and the source for `docs/SPEC.md`. **Do not modify it.**

If those paths are wrong, ask. Never cite a sibling path from a file this repo loads every session: `check:context` asserts cited paths resolve.

## Preflight

Check `cargo --version`, `rustc --version`, `node --version` and `gh auth status`, that this directory is a git repo with an `origin` remote, and that it is empty apart from the two untracked files. If anything fails, stop and tell Spink what to run. Installs are his: `npm install`, `cargo install`, `cargo add` and `curl` are denied.

## Decisions already made (do not reopen)

1. New repo `centerline-rs`. The old repo stays as the reference.
2. Start from jig's scaffolding, then edit the copy freely. Jig is not changed and nothing syncs back. Record the fork in a decision record.
3. Tests follow Rust convention, and the workflow bends to it: unit tests inline in `#[cfg(test)] mod tests` blocks, public-API tests in `tests/`, database tests with `#[sqlx::test]` against a real PostGIS, never mocked.
4. Spink writes one criterion per task as the implementer, when he marks it `(yours)`.
5. The existing database schema is unchanged and is not migrated from this repo until cutover.
6. The version lives in `Cargo.toml`.

## What to do

**Step A: plan, then wait.** Read jig's `CLAUDE.md`, `.claude/file-classes.yaml`, every skill and agent, and the gate scripts. List exactly what you will copy, create, modify and leave out, with the commands you will run. Do not write anything until Spink says go.

**Step B: verbatim scaffold, committed to `main`.** `.claude/file-classes.yaml` is the manifest. Copy files classed `logic`, `presence`, and the shell half of `hybrid`; copy `scaffold/**` placeholders to their project paths; skip `jig-only` and jig's own decision records. Commit as "scaffold from jig generation 6 at <jig commit sha>" before changing anything, so the next pull request's diff is exactly what differs from jig.

**Step C: branch `task/0.1-adapt-workflow-for-rust`, one pull request.** This task changes the workflow itself, so `/build-task` is not used; take the Micro Workflow steps by hand. The changes:

1. **Test lock.** `/build-task` locks tests by file list: it commits the files `@test-writer` wrote (search it for `TESTS=`) and fails if any changed. Inline tests share a file with the code, so replace this with `scripts/lock-tests.mjs`, which fingerprints every `#[cfg(test)]` block plus everything under `tests/`, with a snapshot mode and a verify mode. It must handle braces inside strings, comments and raw strings, and nested modules; fail loudly on anything it cannot parse; and ship with its own tests. Update `@test-writer`, `@implementer` and `build-task` to match: the implementer may edit the code in a file but never its test blocks. Stubs never use `todo!()` or `unimplemented!()`, which panic; they return the empty value of the type (`Vec::new()`, `None`, `Default::default()`), and where a type has none, the smallest well-typed value, or stop and report.
2. **The `(yours)` criterion.** Add it to `task-spec.md` and `build-task`: at most one per task, optional. It is not `(by hand)`, which means a person checks it. `@test-writer` writes its test and stub; `@implementer` builds every other criterion first, so Spink has working Rust to read; then the Lead stops, names the test and the file, and waits. Spink writes the code. The Lead then runs the proof and reviews it as a teacher: the compiler's messages first, then one concept at a time.
3. **Slots in `.claude/CLAUDE-context.md`**, written fresh for Rust (jig's is a template, never copied): stack, commands, Proof (`cargo test`, with the database tests on `#[sqlx::test]`), Proof command (`cargo test <filter>`), the gate, conventions, and Migration Protocol (project) saying the schema is owned by the old repo until cutover. The gate is `npm run verify`: jig's doc gates, then `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, `cargo build`.
4. **Tooling manifest.** A private `package.json` with no version field, `js-yaml` as a dev dependency, and scripts for the gates and `verify`. Spink runs `npm install`.
5. **Versioning.** Replace the `package.json` calls in `/bump-major`, `/retro` and `/promote-production` with `scripts/version.mjs get | bump patch | minor | major`, which edits the one `version` line under `[package]` in `Cargo.toml`, fails loudly unless it matches exactly once, and then runs `cargo check` to refresh `Cargo.lock`. Fix the `git add` lines and the cheatsheet.
6. **Remove what needs jig's own tooling.** Check what `/its-alive` runs for drift and the permission policy: those scripts are jig-only and will not be here. Also remove references to `sync.mjs`, `drift.mjs`, `fleet.mjs`, `settings-policy.mjs` and `check:shipped-citations`, and the generation comparison on `.claude/jig-version`. Keep the permission policy in `.claude/settings.json` unchanged.
7. **Docs.** `docs/SPEC.md` from `../centerline/docs/SPEC.md`: keep Overview, Philosophy, Core Concepts, Coverage Rules and Data Model as written; rewrite Stack (Rust, Axum, Askama and HTMX, sqlx; unchanged: Postgres and PostGIS, Valhalla, MapLibre, bee-grace); replace Phases with a pointer to the plan. `docs/PROJECT_PLAN.md` is the attached plan. Seed `docs/RUST_NOTES.md`. Write decision records: the fork from jig, Rust-convention tests and the lock, the `(yours)` criterion, and versioning in `Cargo.toml`. Follow the shell's rule on decisions: search first, and say in the pull request what came back.
8. **A crate to run the gate against:** `cargo new --lib` plus a thin `src/main.rs` and one passing test. No app code, no slice 1.
9. **Fill `.claude/doc-check.json`** so `check:docs` passes.

Done means `npm run verify` is green, `lock-tests.mjs` and `version.mjs` have passing tests, and you have shown a lock that fails when an inline test block is edited.

**Step D: stop with the pull request.** Report every file that differs from jig's copy in one line each, the verify output, and anything you could not adapt and why. Spink reviews and merges. `/start-phase` for the plan's slices happens in a later session, when he says go.

## Working rules

- Cut branches from the fetched `origin/main`. Read files with the Read tool. A scripted edit must fail loudly when its anchor does not match, including a one-line `sed`.
- Cite a file or tool result for any claim about the code. Label proposals as proposals.
- Use Opus for Step A and the design of the lock; Sonnet is fine for mechanical sweeps. Spink switches with `/model`.
- Do not touch `../jig` or `../centerline`.
