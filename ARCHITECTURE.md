# ARCHITECTURE.md

<!-- The split doctrine: what belongs in the hub, the daemon, and the UI, why the split is
     drawn where it is, and the one law the codebase was violating when this document was
     written. Pairs with JOURNEY.md (structural/temporal spec) and DESIGN.md (visual tokens);
     this document is neither — it is the runtime topology underneath both. -->

## The operator's question

CawCo is three programs cooperating on one belief: what is actually running, right now,
across every machine. The question that forced this document was blunt — "what goes into the
hub, what goes into the daemon, what goes into the UI, and is the splitting logical?" The
verdict is that the three roles are right and nothing needs to merge. What was wrong is a
single law being violated in one specific place: session status was being stored and then
served back as if storage made it current. Everything below explains the roles first, then
names that law and where it was broken.

## The three roles

**The daemon (`packages/agent`, one process per machine)** is the only authority on process
truth: what is alive on this machine, what it's doing, and why. It owns spawning and killing
child processes, the harness adapters that speak each agent's wire protocol (Claude Code,
OpenCode, pi), the pulse that reports busy/idle/blocked in near-real-time, local disk state,
and executing its own update when told to. If a fact can only be known by asking the operating
system on this machine — is this pid alive, is this pipe still open, did this child exit — the
daemon is where that question gets asked. Nothing upstream of the daemon should ever need to
guess at process truth; it should ask the daemon, or accept that the daemon is unreachable and
say so.

