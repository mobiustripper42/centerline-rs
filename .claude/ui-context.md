# [Project Name] — Interface Context (for @ui-reviewer)

What `@ui-reviewer` checks a screen against, and what `/kill-this` and `/retro` read to decide when it runs. Copied once from jig's scaffold when the project gets its first screen, then owned here. Delete it while the project has no screens: `/kill-this` and `/retro` skip the review when it is absent.

Rules and pointers only. Every value lives in a file named here; a list of components or colours copied into this file is wrong the day the code moves.

## Sources

[The files a screen is checked against, most authoritative first, one line each saying what it holds. Typically the brand document (voice, colour rules, type, spacing, accessibility), the design tokens, the stylesheet or theme as built, and where approved mockups live. Name anything that looks like a source and is not one.]

## Components

[Where the project's components live, and the command that lists them, for example `ls <components dir>/*.tsx`. A screen that builds one of them by hand is a finding. Say what lint already enforces, so the review looks for what it cannot see. A look no component covers is a follow-up, not something for the reviewer to design.]

## Viewports

[The widths to review at, for example 375px and 1440px, and which devices use which.]

## Languages

[The languages to review in. Write the project's one language if it has one. A language the review should skip for now is named with why and until when.]

## Screen files and routes

- **Screen file:** [which files count as a screen change: paths and extensions, tests excluded]
- **Strings file:** [where translated or user-facing strings live, or "None"]
- **Route:** [how a screen file maps to the route it renders, and the command that lists every route. Say what a shared file, such as a layout or a component, reaches.]

## Reaching a screen

[The exact commands to start a server the reviewer owns, on its own port and database, the seed commands that give it data, and how to sign in as each role. Name what must not run at the same time.]

A screen still out of reach is named in the report as not reached — never reviewed from source and called clean.

## What to check

[What lint cannot see, each with the source line it comes from: spacing steps, control sizes, colour used without a word or icon, voice, a hand-built copy of a component.]
