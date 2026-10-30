# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single operator — the person who owns every machine in a self-hosted deployment and every agent session running on them. There is exactly one operator role per deployment; no team personas, no multi-user access, no guest or viewer distinction. The operator works across desk computers, a phone and an iPad, checking in on running agents periodically throughout a working day rather than watching them continuously, and is often away while the work goes on. Their work is code and more than code.

## Product Purpose

CawCo is the agent canvas for any work, anywhere, in any harness.

Any work: a project is code and more than code, a repository, a launch, an X account, an SEO programme or a design kit. Anywhere: every machine the operator runs joins one hub, and the phone carries the same board. In any harness: Claude Code, OpenCode and pi run side by side, as peers.

It is self-hosted and watches the whole fleet. When several agents are running unattended across different machines and one stalls on a permission gate, breaks, or goes silent, CawCo shows which session needs attention without opening every terminal or SSHing into every box. The operator can approve, redirect, or kill it before it wastes context, cost, or blocks downstream work.

A project is one identity across machines and kinds of work. The operator talks to it through Caw, in the project's conversation (a session whose scope is the project); work that must outlive a chat becomes tasks; code runs the tasks, the merge checks and the landing; models judge; the operator decides. "Done" means on main, or a pull request that exists.

Success means the operator trusts the board: an empty board with a live connection genuinely means nothing needs them, and a "needs you" signal is never a false negative.

## Positioning

Three things a neighboring tool could not truthfully copy simultaneously:

1. **Self-hosted, no cloud dependency.** The tailnet is the perimeter. No data leaves the operator's network; no vendor outage takes the board down.
2. **Harness-neutral.** One board across Claude Code, OpenCode, and pi — not an extension of any single agent's ecosystem.
3. **Derived liveness.** Every status assertion traces to a live source at read time. Nothing in the UI or hub serves a stored value back as present-tense truth. An empty board is a verifiable claim, not a stale cache.

## Operating Context

The operator runs a fleet of machines (desktops, laptops, servers) on a Tailscale network or LAN. Each machine runs a cawco daemon that discovers the hub via mDNS (link-local) or Tailscale peer discovery. Agent sessions are spawned against Git repositories and run inside harness runtimes (Claude Code, OpenCode, pi).

A project's files are the truth: tasks, stages, routines, delegate types, decision pages, knowledge and memory are files in the project's folder (in its repository, or a hub-kept folder), and the hub keeps indexes rebuilt from them and the live state. A project runs on any of its machines; a project with no outside remote gets the hub as its git remote.

The operator's day includes: glancing at the fleet board to see what's running and what's blocked; triaging a blocked session by reading its transcript and approving or denying the permission request; talking to Caw in a project's conversation; picking on decision pages and commenting on what agents show in the artifact panel; spawning new sessions against projects; checking daily spend against a budget; authoring standing rules that auto-approve or auto-deny future permission patterns; and configuring fleet-wide tools (MCP servers, skills, plugins, hooks).

