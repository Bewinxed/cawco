# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## UI/UX analysis

When analyzing, critiquing, or reviewing UI/UX in this repository, use the
`interface-craft` skill (its Design Critique methodology) as the analytical
frame. It composes with, not replaces, the measurement tools: clearshot for
incoming screenshots, and for rendered-layout ground truth `impeccable detect`.

## Project

Caw&Co (UI wordmark "Caw&Co", set in the landing's Nunito Variable face) is the agent canvas for any work, anywhere, in any harness: self-hosted, for code and more than code. A
`cawco` daemon runs on each machine, joins a hub over tailnet/LAN via mDNS, and a browser
dashboard gives one board across every machine, project, and running agent session. Harnesses:
Claude Code, OpenCode, pi. The iOS app is the operator's phone channel: its push answers
permissions and questions from the lock screen.

## Design Context

- **PRD**: `.design-foundations/plans/2026-10-06-projects.md` is the source of truth for the
  Projects features (Caw, tasks, routines, decisions, live-component sheets). Read it whole before
  briefing or building any of them.
- **Journey spec**: JOURNEY.md. Structural and IA decisions come from it.
- **Design spec**: DESIGN.md holds the design judgements that span screens and no check can
  hold; read it whole before UI work and follow each line, and the skill it names for a kind of
  work. A value several places share is a token in `apps/dashboard/src/lib/tokens/theme.css`
  (Tailwind's `@theme`; add it there first); padding, margin and gap use the house steps; a size
  only one place needs is written on Tailwind's number scale. DESIGN.md changes when the
  owner picks a change to the system; a screen's own decisions live in its surface brief at
  `apps/dashboard/.impeccable/surfaces/` (`impeccable surface-brief read <file>`).
- **Product truth**: PRODUCT.md (users, principles, accessibility). **Copy**: the words the product shows live in `packages/core/src/words/**`, written to DESIGN.md's Words section.

## Tests

No unit tests, and no test under another name: no script that runs product code and asserts what it does, no new probe spec, no new scenario in the binary's tests. What the code shows is not tested: read it and prove the change from the diff. A check in `bun run check` is a rule a tool enforces on the source: lint, types, a banned pattern, a measured contrast, a generated file kept current. Three things stay because the code cannot show them: the migration check on a copy of a real database, the sweep of the session handover's interleavings (`scripts/protocol-sweep.ts`), and the binary's smoke and end-to-end tests (`bun run test:binary`), run by hand before a change to how the daemon installs, updates or rolls back.
