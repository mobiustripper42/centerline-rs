---
schema: 1
id: DEC-R001
title: "The workflow is a fork of jig generation 6, owned here"
topic: "Workflow"
status: "active"
date: "2026-11-12"
ruling: "This repo's skills, agents, gates and shell started as a copy of jig generation 6 and are this repo's to change. Jig is not changed by this repo, and nothing syncs in either direction."
claims:
  - kind: "file"
    target: "CLAUDE.md"
    note: "Session Skills: this repo owns its copy of the workflow"
  - kind: "file"
    target: ".claude/skills/its-alive/SKILL.md"
    note: "No drift or permission-policy step"
revisit_if: "The operator wants this repo and jig merged again, or a jig change is wanted here and copying it by hand starts to hurt."
---

## DEC-R001: The workflow is a fork of jig generation 6, owned here

Jig's workflow assumes a Node project and a jig checkout that syncs files into it: its tests are
files, its version is in `package.json`, and `/its-alive` runs jig's drift and policy scripts. A
Rust repo breaks the first two, and the third would report every Rust adaptation as drift.

So the scaffold was copied verbatim from jig commit `66ecb0a` (the commit "scaffold from jig
generation 6" on `main`, so the next diff is exactly what differs from jig), then adapted in task
0.1. Left out: jig's own tooling (`sync`, `drift`, `fleet`, `settings-policy`,
`check-shipped-citations`), its test suites, its decision records and its `jig-version`
comparison. Kept unchanged: the permission policy in `.claude/settings.json`.

Whether the two are merged later or stay two versions is decided later (`docs/PROJECT_PLAN.md`,
decisions made after approval). Until then a workflow fix here is its own task and pull request.

See also jig's DEC-J001, whose one-copy rule this repo steps outside.
