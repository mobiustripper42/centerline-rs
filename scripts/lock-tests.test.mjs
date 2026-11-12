// Tests for scripts/lock-tests.mjs. Run: npm run test:scripts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { LockError, compare, findTestBlocks, snapshot, tokenize } from './lock-tests.mjs'

const labels = (src) => findTestBlocks(src).blocks.map((b) => b.label)
const texts = (src) => findTestBlocks(src).blocks.map((b) => b.text)

/** A throwaway crate: `files` maps a relative path to its contents. */
function crate(files) {
  const root = mkdtempSync(join(tmpdir(), 'lock-tests-'))
  write(root, { 'Cargo.toml': '[package]\nname = "t"\nversion = "0.1.0"\n', ...files })
  return root
}
function write(root, files) {
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true })
    writeFileSync(join(root, p), text)
  }
}
function withCrate(files, fn) {
  const root = crate(files)
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const LIB = `pub fn add(a: u32, b: u32) -> u32 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds() {
        assert_eq!(add(2, 2), 4);
    }
}
`

// ── The tokenizer: braces that are not code ──────────────────────────────────────────────────

test('braces inside strings, chars and comments are not brackets', () => {
  const src = `fn f() { let s = "}{"; let c = '}'; let d = '{'; // }
    /* { */ }`
  const braces = tokenize(src).filter((t) => t.text === '{' || t.text === '}')
  assert.deepEqual(braces.map((t) => t.text), ['{', '}'])
})

test('raw strings with hashes may hold quotes and braces', () => {
  const src = 'let s = r#"a "quoted" } brace"#; let t = r##"has "# inside }"##; let u = br"}";'
  const lits = tokenize(src).filter((t) => t.kind === 'literal').map((t) => t.text)
  assert.deepEqual(lits, ['r#"a "quoted" } brace"#', 'r##"has "# inside }"##', 'br"}"'])
})

test('block comments nest, as Rust allows', () => {
  const src = 'fn f() { /* outer /* inner } */ still comment { */ }'
  assert.deepEqual(tokenize(src).filter((t) => t.kind === 'punct').map((t) => t.text), ['(', ')', '{', '}'])
})

test('a lifetime is not a character literal', () => {
  const toks = tokenize("fn f<'a>(x: &'a str) -> char { 'x' }")
  assert.deepEqual(toks.filter((t) => t.kind === 'lifetime').map((t) => t.text), ["'a", "'a"])
  assert.deepEqual(toks.filter((t) => t.kind === 'literal').map((t) => t.text), ["'x'"])
})

test('escaped characters and byte literals', () => {
  const src = String.raw`let a = '\''; let b = '\\'; let c = '\u{1F600}'; let d = b'}'; let e = b"{";`
  assert.deepEqual(
    tokenize(src).filter((t) => t.kind === 'literal').map((t) => t.text),
    [String.raw`'\''`, String.raw`'\\'`, String.raw`'\u{1F600}'`, "b'}'", 'b"{"'],
  )
})

test('a raw identifier is an identifier', () => {
  assert.deepEqual(tokenize('let r#type = 1;').map((t) => t.text), ['let', 'r#type', '=', '1', ';'])
})

test('a string with an escaped quote ends at the real quote', () => {
  const lits = tokenize(String.raw`let s = "a \" } b"; }`).filter((t) => t.kind === 'literal')
  assert.equal(lits[0].text, String.raw`"a \" } b"`)
})

// ── Finding test blocks ──────────────────────────────────────────────────────────────────────

test('finds the cfg(test) module, from its attribute to its closing brace', () => {
  const [block] = findTestBlocks(LIB).blocks
  assert.equal(block.label, 'mod tests')
  assert.ok(block.text.startsWith('#[cfg(test)]'))
  assert.ok(block.text.endsWith('}'))
  assert.ok(!block.text.includes('pub fn add'))
})

test('a test module whose body holds braces in strings and chars ends at the right brace', () => {
  const src = `#[cfg(test)]
mod tests {
    #[test]
    fn tricky() { assert_eq!("}", "}"); assert_eq!('}', '}'); /* } */ }
}
pub fn after() {}
`
  const [text] = texts(src)
  assert.ok(text.endsWith("/* } */ }\n}"))
  assert.ok(!text.includes('after'))
})

test('a test module nested inside an ordinary module is found', () => {
  const src = 'mod outer {\n  pub fn f() {}\n  #[cfg(test)]\n  mod tests { #[test] fn t() {} }\n}\n'
  assert.deepEqual(labels(src), ['mod tests'])
})

test('nested modules inside a test module count once, as part of the outer block', () => {
  const src = '#[cfg(test)]\nmod tests {\n  mod inner { #[test] fn t() {} }\n}\n'
  assert.deepEqual(labels(src), ['mod tests'])
})

test('a #[test] outside any cfg(test) block is locked on its own', () => {
  assert.deepEqual(labels('pub fn f() {}\n#[test]\nfn stray() { assert!(true) }\n'), ['fn stray'])
})

test('database and async test attributes count as tests', () => {
  const src = '#[sqlx::test(migrations = false)]\nasync fn reads(pool: PgPool) {}\n#[tokio::test]\nasync fn waits() {}\n'
  assert.deepEqual(labels(src), ['async fn reads', 'async fn waits'])
})

test('attributes in front of the test attribute are part of the block', () => {
  const [text] = texts('#[ignore]\n#[test]\nfn skipped() {}\n')
  assert.ok(text.startsWith('#[ignore]'))
})

test('a test-only item that is not a module is locked too', () => {
  assert.deepEqual(labels('#[cfg(test)]\nuse std::collections::HashMap;\n#[cfg(test)]\nconst N: [u8; 2] = [1, 2];\n'), [
    'use std',
    'const N',
  ])
})

test('pub(crate) is read as part of the name', () => {
  assert.deepEqual(labels('#[cfg(test)]\npub(crate) mod helpers { }\n'), ['pub(crate) mod helpers'])
})

test('cfg(not(test)) is production code, not a test block', () => {
  assert.deepEqual(labels('#[cfg(not(test))]\nfn real() {}\n'), [])
})

test('cfg_attr(test, ...) is not a test block', () => {
  assert.deepEqual(labels('#[cfg_attr(test, derive(Debug))]\nstruct S;\n'), [])
})

test('#![cfg(test)] at the top makes the whole file test code', () => {
  assert.equal(findTestBlocks('#![allow(dead_code)]\n#![cfg(test)]\nfn t() {}\n').wholeFile, true)
})

// ── Failing loudly ───────────────────────────────────────────────────────────────────────────

test('a cfg it cannot classify is an error, not a skip', () => {
  assert.throws(() => findTestBlocks('#[cfg(any(test, feature = "x"))]\nmod t {}\n', 'src/a.rs'), (e) => {
    return e instanceof LockError && /src\/a\.rs:1 — cannot classify/.test(e.message)
  })
})

test('an unterminated string names the file and line', () => {
  assert.throws(() => tokenize('fn f() {}\nlet s = "oops;\n', 'src/b.rs'), /src\/b\.rs:2 — unterminated string/)
})

test('an unterminated raw string is an error', () => {
  assert.throws(() => tokenize('let s = r#"never closed";'), /unterminated raw string/)
})

test('an unterminated block comment is an error', () => {
  assert.throws(() => tokenize('/* /* */ fn f() {}'), /unterminated block comment/)
})

test('a mismatched bracket inside a test block is an error', () => {
  assert.throws(() => findTestBlocks('#[cfg(test)]\nmod t { fn f() ) }\n', 'src/c.rs'), /src\/c\.rs:2 — `\)` closes `\{`/)
})

test('a test block that never closes is an error', () => {
  assert.throws(() => findTestBlocks('#[cfg(test)]\nmod t {\n'), /never closed/)
})

test('#![cfg(test)] below the top of the file is an error', () => {
  assert.throws(() => findTestBlocks('fn f() {}\nmod m { #![cfg(test)] }\n'), /not supported/)
})

// ── The lock on a real tree ──────────────────────────────────────────────────────────────────

test('editing code outside the test block leaves the lock intact', () => {
  withCrate({ 'src/lib.rs': LIB }, (root) => {
    const before = snapshot(root)
    write(root, { 'src/lib.rs': LIB.replace('a + b', 'b + a') })
    assert.deepEqual(compare(before, snapshot(root)), [])
  })
})

test('editing an inline test block breaks the lock', () => {
  withCrate({ 'src/lib.rs': LIB }, (root) => {
    const before = snapshot(root)
    write(root, { 'src/lib.rs': LIB.replace('add(2, 2), 4', 'add(2, 2), add(2, 2)') })
    assert.deepEqual(compare(before, snapshot(root)), [{ change: 'changed', file: 'src/lib.rs', label: 'mod tests' }])
  })
})

test('an #[ignore] added inside the block breaks the lock', () => {
  withCrate({ 'src/lib.rs': LIB }, (root) => {
    const before = snapshot(root)
    write(root, { 'src/lib.rs': LIB.replace('    #[test]', '    #[ignore]\n    #[test]') })
    assert.equal(compare(before, snapshot(root))[0].change, 'changed')
  })
})

test('deleting a test block breaks the lock', () => {
  withCrate({ 'src/lib.rs': LIB }, (root) => {
    const before = snapshot(root)
    write(root, { 'src/lib.rs': LIB.slice(0, LIB.indexOf('#[cfg(test)]')) })
    assert.deepEqual(compare(before, snapshot(root)), [{ change: 'removed', file: 'src/lib.rs', label: 'mod tests' }])
  })
})

test('a test block added in a new file breaks the lock', () => {
  withCrate({ 'src/lib.rs': LIB }, (root) => {
    const before = snapshot(root)
    write(root, { 'src/extra.rs': '#[test]\nfn sneaky() {}\n' })
    assert.deepEqual(compare(before, snapshot(root)), [{ change: 'added', file: 'src/extra.rs', label: 'fn sneaky' }])
  })
})

test('files under the crate tests/ directory are locked whole, fixtures included', () => {
  withCrate({ 'src/lib.rs': LIB, 'tests/api.rs': '#[test]\nfn api() {}\n', 'tests/fixtures/ride.gpx': '<gpx/>' }, (root) => {
    const before = snapshot(root)
    assert.deepEqual(Object.keys(before.files), ['src/lib.rs', 'tests/api.rs', 'tests/fixtures/ride.gpx'])
    write(root, { 'tests/fixtures/ride.gpx': '<gpx></gpx>' })
    assert.deepEqual(compare(before, snapshot(root)), [{ change: 'changed', file: 'tests/fixtures/ride.gpx', label: 'whole file' }])
  })
})

test('a cfg(test) module in its own file is locked whole', () => {
  const lib = 'pub fn f() {}\n#[cfg(test)]\nmod tests;\n'
  withCrate({ 'src/lib.rs': lib, 'src/tests.rs': 'use super::*;\n#[test]\nfn t() {}\n' }, (root) => {
    const before = snapshot(root)
    assert.deepEqual(before.files['src/tests.rs'], [before.files['src/tests.rs'][0]])
    assert.equal(before.files['src/tests.rs'][0].label, 'whole file')
    write(root, { 'src/tests.rs': 'use super::*;\n' })
    assert.ok(compare(before, snapshot(root)).some((d) => d.file === 'src/tests.rs' && d.change === 'changed'))
  })
})

test('a module file beside a non-root file resolves under that file’s directory', () => {
  const parser = 'pub fn p() {}\n#[cfg(test)]\nmod tests;\n'
  withCrate({ 'src/lib.rs': 'pub mod gpx;\n', 'src/gpx.rs': parser, 'src/gpx/tests.rs': '#[test]\nfn t() {}\n' }, (root) => {
    assert.equal(snapshot(root).files['src/gpx/tests.rs'][0].label, 'whole file')
  })
})

test('a cfg(test) module whose file is missing is an error', () => {
  withCrate({ 'src/lib.rs': '#[cfg(test)]\nmod tests;\n' }, (root) => {
    assert.throws(() => snapshot(root), /resolves to neither/)
  })
})

test('target/ is never read', () => {
  withCrate({ 'src/lib.rs': LIB, 'target/debug/build/x.rs': 'let s = "unterminated' }, (root) => {
    assert.doesNotThrow(() => snapshot(root))
  })
})
