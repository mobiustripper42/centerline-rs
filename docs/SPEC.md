# [Project Name] — Product Specification

## Overview
[One paragraph: what it is, who uses it, what it replaces or enables.]

## Philosophy
[The guiding principle. How should users feel? What does the app stand for? What should it *not* be?]

## Target
- **Target:** to be decided — a date, if there is one
- **Critical path:** [What must be true before this is useful to anyone — e.g., "payments live"]

## Stack

What this is built with and where it runs. **Filled in as the work forces each choice, not up
front.** A layer is chosen when the first phase that needs it starts, as a decision record, and its
line goes here then. A layer nothing needs yet stays unwritten. One line per layer; delete the
layers this project does not have rather than writing `none` beside half of them.

- **[Layer]** — [choice, and the version if it matters]
- **[Layer]** — [choice]
- **Hosting / target** — [where it runs]
- **Dev environment** — [what a developer needs running locally]
- **Testing** — [the tooling, and what each part covers]

## Roles
- **[Role 1]** — [what they manage or do]
- **[Role 2]** — [what they do]
- **[Role 3]** — [what they do]

## Core Concepts
- **[Concept 1]** — [definition and why it exists as a distinct thing]
- **[Concept 2]** — [definition]

## Phases

Scope is described by phase, and only by phase. A label for a release (a version number, "minimum viable", "launch") invites every session to argue what belongs in it, and the answers end up scattered through the docs disagreeing with each other.

### Phase 0 — Infrastructure
A test harness with one real test passing, a green gate, and the docs filled in. No database, host or framework is chosen here: each arrives with the first phase whose feature needs it. See `docs/PROJECT_PLAN.md` Phase 0.

### Phase 1 — [Name]
[High-level description of this phase's goal and the features it includes]

### Phase 2 — [Name]
[etc.]

## Out of scope
[Things no phase above plans to build. This is the scope guardrail — Claude checks here before adding anything. Moving one into a phase is a decision, made out loud.]

- [Feature X] — not planned
- [Feature Y] — not planned
