#!/usr/bin/env node
// The test lock for a Rust repo (DEC-R002).
//
// `/build-task` hands tests to @implementer and must prove afterwards that none of them changed.
// In jig the proof was a list of test FILES, diffed against the commit that locked them. Rust puts
// unit tests inline, in a `#[cfg(test)]` block inside the file that holds the code, so a file list
// would either lock the code with the tests or lock nothing. This script locks the test CODE:
//
//   - every item carrying `#[cfg(test)]`, or a test attribute (`#[test]`, `#[tokio::test]`,
//     `#[sqlx::test(...)]`) outside such an item, fingerprinted together with every attribute in
//     front of it — so an `#[ignore]` slipped in above a `#[test]` changes the fingerprint;
//   - a `#[cfg(test)] mod name;` declared at file level: the whole file it points to;
//   - a file whose first line is `#![cfg(test)]`: the whole file;
//   - every file under a crate's `tests/` directory (integration tests, fixtures, helpers): whole;
//   - the child modules of anything taken whole, all the way down: whole;
//   - `Cargo.toml`, `build.rs` and `.cargo/config.toml`, which decide what `cargo test` runs: whole.
//
// Not locked, and accepted (DEC-R002): doctests, which live in `///` comments. Tests here are
// written as `#[test]` functions, never as doctests, so a doctest is never the thing under proof.
//
//   node scripts/lock-tests.mjs snapshot <out.json>   fingerprint the tree, write the lock
//   node scripts/lock-tests.mjs verify <lock.json>    compare the tree against the lock
//
// Both take `--root <dir>` (default: the current directory). Exit 0 intact, 1 a difference,
// 2 anything the script cannot parse or resolve. It never guesses: an unterminated string, a
// mismatched bracket or a `cfg` it cannot classify is an exit 2 naming the file and line, because a
// lock that skips what it cannot read is a lock with a hole in it.
//
// Fingerprints are of the exact bytes, so `cargo fmt` reflowing a test block is a change. Format
// before snapshotting; `cargo fmt --check` in the gate keeps it formatted after.

import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export class LockError extends Error {}

const SKIP_DIRS = new Set(['target', 'node_modules', '.git', '.sessions-worktree'])

// ── Tokenizer ────────────────────────────────────────────────────────────────────────────────
// Just enough of Rust's lexer to know which brackets are code: comments (line, and block, which
// Rust nests), strings (plain, byte, C, and raw with any number of `#`), character literals as
// distinct from lifetimes and labels (`'{'` is a character; `'a` is a lifetime), and raw
// identifiers (`r#type`). Multi-character operators come out as single characters; nothing here
// needs them joined.

const ID_START = /[\p{XID_Start}_]/u
const ID_CONT = /\p{XID_Continue}/u

