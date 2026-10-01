# PLAN — session truth, sessiond, deploy-from-main

Repo /home/bewinxed/cawco. Base commit 4cd9dbb (main == fleet). Chair: Fable 5.

## The operator's question, answered (this is the plan's spine)

"What goes into the hub, what goes into the daemon, what goes into the UI — is the splitting
logical?" Verdict: the three roles are right and nothing merges. What was wrong is one law
being violated:

- **Daemon** = the only authority on process truth: what is alive, busy, blocked, and why.
  Owns spawn/kill, harness adapters, pulses, local disk, executing its own update.
- **Hub** = presence (socket registry), relay/sequencing/fan-out, durable HISTORY (rows are
  lifecycle records), pending asks, Telegram, fleet policy (rules, tools, sync, deploy).
  **LAW: the hub may store last-known state but must never serve stored liveness as
  present-tense truth — every liveness read is derived at read time.** Machines already obey
  (withPresence); sessions do not — that is the 177-running-vs-42-processes lie.
- **UI** = renders derived truth, never invents state, every action rides the ledger.
- The one split still owed is **sessiond**: process custody out of the churny agent, so agent
  deploys stop costing sessions. Built in wave D per
  `/tmp/claude-1000/-home-bewinxed-cawco/1f058869-e130-41f4-98cc-8db5aa6003d5/scratchpad/sessiond-design.md`
  (the design doc IS the spec; leaves cite its sections).

## Contracts (frozen before fan-out; leaves build against these exactly)

- **C1 heartbeat truth.** The `heartbeat` envelope payload gains `instances: string[]` — the
  supervisor's live ids, every beat (15s). Register keeps its richer payload. The hub
  reconciles on every heartbeat, not only at register.
- **C2 status taxonomy.** Instance status union becomes
  `starting | running | sleeping | stopped | discarded | unknown | error`:
  `starting` = spawn issued, not yet confirmed live; `running` = the daemon currently lists
  it; `sleeping` = no process, resumable (NEW — replaces error+RESTART_RESUMABLE; lastError
  null); `stopped` = deliberate; `error` = real failure, lastError required (RESTART_LOST
  stays here); `unknown` = the machine is unreachable; `discarded` unchanged. Plain text
  column — no SQL migration, TS unions + a one-time boot sweep only.
- **C3 pulse retention.** Hub keeps `Map<instanceId, SessionPulse>` (memory), updated on
  pulse frames, dropped when a row settles or is discarded. `instancesFrame` payload gains
  `pulses: Record<string, SessionPulse>` (additive). Dashboard seeds `state.pulses` from it,
  keeping whichever `at` is newer.
- **C4 reconcile-on-heartbeat.** Rows listed by the beat → promoted to `running` (from
  starting/unknown/sleeping/error). Rows at running/starting NOT listed → `sleeping` if
  `sessionId` present else `error`+RESTART_LOST. No respawn from this path — heartbeat is
  truth, register is recovery.
- **C5 bounded restore.** At register, respawn only orphans with `updatedAt` within
  RESTORE_HORIZON_MS = 30 min, newest first, at most RESTORE_MAX = 20 (both our choice:
  the horizon covers restart cycles measured in seconds-to-minutes; the cap keeps a register
  from stampeding a machine; everything older/beyond settles as `sleeping` with a UI wake).
  `restore()` writes `starting`, never `running`; promotion to `running` comes only from the
  daemon's own word (heartbeat/register listing or first frame).
- **C6 read overlay for sessions.** `/api/instances` and `instancesFrame.instances` pass
  through `withSessionPresence`: machine absent from the socket registry ⇒ the row is served
  as `unknown` (stored value untouched). Boot additionally runs the one-time sweep:
  running/starting → unknown; error+lastError==RESTART_RESUMABLE → sleeping (idempotent).
- **C7 sessiond.** Per the sessiond design doc: sessiond owns process, pipe, buffer only
  (§3.4 verbs; §5 capability strings; §6 ring 4096 lines/8 MiB, drop-oldest with explicit
  reset; §7 epoch+srcSeq and the hub ingest ledger; §8 commandId idempotency, 5 min TTL;
  §9 unix socket 0600 in 0700 dir, win32 pipe name reserved; §11 one per machine,
  KillMode=control-group on sessiond, ad-hoc auto-spawn FORBIDDEN under service management;
  §12 endpoint derivation in core). Deviation from the doc's migration section, by operator
  order: NO `CAWCO_SESSIOND` flag — the bridge is the spawn path unconditionally. The
  adoption spike (second `initialize` against a live child) is timeboxed to 90 min (our
  choice); custody + boundary hand-off ship either way. pi keeps agent-lifetime sessions
  (scope, stated; the runner is the upgrade path).
