# Rust notes

Spink's notes, in his words. Three lines per new concept, written after the phase that met it, so the
notes are his and searchable (`docs/PROJECT_PLAN.md` § Rust learning track). Claude explains a concept
before using it; this file is where it lands once it makes sense. Claude does not write the notes.

Format, one block per concept:

    ### <concept>
    What it is, in one line.
    Where I met it (file, phase).
    The thing that tripped me up, or the C#/TypeScript thing it is like and not like.

Reading along: the Rust Book (doc.rust-lang.org/book) follows the phases' order — ownership, enums
and `match`, error handling, traits, iterators, then async.

## Waiting to be written up

Met in task 0.1, explained or not yet:

- A crate and `Cargo.toml` — `Cargo.toml`, `src/lib.rs`, `src/main.rs`
- `#[cfg(test)] mod tests` — the test block at the bottom of `src/lib.rs`
- `env!` and the `!` that marks a macro — `src/lib.rs`
- `&'static str` — the return type of `version()` in `src/lib.rs`

## Phase 1 — Hello, grace

## Phase 2 — First database read
