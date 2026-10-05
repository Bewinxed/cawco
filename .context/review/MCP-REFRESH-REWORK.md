# MCP refresh rework: stopped at the submission boundary

## Status

Read the independent review in full. Step 1 is complete on main:

- `b80ddaec` reverts `d54a6677`.
- `7db9020f` reverts `0bf16d6d`.
- The reverts changed only `packages/agent/src/harnesses/opencode.ts` and
  `opencode-activity.ts`. Agent type-check passed. No lint/build was run for
  the reverts, as instructed.

Step 2 has no source implementation. The branch `opencode-mcp-refresh`
starts at the reverted main. The explicit R2 stop condition is reached if
"submission" means the server has accepted the command/compaction rather
than just that the SDK request has been initiated. That distinction needs
to be settled before implementing the admission lock.

## Submission blocker

The adapter's existing request bound is `AbortSignal.timeout`, generally
using `RECOVERY_TIMEOUT_MS` (`opencode.ts:318`, recovery reads throughout the
file). It can bound an HTTP request, but cannot turn an execution-completion
response into a submission acknowledgement.

- Ordinary prompts use `session.promptAsync` (`opencode.ts:2889-2924`).
  The SDK documents this as returning immediately after asynchronous
  acceptance (`sdk.gen.d.ts:1194-1216`).
- Registered commands use `session.command` (`opencode.ts:3038-3054`).
  The current call has no deadline and its response is an assistant message,
  not an acceptance acknowledgement (`sdk.gen.d.ts:1217-1240`).
- Skill-loading commands also call `session.command`
  (`opencode.ts:5451-5467`), with an existing 10-second HTTP deadline.
- Compaction awaits `session.summarize` (`opencode.ts:3078-3087`), without
  a deadline.

Read the following version-pinned upstream sources in full through Exa:

1. https://raw.githubusercontent.com/anomalyco/opencode/v1.18.34/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts
   - `SessionHttpApi.command`: `return yield* promptSvc.command(...)`.
   - `SessionHttpApi.summarize`: `yield* promptSvc.loop(...)` before `return true`.
   - `SessionHttpApi.promptAsync` forks the prompt and returns NoContent.
2. https://raw.githubusercontent.com/anomalyco/opencode/v1.18.34/packages/opencode/src/session/prompt.ts
   - `SessionPrompt.command` executes command-template expansion, including
     shell substitutions through `Process.text`, then awaits `prompt(...)`.
   - `SessionPrompt.prompt`: `return yield* loop(...)` unless `noReply` is true.
   - `CommandInput` has no `noReply` or async-acceptance option.

Awaiting command/summarize responses under the admission lock therefore
waits for execution rather than just submission. A sibling ordinary send
would wait for that turn, violating R1 and R2. Initiating the SDK promise
and immediately unlocking is a different admission boundary; it is not
proof of server acceptance. A fixed timeout releases the lock eventually,
but may report failure for an already-accepted command/compaction and does
not establish a separate acceptance point.

What is missing: an approved boundary for releasing the admission lock
independently of the command/compaction completion response. One possible
design is request initiation plus a durable local in-flight admission
reservation until server activity takes custody; that is a proposal, not an
implemented or proven solution. No server/hub/sessiond change was made.

## Finding 1: indefinite send wait

The faulty added wait was removed by `b80ddaec`; the base mid-turn prompt
contract at `opencode.ts:2837-2839` is restored. The replacement R1/R3/R5
implementation is pending the R2 boundary decision. No new idle waiter was
introduced.

## Finding 2: disposal while waiting/applying

The faulty shared refresh waiter and post-await continuation were removed
by `b80ddaec`. New session-scoped cancellation and R6 checks have not been
implemented. The original lifetime/release methods remain at
`opencode.ts:3395-3413`; preparation remains at `3836-3849`.

## Finding 3: admission and refresh race

No admission lock was added. R2 is the blocker described above; R11 and R13
are pending. Skill commands at `5451-5467` remain on the original path.

## Finding 4: publication overtaking refresh

The flawed entry-only counter guard and publication wakeup were removed by
`b80ddaec`. The shared mutation gate required by R7 has not been implemented.
Original publication is at `opencode.ts:4034-4191` and generation migration
is at `3693-3834`.

## Finding 5: sibling connection closers

R10 is pending. Original operator reconnect/toggle remain at
`opencode.ts:3224-3258`; the unscoped status probe's unconditional disposal
remains at `5880-5890`. No source fix is claimed for these pre-existing
paths. Guarded directory disposal is at `4665-4719`.

## Finding 6: containment seeding hides differences