- **C8 deployment channel.** Every machine's services run from a dedicated clean clone at
  `~/.cawco/app` tracking `origin/main` (path our choice, per-user, no sudo). `cawco
  deploy init` creates it: clone, bun install, build dashboard, install units pointing at
  the clone, write a `.cawco-deploy` marker (our choice — the guard that auto-pull NEVER
  runs in a dev tree). The agent polls every 60 s (our choice): `git fetch origin main` in a
  marked checkout; if behind → the existing update flow (`pull --ff-only`, install, build,
  restart services; agent restart is free post-cutover). Push to main IS the fleet deploy.
  The hub's role is surfacing skew, not executing pulls.
- **C9 DB placement.** Default CAWCO_DB_PATH moves to the platform data dir
  (`~/.local/share/cawco/cawco.db`; darwin `~/Library/Application Support/cawco/`).
  Hub boot migrates: target absent + legacy tree file present → move db+wal+shm. The DB
  never lives in a git checkout again (dev tree or clone).

## Standing constraints (every leaf brief carries these verbatim)

- Do NOT spawn subagents; do the reads yourself.
- `bun test <path>` from repo root (no test script). Lint per-file only
  (`npx eslint <file>`, ~3.4 s; full-repo lint does not finish).
- Touch only your OWNED FILES. If you believe you need another file, stop and report.
- Another live agent session may be editing this tree: re-read files at execution time
  (line numbers in briefs are stale on arrival), never revert hunks you did not write.
- One commit per leaf. No unsourced numbers — constants are cited or labeled "our choice".
- Never write into `.data/`, `~/.claude`, or any live project directory; scratch dirs for
  anything disposable.
- Reports end with `DEVIATIONS FROM SPEC` — empty or itemized. Silence = zero deviation.
- Baselines to preserve: dashboard 266 / hub 84 / agent 124, all 0 fail (counts may grow,
  failures may not).

## Leaves, models, order

| Leaf | Scope | Model | Waits on |
|---|---|---|---|
| A1 | wire contract: heartbeat instances, core `sleeping` union, daemon.ts TS2345 fix | Sonnet 5 | — |
| A2 | hub truth engine: reconcile-on-heartbeat, settle rewrite, bounded restore, boot sweep, pulse retention, read overlay, hubBuild in frame | Opus 5 | A1 |
| A3 | dashboard derived status: readers, pulse seeding, sleeping/unknown rendering, wake | Sonnet 5 | A2 |
| A4 | ARCHITECTURE.md — the split doctrine filed | Sonnet 5 | — |
| B1 | daemon re-discovery on sustained reconnect failure | Sonnet 5 | A1 |
| B2 | DB path out of the tree + boot migration | Sonnet 5 | — |
| D0 | extraction: SessionRing → core, sessiond protocol types + endpoint | Sonnet 5 | A1 |
| D1 | sessiond binary (packages/sessiond) | Opus 5 | D0 |
| D2 | claude bridge + custody + boundary hand-off (+90 min adoption spike) | Opus 5 | D1 |
| D3 | ingest ledger: srcEpoch/srcSeq, hub ledger, register-ack ingested, seam frame, property test | Opus 5 | A2, D2 |
| D4 | service units: sessiond in SERVICES, agent Wants/After, auto-spawn guard, pid ledger | Opus 5 | B2, D1 |
| D5 | opencode process-keeping under sessiond | Opus 5 | D2, D4 |
| C1 | deploy clone: `cawco deploy init`, marker guard, agent poller, update-flow trigger | Opus 5 | D4, B2 |
| C2 | convergence surfaced: behind-main badge, fleet-sync failures, update-pending | Sonnet 5 | A3, D3 |
| F1 | THE CUTOVER (one destructive event, operator-timed): push main, deploy init on obelisk, flip units, verify survival; then mac | Opus 5 | all above |
| E  | close: full suites, all typechecks, security pass on the deploy/update surface, gate re-run | Opus 5 | F1 |

Concurrency: start A1 + A4 + B2 together. After A1: A2 ∥ B1 ∥ D0. After A2: A3 (∥ D1 after
D0). Chain D1→D2→D3; D4 after B2+D1; D5 and C1 after D4; C2 after A3+D3. F1 alone. E last.
Peak concurrency 3. File-ownership collisions that force the sequencing: core/index.ts
(A1→D0), server.ts (A2→D3), service.ts (B2→D4→C1), client.svelte.ts (A3→C2),
harnesses/* (D2→D5), daemon.ts (A1→B1).

## F1 warnings (in the leaf brief, verbatim)

- This is the single destructive step of the plan: stopping the old agent kills every live
  claude child once (pipes die with the parent). Run at an operator-confirmed moment.
- If the executor itself runs as a cawco-agent child it will die mid-leaf. That is
  expected and survivable: gates live on disk; the resumed/replacement session re-runs
  gate-check and continues. Do not treat your own death as failure; write evidence early.
- With RESTORE_HORIZON/RESTORE_MAX bounds, up to ~20 sessions respawn immediately; the rest
  settle as `sleeping` with the UI wake affordance. That is designed, not a bug.
- Old units (`cawco-*`, `cawco-*` pointing at the dev tree) are disabled, not deleted;
  `.bak` copies stay.

## Status log
(append-only)
