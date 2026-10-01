# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## UI/UX analysis

When analyzing, critiquing, or reviewing UI/UX in this repository, use the
`interface-craft` skill (its Design Critique methodology) as the analytical
frame. It composes with, not replaces, the measurement tools: clearshot for
incoming screenshots, ui-observer for rendered-layout ground truth.

## Project

Whiffle (UI wordmark "Whiffle") is a self-hosted fleet control plane for AI coding agents. A
`whiffle` daemon runs on each machine, joins a hub over tailnet/LAN via mDNS, and a browser
dashboard gives one board across every machine, project, and running agent session. Harnesses:
Claude Code, OpenCode, pi. A Telegram bridge lets the operator approve permissions from a phone.

## Design Context

- **Journey spec**: JOURNEY.md. Structural and IA decisions come from it.
- **Design spec**: DESIGN.md is the locked design language and it is law. Apply its tokens
  (`apps/dashboard/src/app.css`), its named rules and its component recipes. Do not introduce
  one-off colours, fonts, spacing, radii, shadows, curves or durations outside it; add a token
  first. `.impeccable/design.json` carries its hex values, shadows, motion tokens and breakpoints.
- **Product truth**: PRODUCT.md (users, principles, accessibility). **Copy**: WORDS.md.