The faulty containment-based refresh record was removed by `b80ddaec`.
R8 has not been reimplemented. The strict comparator available for the
rework is `managed-mcp.ts:9-17`, using `isDeepStrictEqual`; no desired-as-actual
record was introduced.

## Finding 7: detached reconciliation rejection

The new throwing refresh dependency was removed from reconciliation by
`b80ddaec`. No refresh rejection path was reintroduced. R9's complete
detached-caller handling remains pending; existing `#reconcile` is at
`opencode.ts:4942-4965`.

## Finding 8: duplicate outcome logs

The added refresh function and duplicate idle failure log were removed by
`b80ddaec`. R9's single-owner outcome logs are pending. No new outcome logger
was added.

## R1: no idle wait for sends

Restored base prompt contract at `opencode.ts:2837-2839`; new refresh
integration is not implemented. A completion-held command lock would
conflict with this rule for sibling sends.

## R2: generation/directory admission lock

Stopped before implementation. SDK command/summarize completion responses
cannot serve as bounded submission acknowledgements while preserving the
base send behavior. See the submission blocker above.

## R3: attempt owed refresh, always submit

Pending R2. No new refresh-error-to-send-rejection path exists on this branch.

## R4: bounded transaction requests

Pending implementation. The adapter mechanism is
`AbortSignal.timeout(RECOVERY_TIMEOUT_MS)`, not a new deadline mechanism.

## R5: all refresh wakeups

Pending implementation. Required ingress points are pump idle events
(`opencode.ts:4804-4837`), successful activity sampling
(`opencode-activity.ts:382-495`), readiness reconciliation
(`opencode.ts:4779-4796`, `4942-4965`, `5431-5446`), fleet sync, and admission.
No callback or timer was added.

## R6: lifetime, attachment and generation revalidation

Pending implementation at preparation/submission. The existing lifetime
controller is `opencode.ts:1349`; stop/dispose abort it at `3396`/`3412`.

## R7: publication/refresh mutation gate

Pending implementation. No unsafe waiter resolution or counter-only
substitute was reintroduced.

## R8: exact actual-definition record

Pending implementation. `managed-mcp.ts:9-17` provides the exact comparator.
The previous containment-normalized record is absent after the revert.

## R9: handled detached calls and one outcome logger

Pending implementation. There is no new refresh promise to detach and no
new outcome log to duplicate on this branch.

## R10: operator controls and safe unscoped probe disposal

Pending implementation. The original controls and unconditional probe
disposal remain; see finding 5. Controls would use the admission lock but
retain their immediate, operator-directed replacement semantics.

## R11: fresh complete directory idle coverage

Pending implementation. The overly permissive added `directoryIdle()` was
removed. The existing sampler and custody observations remain in
`opencode-activity.ts`, with no new idle predicate claiming completeness.

## R12: retained generations untouched, conditional active-pump refresh

Pending implementation. Step 1 intentionally restored the pre-0bf16d6d
directory-list bug at `opencode.ts:5815-5819`, rather than leave real pump
directories exposed to unconditional connection replacement.

## R13: scope of agent-only admission exclusion

Pending lock comment. The rework invariant explicitly excludes native or
server-started turns not yet observed by the agent. No server-side exclusion
is claimed or attempted.

## Restart question

No agent-start-minted port or token is introduced into the proxied remote
definition by the agent-side transformation:

- `session.ts:2483-2513` resolves launchers, then rewrites a proxied remote
  URL to `harnessMcpUrl('/mcp/fleet/' + encoded server name)`. It copies the
  remaining supplied configuration; it adds no random token/header.
- `mcp-launcher.ts:44-47` returns remote URL configuration unchanged;
  `140-151` preserves that result.
- `delegation.ts:18-22` uses the configured hub origin for a local hub, or
  loopback at `CAWCO_MCP_CALLBACK_PORT` for a remote hub.
- `packages/core/src/fleet.ts:81` fixes that port at `43_879`.
- `mcp-oauth.ts:114-120` binds that fixed port; it is not chosen afresh.
- `opencode.ts:836-843` copies URL/headers into a remote MCP definition and
  adds fixed `enabled: true`/`oauth: false` fields.

With unchanged incoming fleet configuration and hub address, merely
restarting this agent does not change the resulting definition. This is a
source trace of the agent-side path; hub-produced headers are copied, and
hub-side token rotation was not audited. No credential values were read.

## Verification and exclusions

Step 1: `bun run --filter '@cawco/agent' typecheck` exited 0, followed by
successful normal push to main. Git proves both reverts; no other check was
run for them. No step-2 source, lint, build, or live provocation was done
because the stop condition was reached. No session, service or credential
was acted on. The pi and release-pin commits remain on main.
