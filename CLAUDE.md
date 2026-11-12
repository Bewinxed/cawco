# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## UI/UX analysis

When analyzing, critiquing, or reviewing UI/UX in this repository, use the
`interface-craft` skill (its Design Critique methodology) as the analytical
frame. It composes with, not replaces, the measurement tools: clearshot for
incoming screenshots, and for rendered-layout ground truth `impeccable detect`
plus the probe kit's rendered checks (`scripts/probe-kit/rendered-checks.ts`).

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
  work. Every visual value comes from a token in `design/tokens/` (DTCG 2025.10, built by
  `bun run tokens` in apps/dashboard into `src/lib/tokens/tokens.css`; add a token there before
  using a new value). DESIGN.md changes when the
  owner picks a change to the system; a screen's own decisions live in its surface brief at
  `apps/dashboard/.impeccable/surfaces/` (`impeccable surface-brief read <file>`).
- **Product truth**: PRODUCT.md (users, principles, accessibility). **Copy**: the words the product shows live in `packages/core/src/words/**`, written to DESIGN.md's Words section.
