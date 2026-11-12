// Tests for scripts/version.mjs. Run: npm run test:scripts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VersionError, bump, read } from './version.mjs'

const SCRIPT = fileURLToPath(new URL('./version.mjs', import.meta.url))

const CARGO = `[package]
name = "centerline"
version = "1.4.9"
edition = "2024"

[dependencies]
serde = { version = "1.0.200", features = ["derive"] }

[dev-dependencies.sqlx]
version = "0.8.0"
`

test('get reads the [package] version, not a dependency version', () => {
  assert.equal(read(CARGO), '1.4.9')
})

test('patch, minor and major bump as SemVer does', () => {
  assert.equal(bump(CARGO, 'patch').version, '1.4.10')
  assert.equal(bump(CARGO, 'minor').version, '1.5.0')
  assert.equal(bump(CARGO, 'major').version, '2.0.0')
})

test('a bump changes exactly one line', () => {
  const before = CARGO.split('\n')
  const after = bump(CARGO, 'minor').text.split('\n')
  const changed = after.filter((line, k) => line !== before[k])
  assert.deepEqual(changed, ['version = "1.5.0"'])
})

test('spacing and a trailing comment on the line are kept', () => {
  const text = '[package]\nname = "x"\nversion   =   "0.1.0"  # the app\n'
  assert.equal(bump(text, 'patch').text, '[package]\nname = "x"\nversion   =   "0.1.1"  # the app\n')
})

test('a version in a later table is not the package version', () => {
  const text = '[package]\nname = "x"\n\n[workspace.package]\nversion = "9.9.9"\n'
  assert.throws(() => read(text), (e) => e instanceof VersionError && /no version line/.test(e.message))
})

test('no [package] table is refused', () => {
  assert.throws(() => read('[workspace]\nmembers = []\n'), /no \[package\] table/)
})

test('two version lines are refused', () => {
  assert.throws(() => read('[package]\nversion = "0.1.0"\nversion = "0.2.0"\n'), /2 version lines/)
})

test('a version that is not three numbers is refused', () => {
  assert.throws(() => read('[package]\nversion = "0.1.0-beta.1"\n'), /cannot read/)
  assert.throws(() => read('[package]\nversion.workspace = true\n'), /cannot read/)
})

test('an unknown part is refused', () => {
  assert.throws(() => bump(CARGO, 'micro'), /unknown part/)
})

// ── The command line ─────────────────────────────────────────────────────────────────────────

function run(args, cargo) {
  const root = mkdtempSync(join(tmpdir(), 'version-'))
  try {
    if (cargo !== undefined) writeFileSync(join(root, 'Cargo.toml'), cargo)
    const r = spawnSync('node', [SCRIPT, ...args, '--root', root, '--no-check'], { encoding: 'utf8' })
    const after = cargo === undefined ? null : readFileSync(join(root, 'Cargo.toml'), 'utf8')
    return { ...r, after }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('bump writes the file and prints only the new version', () => {
  const r = run(['bump', 'patch'], CARGO)
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '1.4.10\n')
  assert.equal(read(r.after), '1.4.10')
})

test('get prints only the version', () => {
  const r = run(['get'], CARGO)
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '1.4.9\n')
})

test('a refused bump exits 1 and writes nothing', () => {
  const text = '[package]\nversion = "0.1.0"\nversion = "0.2.0"\n'
  const r = run(['bump', 'patch'], text)
  assert.equal(r.status, 1)
  assert.equal(r.stdout, '')
  assert.equal(r.after, text)
})

test('a missing Cargo.toml exits 1', () => {
  const r = run(['get'])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /does not exist/)
})

test('a bad command exits 2', () => {
  assert.equal(run(['set', '1.0.0'], CARGO).status, 2)
})
