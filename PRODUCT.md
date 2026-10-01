# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single operator — the person who owns every machine in a self-hosted deployment and every agent session running on them. There is exactly one operator role per deployment; no team personas, no multi-user access, no guest or viewer distinction. The operator works across a desktop and a phone, checking in on running agents periodically throughout a working day rather than watching them continuously.

## Product Purpose

Whiffle is a self-hosted fleet control plane for AI coding agents. When several agents are running unattended across different machines and one stalls on a permission gate, breaks, or goes silent, Whiffle shows which session needs attention without opening every terminal or SSHing into every box. The operator can approve, redirect, or kill it before it wastes context, cost, or blocks downstream work.

Success means the operator trusts the board: an empty board with a live connection genuinely means nothing needs them, and a "needs you" signal is never a false negative.

## Positioning

Three things a neighboring tool could not truthfully copy simultaneously:

1. **Self-hosted, no cloud dependency.** The tailnet is the perimeter. No data leaves the operator's network; no vendor outage takes the board down.
2. **Harness-neutral.** One board across Claude Code, OpenCode, and pi — not an extension of any single agent's ecosystem.
3. **Derived liveness.** Every status assertion traces to a live source at read time. Nothing in the UI or hub serves a stored value back as present-tense truth. An empty board is a verifiable claim, not a stale cache.

## Operating Context

The operator runs a fleet of machines (desktops, laptops, servers) on a Tailscale network or LAN. Each machine runs a whiffle daemon that discovers the hub via mDNS (link-local) or Tailscale peer discovery. Agent sessions are spawned against Git repositories and run inside harness runtimes (Claude Code, OpenCode, pi).

The operator's day includes: glancing at the fleet board to see what's running and what's blocked; triaging a blocked session by reading its transcript and approving or denying the permission request; spawning new sessions against projects; checking daily spend against a budget; authoring standing rules that auto-approve or auto-deny future permission patterns; and configuring fleet-wide tools (MCP servers, skills, plugins, hooks).

Away from a desk, the operator uses a Telegram bridge to receive permission prompts and approve them from a phone — this is a first-class channel, not a fallback notification.

## Capabilities and Constraints

**Capabilities:**
- Fleet board: one view of every machine, project, and running session with live status
- Session transcript: real-time streaming conversation view with tool calls, subagent branches, and delegate sessions
- Remote session control: spawn, steer (send messages), interrupt, and stop sessions from the dashboard or Telegram
- Permission approval: answer permission gates inline or via Telegram
- Standing rules: persistent rules that auto-approve/deny permission patterns, with live testers
- Hooks: lifecycle hooks with English-sentence previews and matchers
- Fleet config sync: push MCP servers, skills, plugins, memory, and hooks to all machines; hub resolves sources once and ships bytes
- Usage tracking: per-harness spend with daily charts and breakdown tables
- Delegate management: define and manage subagent presets (harness, model, effort)
- Project view: per-project docs, machine/session inventory, spawn controls

**Constraints:**
- Single-tenant only — one operator per hub deployment
- No in-app authentication — the Tailscale/LAN network boundary is the entire security model; anyone who can reach the hub socket can operate the fleet
- The hub is never publicly bound (architectural law); external access requires a tunnel with its own auth layer
- sessiond (process keeper) is deliberately protocol-blind and ships approximately never, so agent daemon deploys don't kill running sessions
- The daemon is never auto-restarted mid-turn — deploys require `--when-idle` or `--force`

**Terminology (canonical — one concept, one term):**
- **session**: one working instance of an agent on repo+machine+task
- **run**: a single execution of a session's active work
- **agent**: the harness identity (Claude Code / OpenCode / pi)
- **subagent**: a child task inside a session, folded into the parent transcript
- **delegate**: a separate fleet session spawned by a parent, reported back
- **machine**: a host running the whiffle daemon
- **fleet**: the connected collective of machines
- **rule**: a standing permission rule
- **spend / budget**: daily cost number / the limit

**How state is shown (derived liveness in the UI):**
- An empty surface claims "nothing" only while the hub connection is live. While connecting, disconnected or in error, the board keeps its last good rows, marks them stale, and suppresses the needs-you count instead of showing zero.
- An empty state renders only once the data is known to be empty, never while it is still being read. While data loads, a skeleton stands in at the real layout's size.
- First-use empty ("no machine has joined") and user-cleared empty ("all clear, nothing running") are different answers and are always shown differently.
- A machine the hub cannot reach is marked on its own rows (hollow status, "Unreachable"); the rest of the board stays live.
- No answer to a permission prompt and no spawn is ever posted optimistically. A control that cannot be carried by the socket is disabled with the reason stated.

## Brand Commitments

- **Name:** Whiffle (codebase migration from "Whiffle" pending; "Whiffle" is the sole public-facing name)
- **Voice:** Calm structure — precise, calm, commanding, honest. Not friendly-helpful-clear. A calm ledger, not a personality brand.
- **Error formula:** what happened → why → how to fix → what happens next. Never "We" as subject; never blame framing; never a raw error code alone.
- **Button labels:** always [Verb]+[Object], from an allowlisted imperative-verb set.
- **Terminology discipline:** one concept → one canonical term everywhere, enforced by lint.
- **No humor** in error, warning, destructive-confirm, or permission-approval copy.
- **Copy authority:** WORDS.md governs every user-facing string: the voice chart, tone map, terminology table, error formula, empty-state formulas and button-label rule.
- **Identity constraints (owner-stated):** every product icon is Solar's bold-duotone cut, and it stays; indigo is never a brand hue; the action is graphite, not a hue. DESIGN.md records how these are drawn.

## Evidence on Hand

Working product with 9 route surfaces (fleet board, session detail, project detail, tools, rules, rule detail, hooks, hook detail, usage, delegates), functional fleet sync, Telegram bridge, three harness adapters shipping. No marketing site, no public launch, no external testimonials — installed and used by its own operator.

## Product Principles

1. **Trust the board.** Every liveness claim traces to a live source. An empty board with a live connection is a verifiable assertion that nothing needs the operator, not an absence of data.
2. **The network is the perimeter.** Self-hosted, single-tenant, no cloud. Authentication is network reachability; the hub never binds publicly.
3. **One board, every agent.** Harness-neutral by design — Claude Code, OpenCode, and pi are peers, not first-class-and-also-rans.
4. **Ship the daemon, not the sessions.** sessiond exists so agent-daemon deploys don't kill running work. The process keeper is protocol-blind and ships approximately never.
5. **Derived, not stored.** Status is computed at read time from live sources. The hub records what happened (durable history); the daemon reports what is happening (live truth). The UI renders the derivation and invents nothing.

## Accessibility & Inclusion

- **Standard:** WCAG 2.2 AA. Text and status inks hold 4.5:1 on the surfaces they sit on.
- **Target size:** every control reaches a 44×44 touch area on a coarse pointer and a 24×24 area on a fine pointer (SC 2.5.8), without changing its drawn size. The approve/deny pair targets 44×44.
- **Status is never colour alone:** every state carries a word or a distinct shape as well as its hue.
- **Keyboard:** every action is reachable by keyboard and shows one visible focus ring on keyboard focus.
- **Reduced motion and transparency:** `prefers-reduced-motion` removes all travelling motion and loops (fades remain); `prefers-reduced-transparency` makes translucent chrome opaque.
- **Phone fields:** text inputs never render below 16px on a phone or a coarse pointer, so iOS never zooms on focus; iOS hold-to-select and Paste must reach every text field, including inside sheets.
- **Screen readers:** live regions announce state changes and refusals; morphing text keeps a plain-text copy for assistive technology.
