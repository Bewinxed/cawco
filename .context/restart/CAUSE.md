# OpenCode restart custody, 5 October 2026

## Cause

The hub made a claim about conversation loss from a catalog omission. The agent then treated a positively observed ownership conflict as a transient read failure. Neither decision required an OpenCode process to have died.

The boot sweep at `packages/hub/src/db/index.ts:2335` changes running/starting rows to unknown, without dating them anew. `packages/hub/src/server.ts:1598` runs that sweep on hub startup. This is appropriate: losing the hub does not prove that a runner stopped. The fault comes later: registration calls `settleInstances` at `packages/hub/src/server.ts:9955`, before it interprets the sessiond/OpenCode custody report at `packages/hub/src/server.ts:9974`. Before this fix, `packages/hub/src/db/index.ts:2197` treated a row missing from `liveIds` and the supplied resumable catalog as non-resumable and wrote `error` with `RESTART_LOST`. The following OpenCode custody check could restore that same row because a server survived. Thus the error did not establish that its conversation was gone.

Before the fix, `packages/agent/src/harnesses/opencode.ts:5509–5527` returned empty arrays for failed session-list requests, including SDK error responses and rejected requests. `resumableSessions` at `packages/agent/src/session.ts:394` could then publish a seemingly complete cross-harness catalog without the OpenCode conversation. Successful listings are also project/directory-filtered and omit children; they cannot prove absence of a specific recorded conversation. An unavailable read must stay unavailable, and recorded OpenCode keys must be checked individually during recovery. The fix implements both rules at `packages/agent/src/harnesses/opencode.ts:5493–5544` and `packages/hub/src/db/index.ts:2196–2218`.

The morning evidence proves that the agent had not restarted when the hub classified this row as lost. The later read-only checks prove that its conversation survived in two server generations. The journal does not contain the original registration payload or the list HTTP responses, so it cannot establish which exact request omitted the key, or whether the supervisor lacked its handle before that reconnect. The private reproduction supplies those missing conditions explicitly and demonstrates the same wrong transition with both a failed list request and a successful list that omits the key. It does not claim to recreate the unrecorded origin of the duplicate runner.

Recovery reads the process-local runner status of every recorded live generation at `packages/agent/src/harnesses/opencode.ts:5088–5107`. Two busy answers previously threw an ordinary Error at pre-fix line 5105. `#recover` caught every exception and retried forever at pre-fix lines 5039–5059. Nothing inside that loop could reconcile the two runners; only one runner becoming idle, being explicitly aborted, or its generation exiting could end the conflict. Shared conversation storage is not shared runner ownership. Upstream's status implementation stores a map in `InstanceState` and removes an entry when idle: https://github.com/anomalyco/opencode/blob/ec3ae17e/packages/opencode/src/session/status.ts, “`data.delete(sessionID)`”.

The loop also kept `#pendingRecoveries` populated. `#operationsPending` at `packages/agent/src/harnesses/opencode.ts:3898–3906` vetoes retirement while recovery is pending or machine custody is not ready. `#generationIdle` at line 3967 checks that veto before sampling a generation, and `packages/agent/src/harnesses/opencode-server.ts:374–376` emits the generic “busy or unknown” retirement warning. Consequently, a permanently retrying conflict holds retirement even for an unrelated idle generation. A genuinely busy retired generation is separately and correctly retained.

The fix distinguishes known, non-transient refusal using `HarnessRecoveryRefused` (`packages/agent/src/harness.ts:35`). The multiple-generation conflict now includes exact generation IDs, PIDs and URLs at `packages/agent/src/harnesses/opencode.ts:5109`; `#recover` propagates it immediately at line 5054. The supervisor reports it as a registration/custody error at `packages/agent/src/session.ts:1476`, with a failed request acknowledgement where requested, and never converts it into a spawn/session failure. The recovery promise settles and releases its pending-operation veto. No runner is selected, aborted, replaced or killed automatically. Transient unreachable reads still retain their existing retry behavior.

The original protections remain: commit `987888b8` introduced catalog reconciliation to distinguish genuinely lost conversations from sleeping sessions; the Claude-specific gone-conversation check is retained. Commit `e9d93055`, reapplied by `11ae8453`, introduced generation retention to preserve incumbent turns during publication; fresh idle reads, captured process identity checks, and protection of busy generations are retained.

### Memory pressure and the remaining retired generation

The owner's later evidence identifies the memory shortage as another project's Stop hook accumulating about a thousand build checks, lasting roughly 07:15–08:30. This can delay or fail catalog/status HTTP requests and delay agent recovery. The empty-on-error implementation made such pressure relevant to the false loss transition. There is no evidence that either OpenCode server was OOM-killed: both were still answering busy at 08:40. Memory pressure cannot explain away the persistent two-owner conflict; both runners remained busy after memory recovered.

The row returned to running by itself around 08:38:35, before the operator's recovery action. This confirms that the earlier `RESTART_LOST` label was not evidence of a lost conversation. It does not establish that the duplicate runner had ended.