export function tokenize(src, file = '<input>') {
  const n = src.length
  const lineStarts = [0]
  for (let k = 0; k < n; k++) if (src[k] === '\n') lineStarts.push(k + 1)
  const lineAt = (off) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= off) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
  const fail = (msg, off) => {
    throw new LockError(`${file}:${lineAt(off)} — ${msg}`)
  }
  const charAt = (k) => (k < n ? String.fromCodePoint(src.codePointAt(k)) : '')

  const quoted = (j) => {
    // src[j] is the opening `"`; returns the offset after the closing one.
    for (let k = j + 1; k < n; k++) {
      if (src[k] === '\\') k++
      else if (src[k] === '"') return k + 1
    }
    fail('unterminated string', j)
  }
  const raw = (j) => {
    // src[j] is the first `#` or the `"` after an `r`; -1 when it is not a raw string.
    let k = j
    while (src[k] === '#') k++
    if (src[k] !== '"') return -1
    const close = '"' + '#'.repeat(k - j)
    const end = src.indexOf(close, k + 1)
    if (end < 0) fail('unterminated raw string', j)
    return end + close.length
  }
  const quote = (j) => {
    // src[j] is `'`: a character literal, or a lifetime or label.
    if (src[j + 1] === '\\') {
      const end = src.indexOf("'", j + 3)
      if (end < 0 || end - j > 12) fail('unterminated character literal', j)
      return { end: end + 1, kind: 'literal' }
    }
    const c = charAt(j + 1)
    if (!c) fail('stray quote at end of file', j)
    if (src[j + 1 + c.length] === "'") return { end: j + 2 + c.length, kind: 'literal' }
    if (!ID_START.test(c)) fail('a quote that is neither a character literal nor a lifetime', j)
    let k = j + 1
    while (k < n && ID_CONT.test(charAt(k))) k += charAt(k).length
    return { end: k, kind: 'lifetime' }
  }

  const toks = []
  const push = (kind, start, end) => toks.push({ kind, text: src.slice(start, end), start, end, line: lineAt(start) })
  let i = 0
  while (i < n) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
    } else if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i)
      i = nl < 0 ? n : nl + 1
    } else if (c === '/' && src[i + 1] === '*') {
      let depth = 1
      let k = i + 2
      while (k < n && depth > 0) {
        if (src[k] === '/' && src[k + 1] === '*') (depth++, (k += 2))
        else if (src[k] === '*' && src[k + 1] === '/') (depth--, (k += 2))
        else k++
      }
      if (depth > 0) fail('unterminated block comment', i)
      i = k
    } else if (c === '"') {
      const end = quoted(i)
      push('literal', i, end)
      i = end
    } else if (c === "'") {
      const { end, kind } = quote(i)
      push(kind, i, end)
      i = end
    } else if (/[0-9]/.test(c)) {
      let k = i + 1
      while (k < n && /[0-9A-Za-z_]/.test(src[k])) k++
      if (src[k] === '.' && /[0-9]/.test(src[k + 1] ?? '')) {
        k++
        while (k < n && /[0-9A-Za-z_]/.test(src[k])) k++
      }
      push('literal', i, k)
      i = k
    } else if (ID_START.test(charAt(i))) {
      let k = i
      while (k < n && ID_CONT.test(charAt(k))) k += charAt(k).length
      const word = src.slice(i, k)
      const next = src[k]
      if ((word === 'b' || word === 'c') && next === '"') {
        const end = quoted(k)
        push('literal', i, end)
        i = end
      } else if (word === 'b' && next === "'") {
        const { end, kind } = quote(k)
        if (kind !== 'literal') fail('malformed byte literal', i)
        push('literal', i, end)
        i = end
      } else if ((word === 'r' || word === 'br' || word === 'cr') && (next === '"' || next === '#')) {
        const end = raw(k)
        if (end >= 0) {
          push('literal', i, end)
          i = end
        } else if (word === 'r' && next === '#' && ID_START.test(charAt(k + 1))) {
          let m = k + 1
          while (m < n && ID_CONT.test(charAt(m))) m += charAt(m).length
          push('ident', i, m)
          i = m
        } else {
          fail(`cannot read \`${word}${next}\``, i)
        }
      } else {
        push('ident', i, k)
        i = k
      }
    } else {
      push('punct', i, i + 1)
      i++
    }
  }
  return toks
}

// ── Items ────────────────────────────────────────────────────────────────────────────────────

const OPEN = { '(': ')', '[': ']', '{': '}' }
const CLOSE = new Set([')', ']', '}'])

/** Index of the token closing the bracket opened at `k`. */
function match(toks, k, file) {
  const stack = []
  for (let j = k; j < toks.length; j++) {
    const t = toks[j]
    if (t.kind !== 'punct') continue
    if (t.text in OPEN) stack.push(t)
    else if (CLOSE.has(t.text)) {
      const open = stack.pop()
      if (OPEN[open.text] !== t.text) {
        throw new LockError(`${file}:${t.line} — \`${t.text}\` closes \`${open.text}\` from line ${open.line}`)
      }
      if (stack.length === 0) return j
    }
  }
  throw new LockError(`${file}:${toks[k].line} — \`${toks[k].text}\` is never closed`)
}

/** Skip outer attributes starting at `k`; returns the first token after them. */
function skipAttrs(toks, k, file) {
  while (toks[k]?.text === '#' && toks[k + 1]?.text === '[') k = match(toks, k + 1, file) + 1
  return k
}

/** One past the last token of the item starting at `k` (after its attributes). */
function itemEnd(toks, k, file) {
  const first = toks[k]
  for (let j = k; j < toks.length; j++) {
    const t = toks[j]
    if (t.kind !== 'punct') continue
    if (t.text === ';') return j + 1
    if (t.text === '{') {
      const close = match(toks, j, file)
      return toks[close + 1]?.text === ';' ? close + 2 : close + 1
    }
    if (t.text in OPEN) j = match(toks, j, file)
    else if (CLOSE.has(t.text)) break
  }
  throw new LockError(`${file}:${first?.line ?? '?'} — the item after a test attribute never ends`)
}

