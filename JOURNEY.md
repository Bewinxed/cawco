# JOURNEY.md

<!-- The structural and temporal design spec for Caw&Co ("CawCo"). Pairs with DESIGN.md
     (visual tokens, produced in a later phase) — this document carries the structural and
     temporal spec that visual tokens alone can't encode. For visual tokens, see DESIGN.md
     (once it exists). -->

## Job

**Job story:** When several AI coding agents are running unattended across different machines and one of them stalls on a permission gate, breaks, or goes silent, I want to see which session needs me without opening every terminal or SSHing into every box, so I can approve, redirect, or kill it before it wastes the run's context and cost, or blocks work I'm waiting on.

**Functional job:** Triage every running agent session across every machine and project from one board; approve or deny the permission a blocked session is waiting on; spawn, steer, or stop a session; check spend against a daily budget before it surprises them.

**Emotional job:** Feel in control of a fleet they aren't watching continuously — confident that "needs you" really means needs-you, not anxious that something is silently stuck off-screen.

**Social job:** Be seen (by themselves, and by anyone they hand a session to) as someone running a disciplined, supervised fleet — not someone who fired off a dozen agents and walked away from the blast radius.

*(Attribution, split by construct. The **functional/emotional/social split** above is Moesta's three
sources of energy — Moesta & Engle, *Demand-Side Sales 101: Stop Selling and Help Your Customers
Make Progress*, Lioncrest, 2020. The **job-story sentence form** is not Moesta's and is not claimed
as his: it originates at Intercom and was first published by Paul Adams, "The dribbblisation of
design," Intercom, 18 September 2013 — "We frame every design problem in a Job… When _____, I want
to _____, so I can _____." Alan Klement gave the format the name "Job Story" — Intercom's own
record, Adams, "How we accidentally invented Job Stories," Intercom, 28 June 2016: "It didn't have
that name at the time (Alan Klement later named it for us)" — and published under that name in
Klement, "Designing Features Using Job Stories," Intercom, 23 December 2013. The sentence form is
adopted here as **notation only**: a template for writing one sentence. It is not a second analytic
school, and no analytic method attached to it is used. Every construct this document actually
reasons with — the four forces, the three energies, the Switch interview — is Moesta's, and that
remains the single school in use.)*

**Switch interview (Moesta four forces — Moesta & Engle, *Demand-Side Sales 101*, Lioncrest, 2020):**
- **Push:** Watching a fleet of agents by SSHing into each machine and attaching to each tmux/terminal session doesn't scale past two or three sessions; a blocked approval sitting unseen for hours is the concrete failure that created this job.
- **Pull:** One board across every machine, project, and session — plus a Telegram bridge that lets the operator approve a permission from a phone without being at a keyboard at all.
- **Anxiety:** The user reports the current dashboard's CSS and layout are buggy and were produced by a prior agent — the fear is that the replacement looks plausible but still hides or misreports a blocked session, which is worse than no dashboard (false confidence beats no confidence).
- **Habit:** Falling back to a raw terminal/tmux per machine when the dashboard doesn't clearly answer "is anything blocked right now" fast enough.

**JTBD school used:** Moesta (Switch interview).

---

## Journey

**Actor:** The fleet operator — the single person who owns every machine in this self-hosted deployment and every agent session running on it. CawCo is single-tenant per deployment; there is exactly one operator role, never a team of distinct personas.

**Scenario:** A working day (or a working stretch that spans in-person and mobile time) in which the operator keeps several Claude Code / OpenCode / pi sessions moving across machines — starting some, checking on others, unblocking the ones that stalled, and closing the day confident nothing was left stuck.