**The hub (`packages/hub`, one process, tailnet/LAN-reachable)** is presence — the socket
registry of which daemons currently hold a connection — plus relay, sequencing, and fan-out of
everything daemons and the dashboard exchange; durable history (its database rows are lifecycle
records — spawn, error, stop — not a live status you can trust the moment they're read);
pending approval requests; the Telegram bridge; and fleet policy (rules, tool grants, sync,
deploy). The hub is deliberately not a second copy of process truth. It is the place multiple
daemons and multiple dashboard tabs converge, and its job is to converge them consistently, not
to independently decide what's alive.

**The UI (the dashboard app, `apps/dashboard`)** renders derived truth and invents none of its
own. Every status it shows traces to a hub-computed read (an overlay function run at request
time, never a bare column) or a live pulse frame; every action the operator takes rides the
same ledger the hub uses internally, rather than mutating local state optimistically and hoping
the backend agrees later.

The split is drawn along *who can answer the question first-hand*. The daemon is first-hand on
process. The hub is first-hand on presence (it either holds a socket or it doesn't) and on
history (it either wrote a row or it didn't). Neither is first-hand on the other's domain, and
the failure mode this document exists to prevent is one of them pretending otherwise — most
often the hub, because it is the one place a live fact and a historical record sit in the same
table and are one careless `SELECT` away from being confused for each other.

## The derived-liveness law

**The hub may store last-known state, but it must never serve stored liveness as present-tense
truth — every liveness read is derived at read time, from a live source, not from a column.**
A database row can say what last happened; it cannot say what is happening now, because "now"
changed the instant after the row was written and nothing re-checked it. Serving that row back
to a reader as if it still held is the exact violation this document exists to name: a live
fact was stored, and then quietly promoted to a claim about the present.

CawCo has one instance of this law already obeyed and one instance it was violating.

**Obeyed: machine presence.** `packages/hub/src/server.ts` defines `withPresence()`, which maps
every agent row through the hub's live socket registry at read time — `status: registry.agent(
row.machineId) ? 'online' : 'offline'` — while every other field on the row (`lastSeenAt`,
`build`, `harnesses`, `fleet`, `auth`) passes through from the database untouched. `lastSeenAt`
is allowed to be history; `status` is not allowed to be. This overlay is applied at the only two
places a machine's status reaches a reader — the `GET /api/agents` route and the
`instancesFrame` snapshot sent to every dashboard — and nowhere else, because the other
`db.listAgents()` call sites are fleet/config lookups that never read `status` and have nothing
to derive. The hub additionally calls `db.markAllAgentsOffline()` at boot, so a hub that just
restarted with an empty socket registry never serves a stale "online" from before it lost its
sockets. Measured behavior matches the design: after a hub restart with an empty registry,
every machine reads `offline`; the live ones flip to `online` within the next heartbeat cycle
(roughly 10s); a genuinely dead machine stays `offline` rather than freezing at whatever it last
reported.

**Violated: session status.** `instances.status` is a stored column, written directly in
roughly seven places across `packages/hub/src/db/index.ts` — on register, on restore, on stop,
on error, on discard, and elsewhere — and until this build, read back exactly as written, with
no equivalent of `withPresence()` standing between the column and the API response. The result
was measurable: `/api/instances` reported 178 instances as `running` on one machine while only
42 `claude` processes actually existed there, all at or under 1.5% CPU and 36–44 hours old. That
gap is not a rounding error or a race — it is the law's failure mode exactly as stated: a value
that was true when written (`running`, at spawn) was served forever afterward as if writing it
had made it durably true, long after the process it described was gone. This build closes that
gap the same way `withPresence()` already closed it for machines: a read-time overlay
(`withSessionPresence`, contract C6) that serves a session as `unknown` whenever its owning
machine is absent from the socket registry, leaves the stored column untouched as history, and
reconciles the column itself only from the daemon's own word — a heartbeat listing or a register
handshake — never from a reader's assumption that yesterday's write is still true. A live
per-instance pulse already existed for this purpose in `packages/agent/src/session.ts`
(`SessionPulse`, built fresh from live parts on every emission and throttled, never itself
persisted) before this build — the daemon was already computing liveness first-hand; what was
missing was the hub trusting that computation over its own stored column when a reader asked.

The law generalizes past these two instances: any time a new fact starts getting stored for
convenience or durability — a cache, a snapshot, a denormalized column — the question that must
be asked before it ships is whether a reader can be handed that value as "what is true now." If
the answer is no, the value needs a derivation step between the store and the response, the same
shape as `withPresence()` and `withSessionPresence`, before it reaches a caller.

## The status taxonomy

Instance status is a seven-value union. It is a plain text column — this build introduces no
SQL migration, only the TypeScript union plus a one-time boot sweep that reclassifies rows left
in states the old taxonomy could produce but the new one no longer uses.

| Status | Meaning |
|---|---|
| `starting` | A spawn has been issued but the daemon has not yet confirmed the process is live. Written by `restore()` and by a fresh spawn; never promoted to `running` from this path alone — promotion comes only from the daemon's own word (a heartbeat listing it, or its first frame). |
| `running` | The owning daemon currently lists this instance among its live processes. This is the only status that means "a process exists right now," and it is asserted solely on the daemon's report — heartbeat or register — never inferred by the hub from the mere passage of time. |
| `sleeping` | No process is currently running, but the session is resumable: `sessionId` is present, and `lastError` is null. This value is new in this build — it replaces the previous overload of `error` with a `RESTART_RESUMABLE` marker, which conflated "recoverable, nothing wrong" with "a real failure occurred." A session a heartbeat no longer lists, that still has a `sessionId` to resume from, settles here — not into `error`. |
Table continues below.

| Status | Meaning |
|---|---|
| `stopped` | Deliberately ended — the operator or an automated policy asked for it, and the daemon complied. Not a failure and not resumable in the way `sleeping` is. |
| `discarded` | Removed from active consideration entirely; terminal, unchanged from prior behavior. Once a row reaches `discarded` it is excluded from restore, reconciliation, and presence overlays alike. |
| `unknown` | The machine that would know is unreachable — the hub has no live socket for it, so it cannot ask. This is the presence-overlay value: `withSessionPresence` serves any row on a machine absent from the socket registry as `unknown` without touching the stored column, exactly mirroring what `withPresence()` already does for machines. It means "the hub cannot currently find out," not "the hub knows this is broken." |
| `error` | A real failure, distinct from `sleeping`: `lastError` is required and non-null. The old `RESTART_LOST` condition — a row the heartbeat should have listed but didn't, with no `sessionId` to resume from — lands here, not in `sleeping`, because there is nothing left to resume. |

Two taxonomy rules follow directly from the derived-liveness law rather than being arbitrary
choices. First, `running` can only be asserted by the daemon's own report, never inferred by
the hub from elapsed time or from the mere existence of a row — that is what makes it a
liveness value rather than a stored guess. Second, `unknown` exists specifically so that
"the hub can't currently tell" and "the hub positively knows this failed" are never the same
value; collapsing them was part of what let the 178-vs-42 gap go unnoticed, because a reader
had no way to distinguish a row the hub genuinely believed was running from one it simply
hadn't had the chance to check.

Two of the seven — `sleeping` and `unknown` — did not exist under the old taxonomy at all;
both were introduced by this build to give a name to a state the system was previously forced
to misreport as something else: a session with nothing wrong that simply had no process was
called `error`, and a session on an unreachable machine was called whatever it had last been,
neither of which is `sleeping` or `unknown` in truth.

Reconciliation between these values runs on every heartbeat, not only at register: rows the
heartbeat lists are promoted to `running` from `starting`, `unknown`, `sleeping`, or `error`;
rows at `running` or `starting` that the heartbeat does *not* list settle to `sleeping` if a
`sessionId` survives, or to `error` (with `lastError` set) if it doesn't. Register remains a
recovery path, not the primary source of truth — it bounds how many orphaned sessions get
respawned automatically (newest-first, within a horizon and a cap chosen so a register doesn't
stampede a machine that's been down for a while), and everything outside that bound settles as
`sleeping` with an operator-facing affordance to wake it by hand rather than being silently
respawned.
The cap and horizon bound fresh respawns, not reattachment to custody the daemon has verified first-hand; a sleeping or errored turn older than the horizon that the server still holds is reported, not resumed, until the operator asks.

## Who writes what

The table below is the single source for which component is allowed to assert a fact, and
which is only ever allowed to render one someone else asserted.

| Fact | Authority (writes/asserts) | Renderer (reads only) |
|---|---|---|
| A session's process is alive, busy, or blocked | The daemon (harness adapter + `SessionPulse`) | Hub (relays the pulse, retains a bounded map of the latest one per instance), UI (paints activity from the pulse) |
| A session's `running`/`sleeping`/`error`/`starting` status | The hub, reconciling stored history against the daemon's heartbeat/register report | UI (never computes status itself — it renders whatever `/api/instances` or `instancesFrame` hands it) |
| Whether a session is reachable at all right now | The hub's socket registry, via the presence overlay | UI, and the hub's own history columns (which stay untouched by the overlay and record only what was last known) |
| A machine's `online`/`offline` status | The hub's socket registry, via `withPresence()` | UI, daemon (the daemon knows its own aliveness trivially; it never needs to ask the hub whether it itself is online) |
| History — what happened, when, in what order | The hub's database (append/update on lifecycle events only, never on a mere read) | UI (renders a timeline/log), daemon (never reads history to decide present-tense behavior) |
| Fleet policy — rules, tool grants, deploy target | The hub | Daemon (executes what it's told), UI (edits policy through the hub's API, never locally) |
| What the operator wants right now — approve, deny, spawn, stop | The UI, expressed as an action against the hub's ledger | Daemon (executes once the hub relays it), hub (records the action as history) |

The pattern repeats: whoever can observe a fact first-hand is its sole authority, and every
other component is a renderer of that authority's most recent report — never a second opinion
formed from its own stale copy.

## The trust boundary: the tailnet is the perimeter

CawCo is a single-operator fleet reachable only over a tailnet (or a trusted LAN), and
that network boundary *is* the authentication. It is stated here because several things in
the system only make sense once it is: the hub's `/ws` accepts a `register` for any
`machineId` and relays any `control` verb without a token
(`packages/hub/src/registry.ts`, `packages/hub/src/server.ts` `case 'register'`); sessiond's
unix socket authorizes by filesystem permission alone — `0600` inside a `0700` directory,
which is the whole of design §9 (`packages/sessiond/src/server.ts:151-166`); and the deploy
poller executes whatever is on `origin/main` (`packages/agent/src/deploy.ts`,
`packages/agent/src/update.ts`). Anyone who can open a socket to the hub can already spawn a
session with an arbitrary `cwd`, which is arbitrary code execution as the operator. No
in-band control adds capability beyond that, so adding tokens *inside* the perimeter would
be ceremony; keeping the perimeter closed is the actual control.

What follows from that, concretely, and what must stay true:

- **The hub must not be bound to a public interface or port-forwarded.** Everything else in
  this section assumes it is not.
- **`origin` is pinned.** The poller reads its remote and branch from the `.cawco-deploy`
  marker (`0600`, written by `cawco deploy init`) and never from the wire; the fast-forward
  is `git pull --ff-only origin <branch>` with both named explicitly
  (`packages/agent/src/update.ts` `pullArgs`), and a diverged clone is refused rather than
  reset (`deploy.ts` `DeployState.diverged`, `update.ts` `deployUpdate`). Push access to
  `origin/main` is therefore equivalent to root on every machine in the fleet — that is the
  operator's deliberate choice ("push to main IS the fleet deploy"), and it is the reason
  the marker is the only thing that licenses a pull: an unmarked checkout does not even
  fetch (`deploy.ts` `checkDeploy`, which returns `unmarked` before any git command runs).
- **The preview is same-origin with the dashboard.** A page an agent wrote is
  served through the dashboard's own origin at `/preview/<id>/`, not on a second
  port or hostname. The tailnet/Access perimeter is the control: anything that
  page can do in the dashboard, a shell on its own machine can already do through
  the hub. A second origin would cost every operator a second hostname for no
  security gain.
- **Generated unit files carry no secrets.** The only `Environment=` lines
  `packages/cli/src/service.ts` writes are `PATH`, `CAWCO_DB_PATH`, `PORT` and `HOST`, and
  the units are written `0600` outside the clone.

## The sessiond boundary

The one split this document owes beyond restating what already exists: process custody is
moving out of the agent daemon and into a dedicated `sessiond` — a small, machine-local service
whose entire job is owning a spawned process, its pipe, and its output ring buffer. Nothing
else. `sessiond` does not parse the newline-delimited JSON its child emits, does not know what a
tool call or a permission request is, and does not know which harness (Claude Code, OpenCode,
pi) it's holding — it knows a process exists, that stdin/stdout/stderr are open, and that bytes
are flowing. Interpreting those bytes into meaning — recognizing a tool call, a permission
prompt, a pulse-worthy state change — stays entirely in the agent (the harness adapters in
`packages/agent`), which sits on the other side of the pipe from `sessiond` and reads its ring
buffer as an unopinionated stream.

The reason for drawing the line exactly there, rather than folding interpretation into
`sessiond` for convenience, is that `sessiond`'s value is proportional to how rarely it changes.
It is the thing every agent deploy currently has to restart *through* — today, updating the
agent daemon kills every child process it's holding, because the pipes die with the parent. A
service that owns nothing but process/pipe/buffer can be restarted essentially never, because
there is nothing in it that a harness change, a new agent feature, or a wire-protocol tweak
would ever need to touch. Harness adapters are the opposite: they are the highest-churn surface
in the whole system, because every provider (Claude Code, OpenCode, pi) ships its own wire
format and its own idea of what a tool call looks like, and that surface changes on the
provider's schedule, not CawCo's. Anthropic's own SDK acknowledges this exact seam at the
transport level — `@anthropic-ai/claude-agent-sdk` (pinned `0.3.220`) exposes a
`spawnClaudeCodeProcess` option (`sdk.d.ts`, `ClaudeAgentOptions`) specifically so the caller can
substitute *how* the child process is launched without the SDK needing to know anything about
where that process actually lives — the same custody/interpretation seam `sessiond` draws,
one level up.

Put the churny part (interpretation) behind the stable part (custody) and an agent deploy stops
costing every running session its process: the child stays owned by `sessiond` across an agent
restart, and the agent reattaches to the same pipe and ring buffer it left, rather than
re-spawning from nothing. Put them in the other order — meaning inside the thing you restart
often — and every harness change becomes a fleet-wide session massacre again, which is the exact
failure this split exists to retire.
