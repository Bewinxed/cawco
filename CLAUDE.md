# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## UI/UX analysis

When analyzing, critiquing, or reviewing UI/UX in this repository, use the
`interface-craft` skill (its Design Critique methodology) as the analytical
frame. It composes with, not replaces, the measurement tools: clearshot for
incoming screenshots, and for rendered-layout ground truth `impeccable detect`
plus the probe kit's house-rules check (`scripts/probe-kit/house-rules.ts`).

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
- **Design spec**: DESIGN.md is the locked design language and it is law. Apply its tokens
  (the one source is `design/tokens/cawco.resolver.json`, DTCG 2025.10, built by `bun run tokens` in
  apps/dashboard into `src/lib/tokens/tokens.css`), its named rules and its component recipes.
  Do not introduce one-off colours, fonts, spacing, radii, shadows, curves or durations outside
  it; add a token to the JSON first. `.impeccable/design.json` carries its hex values, shadows,
  motion tokens and breakpoints.
- **Product truth**: PRODUCT.md (users, principles, accessibility). **Copy**: WORDS.md.
