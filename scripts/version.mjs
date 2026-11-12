#!/usr/bin/env node
// The project version, read from and written to `Cargo.toml` (DEC-R004).
//
//   node scripts/version.mjs get                       prints 0.1.0
//   node scripts/version.mjs bump patch|minor|major    edits Cargo.toml, prints the new version
//
// The one line it touches is `version = "X.Y.Z"` inside `[package]`. Anything else — no
// `[package]`, no such line, two of them, a version that is not three numbers, a
// `version.workspace = true` — is an error and nothing is written. After a bump it runs
// `cargo check` so `Cargo.lock` carries the new version too; `--no-check` skips that (tests only).
//
// Output is the bare version on stdout, so a skill can write `NEW_VERSION=$(node scripts/version.mjs
// bump patch)`. Everything else goes to stderr. Exit 0 done, 1 refused, 2 usage.

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export class VersionError extends Error {}

const LINE = /^version\s*=\s*"(\d+)\.(\d+)\.(\d+)"\s*(#.*)?$/

/** The `[package]` table's version line: `{ index, parts }`, where `index` is the line number. */
export function locate(text) {
  const lines = text.split('\n')
  let inPackage = false
  let sawPackage = false
  const hits = []
  lines.forEach((raw, index) => {
    const line = raw.trim()
    if (/^\[\[?[^\]]*\]\]?\s*(#.*)?$/.test(line)) {
      inPackage = line.replace(/\s*#.*$/, '') === '[package]'
      if (inPackage) sawPackage = true
      return
    }
    if (inPackage && /^version\b/.test(line)) hits.push({ index, line })
  })
  if (!sawPackage) throw new VersionError('Cargo.toml has no [package] table')
  if (hits.length === 0) throw new VersionError('[package] has no version line')
  if (hits.length > 1) throw new VersionError(`[package] has ${hits.length} version lines`)
  const m = hits[0].line.match(LINE)
  if (!m) throw new VersionError(`cannot read \`${hits[0].line}\`; expected version = "X.Y.Z"`)
  return { index: hits[0].index, parts: [Number(m[1]), Number(m[2]), Number(m[3])] }
}

export const read = (text) => locate(text).parts.join('.')

export function next([major, minor, patch], part) {
  if (part === 'major') return [major + 1, 0, 0]
  if (part === 'minor') return [major, minor + 1, 0]
  if (part === 'patch') return [major, minor, patch + 1]
  throw new VersionError(`unknown part \`${part}\`; use patch, minor or major`)
}

/** The new text and version; only the one version line differs, its spacing and comment kept. */
export function bump(text, part) {
  const { index, parts } = locate(text)
  const version = next(parts, part).join('.')
  const lines = text.split('\n')
  lines[index] = lines[index].replace(/"\d+\.\d+\.\d+"/, `"${version}"`)
  return { text: lines.join('\n'), version }
}

function main(argv) {
  const check = !argv.includes('--no-check')
  const rootAt = argv.indexOf('--root')
  const root = rootAt >= 0 ? argv[rootAt + 1] : '.'
  const [cmd, part] = argv.filter((a, k) => !a.startsWith('--') && (rootAt < 0 || k !== rootAt + 1))
  const path = join(root, 'Cargo.toml')
  try {
    if (cmd === 'get' && !part) {
      console.log(read(readFileSync(path, 'utf8')))
      return 0
    }
    if (cmd === 'bump' && part) {
      const { text, version } = bump(readFileSync(path, 'utf8'), part)
      writeFileSync(path, text)
      if (check) {
        const r = spawnSync('cargo', ['check', '--quiet'], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] })
        if (r.status !== 0) {
          console.error(`✗ Cargo.toml now says ${version}, but cargo check failed, so Cargo.lock may not match`)
          return 1
        }
      }
      console.log(version)
      return 0
    }
  } catch (e) {
    if (e instanceof VersionError || e.code === 'ENOENT') {
      console.error(`✗ version: ${e.code === 'ENOENT' ? `${path} does not exist` : e.message}`)
      return 1
    }
    throw e
  }
  console.error('usage: version.mjs get | bump patch|minor|major [--root <dir>] [--no-check]')
  return 2
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