/** A readable name for the item: its tokens up to the body, e.g. `mod tests` or `fn parses`. */
function label(toks, k, file) {
  const words = []
  for (let j = k; j < toks.length && words.length < 6; j++) {
    if (toks[j].text === '(' && words.at(-1) === 'pub') {
      // `pub(crate)`: a visibility, not the start of a signature.
      const close = match(toks, j, file)
      words[words.length - 1] = 'pub' + toks.slice(j, close + 1).map((x) => x.text).join('')
      j = close
      continue
    }
    if (['{', ';', '(', '<', '=', ':'].includes(toks[j].text)) break
    words.push(toks[j].text)
  }
  return words.join(' ')
}

/** The attributes that make a function a test. One that is not listed and looks like one is an error. */
export const TEST_ATTR = /^(?:\w+::)*(?:test|rstest|test_case|quickcheck|proptest|wasm_bindgen_test)(?:\(.*\))?$/

/** `test` for a test attribute, `skip` for one that is not, and a throw for one it cannot read. */
function classify(body, file, line) {
  if (body === 'cfg(test)' || TEST_ATTR.test(body)) return 'test'
  // Strings out first, so `feature = "test-utils"` is not read as the `test` cfg.
  const bare = body.replace(/"(?:\\.|[^"\\])*"/g, '""')
  if (/^cfg\(/.test(bare) && /\btest\b/.test(bare) && bare !== 'cfg(not(test))') {
    throw new LockError(`${file}:${line} — cannot classify #[${body}]; use #[cfg(test)] or extend lock-tests.mjs`)
  }
  const path = bare.match(/^(?:\w+::)*\w+/)?.[0] ?? ''
  if (!path.startsWith('cfg') && /test|case/.test(path.split('::').at(-1))) {
    throw new LockError(`${file}:${line} — #[${body}] looks like a test attribute lock-tests.mjs does not know; add it to TEST_ATTR`)
  }
  return 'skip'
}

/**
 * The `mod name;` declarations of a file taken whole, so their files are taken whole too: a test
 * module's child modules are test code. A declaration inside an inline block, or one carrying
 * `#[path]`, cannot be resolved here, so it is an error rather than a file left unlocked.
 */
export function childModules(src, file = '<input>') {
  const toks = tokenize(src, file)
  const out = []
  let depth = 0
  let pathAttr = false
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (t.text === 'path' && toks[i - 1]?.text === '[') pathAttr = true
    if (t.text === 'mod' && toks[i + 1]?.kind === 'ident' && toks[i + 2]?.text === ';') {
      if (depth > 0) throw new LockError(`${file}:${t.line} — \`mod ${toks[i + 1].text};\` inside an inline module is not supported`)
      if (pathAttr) throw new LockError(`${file}:${t.line} — #[path] on a module is not supported`)
      out.push({ name: toks[i + 1].text, line: t.line })
    }
    if (t.text === '{') depth++
    else if (t.text === '}') depth--
    if (t.text === ';' || t.text === '{' || t.text === '}') pathAttr = false
  }
  return out
}

/**
 * The test blocks in one Rust file.
 * @returns {{ wholeFile: boolean, blocks: {label: string, line: number, text: string}[], external: {name: string, line: number}[] }}
 */