CawCo knows where the person is: **here** (on this chat), **elsewhere** (at a desk, on another chat or app) or **away** (no input on any device for the away clock, 5 minutes by default and the person's to set; a locked screen; or Appear away). A computer counts only once the person opts it in, through its CawCo agent or the browser's Idle Detection, and only whether keys or the pointer moved and whether the screen is locked is read. Every session is told the person's presence at each turn: elsewhere, it works quietly; away, it works without talking and keeps what the person would want to know in its plan, recapped on their return. What needs the person comes to the desk while they are there and to the phone once they leave.

Away from a desk, the operator uses the Caw&Co app on iPhone, iPad and Mac, or the mobile web dashboard. The app is a first-class channel, not a fallback notification, and the only bridge to the phone: no chat-app bridge. Its own facts are in `apps/apple/PRODUCT.md`.

## Capabilities and Constraints

**Capabilities:**
- Fleet board: one view of every machine, project, and running session with live status
- Session transcript: real-time streaming conversation view with tool calls, subagent branches, and delegate sessions
- Remote session control: spawn, steer (send messages), interrupt, and stop sessions from the dashboard or the app
- Permission approval: answer permission gates inline or from the app's push
- Rules: standing instructions the hub enforces on every session; a rule fires on a phrase, pattern or meaning in what a session says or thinks, or at the end of every turn, and answers with a fixed reply or the supervisor's judgement; each can be scoped to an agent, model, project or machine
- Hooks: lifecycle hooks with English-sentence previews and matchers
- Fleet config sync: push MCP servers, skills, plugins, memory, and hooks to all machines; hub resolves sources once and ships bytes
- Usage tracking: per-harness spend with daily charts and breakdown tables; a project's own spend cap
- Projects: one identity across places (checkouts on any machine, delegates' workspaces, the hub folder); made by talking to Caw, or offered once by Caw when a plain session outgrows itself
- The project's conversation: a session whose scope is the project, which its events reach (a routine, a report, a GitHub event) while the project's switch is on; off, only the person's words reach it
- Tasks: task files with stages the project names on six fixed kinds, to-dos, edges and attempts, shown in views (board, table, calendar, pipeline, canvas, or one Caw builds); a tracker of CawCo's files, GitHub Issues or Linear, never two-way
- Delegation and landing: every session that changes code works in its own workspace; the hub lands its commits on main through the merge checks the project's gate.md names; the delegation tree is how multi-step work runs (no workflow engine)
- Routines: scheduled or event-fired work that starts a delegate, an orchestrator or a message to Caw, once per slot
- Plans: every session keeps its plan in CawCo's list on every harness; the person's edits reach it at its next step
- Artifacts: pages, canvases, previews, component canvases and the project's browser, kept by the hub, with picks, pins, comments and ink that reach the session that made them
- Decision pages: the person's choices, one card each, drawn live; their picks become tasks, and their links read as words on each page
- Memory and Find: AGENTS.md and dated, sourced fact lines curated from agents' notes; one search over everything any session said or made, for the person and every agent
- Fleet watch: code detectors and a triage that nudges a session's steward (its parent, else its project's conversation) when it loops or stalls; a session is never told about itself
- Browser take-over: each project's own Chrome; the person takes over privately for a sign-in or a code and hands back
- Presence: here, elsewhere or away, which every session and push follows
- Delegate types: presets of harness, model, effort, skills, tools and budget, per fleet or per project

**Constraints:**
- Single-tenant only — one operator per hub deployment
- The network boundary is the security model by default: a device on the tailnet or LAN is the person's, and a session's credential is never the person. "Require paired devices" (Configure › Devices, off by default) makes every browser, app and CLI pair once and every machine be admitted with a click
- The hub is never publicly bound (architectural law); external access requires a tunnel with its own auth layer. The webhook relay and the stream relay are opt-in public paths that reach no hub API
- Permissions, merges, config writes and public actions are the person's: a fleet change asks the person except from a session in Full Send, and a public action waits for the person unless a project loosens it per stage move
- No adapter per outside tool: an outside tool with an MCP server is used through it
- sessiond (process keeper) is deliberately protocol-blind and ships approximately never, so agent daemon deploys don't kill running sessions
- A daemon restart never cuts a turn (the keeper runs it, the next daemon takes it over); an update or `cawco service restart agent` waits, behind a fence, for what the daemon carries itself (relayed tool calls, image generations, commands, session starts, hand-offs to a harness) — Install now for up to 45 s, auto-update for up to 30 min, `--when-idle` for up to 5 min; an update that then installs anyway records what it cut, and only `--force` restarts the daemon through it by hand

**Terminology (canonical — one concept, one term):**
- **session**: one working instance of an agent on repo+machine+task
- **run**: a single execution of a session's active work
- **agent**: the harness identity (Claude Code / OpenCode / pi)
- **subagent**: a child task inside a session, folded into the parent transcript
- **delegate**: a separate fleet session spawned by a parent, reported back
- **machine**: a host running the cawco daemon
- **fleet**: the connected collective of machines
- **rule**: a standing instruction the hub enforces on every session
- **spend / budget**: daily cost number / the limit
- **project**: one identity for work across machines, folders and kinds of work; **place**: where its files are; **workspace**: a clone plus branch kept for one task
- **Caw**: the agent's name and face, CawCo's mascot; **project conversation**: a session whose scope is the project
- **task**: the unit of work a project tracks; **stage**: where a task is, named by the project; **routine**: scheduled or event-fired work
- **plan**: a session's own step list, kept in CawCo; **attempt**: one session's try at a task
- **artifact**: a document a session made that the person works in; **decision page**: a page of choices the person picks on
- **paired device**: a browser, the app or a CLI the hub knows as the person's
- **here / elsewhere / away**: the person's presence
- The words the product shows, these terms in use, live in `packages/core/src/words/**`

**How state is shown (derived liveness in the UI):**
- An empty surface claims "nothing" only while the hub connection is live. While connecting, disconnected or in error, the board keeps its last good rows, marks them stale, and suppresses the needs-you count instead of showing zero.
- An empty state renders only once the data is known to be empty, never while it is still being read. While data loads, a skeleton stands in at the real layout's size.
- First-use empty ("no machine has joined") and user-cleared empty ("all clear, nothing running") are different answers and are always shown differently.
- A machine the hub cannot reach is marked on its own rows (hollow status, "Unreachable"); the rest of the board stays live.
- No answer to a permission prompt and no spawn is ever posted optimistically. A control that cannot be carried by the socket is disabled with the reason stated.

## Brand Commitments

- **Name:** Caw&Co as the wordmark; CawCo in sentences, page titles and notices. Identifiers spell it `cawco`.
- **Caw:** the crow is the agent's face. His poses carry the personality; the copy stays calm, and he moves only while something is going on.
- **Voice:** Calm structure — precise, calm, commanding, honest. Not friendly-helpful-clear. A calm ledger, not a personality brand.
- **Error formula:** what happened → why → how to fix → what happens next. Never "We" as subject; never blame framing; never a raw error code alone.
- **Button labels:** always [Verb]+[Object], from an allowlisted imperative-verb set.
- **Terminology discipline:** one concept → one canonical term everywhere, enforced by lint.
- **No humor** in error, warning, destructive-confirm, or permission-approval copy.
- **Copy authority:** every user-facing string lives in `packages/core/src/words/**`, written to DESIGN.md's Voice section (the voice, punctuation, contractions, error and empty-state formulas, button labels).
- **Identity constraints (owner-stated):** every product icon is Solar's bold-duotone cut, and it stays; indigo is never a brand hue; the action is graphite, not a hue. DESIGN.md records how these are drawn.

## Evidence on Hand

Working product: the fleet board and session transcripts, projects with Caw, tasks, routines, decision pages and artifacts, usage, and Configure's sections (rules, hooks, delegate types, MCP servers, skills, memory, accounts, connections, devices, browsers, phone, updates); functional fleet sync; three harness adapters shipping; the native app for iPhone, iPad and Mac in TestFlight (`apps/apple/PRODUCT.md`). cawco.dev is built from `site/`: a one-page landing page and the first-machine installer (`install.sh`). The hub, daemon and board are free (Apache 2.0 with the Commons Clause: no right to sell it). There are no external testimonials — the product is installed and used by its own operator.

## Product Principles

1. **Trust the board.** Every liveness claim traces to a live source. An empty board with a live connection is a verifiable assertion that nothing needs the operator, not an absence of data.
2. **The network is the perimeter, and pairing is one switch away.** Self-hosted, single-tenant, no cloud; the hub never binds publicly. By default being on the network is enough for the person's own devices, and a session's credential is never the person. "Require paired devices" makes every browser, app and machine prove itself: each device pairs once, each machine is admitted with one click.
3. **One board, every agent.** Harness-neutral by design — Claude Code, OpenCode, and pi are peers, not first-class-and-also-rans.
4. **Talk first; code coordinates, models judge, you decide.** Every primitive is reachable by talking and none sits between the person and a session; a session never needs a task. Status, checks, landing and schedules are code; judgements are models'; permissions, merges, config writes and public actions are the person's.
5. **Derived, not stored.** Status is computed at read time from live sources. The hub records what happened (durable history); the daemon reports what is happening (live truth). The UI renders the derivation and invents nothing.

## Accessibility & Inclusion

- **Standard:** WCAG 2.2 AA. Text and status inks hold 4.5:1 on the surfaces they sit on.
- **Target size:** every control reaches a 44×44 touch area on a coarse pointer and a 24×24 area on a fine pointer (SC 2.5.8), without changing its drawn size. The approve/deny pair targets 44×44.
- **Status is never colour alone:** every state carries a word or a distinct shape as well as its hue.
- **Keyboard:** every action is reachable by keyboard and shows one visible focus ring on keyboard focus.
- **Reduced motion and transparency:** `prefers-reduced-motion` removes all travelling motion and loops (fades remain); `prefers-reduced-transparency` makes translucent chrome opaque.
- **Phone fields:** text inputs never render below 16px on a phone or a coarse pointer, so iOS never zooms on focus; iOS hold-to-select and Paste must reach every text field, including inside sheets.
- **Screen readers:** live regions announce state changes and refusals; morphing text keeps a plain-text copy for assistive technology.