**Scope:** Future-state (CawCo's dashboard, redesigned from the existing implementation — the plan mandates discarding and re-deriving the current UI in full). Current-state baseline is the existing dashboard (7 route surfaces already on disk, reported buggy CSS/layout — see plan `## Context`), plus a raw-terminal/tmux fallback habit the operator reaches for when that dashboard doesn't answer fast enough; the baseline is not the absence of any dashboard. Touchpoints included: the browser dashboard (desktop and mobile web) and the Telegram bridge. Excludes the `cawco` daemon's own internals and harness-level CLI usage, which are not surfaces this design phase touches.

**Journey map (NN/g swim lanes — Gibbons, "Journey Mapping 101," Nielsen Norman Group, 2018):**

| Phase | Actions | Mindset | Emotion | Touchpoints | Opportunities |
|-------|---------|---------|---------|-------------|----------------|
| **Fleet check-in** | Opens the dashboard (or its phone-sized view) and scans for anything blocked, errored, or unreachable across every machine at once. | "Is anything on fire right now?" — a fast binary scan, not a deep read. | Medium — mild vigilance, not yet alarmed. | Dashboard fleet board (`session`), Telegram digest/notification. | A single unmistakable "needs you" count that never requires opening a session to trust. |
| **Triage blocked sessions** | Opens each flagged session's transcript, reads the last agent turn and the pending permission request, decides approve / widen scope / deny / redirect. | "What is it actually asking, and is that safe to grant?" — reading for risk, not just status. | Low → rising if the request is ambiguous or the transcript is hard to scan. | Session detail/transcript (`session/[id]`). | Keep the permission-widening control spatially and visually separated from the primary approve action, so a rushed triage pass can't misclick into a blanket grant (Fitts's law, 1954 — near-zero travel cost to a high-cost target is itself a hazard). |
| **Steer or spawn work** | Starts a new session against a project, assigns rules/tool access, or redirects a running session with a follow-up instruction. | "What does this session need to be trusted to run unattended?" | Medium — this is deliberate, unhurried setup work, not reactive. | Project detail (`project/[id]`), Rules (`rules`, `rules/[id]`), Tools (`tools`). | Surface which rules and tools apply to a session at spawn time, not only after something goes wrong. |
| **Remote approval (away from the desk)** | Gets a Telegram message that a session is blocked, reads the request on a phone, approves or denies without opening a laptop. | "Is this safe enough to approve from a notification, or do I need the full context first?" | High, negative valence, if the request is unclear on a small screen — this is the day's single peak (not its end; see Wind-down). | Telegram bridge, mobile web dashboard. | The mobile/compact surface must carry enough of the transcript's context to approve responsibly, not just a bare command string — this is a first-class requirement, not a fallback view. |
| **Cost check** | Glances at spend against the daily budget, drills into `usage` only if a session is unexpectedly expensive. | "Am I about to blow the budget on a run I forgot was going?" | Low — routine unless a number surprises them. | Usage (`usage`). | Surface the alert threshold, not just the running total, so this stays a glance rather than a calculation. |
| **Wind-down** | Confirms nothing is left in a blocked or errored state before stepping away; leaves the fleet running unattended overnight or over a break. | "Can I actually leave this alone?" | High, positive valence, if confirmed clean — this is the day's end-point, not its peak (see Remote approval); the second half of the peak-end rule (Kahneman, Fredrickson, Schreiber & Redelmeier, 1993). | Dashboard fleet board (`session`). | The zero-blocked state should feel like a distinct, reassuring end state, not silence that could mean "nothing to report" or "not checked recently." |

**Decision model:** McKinsey loyalty loop (Court et al., *McKinsey Quarterly*, 2009; Edelman, "Branding in the Digital Age: You're Spending Your Money in All the Wrong Places," *Harvard Business Review*, December 2010). The operator's *first* extended use of the redesigned dashboard is the initial-loop decision (does the redesign earn enough trust to retire the buggy predecessor and the raw-terminal fallback habit?); every subsequent day is the loyalty loop — once "needs you" is trusted, the operator returns straight to check-in and skips re-evaluating whether the tool is worth using, exactly as the loyalty loop bypasses active re-evaluation after a positive post-purchase experience. This is not a messy-middle (Rennie & Protheroe, "Decoding Decisions: Making Sense of the Messy Middle," Think with Google, July 2020) situation: there is no live "consideration set" of competing dashboards each time the operator opens the board.

**Emotion curve:** Intensity starts medium during check-in, dips low during routine triage, then rises to the day's single peak during remote/mobile approval of an ambiguous request — high intensity, negative valence, the anxiety force from the Switch interview above made concrete — eases through cost check, and closes at Wind-down: a separate high-intensity, positive-valence end-point, not a second peak. The peak-end rule (Kahneman, Fredrickson, Schreiber & Redelmeier, "When More Pain Is Preferred to Less: Adding a Better End," *Psychological Science*, 1993; cited in the doctrine's `journey-stack.md` §Emotion curve guidance) treats the peak and the end as two distinct moments that dominate how an experience is remembered — this map keeps them distinct rather than collapsing both into one "peak-end" phase.

**Research basis:** UNGROUNDED. No interviews, diary studies, or support-call analysis have been conducted — this project has exactly one available informant (the user, consulted directly for the plan's `## Context` and constraints) and no separate user population to interview. Per the doctrine's pre-flight check (`journey-caveats.md` §Journey-map theater): this map's emotion curve is a reasoned hypothesis from the stated forces and scenario, not derived from research, and should be treated as such until revisited against real usage. **Owner:** the fleet operator — the same single person named as **Actor** above, who is this project's one informant and the only person able to act on the map. Naming an owner is the one pre-flight gate the single-operator constraint does *not* excuse: research basis and card-sort validation are blocked by having no second person, but ownership is not, and NN/g's own map format carries ownership in its takeaways lane (Gibbons, "Journey Mapping 101," Nielsen Norman Group, 2018). **Update cadence:** the owner revisits this map after the first real multi-day usage period, and again if a second operator or deployment ever exists to compare against; between those triggers the map is a standing hypothesis, not a current finding.

---

## IA

**Organization scheme:** Task (Rosenfeld/Morville ambiguous scheme — *Information Architecture: For the Web and Beyond*, 4th ed, Rosenfeld/Morville/Arango, 2015). The seven surfaces group by what the operator is doing (triage sessions, manage rules, browse tools, check spend), not by an exact alphabetical/chronological/geographical order.

**Structure type:** Hub-and-spoke — taken from the enumerated structure set in this project's journey doctrine (`journey-stack.md` §IA structure table, design-for-ai 4.2.0), *not* from the polar-bear book. Rosenfeld/Morville/Arango's own organization structures are hierarchy, hypertext, and the relational-database model (*Information Architecture: For the Web and Beyond*, 4th ed, 2015, ch. 6 "Organization Systems"); hub-and-spoke is not one of them, and an earlier draft's attribution of it to them was inherited from the doctrine and is corrected here. Read honestly against the journey table rather than asserted from the sitemap shape alone. Of the six journey phases, **four** (Fleet check-in, Triage, Remote approval, Wind-down) never touch a Tools/Rules/Usage spoke at all — their touchpoints are the hub (`session`, `session/[id]`) or the external Telegram channel, so they neither confirm nor contradict hub-and-spoke; they're silent on it. **Exactly one** phase, Cost check, shows the clean pattern the structure type predicts: it visits a single spoke (Usage) and nothing else. **Steer-or-spawn work is the one phase that deviates**: its Opportunities cell asks for a session→rules/tools contextual link, i.e. it crosses spokes directly (Project → Rules → Tools) without returning to the hub between them. So the structure claim rests on one phase's clean fit and one phase's documented exception — not on "most phases fit the pattern," which the table does not show. Session detail and Project detail are contextual drill-ins reached from the hub; Rules carries one further level of local tree structure (list → detail) beneath its spoke.

**Sitemap:**
```
Session (hub — fleet board)
├── Session/[id] (session detail / transcript — contextual drill-in from the hub)
├── Project/[id] (project detail — contextual drill-in from the hub)
├── Tools (spoke)
├── Rules (spoke)
│   └── Rules/[id] (rule detail — one-level local tree)
└── Usage (spoke)
```

**Sitemap on disk now.** The routes have since regrouped. Tools and Rules are sections of one **Configure** spoke, and a **Workflows** spoke has been added. The rail's spokes, top to bottom, are Fleet, Workflows, Usage, Configure (`lib/cawco/Sidebar.svelte`; `lib/cawco/motion/route.svelte.ts` `SPOKE_ORDER`). The specs below keep their original surface names; this is where each lives today:
```
/session                     Fleet board (hub)                    spec 1 `session`
/session/[id]                Session transcript                   spec 2 `session/[id]` (one [[id]] route)
/project/[id]                Project detail                       spec 3 `project/[id]`
/workflows                   Workflows (spoke)
  /workflows/[id]            Workflow editor
    /runs/[run]              One run of it
/usage                       Usage (spoke)                        spec 7 `usage`
/config                      Configure (spoke; wide screens open on Rules)
  /config/rules              Rules                                spec 5 `rules`
  /config/rules/[id]         Rule detail                          spec 6 `rules/[id]`
  /config/hooks, /[id]       Hooks
  /config/delegate-types, /[name]
  /config/subagents, /[name]
  /config/cli-tools          Command-line tools                   spec 4 `tools` (Tools tab)
  /config/mcp, /[name]       MCP servers                          spec 4 `tools` (MCP servers tab)
  /config/skills             Skills & plugins                     spec 4 `tools` (Skills & plugins tab)
  /config/memory, /[...path] Memory files                         spec 4 `tools` (Memory tab)
  /config/models             Models CawCo uses
/motion/new-session, /motion/traffic   motion test benches, not product surfaces
```

**Global navigation labels:** Fleet, Tools, Rules, Usage. Corrected from an earlier draft that omitted the fleet board from global nav — three of the six journey phases route through the fleet board — Fleet check-in and Wind-down list it directly as their touchpoint, and Triage reaches its `session/[id]` transcript only by drilling in from it — the highest return frequency of any surface, so it gets a persistent global-nav entry like its three sibling spokes rather than being reachable only by an implicit "it's the arrival page" assumption. This also reconciles labeling with prose: **Fleet** in nav matches "fleet board" in the Job/Journey sections, and **Usage** in nav is the destination named by the "Cost check" phase — a reader landing on either label can trace it back to the phase that sends them there (Rosenfeld/Morville/Arango, 2015, on avoiding internal jargon that the sitemap alone doesn't reveal — see doctrine `journey-caveats.md` §"Sitemap ≠ IA").

**Navigation model:** Global navigation surfaces all four spokes (Fleet, Tools, Rules, Usage) persistently, giving a one-click path to at least one listed touchpoint for **4 of 6 phases**, counted against the journey table above: Fleet check-in and Wind-down (→ Fleet), Cost check (→ Usage), and Steer-or-spawn, whose Touchpoints cell lists Rules (`rules`, `rules/[id]`) and Tools (`tools`) — both global-nav entries. Steer-or-spawn is a **partial** fit and is counted as such: its remaining leg, Project detail (`project/[id]`), is a contextual drill-in with no global-nav entry, so the phase reaches two of its three destinations in one click and the third not at all. The other **2 of 6** have no one-click global-nav path to any of their destinations, by design, not by oversight: Triage's destination (`session/[id]`) is a contextual drill-in from within the Fleet hub, never a global-nav target itself; Remote approval's destinations are the Telegram bridge — an external channel with no in-app nav entry at all — and the mobile web dashboard, which is the same four-entry global nav on a smaller surface rather than a separate destination. **Known gap for Phase 2:** `project/[id]` currently has no list or creation entry point on disk (`apps/dashboard/src/routes/project/` contains only `[id]/`), yet Steer-or-spawn's action is to start a *new* session against a project — there is no specified way to reach or choose a project before a session exists. This IA does not invent that entry point; it is flagged here as an open structural gap for Phase 2's flows and page specs to resolve. Global-nav grouping is staged to reduce decision time for an operator scanning it mid-triage (Hick, "On the Rate of Gain of Information," *Quarterly Journal of Experimental Psychology*, 1952; Hyman, "Stimulus Information as a Determinant of Reaction Time," *Journal of Experimental Psychology*, 1953 — two separate papers, commonly paired as "Hick's law," applied per the doctrine's IA navigation guidance: grouping and staging reduces decision time for unfamiliar or time-pressured scanning, not a mandate to minimize the raw item count).

**Validation:** NOT VALIDATED. No card sort or tree test is possible — this is a single-operator, self-hosted tool with no second person to run either method against (Rosenfeld/Morville validation requirement, 2015). This structure is a reasoned default from the task-organization scheme above, not a validated IA, and should be revisited if a second operator or deployment ever exists to test it against.

---

## Flows

**Notation** (NN/g / Garrett flow notation, per the journey doctrine): `●` entry point · `▭` action or screen · `◆` decision point · `◎` exit point · `→` flow direction.

**Law shorthand used throughout this section and `## Page specs`.** Both laws are written in full here once and referenced in short form at every node, so that a short form is always resolvable:

- **Hick's law** — Hick, "On the Rate of Gain of Information," *Quarterly Journal of Experimental Psychology*, 1952; Hyman, "Stimulus Information as a Determinant of Reaction Time," *Journal of Experimental Psychology*, 1953. Two separate papers, commonly paired. Short form below: **(Hick–Hyman 1952/1953)**. Applied as the doctrine applies it — *group and stage* the options at a branch to cut decision time under time pressure — not as a mandate to minimise raw item count.
- **Fitts's law** — Fitts, "The information capacity of the human motor system in controlling the amplitude of movement," *Journal of Experimental Psychology* 47(6):381–391, 1954. Short form below: **(Fitts 1954)**. Applied in both directions: the primary target is large and in the natural resting path, *and* a high-cost target must not be cheap to reach.

**Feedback tiers used by every Loading state here and in `## Page specs`.** The boundaries are Nielsen's, from Nielsen, "Response Times: The 3 Important Limits," Nielsen Norman Group, 1 January 1993 — an excerpt from ch. 5 of *Usability Engineering* (1993) — which in turn cites Miller, R. B., "Response time in man-computer conversational transactions," *Proc. AFIPS Fall Joint Computer Conference*, Vol. 33, 1968, 267–277:

| Tier | Band | Treatment | Source of the boundary / of the treatment |
|------|------|-----------|-------------------------------------------|
| **Tier 1** | `<0.1s` | No indicator — show the result | Nielsen 1993: 0.1s is "the limit for having the user feel that the system is reacting instantaneously… no special feedback is necessary" |
| **Tier 2** | `0.1–1s` | Subtle only — no blocking indicator | Nielsen 1993: "Normally, no special feedback is necessary during delays of more than 0.1 but less than 1.0 second" |
| **Tier 3** | `1–10s` | Skeleton of the real layout | The *boundary* is Nielsen 1993 ("10 seconds is about the limit for keeping the user's attention"). The *skeleton-over-bare-spinner* choice is this project's doctrine pattern bridge (`usability` → `references/ui-patterns.md`), selected by visibility of system status; it is **not** Nielsen's wording and is not attributed to him. |
| **Tier 4** | `10s+` | Determinate percent or step-and-count, **plus** an out-of-band notification, **plus** a signposted way to interrupt | Nielsen 1993, literal: "percent-done progress indicators should be used for operations taking more than about 10 seconds" and "Anything slower than 10 seconds needs a percent-done indicator as well as a clearly signposted way for the user to interrupt the operation." Percent-done indicators themselves: Myers, B. A., "The importance of percent-done progress indicators for computer-human interfaces," *Proc. ACM CHI'85*, 1985, 11–17 (as cited by Nielsen 1993). |

**A bare spinner is never prescribed anywhere in this document.** It is the named mistake for any load that can exceed 5s: agent runs are open-ended and routinely cross the 10s boundary, so they take Tier 4, and the Telegram bridge is the out-of-band channel Tier 4 requires.

**The hub connection is a cross-cutting error state, not a per-flow one.** The dashboard is a thin client over a hub that may be off, unreachable, or mid-restart. The client already models four connection phases — `apps/dashboard/src/lib/cawco/client.svelte.ts` L70: `export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';` — plus a retry countdown (L303: *"When the next reconnect attempt fires, so the banner can count it down"*) and a manual retry (L1115 `reconnectNow()`). Every flow's **Network failure** edge case and every page spec's **Error** state binds to those four phases and that countdown, not to a generic request failure. The rule that follows from Nielsen's heuristic #1, visibility of system status (Nielsen, "10 Usability Heuristics for User Interface Design," Nielsen Norman Group, 24 April 1994): **an empty surface must assert that the connection is live before it is allowed to claim zero.** A quiet fleet and a dead hub must never render the same.

---

### Flow 1 — Fleet check-in and wind-down

**Type:** Task flow (linear). One primary path; the branch cases belong to Flow 2. Covers the journey's **Fleet check-in** and **Wind-down** phases, which are the same traversal read for opposite answers.

**Entry:** Opening the dashboard at any URL (the root redirects: `routes/+page.server.ts` is `redirect(307, '/session')`), or returning to `session` from any surface via the global-nav **Fleet** entry, or the phone top bar's back link to the fleet (`lib/cawco/Shell.svelte`).

**Goal:** Answer one binary question — *is anything blocked, errored, or unreachable right now?* — without opening a session to trust the answer.

**Steps:**

```
● Open dashboard
  → ▭ session (fleet board): connection band resolves, needs-you count renders
  → ◆ Is the needs-you count > 0?
       ├─ yes → ◎ exit into Flow 2 (Triage)
       └─ no  → ▭ Confirm the count is trustworthy: connection band reads connected,
                    machine roster shows every expected machine online
                → ◆ Is every expected machine online?
                     ├─ no  → ◎ exit into the machine-unreachable recovery (Flow 1 error states)
                     └─ yes → ◎ Wind-down: zero-blocked confirmed
```

**Decision nodes:**
- `◆ Is the needs-you count > 0?` — **(Hick–Hyman 1952/1953)** This branch is staged to exactly one reading, deliberately. Check-in happens under mild time pressure and must resolve in a glance; every additional status category the operator has to weigh here adds decision time. Per-status detail is *staged behind* this branch, not shown alongside it.
- `◆ Is every expected machine online?` — **(Hick–Hyman 1952/1953)** Grouped rather than enumerated: the roster answers "all online" or names the exceptions. The operator never reads N machine rows to compute a boolean.

**Primary CTA:** *Review what needs you* → `session/[id]` for the first blocked session. **(Fitts 1954)** — largest target on the board, in the natural landing path; on a coarse pointer it is the thumb-reachable target rather than a row-level affordance.

**Loading state:** **Tier 3 (1–10s)** — skeleton of the board's real row structure while the socket opens and the first roster frame arrives. Not a spinner. If the socket has not opened by 10s the state escalates to **Tier 4** and becomes the connection band's countdown, which is determinate because the retry time is known (`client.svelte.ts` L303).

**Empty state:** Two distinguishable cases. *First-use* (no machine has ever joined) names the single next action — join a machine — and nothing else. *User-cleared / no-results* (machines online, no sessions running) is the Wind-down success reading and says so; it must be visually distinct from first-use, and both must assert the connection is live before claiming zero.

**Error states:**
- `connecting` — band shows the attempt; board holds its last good rows rather than blanking.
- `disconnected` — band names the state, counts down to the next retry, offers retry now. Every row is marked stale; the needs-you count is suppressed rather than shown as zero.
- `error` — band names the state and offers retry now; same staleness marking.
- Machine online but silent — a single machine unreachable while the hub is fine: that machine's rows mark stale, the rest of the board stays live.

**Success state:** Needs-you count reads zero, connection band reads connected, roster reads all-expected-machines-online. The Wind-down reading is the whole point of the flow and gets a distinct, deliberate treatment — this is the journey's end-point (see `## Journey` §Emotion curve), not an absence of content.

**Edge cases:**
- **Back-navigation:** returning to `session` from any surface restores the board's scroll position and filter, and does not remount the open transcript panes — `routes/session/+layout.svelte` holds one pane per open tab above the route so that "moving between the board and a conversation is a parameter change the router swaps no components for." Browser back from `session` leaves the app; nothing is lost because the board holds no unsaved state.
- **Session expiry:** an agent session that ended while the operator was away does not silently vanish from the board. It ages out through a visibly terminal state first, so Wind-down's "nothing is left stuck" reading is about sessions that *finished*, not sessions that disappeared.
- **Network failure:** covered by the four connection phases above. The load-bearing rule: while `disconnected` or `error`, the board may not render a zero needs-you count, because a false zero is exactly the anxiety force named in `## Job` — *"the replacement looks plausible but still hides or misreports a blocked session."*

---

### Flow 2 — Triage a blocked session

**Type:** User flow (branching). Three outcomes, one of them irreversible.

**Entry:** The needs-you exit of Flow 1; a blocked-session row on the board; the attention queue; a Telegram notification opened on a desktop browser.

**Goal:** Read what a blocked session is actually asking for, and answer it — approve, deny, or redirect — with enough context to know the answer is safe.

**Steps:**

```
● Blocked session identified
  → ▭ session/[id]: transcript scrolled to the last agent turn and the pending request
  → ▭ Read the request: tool, target, and the turn that led to it
  → ◆ Is the request clear enough to answer now?
       ├─ no  → ▭ Expand the request's raw payload (disclosed, not default)
       │        → back to the same decision
       └─ yes → ◆ Answer: approve · deny · redirect
                  ├─ approve  → ▭ Allow (primary) → ◎ session resumes
                  ├─ deny     → ▭ Deny            → ◎ session reports the denial and continues or stops
                  └─ redirect → ▭ Interrupt the run, then send a follow-up instruction
                                → ◎ session resumes on the new instruction
```

**Decision nodes:**
- `◆ Is the request clear enough to answer now?` — *Constraint:* the operator is making one choice here, under time pressure, and the request's full argument payload is high-volume, unbounded in size, and needed in a minority of cases. *Law:* **(Hick–Hyman 1952/1953)** — stage the options at a branch; reference material placed beside a decision competes with it. *Pattern selected:* the payload goes behind a disclosure control, and the branch carries only the summary needed to answer. This is derived from the constraint, and it is what the code already does — `lib/cawco/transcript/Prompt.svelte` renders a `<details><summary>What this touches</summary>` block holding every tool-input field — which is confirmation of the derivation, not its source.
- `◆ Answer: approve · deny · redirect` — **(Hick–Hyman 1952/1953)** Exactly three options at the branch, and **scope-widening is not one of them.** When this was written the code put it there: the permission card of the time rendered `Deny`, `Always allow {rule.short} ({rule.scope})` and `Allow` in one row, with accelerators `N`, `⇧Y` and `Y` — four targets, one of them irreversible, at a branch taken under time pressure. This spec stages widening *behind* the answer: it is reachable from the request's disclosed detail, never from the answer row. The code now does so: `lib/cawco/transcript/Prompt.svelte` renders `Approve` (L379) and `Deny` (L390) as the answer row, and `Always allow {rule.short}` (L410) in its own block below a hairline, after a sentence naming the wider grant.

**Primary CTA:** *Allow* → session resumes. **(Fitts 1954)** — the largest target in the action row, at the trailing edge where the pointer and the thumb both rest.

**Destructive / irreversible separation:** two things are separated from *Allow*, in different ways, and for different reasons. *Deny* is reversible in effect (the operator can answer the next request differently) and sits at the **leading** edge of the row, the full width of the row away from the primary — this is the existing on-disk arrangement and it is kept. *Always allow* is **irreversible for the remainder of the run and beyond its scope**, so distance alone is not enough: it is removed from the answer row entirely and disclosed with the request detail, where reaching it costs a deliberate act. **(Fitts 1954)** — a high-cost target with near-zero travel cost is itself the hazard, which is the reading `## Journey` §Triage already committed to.

**Loading state:** **Tier 3 (1–10s)** for the transcript's own load — skeleton of the message column, sized to the real row rhythm so the layout does not jump when content lands. The *agent's run* after an approval is **Tier 4 (10s+)**: determinate step-and-count progress (tool calls completed / turn in progress), an out-of-band Telegram notification when it next needs a human, and a signposted interrupt available the whole time. No bare spinner appears at either tier.

**Empty state:** A session with no pending request — reached by opening a session that resolved while the operator was navigating to it. The surface says the request was answered and by what, rather than showing an empty action row. This is the *user-cleared* empty type, not first-use.

**Error states:**
- Hub `disconnected` / `error` mid-read: the transcript holds what it has, marks it stale, and disables the answer row rather than letting an approval be composed against a socket that cannot carry it. On disk the failure is thrown as text — `client.svelte.ts` L1081: `throw new Error('Not connected to the hub. Check that it is running, then try again.');` — this spec promotes it into the persistent band so it is visible *before* the operator commits, not after.
- Machine reachable but unresponsive — `client.svelte.ts` L1676 rejects with `` `${label} got no answer in time. The machine may be offline.` ``. Surfaced against that session's rows only.
- Request already answered elsewhere (Telegram, another browser tab, or the harness itself) — the answer row resolves to the answer that won, naming where it came from. This is a routine race in a fleet with a phone bridge, not an error to hide.

**Success state:** The request resolves visibly in place — the chosen answer is confirmed on the card that asked, and the transcript resumes streaming. The operator does not have to re-scan the board to learn whether the answer landed.

**Edge cases:**
- **Back-navigation:** leaving `session/[id]` for the board and returning does not remount the transcript or lose scroll position or a half-typed follow-up (the pane is held in the layout, above the route). A pending request that was answered while away shows its resolved state, not a stale action row.
- **Session expiry:** the agent session ended or was reaped while the operator was reading. The pending request is marked expired and the answer row is replaced by what happened and what remains possible (resume, or start fresh) — never by an answer row that would post into a dead session.
- **Network failure:** the four connection phases above. An answer composed while `connecting` is held and posted on reconnect only if the request is still pending; if it is not, the operator is told the request expired rather than having the answer silently dropped or silently applied to a different request.

---

### Flow 3 — Remote approval on a phone

**Type:** User flow (branching). This is the journey's single peak moment (`## Journey` §Emotion curve) and its constraint is a coarse pointer on a narrow viewport, away from any keyboard.

**Entry:** A Telegram message that a session is blocked. Either the operator answers in Telegram, or opens the mobile web dashboard from it.

**Goal:** Approve or deny responsibly from a phone — with enough of the transcript to know what is being approved, not just a bare command string.

**Steps:**

```
● Telegram notification: session blocked
  → ◆ Is the request answerable from the notification alone?
       ├─ yes → ▭ Answer in Telegram → ◎ session resumes
       └─ no  → ▭ Open the mobile dashboard at session/[id]
                → ▭ Read the last agent turn plus the request, at relaxed density
                → ◆ Answer: approve · deny · defer
                     ├─ approve → ▭ Allow (thumb-reachable primary) → ◎ session resumes
                     ├─ deny    → ▭ Deny → ◎ session reports the denial
                     └─ defer   → ◎ leave it blocked; it stays in the needs-you count
```

**Decision nodes:**
- `◆ Is the request answerable from the notification alone?` — **(Hick–Hyman 1952/1953)** Two options, staged: the notification carries the request and one escalation path, never a menu of fleet actions.
- `◆ Answer: approve · deny · defer` — **(Hick–Hyman 1952/1953)** Three, and *defer* is explicit rather than implied by closing the page, so leaving without answering is a chosen outcome instead of an accident. Scope-widening is **not offered on a coarse pointer at all** — the one input model where a mis-tap is most likely is not the place to reach an irreversible grant.

**Primary CTA:** *Allow* → session resumes. **(Fitts 1954)** — on a coarse pointer it is a full-width target in the thumb arc at the bottom of the viewport, not a small trailing button. The floor is WCAG 2.2 SC 2.5.8 Target Size (Minimum), Level AA — 24×24 CSS pixels (W3C Recommendation, 12 December 2024) — and this pair targets 44×44, which the codebase already treats as the floor for every control on a coarse pointer (`apps/dashboard/src/app.css` `.touch-hit`: *"On a coarse pointer the control's tappable area grows to 44×44 (WCAG 2.5.8)"*).

**Destructive / irreversible separation:** *Deny* and *Allow* sit at opposite ends of the thumb row with a full gap between them, and the gap is not fillable by a third control. *Always allow* is absent on coarse pointer — the adaptation is that it moves to the fine-pointer surface, not that the capability is removed from the product.

**Loading state:** **Tier 3 (1–10s)** for the transcript excerpt — skeleton, on a cold mobile connection where this is the common case. Escalates to **Tier 4 (10s+)** with the connection band's determinate countdown if the socket does not open, because on a phone a stalled open is far more likely than on the desk and must not read as "nothing is blocked."

**Empty state:** The request was answered from Telegram, or by the desk browser, before the phone finished loading. The surface says so and names where the answer came from, rather than presenting an answer row for a decision already made.

**Error states:** The four connection phases, plus one that only exists here: the phone reached the dashboard but the hub is on a tailnet the phone has not joined. That is `error`, and it must say so as a reachability problem with the retry countdown, never as "no sessions need you" — a false all-clear at the journey's peak moment is the single worst failure this design can produce.

**Success state:** The answer is confirmed on the phone, and the fleet's needs-you count decrements everywhere without a manual refresh.

**Edge cases:**
- **Back-navigation:** the phone's back gesture from `session/[id]` returns to the board, not out of the app; a composed-but-unsent answer is discarded with the request still pending rather than posted on the way out.
- **Session expiry:** the notification is older than the session. Opening it lands on a terminal state that says the session ended and what it ended as — an expired notification must never open an answer row.
- **Network failure:** on a phone this is routine, not exceptional. The connection band persists at the top of the viewport across all mobile surfaces, and no answer is ever posted optimistically: an approval is a grant, and an optimistic grant that later fails to land is indistinguishable from one that landed.

---

### Flow 4 — Spawn a session against a project

**Type:** User flow (branching). This flow resolves the structural gap `## IA` assigned to Phase 2.

**The gap, narrowed by evidence, then closed.** `## IA` flagged: *"`project/[id]` currently has no list or creation entry point on disk… there is no specified way to reach or choose a project before a session exists."* Reading the code rather than the route table narrows that claim in one important way, and the narrowing is recorded here rather than quietly designed around.

**What is true:** there is no `/project` list route. `ls -R apps/dashboard/src/routes/project` returns `[id]` and nothing else.

**What is not true:** that a project cannot be chosen before a session exists. It can, in four places, none of them a route:
- **The spawn control already contains a project picker.** (Recorded against the former `lib/cawco/SpawnPanel.svelte`; the new-session dialog, `lib/cawco/spawn/NewSessionDialog.svelte`, has since replaced it, choosing the project through its `ProjectChip.svelte` and the machine and directory through `LocationSection.svelte`.) `SpawnPanel.svelte` L583–588 renders `<label for="spawn-project">Project (optional)</label>` over an input with `placeholder="Search projects…"`, filtering `cawco.projects` by name and directory, with the empty case at L622: `No project by that name — pick a directory below instead.` Choosing one sets the project, machine and directory together. So the *task* in `## Journey` §Steer-or-spawn is already completable.
- `lib/cawco/Sidebar.svelte` L1168 renders `<NewProjectPopover />` in the folders group label. That component states its own job: *"Names a directory so the rail has a folder for it before anything has run there. Every other folder in the rail is grown from live work, which leaves no way at all to add the checkout you have not started yet — this is it."*
- `lib/cawco/JumpPalette.svelte` L27–38 builds a `'Projects'` group with `href: /project/${project.id}`.
- `lib/cawco/SessionTabs.svelte` L490 and `lib/cawco/FolderMenu.svelte` L86 both `goto(/project/${project.id})`.

**So the real gap is discovery, not capability.** Every path above is either inside a control the operator has already decided to open, or behind a keyboard shortcut, or behind a right-click. None is a visible, browsable list of projects, which is what a first-use operator needs and what Nielsen's heuristic #6, recognition rather than recall (1994), asks for.

**Resolution:** the hub's **Projects rail is the project index**, promoted from incidental sidebar chrome to a **named content block of the `session` page spec** — a visible label, every project listed whether or not it has live work, and the creation control beside it. No eighth surface is created: adding a `/project` list route would put a spoke in the sitemap that no journey phase visits, and would contradict the hub-and-spoke structure `## IA` committed to. The spawn control's existing picker is kept as-is; it is the right pattern for choosing a project *while spawning*, and it is not a substitute for being able to see what projects exist.

**Entry:** The Projects rail on `session`; ⌘K → Projects; a session tab or folder context menu; *Start session* on the fleet board or the rail, which opens the new-session dialog (`lib/cawco/spawn/NewSessionDialog.svelte`).

**Goal:** Get a new agent session running against a chosen project, on a chosen machine, with its rules and tool access known *before* it starts.

**Steps:**

```
● Intent to start work
  → ◆ Does the project already exist in the rail?
       ├─ no  → ▭ New project: name it, pick a machine, pick a directory
       │        → ▭ Project appears in the rail
       └─ yes → ▭ Open it (rail row, or ⌘K → Projects)
  → ▭ project/[id]
  → ◆ Start with an instruction, or start empty?
       ├─ instruction → ▭ Write what the session should do
       └─ empty       → ▭ Start empty
  → ▭ Review what will apply: machine, harness, model, permission mode,
        and the rules and tools this session will run under
  → ▭ Start (primary)
  → ◎ session/[id], streaming
```

**Decision nodes:**
- `◆ Does the project already exist in the rail?` — **(Hick–Hyman 1952/1953)** The rail answers this by *recognition* rather than by making the operator recall a path; creation is one staged control beside the list, not a competing top-level choice.
- `◆ Start with an instruction, or start empty?` — *Constraint:* there are two genuinely different starting intents (hand the session a brief, or open one to steer interactively), and five configuration dimensions that apply to both — machine, harness, model, permission mode, effort. Laid out flat that is a seven-way choice for what the operator experiences as one decision. *Law:* **(Hick–Hyman 1952/1953)** — group and stage: keep the branch to the choice actually being made and push the configuration behind it, carrying defaults. *Pattern selected:* a two-way branch, with configuration staged inside the spawn control rather than beside it. Derived from the constraint; the code independently arrives at the same shape (`routes/project/[id]/+page.svelte` L256 prompt field, L267 `Start empty`, L269 `Start`), which corroborates it.

**Primary CTA:** *Start* → `session/[id]`. **(Fitts 1954)** — largest target in the spawn control, at its trailing edge, and on a phone the full-width bottom action of the spawn sheet (the new-session dialog becomes a bottom sheet under 640px).

**Destructive / irreversible separation:** the spawn control carries no destructive action at all. Where a project surface offers one — removing a project from the rail — it sits in the project's own overflow menu, in a different region from *Start*, and never in the spawn control. Starting a session with `bypassPermissions` set is treated as consequential rather than destructive: it is reachable but is not the default and is stated in the review step above, so it cannot be selected without being read.

**Loading state:** **Tier 2 (0.1–1s)** for the rail and the project surface, which read from state already held in the client. Spawning itself is **Tier 3 (1–10s)** — the session row appears immediately in a starting state, and the transcript renders its skeleton; if the harness takes longer than 10s to produce its first turn the state escalates to **Tier 4**, with step progress and the Telegram channel available, because a harness that is slow to start is indistinguishable from one that is stuck.

**Empty state:** *First-use* — no machine has joined, so no project can be created against one. The rail says the prerequisite plainly (join a machine) and offers that action, rather than offering a project-creation control that would fail. When machines exist but no project does, the rail's empty state is the creation control itself.

**Error states:**
- Machine offline at spawn time — named against the machine, with the other machines still selectable rather than the whole control failing.
- Directory does not exist or is not readable on the target machine — reported against the directory field, before the session is created.
- Hub `disconnected` / `error` — the spawn control disables and says why; a spawn is not queued optimistically, because a session the operator believes is running and is not is the same false-confidence failure the Job's anxiety force names.
- `routes/project/[id]/+page.svelte` L214 renders `No such project.` for an unresolvable id — kept, with a path back to the rail.

**Success state:** The session is running, its transcript is streaming, and the rules and tools it is running under are visible on that session without navigating away — which is the opportunity `## Journey` §Steer-or-spawn asked for: *"Surface which rules and tools apply to a session at spawn time, not only after something goes wrong."*

**Edge cases:**
- **Back-navigation:** returning from `session/[id]` to `project/[id]` shows the new session listed under the project. Back out of a half-filled spawn control discards the draft but leaves the project untouched; nothing is created by navigating away.
- **Session expiry:** a session that dies during startup does not linger as "starting". It resolves to a terminal state naming the failure, and the project surface offers a retry rather than a second silent attempt.
- **Network failure:** if the socket drops between pressing *Start* and the first frame, the surface holds the session in an unconfirmed state and reconciles on reconnect — it must resolve to either "running" or "never started", never to an assumed success.

---

### Flow 5 — Author or edit a rule

**Type:** Task flow (linear). One path; the delete branch is an exit, not a step.

**Entry:** Global nav → **Rules**; a template on the Rules empty state; a rule referenced from a session.

**Goal:** Get one standing rule watching every session, or change one that already is.

**Steps:**

```
● Rules
  → ◆ Start from a template, or from scratch?
       ├─ template → ▭ One click seeds a working rule → ◎ live on every session
       └─ scratch  → ▭ rules/[id]
                     → ▭ Name it
                     → ▭ What to watch for
                     → ▭ What cawco sends back
                     → ▭ Where it applies
                     → ▭ Making it stick
                     → ▭ Save (primary)
                     → ◎ Rules, with the rule listed and live
```

**Decision node:**
- `◆ Start from a template, or from scratch?` — *Constraint:* a first-time operator meets a five-section authoring form for a concept — a standing rule — they have not yet formed a mental model of. They cannot fill a form for a thing they cannot yet picture. *Laws:* recognition rather than recall (Nielsen's heuristic #6, 1994) — a concrete worked example is recognisable where an empty form is not; and **(Hick–Hyman 1952/1953)** for the count, since this branch is taken at the moment of least familiarity, where a long list costs the most. *Pattern selected:* a small set of prefilled exemplars as the primary path, the blank form as the secondary, and the set kept short enough that scanning it is cheaper than reading the form. Derived from the constraint; the code reaches the same conclusion and says so — `routes/rules/+page.svelte` L27: *"The empty state is the onboarding: three ready-made rules, one click each."*

**Primary CTA:** *Save* → back to `rules` with the rule live. **(Fitts 1954)** — the largest target in the form's action row, at its trailing edge, in a row that does not scroll away with the form body.

**Destructive / irreversible separation:** *Delete* is separated from *Save* in the editor's action row, at the opposite edge with the cancel control between them. On the list, per-row delete (`routes/rules/+page.svelte` L214–215, `aria-label="Delete {row.name}"` → `onclick={() => remove(row)}`) is not adjacent to any primary — the list's primary is *New rule* in the page header, a different region entirely. Deletion is currently immediate and unrecoverable: `remove()` calls `removeRule(...)` and filters the row out with no confirm and no undo path anywhere in the codebase. Per Nielsen's heuristic #3, user control and freedom (1994), the spec requires an **undo affordance after the fact** rather than a confirm dialog before it — the action stays one gesture, and the recovery is the safety.

**Loading state:** **Tier 2 (0.1–1s)** for the list and the editor, both of which read state the client already holds. Saving is **Tier 2** as well; if a save has not confirmed by 1s it shows progress in place on the button's own region without moving or resizing it, and it never becomes a blocking overlay.

**Empty state:** *First-use* — `routes/rules/+page.svelte` L124 renders `Nothing is watching yet` with three one-click templates (L140–152). This is the strongest empty state on disk and the spec keeps its shape as the model for the other six surfaces.

**Error states:** Load failure is rendered inline (`{#if data.error}`, L117–119) rather than as a toast that can be missed. Save and delete failures currently surface as `toast.error(message(error))`; the spec requires the failing field or row to carry the error too, so a missed toast does not leave the operator believing a rule saved when it did not. Hub `disconnected` / `error` disables save and says why.

**Success state:** The rule is listed and reports that it is live on every session — matching the on-disk confirmation for templates (L82: `toast.success(\`${template.title} is live on every session.\`)`), which is the right claim because it states the *effect*, not the *operation*.

**Edge cases:**
- **Back-navigation:** leaving the editor with unsaved changes warns once and keeps the draft on return. *Cancel* (`goto('/rules')`, L466) discards deliberately, which is a different act from navigating away and is treated as one.
- **Session expiry:** rules outlive agent sessions, so no rule edit depends on one. A rule edited while sessions are running takes effect on the next evaluation and says so, rather than implying it retroactively changed a turn already taken.
- **Network failure:** an unsaved draft survives a socket drop in the editor; save is disabled while `disconnected` or `error` and re-enables on reconnect with the draft intact.

---

### Flow 6 — Cost check

**Type:** Task flow (linear).

**Entry:** Global nav → **Usage**; a cost figure on a session that looks wrong.

**Goal:** Answer *am I about to blow the budget?* as a glance, and only drill in when a number surprises.

**Steps:**

```
● Usage
  → ▭ Read spend against the alert threshold, and the current limit windows
  → ◆ Is anything unexpectedly expensive?
       ├─ no  → ◎ exit; this was a glance
       └─ yes → ▭ Open the session responsible
                → ◎ session/[id] (rejoins Flow 2 if it also needs an answer)
```

**Decision node:**
- `◆ Is anything unexpectedly expensive?` — **(Hick–Hyman 1952/1953)** The threshold is shown alongside the total so the branch is a comparison the surface has already made, not arithmetic the operator performs. This is the opportunity `## Journey` §Cost check asked for: *"Surface the alert threshold, not just the running total, so this stays a glance rather than a calculation."*

**Primary CTA:** *Open the session responsible* → `session/[id]`. **(Fitts 1954)** — the largest target on the surface, attached to the top-spend row. The current implementation has none: `routes/usage/+page.svelte` L145 states `No primary action; this surface is read, not operated.` The spec adds one because the journey's Cost-check phase *does* have an action — drilling into the expensive session — and a surface with a real next step and no target for it makes the operator find that session by hand.

**Destructive / irreversible separation:** the surface carries no destructive action. It must not grow one: killing an expensive run belongs on that session, where its transcript is readable, not next to a number.

**Loading state:** **Tier 3 (1–10s)** — skeleton of the limit-window rows and the spend figure. Upstream limit reads are rate-limited and can be slow, so a skeleton sized to the real rows is what keeps the layout from jumping. Never a spinner. If a read exceeds 10s it takes **Tier 4** treatment: the surface keeps the last good reading, timestamps it as stale, and shows the retry countdown — which the implementation's own comment already argues for (L30–31: *"A stale reading beats an empty room."*)

**Empty state:** *First-use* — no machine has reported usage, rendered on disk as `No limit reading yet.` (L199). The spec requires it to distinguish "no machine has reported" from "reported zero spend", because those are opposite answers to the question the operator came with.

**Error states:** `routes/usage/+page.svelte` L190–196 surfaces upstream strings directly — `'not signed in'`, `'token expired'`, or the raw string. Per Nielsen's heuristic #9, help users recognize, diagnose, and recover from errors (1994), each must carry a recovery action rather than a diagnosis alone. Missing price data has a designed state already (L348: `No published price for …`) and is kept, because it correctly says what is unknown rather than reporting a wrong total. Hub `disconnected` / `error` marks the whole reading stale rather than blanking it.

**Success state:** Spend is below the threshold and the reading is fresh — stated as an answer, not as a table the operator has to interpret.

**Edge cases:**
- **Back-navigation:** returning from a drilled-in session to `usage` re-reads rather than restoring a stale snapshot, since the whole value of the surface is the number being current.
- **Session expiry:** spend from ended sessions still counts toward the window and is labelled as such; a session ending must never make its cost disappear from the total.
- **Network failure:** the last good reading is retained with its age shown and the retry countdown attached — the one case in this document where holding stale data is correct, because a blank budget screen reads as "nothing is running" and that is the false all-clear this design exists to prevent.

---

## Page specs

Seven entries, one per surface in the `## IA` sitemap. Each carries the six fields of the doctrine's page-spec template (Purpose, Entry points, Content blocks, States, Primary CTA, Exit/next), all five named states (Default, Loading, Empty, Error, Success), plus three fields this project requires of every surface: **Density**, **Narrow width**, and **Destructive separation**.

**Sitemap reconciliation.** The `## IA` sitemap lists exactly seven pages — `session`, `session/[id]`, `project/[id]`, `tools`, `rules`, `rules/[id]`, `usage` — and when these specs were written there were exactly seven `+page.svelte` files on disk. There are now 25 (`find apps/dashboard/src/routes -name "+page.svelte" | wc -l` → `25`): the seven specs map onto them as `## IA` §"Sitemap on disk now" lists, the Workflows spoke and Configure's other sections have no spec here, and `/motion/*` are test benches. The mapping is not one-to-one and the difference is accounted for: the root `+page.svelte` renders nothing (`routes/+page.server.ts` is `redirect(307, '/session')`; the file's only content is the comment *"Never rendered: +page.server.ts redirects to the session index"*), and `session/[[id]]` is one route serving two surfaces — `routes/session/+layout.svelte` states this: *"The route under this is `[[id]]`, one route for both URLs, so moving between the board and a conversation is a parameter change the router swaps no components for."* Seven sitemap pages, seven specs.

### Density classes

Two scales, one token language. The plan reserves compact for the transcript and its dependents; that is one surface out of seven.

| Surface | Density | Rationale |
|---------|---------|-----------|
| `session` | `comfortable` | A scan-and-triage board read under time pressure; row pitch has to survive a glance, and the needs-you reading must not depend on close inspection. |
| `session/[id]` | `compact` | The transcript is the one surface where more turns visible at once is directly more context for the approval decision — the product's core, and the only place the second scale earns its cost. |
| `project/[id]` | `comfortable` | Deliberate, unhurried setup work (`## Journey` §Steer-or-spawn), not a dense read; nothing here rewards fitting more on screen. |
| `tools` | `comfortable` | Four independent fleet inventories on one surface; compact would collapse the grouping that keeps them distinguishable. |
| `rules` | `comfortable` | A short, infrequently-visited list whose rows carry a destructive control — density here buys nothing and costs target separation. |
| `rules/[id]` | `comfortable` | A five-section authoring form; forms take the roomier scale so field grouping stays legible. |
| `usage` | `comfortable` | Read as a glance against a threshold; the whole surface fits without compression. |

**Dependents of the transcript inherit compact.** The permission stack and the peek pane are transcript-derived and render at the compact scale wherever they appear, including when they surface on `session`. That inheritance is a property of those components, not a second density class on a surface — each of the seven surfaces above carries exactly one class.

**Compact is a fine-pointer affordance only.** Under `@media (pointer: coarse)` or at narrow widths, the compact scale relaxes: every row and control clears WCAG 2.2 SC 2.5.8 Target Size (Minimum), Level AA — 24×24 CSS pixels (W3C Recommendation, 12 December 2024) — and the approve/deny pair targets 44×44, matching the floor the codebase already gives every control on a coarse pointer (`apps/dashboard/src/app.css` `.touch-hit`, and 44px menu items and nav rows). Text inputs never render below 16px, or iOS zooms the viewport on focus.

---

### 1. `session` — Fleet board (hub)

**Purpose:** Answer "is anything blocked, errored, or unreachable across every machine right now?" in a glance, and be the place every other surface returns to.

**Entry points:** App root (307 redirect from `/`); global nav **Fleet**; the phone top bar's back link to the fleet; a Telegram notification; browser bookmark.

**Content blocks (in order):**
1. **Connection band** — the hub's state (`connecting` · `connected` · `disconnected` · `error`) and, when retrying, the countdown to the next attempt with a retry-now control. Persistent, above everything, on every surface. It is first because every other reading on the page is conditional on it.
2. **Needs-you count** — the single unmistakable number, and the only thing on the surface that has to be readable at a glance. Suppressed, never shown as zero, while the connection is not live.
3. **Attention queue** — the blocked and errored sessions behind that count, one row each, ordered by how long each has been waiting. *Constraint:* triage is a repeated action during a scan, most pending requests are routine, and a round trip to a transcript and back costs the scan its momentum — but a minority of requests genuinely cannot be judged from a row. *Laws:* Fitts (1954) — a frequent primary action belongs at the shortest travel distance from where the operator already is, which here is the row itself; and **(Hick–Hyman 1952/1953)** — the row-level branch must stay narrow, because it is repeated once per row down a list. *Pattern selected:* an inline binary answer on the row, plus one escalation target for anything needing context. That yields `Allow` · `Deny` · `Open`, which is also the on-disk shape (`lib/cawco/AttentionQueue.svelte`). Two constraints the derivation imposes on it: scope-widening is **not** offered here — a row carries too little context to justify an irreversible grant, and *Open* is the path for anything that needs reading first; and a question-shaped request offers no inline answer, only *Open*, because a question cannot be answered by a binary.
4. **Fleet roster** — machines and their state; answers "is every expected machine online" as a grouped reading, not an enumeration.
5. **Running sessions** — live work, by project and machine, with its activity state and cost.
6. **Projects rail** — every project, whether or not it has live work, with the creation control beside its label. **This block closes the structural gap `## IA` assigned to Phase 2** (see Flow 4): it is the project index, and it is specified here rather than left as incidental sidebar chrome.
7. **Jump palette (⌘K)** — the recognition-over-recall twin of the rail and the roster; groups on disk are `['Projects', 'Machines', 'Running sessions', 'Recent sessions']` (`lib/cawco/JumpPalette.svelte` L27).

**States:**
- Default: connection live; needs-you count rendered; roster, sessions and projects listed.
- Loading: **Tier 3 (1–10s)** — skeleton of the real row structure while the socket opens and the first roster frame lands. Escalates to **Tier 4 (10s+)**, becoming the connection band's determinate retry countdown, if the socket has not opened. No spinner at either tier.
- Empty: two distinct readings, each written to the empty-state formula in WORDS.md (benefit + primary action for first-use; acknowledge + next action for user-cleared; and an empty board may only claim zero while the connection band reads connected). *First-use* — no machine has ever joined; states the benefit and the one action that starts the fleet, e.g. **"Nothing is connected yet. Join a machine to see every session in one board."** → **[Show join command]** (offers nothing else, because on a fresh install every surface is empty at once and this is the only one that can start the operator moving). *User-cleared / no-results* — machines online, nothing running; this is the Wind-down reading, written as the reassurance it is rather than a dead end, e.g. **"All clear — N machines online, nothing running."** → **[Start a session]**. The two must be visually and verbally distinct, and the no-results case is never reached when a machine is unreachable (that is the error state, below).
- Error: `connecting` holds the last good rows and marks them stale; `disconnected` and `error` do the same and add the countdown and retry-now, with the needs-you count suppressed. The band follows the error formula: **"Hub unreachable — retrying in 12s."** → **[Reconnect now]**. A single unreachable machine marks only its own rows with the machine-scoped error (**"nixbox stopped answering (timeout). It holds its place — check the machine, then Reconnect."**), leaving the rest of the board live.
- Success: needs-you reads zero, connection reads live, roster reads all-expected-online — stated as the Wind-down answer, not as an absence.

**Primary CTA:** *Review what needs you* → `session/[id]` for the longest-waiting blocked session. **(Fitts 1954)** — largest target on the board, in the natural landing path; on a coarse pointer it is a thumb-arc target rather than a row-level affordance.

**Destructive separation:** none adjacent to the primary. Per-session interrupt and per-machine revoke live in their row's overflow menu, a separate region from the board's primary; neither is ever promoted into the row itself, and neither is reachable in the same gesture as the primary. Within an attention-queue row, *Deny* and *Allow* are separated from each other and *Always allow* is absent entirely (see block 3). No destructive control on this surface is hover-revealed — a control that appears only on hover is unreachable by touch and invisible to a keyboard user until it takes focus.

**Density:** `comfortable`.

**Narrow width:** The projects rail and fleet roster **collapse into a disclosure above the attention queue** — they are reachable in one tap, not removed. The needs-you count and the attention queue keep full width and stay first, because they are the reason the surface exists. The connection band stays pinned. The primary action becomes the full-width control at the bottom of the viewport rather than a target in the board body; ⌘K becomes the top bar's Jump control (`lib/cawco/Shell.svelte`). Nothing is dropped: the rail, roster and running-session detail are all one tap away.

**Exit / next:** `session/[id]` (triage, the dominant exit) · `project/[id]` (spawn) · the three spokes via global nav.

---

### 2. `session/[id]` — Session transcript

**Purpose:** Show what one agent session is doing and what it is waiting on, with enough context to answer a permission request responsibly.

**Entry points:** A row or the primary CTA on `session`; ⌘K → Running sessions / Recent sessions; a Telegram notification; a session tab; `project/[id]` after a spawn.

**Content blocks (in order):**
1. **Connection band** — as on every surface.
2. **Session header** — project, machine, harness, model, permission mode, effort, and the live context reading. What the session is running under, before what it has said.
3. **Transcript** — the turn stream, at the compact scale, scrolled to the last agent turn on arrival.
4. **Pending request card** — the tool, the target, the turn that led to it, and a disclosed raw payload. The answer row carries exactly two buttons (see Destructive separation).
5. **Run progress** — for an active turn: determinate step-and-count, and the interrupt.
6. **Composer** — the follow-up instruction, for steering.

**States:**
- Default: transcript streaming or settled; no pending request; composer ready.
- Loading: **Tier 3 (1–10s)** — skeleton of the message column at the real row rhythm, so nothing jumps when content lands. This **replaces the current treatment**: `SessionPane.svelte` L1892 renders `Reading transcript…` beside a spinner, on a load that is fetched across the hub from another machine and is long enough to need virtualisation — the named mistake for anything that can exceed 5s. If the load passes 10s it escalates to **Tier 4**, becoming a determinate count of turns loaded. The *agent's run* after an approval is **Tier 4 (10s+)** always: determinate step-and-count, a Telegram notification when it next needs a human, and a signposted interrupt throughout. Agent runs are open-ended and routinely cross the 10s boundary, so Tier 4 is the normal case here, not the exception. A bare spinner is prohibited at every tier on this surface.
- Empty: *user-cleared* — the request resolved while the operator was navigating in. Says what the answer was and where it came from (this browser, another tab, Telegram, or the harness), instead of rendering an answer row for a settled decision — e.g. **"Already answered — Denied from Telegram."** A session with no turns yet shows the starting state, not a blank column (**"No turns yet — the session is starting."**), never a bare spinner.
- Error: the four connection phases, with the answer row **disabled** rather than merely warned while not live — the band reads **"Hub unreachable — retrying in 12s."**, with a **[Reconnect now]** control, and the answer row is disabled with the reason stated on the card, e.g. **"Can't post this answer while the hub is unreachable. It will re-enable when reconnected."** (on disk the failure is only thrown at send time, `client.svelte.ts` L1081). Machine-unresponsive is surfaced per session (**"nixbox got no answer in time. It may be offline."**, `client.svelte.ts` L1676). Request-already-answered-elsewhere resolves in place, naming the source.
- Success: the answer is confirmed on the card that asked it, and the transcript resumes streaming — no return to the board to find out whether it landed.

**Primary CTA:** *Allow* → the session resumes. **(Fitts 1954)** — largest target in the answer row, at the trailing edge where pointer and thumb rest.

**Destructive separation:** *Deny* sits at the **leading** edge of the answer row, the full row width from *Allow*, with the gap unfillable by a third control. (On disk `lib/cawco/transcript/Prompt.svelte` draws the pair as *Approve* (L379) then *Deny* (L390), at opposite ends of the row with at least 32px between them.) *Always allow* is **removed from the answer row**: the permission card of the time rendered `Deny`, `Always allow {rule.short} ({rule.scope})` and `Allow` in one row with accelerators `N` / `⇧Y` / `Y`, putting an irreversible scope grant immediately beside the primary and one shift-key away from it. Scope-widening moves into the request's disclosed detail, where reaching it costs a deliberate act; `Prompt.svelte` now keeps `Always allow {rule.short}` (L410) in its own block below the answer row. **(Fitts 1954)** — near-zero travel cost to a high-cost target is itself the hazard. *Interrupt* likewise sits with the run-progress block, not in the answer row.

**Density:** `compact` — the one surface where more turns visible at once is directly more context for the decision being made.

**Narrow width:** The session header **collapses to a single summary line** with the rest behind a disclosure; the composer docks at the bottom of the viewport, above the home-indicator safe area. The transcript keeps full width and **relaxes out of compact**: rows and controls clear 24×24 CSS px (WCAG 2.2 SC 2.5.8, AA) and the answer pair targets 44×44; the composer's text input never renders below 16px. The primary action becomes a full-width *Allow* in the thumb arc with *Deny* at the opposite end of the same row. *Always allow* is **not offered on a coarse pointer** — it is adapted to the fine-pointer surface, not removed from the product. Run progress collapses to a one-line determinate reading; the interrupt stays reachable in the stable chrome, never below a scrolling transcript.

**Exit / next:** `session` (back to the board) · another session tab · `project/[id]` via the session's project.

---

### 3. `project/[id]` — Project detail

**Purpose:** Start and steer work against one checkout — choosing the machine, the instruction, and what the session will run under, before it starts.

**Entry points:** The **Projects rail** on `session` (the project index — see Flow 4); ⌘K → Projects (`JumpPalette.svelte` L30–38); a session tab's context menu (`SessionTabs.svelte` L490); a folder context menu (`FolderMenu.svelte` L86). There is deliberately **no `/project` list route**: adding one would put a spoke in the sitemap that no journey phase visits and would contradict the hub-and-spoke structure `## IA` committed to.

**Content blocks (in order):**
1. **Connection band.**
2. **Project header** — name, machine, directory.
3. **Spawn control** — the instruction field (`placeholder="What should this session do?"`, L256), *Start empty* (L267), *Start* (L269), with machine, harness, model, permission mode and effort staged inside it rather than laid out beside the branch.
4. **What will apply** — the rules and tool access this session will run under. Surfaced here at spawn time, which is the opportunity `## Journey` §Steer-or-spawn asked for.
5. **Sessions on this project** — live and recent.
6. **Project documents** — the checkout's agent-facing docs, editable in place.

**States:**
- Default: project resolved; spawn control ready; sessions listed.
- Loading: **Tier 2 (0.1–1s)** for the surface, which reads state the client already holds — subtle, no blocking indicator. Spawning is **Tier 3 (1–10s)**: the session row appears immediately in a starting state and the transcript renders its skeleton; it escalates to **Tier 4 (10s+)** with step progress and the Telegram channel if the harness has not produced a first turn, because a slow start and a stuck start are indistinguishable without a determinate reading. No spinner at any tier.
- Empty: *first-use* — no machine has joined, so the surface states the prerequisite rather than offering a spawn control that would fail: **"No machine is connected yet. Join a machine first, then start a session here."** With machines but no sessions yet, the empty state is the spawn control itself (**"No sessions on this project yet. Start one to see its transcript here."** → **[Start session]**).
- Error: `No such project.` for an unresolvable id (L214) — written to the error formula: **"No such project. It may have been removed. Back to the fleet rail to pick another."**. Machine-offline is named against the machine with the others still selectable (**"nixbox is offline. Pick another machine below."**). A missing or unreadable directory is reported against the directory field before anything is created (**"That directory can't be read on nixbox. Check the path and try again."**). Document read/write failures are already modelled separately on disk (`docsError`, `docError`, `claudeError`) and stay attached to their own block rather than failing the surface. Hub `disconnected` / `error` disables spawning and says why (**"No spawn while the hub is unreachable. Reconnect to continue."**) — spawns are never queued optimistically.
- Success: the session is running, its transcript is streaming, and what it runs under is visible on it without navigating away.

**Primary CTA:** *Start* → `session/[id]`. **(Fitts 1954)** — largest target in the spawn control, at its trailing edge; on a coarse pointer the full-width bottom action of the spawn sheet.

**Destructive separation:** the spawn control carries no destructive action. `Forget project…` lives in the project header, opens a confirm dialog (`Forget {project.name}?`, with `Cancel` and `Forget`) and states what it does and does not delete — *"The grouping is removed. The checkout and its sessions stay on disk."* That is the correct treatment and it is kept: this is one of the few actions in the product where a confirm beats an undo, because the operator's fear is about the checkout and the dialog is what answers it. It stays in the header, never in the spawn control or beside *Start*. Selecting `bypassPermissions` (labelled `Bypass all` — *"Every tool runs unprompted"*) is consequential rather than destructive: it is not the default, and it is stated in the "what will apply" block so it cannot be chosen without being read.

**Density:** `comfortable`.

**Narrow width:** The spawn control becomes a **bottom sheet** — thumb-reachable, and the pattern the codebase already uses (`lib/cawco/spawn/NewSessionDialog.svelte` becomes a vaul bottom sheet under 640px). "What will apply" and project documents **collapse into disclosures** below the session list; both stay one tap away. The session list keeps full width. The primary action is the sheet's full-width *Start* at the bottom of the viewport. The instruction field never renders below 16px.

**Exit / next:** `session/[id]` (the spawned session) · `session` (back to the board) · `rules/[id]` from the "what will apply" block.

---

### 4. `tools` — Fleet tool inventory

**Purpose:** Show what capability every machine in the fleet actually has — MCP servers, skills, agents, and shared memory — so the operator knows what a session can reach before granting it anything.

**Entry points:** Global nav **Tools**; a tool named in a permission request on `session/[id]`; the "what will apply" block on `project/[id]`.

**Content blocks (in order):**
1. **Connection band.**
2. **Page title and fleet status line** — one reading of how many machines have reported. The surface today passes error props independently into each tab panel (`data.toolsError` to the tools matrix, `data.fleetError` to the other four), so a fleet-wide read failure is only discoverable by opening the tab it broke.
3. **Inventory selector** — *Constraint:* five inventories share this surface; each is per-machine and long; the operator arrives already knowing which one they came for; and no journey phase requires comparing two of them side by side. *Laws:* progressive disclosure and cognitive load — reveal complexity only as needed, and do not make the operator scroll past four inventories to reach the fifth; **(Hick–Hyman 1952/1953)** — group and stage, so the arrival choice is five labels rather than five bodies. *Pattern selected:* one panel visible at a time behind a labelled selector, and — because the operator arrives with a destination in mind and will link to and return to it — that selection must be addressable rather than transient. Tabs held in the URL satisfy both; an accordion would satisfy the disclosure requirement but not the addressability one, and a single stacked scroll satisfies neither. The code independently lands on exactly this: `routes/tools/+page.svelte` renders `TAB_LIST` into `Tabs.List` in the order `Tools` · `MCP servers` · `Skills & plugins` · `Agents` · `Memory`, held as `?tab=`, with `switchTab` using `goto(..., { noScroll: true, replaceState: true })` so switching costs no refetch.
4. **Active tab panel** — one inventory at a time, each with its own per-machine rows.

**States:**
- Default: every machine reported; the active tab's inventory listed.
- Loading: **Tier 3 (1–10s)** — skeleton inside the active panel, sized to its real rows. Inventories are gathered from every machine, so partial arrival is normal: a machine still reporting shows its own skeleton row rather than blocking the panel. On disk this is already gated by a `settling` flag (a 600ms post-mount latch) that decides skeleton-versus-empty; the spec keeps that mechanism and extends it to **Tier 4 (10s+)** for a machine that still has not reported, naming that machine and attaching the retry countdown. No spinner at either tier.
- Empty: *first-use* — no machine has joined, so there is no inventory to have. Because the tabs mean only one panel is visible, the prerequisite must be stated **above the tab strip**, not inside whichever panel happens to be open — otherwise a fresh operator sees an empty inventory and reads it as "this fleet has no tools" rather than "no machine has joined": **"No machine is connected yet — nothing to list. Join a machine to see its tools."** *No-results* — machines online but a given inventory genuinely empty — is stated inside its panel as a fact about the fleet, not as an error (**"No MCP servers reported on any machine yet. Add one on the machine, then it appears here."**).
- Error: per-machine failures are attributed to their machine and leave the rest of the inventory readable. Hub `disconnected` / `error` marks the whole inventory stale with the countdown, and keeps the last good reading rather than blanking — a blank tool inventory reads as "this machine has no tools", which is a different and wrong claim.
- Success: the inventory is complete and fresh, stated as a reading ("all N machines reported") rather than implied by the absence of an error.

**Primary CTA:** the active tab's own add-action — *Add server* on MCP servers, *Fetch skill* on Skills & plugins, *New agent* on Agents, *Install* on Tools. **(Fitts 1954)** — largest target in the active panel's action row, at the top of the panel in the natural landing path after a tab switch. One primary per panel, never five competing in the page header, because only one panel is ever visible.

**Destructive separation:** removing a server, skill, or agent lives in that row's overflow menu, in the panel body — a different region from the panel's add-action, and never adjacent to it. Destructive controls are not hover-revealed: a control that only appears on hover is unreachable by touch and invisible to a keyboard user until it takes focus, so it is either always present in the overflow menu or not offered.

**Density:** `comfortable`.

**Narrow width:** The tab strip is already the staging that a narrow viewport needs, so it is kept rather than converted **(Hick–Hyman 1952/1953)** — five labels reflow to a horizontally scrollable strip with the next tab peeking past the edge, so it is visible that more tabs exist. Per-machine detail inside a panel collapses behind its machine row. The primary moves from the page header into the active panel's own action row so it stays in the thumb arc, and each panel's action is the one that belongs to it (add a server, fetch a skill, push agents). Every tab remains reachable; none is dropped.

**Exit / next:** `session/[id]` (a session using a named tool) · `rules` (a rule governing a tool) · `session` (back to the board).

---

### 5. `rules` — Rules list

**Purpose:** Show every standing rule watching the fleet, and be the fastest path to a first one.

**Entry points:** Global nav **Rules**; a rule that fired, from a session; the "what will apply" block on `project/[id]`.

**Content blocks (in order):**
1. **Connection band.**
2. **Page header** — title and *New rule*.
3. **Rule list** — one row per rule with what it watches, where it applies, and how often it has fired.
4. **Templates** — shown as the empty state's body, and available afterwards as a staged control.

**States:**
- Default: rules listed with their fire counts.
- Loading: **Tier 2 (0.1–1s)** — subtle only; the list reads state the client already holds and does not warrant a skeleton. No spinner.
- Empty: *first-use* — the strongest empty state on disk and the model for the other six: **"Nothing is watching yet"** (L124) with three one-click templates (L140–152) — which is the WORDS.md first-use formula (benefit + primary action) exactly, and the file's own comment calls it the onboarding (L27: *"The empty state is the onboarding: three ready-made rules, one click each."*). Three, not a catalogue: this is the branch where a longer list would cost the most **(Hick–Hyman 1952/1953)**. *User-cleared* — every rule deleted — offers the templates again (**"Nothing is watching right now. Seed a rule below."**), never reverting to the first-use copy, which would misdescribe what happened.
- Error: load failure renders inline (`{#if data.error}`, L117–119) rather than as a dismissable toast. Save and delete failures must mark the failing row as well as raising a toast, so a missed toast never leaves a deleted-looking row that still exists. Hub `disconnected` / `error` disables *New rule* and per-row delete and says why.
- Success: a new or seeded rule appears in the list and states its effect — the on-disk confirmation is the right shape because it claims the effect and not the operation (L82: `` `${template.title} is live on every session.` ``).

**Primary CTA:** *New rule* → `rules/[id]`. **(Fitts 1954)** — largest target in the page header, in the natural landing path.

**Destructive separation:** per-row *Delete* (L214–215, `aria-label="Delete {row.name}"` → `onclick={() => remove(row)}`) sits in the row body, a different region from the header primary; it is never adjacent to *New rule* and never adjacent to a row's own navigation target. Deletion is currently immediate and unrecoverable — `remove()` calls `removeRule(...)` and filters the row out, with no confirm and no undo anywhere in the codebase. Per Nielsen's heuristic #3, user control and freedom (1994), this spec requires an **undo affordance after the act** rather than a confirm dialog before it: the gesture stays one step, and the recovery is what makes it safe.

**Density:** `comfortable` — a short, infrequently-visited list whose rows carry a destructive control; compressing it would buy nothing and cost target separation.

**Narrow width:** Rows **reflow from a single line to two** — name and scope on the first, fire count and age on the second — rather than truncating the scope, which is the part that says what a rule actually governs. Per-row *Delete* moves into a row overflow menu so it cannot be mis-tapped beside the row's own tap target, and every target clears 24×24 CSS px (WCAG 2.2 SC 2.5.8, AA). The primary becomes a full-width *New rule* in the thumb arc. Templates stay inline in the empty state, where they are the whole point of the screen.

**Exit / next:** `rules/[id]` (author or edit) · `session/[id]` (a session a rule fired on) · `session` (back to the board).

---

### 6. `rules/[id]` — Rule detail

**Purpose:** Author or change one standing rule — what it watches for, what cawco sends back, where it applies, and how it persists.

**Entry points:** *New rule* on `rules`; a rule row on `rules`; a rule named on a session or in the "what will apply" block on `project/[id]`.

**Content blocks (in order):**
1. **Connection band.**
2. **Name** — an inline title field (`placeholder="Name this rule"`, L163).
3. **What to watch for** (L194).
4. **What cawco sends back** (L286).
5. **Where it applies** (L343).
6. **Making it stick** (L416).
7. **Action row** — *Delete*, *Cancel*, *Save*, in that spatial order.

**States:**
- Default: the form, populated for an existing rule or empty for a new one.
- Loading: **Tier 2 (0.1–1s)** — subtle only, for both the initial read and the save. If a save has not confirmed by 1s, progress shows in place on the button's own region without moving or resizing it; it never becomes a blocking overlay, and never a spinner.
- Empty: *first-use* — a brand-new rule, which is an empty form rather than an empty screen. Each section states what it is for (**Name it**, **What to watch for**, **What cawco sends back**, **Where it applies**, **Making it stick**), so the form is self-describing without a tour; the five sections are the chunking that keeps a long form legible. Fields carry persistent labels, never placeholder-only (Rules: **Name**, **What to watch for**, **What cawco sends back**, **Where it applies**, **Making it stick**). Validation failures are plain-language ("**Name this rule** fields can't be left blank — give it a name first."), marked at the failing field.
- Error: load failure renders inline (`{#if data.error}`, L151–153). Validation failures mark the failing field and move focus to the first one, rather than only raising a toast. Save and delete failures attach to the action row. Hub `disconnected` / `error` disables *Save* and *Delete* and says why.
- Success: the rule saves and the operator returns to `rules` with it listed and live.

**Primary CTA:** *Save* → `rules`, with the rule live. **(Fitts 1954)** — largest target in the action row, at its trailing edge, in a row that does not scroll away with the form body.

**Destructive separation:** *Delete* (L451–457) sits at the **leading** edge of the action row with *Cancel* (L466, `goto('/rules')`) between it and *Save* (L469) — two separations, spatial and interposed. *Delete* is never rendered inside a form section, and never gains a keyboard accelerator that neighbours the save accelerator.

**Density:** `comfortable` — an authoring form; the roomier scale is what keeps five sections of field grouping legible.

**Narrow width:** The five sections become **an accordion, one open at a time**, which is the same chunking the desktop layout expresses as sections **(Hick–Hyman 1952/1953)**. The action row becomes **sticky chrome at the bottom of the viewport with safe-area padding**, so *Save* is never parked below a scrolling form where the keyboard can clip it. *Delete* leaves the sticky row and moves into a header overflow menu — adapted, not removed — so the thumb arc holds only *Cancel* and *Save*. Text inputs never render below 16px.

**Exit / next:** `rules` (after save or cancel) · `session/[id]` (a session the rule governs).

---

### 7. `usage` — Spend and limits

**Purpose:** Answer "am I about to blow the budget?" as a glance against a threshold, not as a calculation.

**Entry points:** Global nav **Usage**; a cost figure on a session that looks wrong.

**Content blocks (in order):**
1. **Connection band.**
2. **Spend against threshold** — the total *and* the alert threshold together, so the comparison is already made. This is the opportunity `## Journey` §Cost check asked for.
3. **Limit windows** — the current rate-limit reading per window, with its age.
4. **Spend by session** — ordered by cost, with the top-spend row carrying the drill-in.
5. **Unpriced models** — what the total cannot account for.

**States:**
- Default: fresh reading, spend below threshold, windows listed.
- Loading: **Tier 3 (1–10s)** — skeleton of the window rows and the spend figure, sized to the real rows so the layout does not jump. Upstream limit reads are rate-limited and can be slow. Escalates to **Tier 4 (10s+)**: the last good reading is kept, timestamped as stale, with the retry countdown — the behaviour the implementation already argues for (L30–31: *"A stale reading beats an empty room: backoff keeps the last good windows with the error attached, and old numbers outrank 'HTTP 429'."*) No spinner at either tier.
- Empty: *first-use* — no machine has reported usage, rendered on disk as `No limit reading yet.` (L199) and written to the first-use formula: **"No limit reading yet. Connect a machine to see spend here."** This must read differently from "reported, and spend is zero" (**"No spend today."**) — they are opposite answers to the question the operator arrived with, and conflating them is a false all-clear.
- Error: on disk, upstream strings are surfaced directly as user-facing text — `'not signed in'`, `'token expired'`, or the raw string (L190–196). Per Nielsen's heuristic #9, help users recognize, diagnose, and recover from errors (1994), each must carry its recovery action, not just its diagnosis: **"This machine isn't signed in, so there's no limit to read. Sign in on nixbox to restore this reading."** and **"The Claude login on nixbox expired. Sign in there to restore this reading."** — each with a recovery control attached to the reading it invalidates. Map any raw upstream fallback to a plain-language sentence with the raw string available on demand, never as the message itself. Missing price data has a correct designed state already (L348: **"No published price for `{model}` yet — the total can't account for it."**) and is kept, because saying what is unknown beats reporting a confidently wrong total. Hub `disconnected` / `error` marks the whole reading stale with the countdown and retains it rather than blanking — a blank budget screen reads as "nothing is running", which is the false all-clear this design exists to prevent.
- Success: spend is below threshold and the reading is fresh, stated as an answer rather than as a table to interpret.

**Primary CTA:** *Open the top-spend session* → `session/[id]`. **(Fitts 1954)** — the largest target on the surface, attached to the top-spend row. The current implementation deliberately has none (L145: `No primary action; this surface is read, not operated.`) — but the Cost-check journey phase *does* have an action, drilling into the session that surprised the operator, and leaving it untargeted makes them find that session by hand.

**Destructive separation:** none on this surface, and none may be added. Killing an expensive run belongs on that session, where its transcript is readable — an interrupt placed next to a number is an interrupt taken without reading what it interrupts.

**Density:** `comfortable`.

**Narrow width:** Spend-against-threshold and the limit windows keep full width and stay first — they are the glance. The by-session table **reflows from columns to stacked rows** (session, then cost and age on a second line) rather than scrolling horizontally, and unpriced models **collapse into a disclosure**. The primary becomes a full-width *Open the top-spend session* in the thumb arc. Nothing is dropped; the per-session detail is one tap away.

**Exit / next:** `session/[id]` (the expensive session) · `session` (back to the board).

---

## Heuristic findings

**This is a heuristic evaluation of the dashboard on disk, and it is a complement to user testing, not a substitute for it.** The method finds *likely* problems, not their real-world frequency; severity ratings from a single evaluator are unreliable — Nielsen's own guidance is that *"severity ratings from a single evaluator are too unreliable to be trusted"* and recommends the mean of three (Nielsen, "Severity Ratings for Usability Problems," Nielsen Norman Group, 1 November 1994). This table has **one** evaluator and no user testing behind it, so every rating below is a single-evaluator estimate and should be treated as a prompt to test, not as a measurement. That constraint is structural here, not an oversight: `## IA` §Validation already records that this is a single-operator tool with no second person available to run any method against.

**Scale** (Nielsen 1994, verbatim): `0` = I don't agree that this is a usability problem at all · `1` = Cosmetic problem only · `2` = Minor usability problem · `3` = Major usability problem · `4` = Usability catastrophe. Severity is a combination of frequency, impact and persistence — a combination the rater forms, not a product they compute. Heuristics cited as **N** are Nielsen's ten (Nielsen, "10 Usability Heuristics for User Interface Design," Nielsen Norman Group, 24 April 1994).

| Severity | Heuristic / law | Problem | Fix |
|---|---|---|---|
| 4 | N#5 Error prevention (1994); Fitts (1954) | (Resolved since: `lib/cawco/transcript/Prompt.svelte` replaced the permission card recorded here and keeps *Always allow* in its own block below the answer row.) The permission card put the irreversible `Always allow {rule.short} ({rule.scope})` (L140) immediately beside the primary `Allow` (L167) in one action row, with accelerators `⇧Y` and `Y` — a blanket scope grant is one mis-click or one held shift key from an approve, at the moment of the journey's highest time pressure. | Remove scope-widening from the answer row entirely; disclose it with the request detail so reaching it costs a deliberate act. Answer row holds exactly *Deny* and *Allow*, at opposite edges. Not offered at all on a coarse pointer. |
| 3 | N#1 Visibility of system status (1994) | **On a cold load with the hub down, the connection state is present but weak, and it is outweighed by a confident empty state beside it.** `Shell.svelte` L259 renders `Hub connection lost — retrying in {countdown}s` with a `Reconnect now` button, but L139 gates it on `wasConnected`, set only after a successful open (L136) — so on a browser that loads while the hub is already down, the banner does not fire. What does render is `FleetBoard.svelte` L305–307: `{#if cawco.status !== 'connected'}<span class="text-caption">hub {cawco.status}</span>`. So the state **is** stated — as caption-sized text beside the `Fleet` heading, with no countdown and no retry — while the body of the same surface shows the full onboarding card `No machines yet` (L503–513). The operator is told "hub disconnected" quietly and "your fleet is empty" loudly, and the loud one is wrong. Not silent failure; a hierarchy inversion. | Drop the `wasConnected` latch for the `disconnected` and `error` phases so the banner — which already carries the countdown and `Reconnect now` — fires from first paint. Keep the `hub {status}` caption. Hard rule: while the connection has never been live, no surface may render a zero needs-you count or a first-use empty state, because both assert a fact about the fleet that has not been established. |
| 3 | WCAG 2.2 SC 2.5.8 Target Size (Minimum), Level AA (W3C Rec., 12 Dec 2024) | The transcript runs the compact scale, and Remote approval — the journey's single peak moment — happens on that surface on a coarse pointer. Compact rows and a small trailing *Allow* can fall below the 24×24 CSS px minimum exactly where a mis-tap grants a permission. | Compact relaxes under `pointer: coarse` and at narrow widths: every row and control clears 24×24, the approve/deny pair targets 44×44, and text inputs stay ≥16px. The codebase already sets this floor for every control on a coarse pointer (`apps/dashboard/src/app.css` `.touch-hit`). |
| 3 | N#3 User control and freedom (1994) | `routes/rules/+page.svelte` deletes a rule immediately from a per-row icon button (L214–215) with no confirmation and no recovery — `grep -rn "undo\|Undo" lib/cawco/ routes/` returns no undo path for this action anywhere in the dashboard. | An undo affordance after the act rather than a confirm before it: the gesture stays one step and the recovery is what makes it safe. On narrow widths the control also moves into a row overflow menu so it is not mis-tapped beside the row's own target. |
| 2 | N#1 Visibility of system status (1994); Nielsen 1993 / Miller 1968 | Recorded and mostly rejected: **determinate board-level progress and a board-level interrupt both already exist.** `LiveSessionRow.svelte` L116–118 renders `<TaskRing done={progress.done} total={progress.total} size="sm" />` beside a literal `{progress.done}/{progress.total}`, and `FleetBoard.svelte` L437 renders that row for every live session; `LiveSessionMenu.svelte` L66–67 carries `<IconStop /> Stop`. Both are the Tier-4 treatment, already built. The residual gap is narrow but real and sits exactly where Tier 4 bites: progress is conditional on the session having a plan — L44, `const progress = $derived(plan && plan.tasks.length > 0 ? taskProgress(plan) : null)` — and `TaskRing` itself draws nothing when `total === 0` (*"Nothing planned draws nothing"*). An open-ended run with no task plan is the common case for an agent that has been going for minutes, and it is the one that gets **no determinate reading at all**. | Keep the ring, the count and the Stop control. Give a plan-less run a determinate reading of what *is* countable — turns taken, or tool calls completed in the current turn — so that "running for 4 minutes" is never rendered as an indistinguishable state word. Bind the Telegram bridge to the same threshold as the out-of-band half of Tier 4. |
| 2 | N#6 Recognition rather than recall (1994) | There is no browsable list of projects. There is no `/project` list route (`ls -R apps/dashboard/src/routes/project` → `[id]` only), and every path to a project is behind a control the operator must already have decided to open: the spawn control's picker (`SpawnPanel.svelte` L583–588, `placeholder="Search projects…"`), the sidebar rail, ⌘K, or a right-click. Recorded honestly: the *capability* is present — the spawn picker means "start a session against a project" is completable today. What is missing is the *visible index* a first-use operator needs to know which projects exist. | Promote the Projects rail from incidental chrome to a named content block of the `session` spec, with a visible label, every project listed whether or not it has live work, and the creation control beside it. Keep the spawn picker unchanged — it is the right pattern for choosing while spawning. No new route. |
| 2 | N#9 Help users recognize, diagnose, recover from errors (1994) | `routes/usage/+page.svelte` L190–196 maps two known upstream errors to plain language — `'not signed in'` → *"This machine is not signed in to Claude, so there is no limit to read."*, `'token expired'` → *"The Claude login on this machine has expired…"* — which is correct and stays. Two defects remain: the fallback branch renders `{readingError}`, whatever raw upstream string arrived, straight to the operator; and **none of the three carries an action**, only a diagnosis. The expired-token case even names the fix in prose (*"signing in there restores this reading"*) without offering it. | Keep the two plain-language messages; give each a recovery control attached to the reading it invalidates. Map the fallback to a generic plain-language sentence with the raw string available on demand, never as the message itself. |
| 2 | N#1 Visibility of system status (1994) | **A bare spinner on a load that routinely exceeds 5s.** `SessionPane.svelte` L1892 renders `Reading transcript…` beside a spinner while a session's transcript loads. Transcripts are long enough to need virtualisation (`virtua`, `bufferSize={400}`) and are fetched across the hub from another machine, so this is exactly the case Nielsen 1993 rules out an indeterminate indicator for. The fleet board is the opposite failure: it has no loading treatment at all and renders straight off the socket store, so a slow first frame is indistinguishable from an empty fleet. | Transcript load takes Tier 3 — a skeleton at the real message rhythm — escalating to Tier 4 with a determinate count of turns loaded if it passes 10s. The board takes Tier 3 skeleton rows. Neither takes a spinner. |
| 1 | N#8 Aesthetic and minimalist design (1994) | Recorded and largely rejected: **empty states are among the strongest work in this codebase, not a gap.** An earlier draft of this table claimed only `rules` had a designed first-use state; that is false. `FleetBoard.svelte` L503–513 is a full onboarding card — `No machines yet`, an explanation, and the literal join command `CAWCO_HUB_URL=ws://<this-host>:3456/ws bun run agent` — and L514–520 is a separate user-cleared state (`{n} machines online, no sessions running.` plus a spawn button), with the no-results case at L498–502 deliberately drawing nothing because the filter chips above already report the zero. `rules` L124–152, `usage` L199, and every tools panel (`ToolMatrix` L149/L164, `FleetMcp` L115, `FleetSkills` L142/L225/L313, `FleetAgents` L144/L216, `FleetMemory` L337/L403) all carry designed copy. The residual defect is only repetition **within** one panel: `FleetSkills` states the same machine prerequisite twice (L207, L349) alongside three separate "nothing yet" messages, so a first-use operator in one tab reads five statements of emptiness where one prerequisite explains all of them. | Keep every empty state. Within a panel, hoist the shared prerequisite to the panel head and let the per-block copy describe only what is specific to that block. |
| 1 | N#8 Aesthetic and minimalist design (1994) | `routes/tools/+page.svelte` carries five inventories on one surface. Recorded and largely rejected: they are **tabbed, not stacked** (`Tabs.Root` over `TAB_LIST` = `Tools` · `MCP servers` · `Skills & plugins` · `Agents` · `Memory`, held in `?tab=`), which is the correct progressive-disclosure pattern and is kept. The residual defect is smaller: each panel takes its own error prop (`data.toolsError` to one, `data.fleetError` to the other four), so a fleet-wide read failure is only discoverable by opening the tab it broke. | Keep the tabs. Add one fleet status line above the tab strip so a fleet-wide failure is visible without hunting through five panels. |
| 1 | N#4 Consistency and standards (1994) | `usage` renders its page title at a different level from every sibling: `<h1 class="text-title">Usage</h1>` (L156) against `text-display` on `rules` (L96), `tools` (L88) and `project/[id]` (L221). | One page-title level across all seven surfaces. Cosmetic, but it is the kind of drift that makes a surface feel like it belongs to a different product. |
| 0 | N#7 Flexibility and efficiency of use (1994) | Keyboard accelerators exist for the approve/deny path (`Y` / `N` / `D` / `⇧Y`) and for navigation (⌘K), and are documented in `ShortcutSheet.svelte` rather than surfaced on the controls themselves. Recorded and rejected: this is the correct shape — accelerators are *"hidden from novice users"* by design (Nielsen 1994, heuristic #7), and the permission card already renders its own `<kbd>` hints inline. | No change. Included to exercise the bottom of the scale rather than to imply everything found was a defect. |

**Not in scope for this table:** anything visual. Contrast, colour, type, spacing and token treatment belong to Phases 3–6, and microcopy wording to Phase 7; findings above name *structure and state*, and where they quote on-disk copy it is as evidence of a structural claim, not as a wording judgement.

---

## Assistant

*Phase 9a (Discover) decided whether the fleet assistant panel has a job this product needs, applying a kill test to every proposed and shipped capability. Phase 9b designs the panel **only** around the surviving job below; DW-9b keeps the measured visual shell (380×899, inset 24/40, scrim `rgba(0,0,0,.06)`, suggestion pitch 44, radius 16, header 47 — `mocks/v3-assistant.html`) as law regardless of what the rows say.*

**Job story:** When an agent session is stalled or a run's spend surprises me and I suspect the cause spans more than one session, machine, or project — and no single agent in CawCo can see across the fleet, because every one is bound to one repo, one machine, one task — I want to ask one surface a question no individual session's transcript can answer, so I can find the fleet-level cause and act on it without opening every session to assemble it by hand.

**Scope test (the assistant's only defensible territory):** every agent in CawCo is bound to ONE session and cannot see outside it. The assistant's legitimate job is the class of question no single session can answer — fleet-spanning reasoning and lookups. Any question a session's own transcript answers is, by definition, answerable more directly and more truthfully by opening that session, and the assistant must not answer it.

**Kill test (DW-9a.2) — every proposed capability classified:**

| Capability | Source | Kill test | Verdict |
|---|---|---|---|
| "What needs me right now?" | mock suggestion (`v3-assistant.html`, `v5-agent.html`) | **Answerable in transcript/surface** — the fleet board's needs-you count and attention queue already answer exactly this, at a glance, as Flow 1 and the `session` page spec require; asking another AI to restate the board adds a surface and subtracts trust. | **CUT** |
| "Why did spend jump today?" | mock suggestion | **Not answerable by opening one session.** The `usage` and `session/[id]` surfaces show the amount per session and the total against a threshold, but the *cause* — which correlated events across which machines and sessions produced the spike — is a fleet-spanning synthesis no single transcript holds. | **KEEP** (as a cross-session question) |
| "Start a session" | mock suggestion | **Neither cross-session nor a question** — it is an action that already has one correct home: the project surface's spawn control (Flow 4, `project/[id]` spec). A second entry point for an action with an existing surface duplicates it. | **CUT** |
| "Which sessions are stuck, and why, as a pattern" | plan examples (§Phase 9a constraints) | The bare "which are stuck" is the board's job; the "why, and are several stuck for the same reason" is a **pattern across transcripts** no session and no board row holds. | **KEEP** (the "why" half; the "which" half belongs to the board) |
| "What did the delegate on another machine conclude?" | plan examples | A delegate's conclusion lives in **another** session's transcript; the current session cannot see it. Pure cross-session. | **KEEP** |
| "Which sessions touched a given file?" | plan examples | A cross-fleet index over many sessions. No session can answer it. | **KEEP** |
| Restate any turn, request, or decision already shown in an open transcript | derived from the kill test's own rule | The transcript already shows it. | **CUT** |

**Cut list (DW-9a.2, explicit):** *"What needs me right now?"* (restates the board), *"Start a session"* (duplicates the project spawn control), and the entire class of any question whose answer is a transcript the operator can open. These are retired from the assistant's mandate, not merely deprioritised: a panel that restates the board or a transcript is worse than no panel.

**Kill test rule, recorded as policy:** a question is CUT if it can be answered by reading an **open transcript, or an existing fleet surface the operator is already looking at** (the board, `usage`, the current `session/[id]`). The delegate-conclusion and file-touch cases survive precisely because their answer lives in a session the operator *cannot know to open* without the cross-session lookup — the assistant's job is to find that session and point at it, never to paraphrase a transcript already in view. Cross-session is the assistant's only territory. This is the same rule V-27 in the plan's verification table enforces.

**Outcome (DW-9a.3): KEEP — the panel survives, with a hard boundary.** It is not a general assistant and it is not a chat about the fleet; it is a **cross-session question surface**. Its scope boundary for Phase 9b:

- **In:** questions whose answer spans ≥2 sessions, machines, or projects — fleet-level causation ("why did spend jump", "are several stuck for the same reason"), cross-machine delegate conclusions, and cross-session indexes ("which sessions touched this file"). Synthesising across the fleet is the one thing no session and no existing surface does.
- **Out (boundary):** anything a session's own transcript, the fleet board, or the `usage` surface already answers. The assistant never restates a turn, an approval, a status, or a spend figure that an existing surface renders. When the answer to a question *is* a session (e.g. "which session is stuck" → a specific one), the correct response is to point at that session, not to paraphrase it.
- **It may propose actions** (as Phase 9b's action contract covers — spawn, clear a block, write a rule) **only** where the action is a legitimate outcome of a cross-session answer and inherits Phase 5's approval contract in full; it never competes as a second home for an action an existing surface already owns.

The mock suggestions that KEEP survive because they are cross-session *questions* ("why did spend jump today", "which sessions are stuck and why") or pure cross-session lookups; the mock suggestions that CUT ("what needs me right now", "start a session") fail the scope test and are retired. Phase 9b runs, and designs within the boundary above.

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-21 | **Phase 9a: the fleet assistant panel is KEPT**, but only as a cross-session question surface. | The kill test (DW-9a.2) cut *"What needs me right now?"* and *"Start a session"* — the first restates the fleet board, the second duplicates the project spawn control — and cut the whole class of answerable-in-transcript questions. The surviving job — fleet-spanning questions no single session can answer ("why did spend jump", "what did that delegate conclude", "which sessions touched this file") — is the one thing no existing surface does, so the panel earns its place. Phase 9b runs within the recorded boundary; the mock's suggestion set is trimmed, not discarded. |
| 2026-09-01 | **DW-9b.2's "zero silent actions" approval contract is overridden for the supervisor (rule kind "LLM") and per-session autopilot** — both act autonomously inside a session, with no per-action approval card. | This is not a reversal of the Phase 9a/9b kill test. DW-9b.2 governed the assistant **panel's** cross-session actions — spawn, clear a block, write a rule — reaching into sessions the operator was not already looking at, where consent had to be earned per action. The supervisor and autopilot are a different animal: opt-in only (a rule the operator wrote, or a per-session toggle the operator flipped) and confined to acting *inside* a session the operator already scoped in by arming it — consent moved from per-action to per-scope, it did not disappear. The boundaries that survive: permissions still escalate to the human only, the supervisor never answers a permission prompt; the panel's own cross-session actions keep the DW-9b.2 approval contract exactly as recorded above, untouched by this override; and every intervention is logged and labeled in the session transcript, origin `supervisor:*`, so nothing it does is silent even though nothing it does inside its scope is approved per-action. Implementing plan: `.unlazy-supervisor/PLAN.md` (Operator decisions §6). |