export function findTestBlocks(src, file = '<input>') {
  const toks = tokenize(src, file)
  const blocks = []
  const external = []
  let depth = 0
  let run = -1 // index of the first outer attribute in the current run
  let i = 0
  let header = true // still inside the file's leading inner attributes
  while (i < toks.length) {
    const t = toks[i]
    if (t.text === '#' && toks[i + 1]?.text === '!' && toks[i + 2]?.text === '[') {
      const close = match(toks, i + 2, file)
      const body = toks.slice(i + 3, close).map((x) => x.text).join('')
      if (classify(body, file, t.line) === 'test') {
        if (!header || depth > 0) throw new LockError(`${file}:${t.line} — #![${body}] below the top of the file is not supported`)
        return { wholeFile: true, blocks: [], external: [] }
      }
      i = close + 1
      continue
    }
    header = false
    if (t.text === '#' && toks[i + 1]?.text === '[') {
      const close = match(toks, i + 1, file)
      const body = toks.slice(i + 2, close).map((x) => x.text).join('')
      if (run < 0) run = i
      if (classify(body, file, t.line) === 'test') {
        const item = skipAttrs(toks, close + 1, file)
        const end = itemEnd(toks, item, file)
        const name = label(toks, item, file)
        const words = name.split(' ')
        const hasPath = toks.slice(run, item).some((x, k, a) => x.text === 'path' && a[k - 1]?.text === '[')
        if (words.includes('mod') && hasPath) throw new LockError(`${file}:${t.line} — #[path] on a module is not supported`)
        if (toks[end - 1].text === ';' && words.at(-2) === 'mod') {
          if (depth > 0) throw new LockError(`${file}:${t.line} — \`${name};\` inside an inline module is not supported`)
          external.push({ name: words.at(-1), line: t.line })
        }
        blocks.push({ label: name, line: toks[run].line, text: src.slice(toks[run].start, toks[end - 1].end) })
        i = end
        run = -1
        continue
      }
      i = close + 1
      continue
    }
    run = -1
    if (t.text === '{') depth++
    else if (t.text === '}') depth--
    i++
  }
  return { wholeFile: false, blocks, external }
}

// ── The tree ─────────────────────────────────────────────────────────────────────────────────

const sha = (text) => createHash('sha256').update(text).digest('hex')
const posix = (p) => p.split(sep).join('/')

/**
 * Files that decide what `cargo test` runs without holding a test: `[lib] test = false`, a
 * `[[test]] harness = false`, a `--cfg` from a build script or rustflags. Taken whole. The cost is
 * that a task changing `Cargo.toml` does it before `/build-task` starts, never inside the build.
 */
export const CONFIG_FILES = ['Cargo.toml', 'build.rs', '.cargo/config.toml', '.cargo/config']

/** Every file to consider: `.rs` files to scan, and files under a crate's `tests/` taken whole. */
function walk(root) {
  const scan = []
  const whole = []
  const visit = (dir, inTests) => {
    for (const e of readdirSync(dir).sort()) {
      // Inside tests/ nothing is skipped: a fixture directory may be called anything.
      if (!inTests && SKIP_DIRS.has(e)) continue
      const p = join(dir, e)
      const st = lstatSync(p)
      if (st.isSymbolicLink()) throw new LockError(`${posix(relative(root, p))} — a symbolic link; lock-tests.mjs does not follow links`)
      if (st.isDirectory()) visit(p, inTests || (e === 'tests' && existsSync(join(dir, 'Cargo.toml'))))
      else if (inTests) whole.push(p)
      else if (e.endsWith('.rs') && posix(relative(root, p)) !== 'build.rs') scan.push(p)
    }
  }
  visit(root, false)
  return { scan, whole }
}

/** Where `mod name;` in `file` points: `<dir>/name.rs` or `<dir>/name/mod.rs`. */
function resolveModule(file, name, line, root) {
  const stem = basename(file, '.rs')
  const dir = ['lib', 'main', 'mod'].includes(stem) ? dirname(file) : join(dirname(file), stem)
  const found = [join(dir, `${name}.rs`), join(dir, name, 'mod.rs')].filter(existsSync)
  if (found.length !== 1) {
    const why = found.length ? 'both' : 'neither'
    throw new LockError(`${posix(relative(root, file))}:${line} — \`mod ${name};\` resolves to ${why} of ${name}.rs and ${name}/mod.rs`)
  }
  return found[0]
}