After the targeted recovery, retirement still being deferred was **not** this session's pending-recovery veto. At 08:48:31 the real machine reported `busy=11`, `ready=true`, `recovery=ready`, without `opencode:pending-operations` or `opencode:activity-unknown`. At 08:50:59 the parent checked seven OpenCode conversations on both servers. Exactly one remained on e12abb42: instance `7ed3765a`, conversation `ses_ef87183e6ffe38an4hN7pKoMLs`, directory `/home/bewinxed/.worktrees/backlot-buildbase-2511be3e`, busy on port 46559 and absent on 42327. This is another orchestrator's real turn, “Implement clip curation”; retaining that generation is correct. It was not touched.

### Concurrent branches

None of the three branches already removes these two causes. `origin/ownership-cutover` adds acknowledged session addresses at `packages/agent/src/daemon.ts:591` and repairs end-intent ownership, but retains catalog-negative settlement at `packages/hub/src/db/index.ts:2527` and the ordinary multiple-generation exception at `packages/agent/src/harnesses/opencode.ts:5328`. `origin/agent-restart-gate` adds short-lived restart holds at `packages/agent/src/harnesses/opencode.ts:3922`, but retains the same conflict at line 5134. `origin/opencode-mcp-refresh` adds directory admission/publication fencing at `packages/agent/src/harnesses/opencode.ts:4060`, which addresses races around new dispatches, but retains the conflict at line 5548 and does not change the hub's catalog-negative settlement. Their changes were read and left alone. This fix is limited to main's false-loss and non-transient-retry decisions.

## Reproduction

Run from the repository root after `bun install --frozen-lockfile`:

```sh
bun .context/restart/reproduce.ts --baseline
bun .context/restart/reproduce.ts --fixed
bun .context/restart/reproduce.ts --baseline --catalog-empty
bun .context/restart/reproduce.ts --fixed --catalog-empty
```

The baseline loader pins the four production source files to `8c4f810b`; it does not overwrite the checkout. The probe runs a real private hub, agent daemon and sessiond, plus two stub OpenCode servers held by that sessiond. Every child gets a whitelist environment with private HOME/XDG roots, a private SQLite database, private callback/listening ports and a private socket. Claude/pi adapters are inert, the OpenCode CLI is a stub, and there are no model calls or owner credentials. A real private hub is restarted while both stub runners keep the same conversation busy and its row is filed live. The default case injects an HTTP 503 catalog read; `--catalog-empty` returns HTTP 200 with the conversation omitted. Every run kills only its captured private child processes by PID, closes its clients, and removes the scratch tree in `finally`.

Actual baseline output (`before.log`):

```text
BEFORE hub restart: {"status":"running","error":null,"sessionId":"ses_restart_proof"}
AFTER hub restart: {"status":"error","error":"The agent restarted, and this session left nothing to resume from.","sessionId":"ses_restart_proof"}; conflict reports=5; generations alive=2
CUSTODY: {"busy":4,"instances":["ses_restart_proof","opencode:activity-unknown","opencode:pending-operations","agent:recovery-recovering"],"ready":false,"recovery":"recovering"}
RECOVERY: retired scoped abort=true; {"status":"running","error":null,"sessionId":"ses_restart_proof"}; active runner={"ses_restart_proof":{"type":"busy"}}
HISTORY: original message preserved on both generations; conversation key unchanged.
RETIREMENT: older generation exited after its only runner went idle; active generation still alive.
Private hub, agent, sessiond and stub generations ended by PID; scratch removed.
```

Actual fixed output (`after.log`):

```text
BEFORE hub restart: {"status":"running","error":null,"sessionId":"ses_restart_proof"}
AFTER hub restart: {"status":"sleeping","error":null,"sessionId":"ses_restart_proof"}; conflict reports=2; generations alive=2
CUSTODY: {"busy":2,"instances":["ses_restart_proof","opencode:activity-unknown"],"ready":true,"recovery":"ready"}
RECOVERY: retired scoped abort=true; {"status":"running","error":null,"sessionId":"ses_restart_proof"}; active runner={"ses_restart_proof":{"type":"busy"}}
HISTORY: original message preserved on both generations; conversation key unchanged.
RETIREMENT: older generation exited after its only runner went idle; active generation still alive.
Private hub, agent, sessiond and stub generations ended by PID; scratch removed.
```

The two fixed conflict reports are one explicit refusal per registration, not a retry loop. The probe asserts that no `waiting; retry` line exists, that custody completes without a pending-operation sentinel, and that the same conversation becomes running after a scoped abort and explicit fresh agent attachment. Both successful-but-omitted catalog runs also exit 0 and flip error to sleeping; their exact output is in `before-empty.log` and `after-empty.log`. The initial unknown activity sentinel is the sampler's incomplete first observation, not a pending recovery; fresh sampling permits retirement once the older runner is idle.

Verification commands all exited 0:

```sh
bun run lint
bun run typecheck
bun run --sequential --filter '*' build
git diff --check
```

Lint: “Checked 1096 files … No fixes applied. Found 5 warnings.” These are existing unused suppressions in `packages/hub/src/server.ts`; there are no lint errors. Type-check: every workspace exited 0, “svelte-check found 0 errors and 0 warnings”, and “openapi.json is up to date”. Build ran the repository's workspace build scripts sequentially: dashboard SSR “built in 4.80s”, client “built in 5.56s”, dashboard “Done in 41.86s”, jsonl-parser “Done in 713ms”. After rebasing onto main's intervening dashboard/documentation changes, lint, type-check, sequential builds and `git diff --check` were run again and all exited 0. The original and rebased verification logs are retained locally beside this file. No unit tests were written or run.

## Recovery

The exact one-line step sent to the parent was:

```sh
curl --fail-with-body -X POST 'http://127.0.0.1:46559/session/ses_ef6cdbf89ffePyNqeqL7Og7oQB/abort?directory=%2Fhome%2Fbewinxed%2F.worktrees%2Fcockpit-b3f67ac3'
```

The parent carried it out at 08:47:10. It returned `true`. Twelve seconds later the older server (PID 1973487, port 46559, generation `opencode-server-e12abb42-1f5f-4ca2-88c4-de1458dd2ffd`) reported the conversation absent from its status map; the active server (PID 1487399, port 42327, generation `opencode-server-96079aaf-62b5-4f98-a043-cd62779a3665`) still reported it busy. The agent logged at 08:47:10:

```text
handoff 2ac13a73…: opencode-server-e12abb42-1f5f-4ca2-88c4-de1458dd2ffd/1973487 → opencode-server-96079aaf-62b5-4f98-a043-cd62779a3665/1487399
```

It then logged a permission snapshot and question snapshot for the session. The hub row was running with no error, still naming `ses_ef6cdbf89ffePyNqeqL7Og7oQB`. This is the observed success receipt: one remaining runner, generation handoff, re-subscribed asks, same conversation and clear row error. The abort is scoped to that one conversation on the older generation; it neither deletes its stored history nor kills that server or its other sessions. No live service, database or real session was accessed or changed by this leaf; the operator performed the authorized recovery.

## Dropped messages

This is a separate delivery-accounting cause and is not fixed in this item. The eight records in `0721-dropped-messages.txt` have `held=0` and reason “This never reached the session.” That literal is `UNREAD.lost` at `packages/hub/src/server.ts:1315`. Two call sites use it: `decideCustody` at lines 2334–2348 settles sends accepted before a returning process registered, and `takeRead` at lines 2436–2462 settles earlier pending sends as soon as a later ordinary send is read.

Both call `settlePending` (lines 2242–2284), which reads stored history and calls `settleSend` (lines 2287–2311). For an `unheld` decision, line 2305 treats absence from that history as lost unless the hub has a held receipt not overtaken by a later read; line 2309 calls `failSend`. There is no durable-redelivery step on that branch. `overtaken` at lines 2225–2232 assumes every non-urgent later read proves that all earlier sends have already reached the harness in order. That does not establish whether an earlier send is still waiting in the agent's delivery queue, or whether the transcript snapshot covered it. For OpenCode, `MESSAGES_STORED` is published before asynchronous dispatch (`packages/agent/src/harnesses/opencode.ts:2798`), and `promptAsync` is dispatched later at line 2889. History reads also still return `[]` on an SDK error in `getSessionMessages` at lines 5593–5594. Thus a successful-looking empty/partial transcript and `held=0` can convert uncertainty into a permanent failed record while its intended recipient survives.

The eight table rows alone do not distinguish which of the two call sites decided each record or prove whether every body was absent from the underlying conversation. Their reason proves this settlement path, rather than a harness rejection. Messages after the new registration cutoff are exposed to the later-read/overtaking path; messages before it are also exposed to custody settlement. Memory pressure and slow adoption make the unresolved-delivery window longer. Fixing the OpenCode *catalog* and the *generation conflict* does not repair these transcript-negative delivery decisions or replay those bodies. No sent-message state, delivery logic or stored message content was changed here.

## Fix

Production fix commit: `107737c5` (rebased from locally verified `6d0f5d81`), “Preserve OpenCode conversations across restart custody conflicts”. Four files, 56 insertions and 23 deletions: the shared terminal-refusal type, OpenCode catalog error propagation and conflict classification, supervisor custody reporting, and hub settlement. The accompanying documentation commit adds this file, the credential-free private reproduction and its short before/after evidence logs.

The hub service `cawco-hub` must restart onto this commit to remove the catalog-based false-loss transition. The agent service `cawco-agent` must restart onto it to stop retrying positively observed conflicts and report the generations requiring an explicit decision. Sessiond and existing OpenCode server processes must remain running; neither requires a restart for this agent-side change. Service-manager actions are the parent's responsibility. The live targeted recovery has already been completed on the pre-fix deployment.
