---
schema: 1
id: DEC-R003
title: "A (yours) criterion is written by the operator"
topic: "Workflow"
status: "draft"
date: "2026-11-12"
ruling: "A task may mark at most one acceptance criterion (yours). Its test and stub are written as usual, the rest is built first, then the run waits while Spink writes it and the Lead reviews it as a teacher."
claims:
  - kind: "file"
    target: ".claude/skills/build-task/task-spec.md"
    note: "Acceptance criteria: the (yours) mark"
  - kind: "file"
    target: ".claude/skills/build-task/SKILL.md"
    note: "Step 4.5"
revisit_if: "Spink stops marking criteria (yours), or a (yours) task stalls for more than one session waiting on him."
---

## DEC-R003: A (yours) criterion is written by the operator

The project has two goals, a working Rust CenterLine and Spink learning Rust on real code
(`docs/PROJECT_PLAN.md` § Rust learning track). The plan's "you write one piece" needs a place in
`/build-task`, where otherwise the agents write everything.

So a criterion can be marked `(yours)`: optional, at most one per task. It is not `(by hand)`,
which means a person checks the result; here a person writes the code, and the test checks it.
`@test-writer` writes its test and stub. `@implementer` builds every other criterion first, so
there is working Rust around the gap to read, and leaves that stub alone. The Lead then stops,
names the test, the file and the stub, explains the concepts it needs, and waits.

When Spink is done, the Lead runs the lock and the proof and reviews it as a teacher: the
compiler's first message first, then one concept per reply. It never rewrites his code.

Draft until the first task with a `(yours)` criterion runs.