/** The lock: for each file holding test code, its blocks as `{label, sha256}` in file order. */
export function snapshot(root = '.') {
  const { scan, whole } = walk(root)
  const files = {}
  const add = (p, entry) => (files[posix(relative(root, p))] ??= []).push(entry)
  const external = new Set()
  const found = new Map()
  for (const p of scan) {
    const rel = posix(relative(root, p))
    const result = findTestBlocks(readFileSync(p, 'utf8'), rel)
    found.set(p, result)
    for (const { name, line } of result.external) external.add(resolveModule(p, name, line, root))
  }
  // A file taken whole takes its child modules with it, all the way down.
  const queue = [...scan.filter((p) => found.get(p).wholeFile), ...external]
  while (queue.length) {
    const p = queue.shift()
    for (const { name, line } of childModules(readFileSync(p, 'utf8'), posix(relative(root, p)))) {
      const child = resolveModule(p, name, line, root)
      if (!external.has(child)) (external.add(child), queue.push(child))
    }
  }
  for (const p of scan) {
    const result = found.get(p)
    if (result.wholeFile || external.has(p)) {
      add(p, { label: 'whole file', sha256: sha(readFileSync(p)) })
      continue
    }
    for (const b of result.blocks) add(p, { label: b.label, sha256: sha(b.text) })
  }
  for (const p of whole) add(p, { label: 'whole file', sha256: sha(readFileSync(p)) })
  for (const c of CONFIG_FILES) {
    const p = join(root, c)
    if (existsSync(p)) add(p, { label: 'test config (whole file)', sha256: sha(readFileSync(p)) })
  }
  return { version: 1, files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) }
}

/** Every difference between two locks, as `{change, file, label}`; empty means intact. */
export function compare(before, after) {
  const out = []
  const paths = new Set([...Object.keys(before.files), ...Object.keys(after.files)])
  for (const file of [...paths].sort()) {
    const old = [...(before.files[file] ?? [])]
    const now = [...(after.files[file] ?? [])]
    for (let k = old.length - 1; k >= 0; k--) {
      const j = now.findIndex((e) => e.label === old[k].label && e.sha256 === old[k].sha256)
      if (j >= 0) (old.splice(k, 1), now.splice(j, 1))
    }
    for (const o of old) {
      const j = now.findIndex((e) => e.label === o.label)
      if (j >= 0) (out.push({ change: 'changed', file, label: o.label }), now.splice(j, 1))
      else out.push({ change: 'removed', file, label: o.label })
    }
    for (const e of now) out.push({ change: 'added', file, label: e.label })
  }
  return out
}

const count = (lock) => {
  const blocks = Object.values(lock.files).reduce((s, l) => s + l.length, 0)
  return `${blocks} block${blocks === 1 ? '' : 's'} in ${Object.keys(lock.files).length} file${Object.keys(lock.files).length === 1 ? '' : 's'}`
}

/** A lock file, read and checked; anything malformed is an error, never a difference. */
function readLock(path) {
  if (!existsSync(path)) throw new LockError(`${path} does not exist — run snapshot first`)
  let lock
  try {
    lock = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new LockError(`${path} is not JSON: ${e.message}`)
  }
  const entriesOk = (l) => Array.isArray(l) && l.every((e) => typeof e?.label === 'string' && typeof e?.sha256 === 'string')
  if (lock?.version !== 1 || typeof lock.files !== 'object' || lock.files === null || !Object.values(lock.files).every(entriesOk)) {
    throw new LockError(`${path} is not a version 1 lock written by lock-tests.mjs snapshot`)
  }
  return lock
}

function main(argv) {
  const rootAt = argv.indexOf('--root')
  const root = rootAt >= 0 ? argv[rootAt + 1] : '.'
  const args = rootAt >= 0 ? argv.filter((_, k) => k !== rootAt && k !== rootAt + 1) : argv
  const [mode, path] = args
  if (!['snapshot', 'verify'].includes(mode) || !path || !root) {
    console.error('usage: lock-tests.mjs snapshot|verify <lock.json> [--root <dir>]')
    return 2
  }
  try {
    const now = snapshot(root)
    if (mode === 'snapshot') {
      writeFileSync(path, JSON.stringify(now, null, 2) + '\n')
      console.log(`locked ${count(now)} → ${path}`)
      for (const [file, list] of Object.entries(now.files)) for (const e of list) console.log(`  ${file} — ${e.label}`)
      return 0
    }
    const diff = compare(readLock(path), now)
    if (diff.length === 0) {
      console.log(`✓ test lock intact — ${count(now)}`)
      return 0
    }
    console.error(`✗ test lock violated — ${diff.length} difference${diff.length === 1 ? '' : 's'}:`)
    for (const d of diff) console.error(`  ${d.change.padEnd(8)} ${d.file} — ${d.label}`)
    return 1
  } catch (e) {
    // Exit 1 means "a test changed" and triggers a discard, so nothing else may ever exit 1.
    console.error(`✗ lock-tests: ${e instanceof LockError ? e.message : `unexpected error — ${e.stack}`}`)
    return 2
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
