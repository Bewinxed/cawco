# Harnesses

The invariant: a CawCo session works the same whichever harness runs it,
delegates included. A session on any harness takes the same sends, raises the
same asks, reaches the same CawCo and fleet tools, runs every shell command
and file write of a work item inside its workspace's boundary, survives an
agent restart under the session keeper, and reads back as the same
transcript. A harness that cannot meet a row says so on the row, and the
product refuses or hides that feature for it rather than half-doing it.

This page is the checklist for adding a harness: what every harness must
provide (§2), how Claude Code, OpenCode and pi each meet it today, and every
place outside the adapters that names a harness (§3). A new harness is one
more column in §2 and one more answer at each place in §3.

Two things keep it in step with the code:

- `bun run check` runs `scripts/harnesses-check.ts`, which reads the members
  of `Harness`, `HarnessSession`, `HarnessContext`, `SessiondAdoption` and the
  keys of `FULL_CAPABILITIES` with the TypeScript parser and fails on a
  member with no row in §2.1–2.5, and on a row naming a member that is gone.
- Adding a kind to `HARNESSES` fails the type-check at every place §3 marks
  **typed**, naming the place. The places marked **untyped** are walked by
  hand from this page.

## 1. Adding a harness

1. **Name the kind.** Add it to `HARNESSES` (`packages/core/src/harness.ts:36`)
   and `HARNESS_TOOL` (`:44`), whose value is its id in the tool catalog
   (`TOOL_CATALOG`, `packages/core/src/tools.ts`). Run `bun run check`: every
   error the type-check names is a typed place in §3; answer each for the new
   kind. Then walk every untyped place in §3.
2. **Write the adapter.** Implement `Harness` (`packages/agent/src/harness.ts`)
   and its `HarnessSession`, and register it in
   `packages/agent/src/harnesses/index.ts`. When each session is a keeper
   process of its own, mark it so in `OWN_PROCESS`
   (`packages/agent/src/proc-id.ts:11`), give it a procId in `procIdFor` and
   `parseProcId`, and implement `SessiondAdoption`
   (`packages/agent/src/session.ts:292`).
3. **Declare what it can do.** Start its capabilities from `FULL_CAPABILITIES`
   (`packages/agent/src/harnesses/capabilities.ts:4`) and take away only what
   its column in §2.5 marks as a gap, with the reason in the cell.
4. **Close the workspace.** Before any work item runs on it: every shell
   command through the workspace's executor, every file tool judged by the
   workspace's policy (`BUILT_INS`, `packages/core/src/workspace-judge.ts:378`),
   every config file the harness loads from a folder and runs on the host in
   its entry of `HARNESS_CONFIG_EMPTY_BY`
   (`packages/core/src/clone-denies.ts:143`), and its logins in its entry of
   `HARNESS_CREDENTIALS` (`packages/core/src/paths.ts:1390`). A harness that
   cannot meet the `workspace-*` rows of §2.6 runs no work item.
5. **Fill its column here**: in every table of §2, the `file:line` where its
   adapter meets the row, or `—` with why it needs none.

## 2. What a harness must do

Cells are `file:line` under `packages/agent/src/harnesses/` unless they name
another folder. `—` is an optional member the adapter leaves out. Line
numbers drift; the identifier in the row is the stable name, and the check
holds the rows to it.

### 2.1 `Harness` members (`packages/agent/src/harness.ts`)

Claude Code's adapter is `ClaudeHarness` (`claude.ts`), OpenCode's
`OpencodeHarness` (`opencode.ts`), pi's `PiHarness` (`pi.ts`, extending
`PiProfile` in `pi-services.ts`).

| Row | Claude Code | OpenCode | pi |
|---|---|---|---|
| `abortSession` | — (a process per session) | `opencode.ts:5001`: aborts a server-held turn | — |
| `accountsChanged` | — (reads accounts afresh) | `opencode.ts:4541` | — |
| `auth` | `claude.ts:4884` | `opencode.ts:1858` | `pi-services.ts:939` |
| `authReason` | — (the report's own, `claude.ts:4910`) | `opencode.ts:3930` | `pi-services.ts:940` |
| `busyInstances` | — | `opencode.ts:3189` | — |
| `capabilities` | `claude.ts:4883` (`CLAUDE_CAPABILITIES`) | `opencode.ts:1857` (`OPENCODE_CAPABILITIES`) | `pi-services.ts:938` (`PI_CAPABILITIES`) |
| `catalogFromServer` | — | `opencode.ts:1856` | — |
| `deleteSession` | `claude.ts:5531` | `opencode.ts:6271` | `pi-services.ts:1206` |
| `detect` | `claude.ts:4901` | `opencode.ts:3555` | `pi-services.ts:967` |
| `dispose` | — | `opencode.ts:6307` | `pi-services.ts:1215` |
| `endSession` | — | `opencode.ts:5034` | — |
| `fleetHoldings` | `claude.ts:5629` | — | `pi-services.ts:1290` |
| `fleetHome` | `claude.ts:5614` | `opencode.ts:6333` (`XDG_CONFIG_HOME`) | `pi-services.ts:1231` (`PI_CODING_AGENT_DIR`) |
| `fleetStatus` | `claude.ts:5625` | `opencode.ts:6461` | `pi-services.ts:1297` |
| `getSessionInfo` | `claude.ts:5446` | `opencode.ts:6106` | `pi-services.ts:1128` |
| `getSessionMessages` | `claude.ts:5473` | `opencode.ts:6137` | `pi-services.ts:1148` |
| `hubRestarted` | — | `opencode.ts:4501` | — |
| `kind` | `claude.ts:4882` | `opencode.ts:1854` | `pi-services.ts:937` |
| `listSessions` | `claude.ts:5402` | `opencode.ts:6072` | `pi-services.ts:1070` |
| `machine` | `claude.ts:5536` | `opencode.ts:6284` | `pi-services.ts:1219` |
| `providerList` | — | `opencode.ts:4527` | — |
| `readTranscriptWindow` | `claude.ts:5494` | `opencode.ts:6175` | `pi-services.ts:1183` |
| `reattach` | `claude.ts:5134` | `opencode.ts:5244` | `pi.ts:111` |
| `renameSession` | `claude.ts:5511` | `opencode.ts:6245` | `pi-services.ts:1200` |
| `restartHolds` | — | `opencode.ts:3156` | — |
| `serversRunning` | — | `opencode.ts:5184` | — |
| `sessionAddresses` | — | `opencode.ts:5194` | — |
| `sessionPresent` | — | `opencode.ts:5146` | — |
| `sessionsOn` | — (its procId names its one session) | `opencode.ts:5188` | — |
| `setCustodyReadiness` | — | `opencode.ts:3112` | — |
| `signInFaults` | — | `opencode.ts:3623` | — |
| `spawn` | `claude.ts:5021` (Agent SDK child under sessiond) | `opencode.ts:5535` (an account's server under sessiond, over HTTP) | `pi.ts:31` (a pi host under sessiond) |
| `spill` | `claude.ts:4999` | `opencode.ts:5527` | `pi.ts:23` |
| `storedRun` | `claude.ts:5459` | `opencode.ts:6087` | `pi-services.ts:1102` |
| `syncFleet` | `claude.ts:5618` | `opencode.ts:6337` | `pi-services.ts:1241` |
| `tagSession` | `claude.ts:5522` | `opencode.ts:6262` (a sidecar, `opencode.ts:1159`) | `pi-services.ts:1203` |
| `unclaimedRunners` | — | `opencode.ts:5204` | — |

### 2.2 `HarnessSession` members (`packages/agent/src/harness.ts`)

Claude Code's is `ClaudeSession` (`claude.ts`), OpenCode's `OpencodeSession`
(`opencode-session.ts`), pi's the daemon's `PiRemoteSession`
(`pi-sessiond.ts`), which speaks to the pi host's own `PiSession`
(`pi-runtime.ts:899`).

| Row | Claude Code | OpenCode | pi |
|---|---|---|---|
| `attached` | `claude.ts:3501` | `opencode-session.ts:752` | `pi-sessiond.ts:440` |
| `control` | `claude.ts:3898` | `opencode-session.ts:3321` | `pi-sessiond.ts:513` |
| `dispose` | `claude.ts:4723` | `opencode-session.ts:3661` | `pi-sessiond.ts:568` |
| `endedForMove` | `claude.ts:3773` | — | — |
| `harness` | `claude.ts:2400` | `opencode-session.ts:753` | `pi-sessiond.ts:206` |
| `heldForLater` | `claude.ts:3737` | — | — |
| `heldSince` | `claude.ts:3732` | — | — |
| `holding` | `claude.ts:3689` | `opencode-session.ts:1033` | `pi-sessiond.ts:504` |
| `interrupt` | `claude.ts:4662` | `opencode-session.ts:3551` | `pi-sessiond.ts:552` |
| `noteStopped` | — | `opencode-session.ts:3579` | — |
| `outdated` | `claude.ts:2889` | — | — |
| `processId` | `claude.ts:3610` | `opencode-session.ts:756` | `pi-sessiond.ts:256` |
| `resolvePermission` | `claude.ts:4615` | `opencode-session.ts:2196` | `pi-sessiond.ts:556` |
| `send` | `claude.ts:3809` | `opencode-session.ts:2865` | `pi-sessiond.ts:491` |
| `sessionId` | `claude.ts:2401` | `opencode-session.ts:783` | `pi-sessiond.ts:207` |
| `stop` | `claude.ts:4676` | `opencode-session.ts:3642` | `pi-sessiond.ts:562` |
| `tables` | `claude.ts:3681` | `opencode-session.ts:1018` | — |
| `withdrawPermission` | `claude.ts:4643` | `opencode-session.ts:2192` | `pi-sessiond.ts:559` |

### 2.3 `HarnessContext` members (`packages/agent/src/harness.ts`)

What the supervisor hands `spawn`. A cell is the first place the adapter
reads or calls the member; `—` is a member it has no use for.

| Row | Claude Code | OpenCode | pi |
|---|---|---|---|
| `boundary` | `claude.ts:1434` (`CLAUDE_CODE_SHELL_PREFIX`, and the judge hook) | — (its plugin's `shell` and judge, §2.6 `workspace-shell`) | `pi-sessiond.ts:432` |
| `browserDoor` | `claude.ts:2080` | — | `pi-sessiond.ts:188` |
| `busy` | `claude.ts:3070` | `opencode-session.ts:1259` | `pi-sessiond.ts:396` |
| `closed` | `claude.ts:3226` | `opencode-session.ts:2625` | `pi-sessiond.ts:342` |
| `containerEnv` | `claude.ts:1448` | `opencode-session.ts:3517` | `pi-sessiond.ts:601` |
| `cwd` | `claude.ts:2195` | `opencode.ts:5775` | `pi-sessiond.ts:183` |
| `died` | `claude.ts:359` | — | `pi-sessiond.ts:329` |
| `emit` | — | `opencode.ts:5487` | — |
| `failed` | `claude.ts:354` | `opencode-session.ts:952` | `pi-sessiond.ts:299` |
| `frame` | `claude.ts:2919` | `opencode-session.ts:1044` | `pi-sessiond.ts:377` |
| `hostTmp` | `claude.ts:1443` | `opencode-session.ts:3520` | `pi-sessiond.ts:610` |
| `ingested` | `claude.ts:5146` | — | `pi.ts:122` |
| `instanceId` | `claude.ts:1451` | `opencode.ts:5248` | `pi-sessiond.ts:191` |
| `keeperRefused` | `claude.ts:2381` | — | `pi-sessiond.ts:463` |
| `mcpGate` | `claude.ts:2070` | — (its gate form, `opencode.ts:328`) | `pi-sessiond.ts:184` |
| `permission` | `claude.ts:2836` | `opencode-session.ts:2064` | — (no permission modes) |
| `permissionResolved` | `claude.ts:2831` | `opencode-session.ts:1543` | — |
| `recordSessionAddress` | — | `opencode.ts:5874` | — |
| `refused` | `claude.ts:3462` | — | — |
| `rejected` | `claude.ts:3813` | `opencode-session.ts:2952` | `pi-sessiond.ts:303` |
| `session` | `claude.ts:3142` | `opencode.ts:6012` | `pi-sessiond.ts:296` |
| `sessionCredential` | `claude.ts:1452` (an MCP config file, off argv) | — | `pi-runtime.ts:1638` |
| `workspace` | `claude.ts:2377` | `opencode-session.ts:3521` | `pi-sessiond.ts:586` |

### 2.4 `SessiondAdoption` members (`packages/agent/src/session.ts`)

For a harness whose every session is a keeper process of its own: how the
agent takes a running session back after its own restart. OpenCode's
sessions live in a server the agent reattaches to instead (`reattach`).

| Row | Claude Code | OpenCode | pi |
|---|---|---|---|
| `adopt` | `claude.ts:5218` | — (server custody) | `pi.ts:103` |
| `custodyCandidates` | `claude.ts:5388` | — | `pi.ts:84` |
| `custodyKeepers` | `claude.ts:5365` | — | `pi.ts:65` |
| `custodyReading` | `claude.ts:5371` | — | `pi.ts:71` |
| `turnRunning` | `claude.ts:5166` | — | `pi.ts:93` |

### 2.5 `FULL_CAPABILITIES` flags (`capabilities.ts`)

Claude Code's is `FULL_CAPABILITIES` itself (`claude.ts:989`); OpenCode's is
the same but `tasks` (`opencode.ts:1154`); pi's is its own list
(`pi-services.ts:206`). A flag that is false hides or refuses the feature for
that harness.

| Row | Claude Code | OpenCode | pi |
|---|---|---|---|
| `interrupt` | true | true | true |
| `permissionModes` | all five | all five (`fullSend` not offered in the iOS picker, `NewSessionPickers.swift:430`) | none |
| `setModel` | true | true | true |
| `effort` | true | true | false |
| `contextUsage` | true | true | true |
| `supportedModels` | true | true | true |
| `supportedCommands` | true | true | true |
| `reloadSkills` | true | true | false |
| `mcpStatus` | true | true | true |
| `mcpControl` | true | true | false |
| `listSessions` | true | true | true |
| `getSessionMessages` | true | true | true |
| `renameSession` | true | true | false |
| `deleteSession` | true | true | true |
| `fork` | true | true | true |
| `rewind` | true | true | false |
| `tagSession` | true | true | false |
| `skills` | true | true | true |
| `subagents` | true | true | false |
| `tasks` | true | false | false |
| `compaction` | true | true | true |
| `costUsd` | true | true | false |
| `thinking` | true | true | true |
| `images` | true | true | true |
| `handoff` | true | true | true |
| `hooks` | true | true | true |
| `plugins` | true | true | false |
| `fleet` | true | true | true |

### 2.6 Rows with no single identifier

What the invariant asks that no one member carries. The check does not
read this table; a new harness fills it all the same.

| Row | Claude Code | OpenCode | pi |
|---|---|---|---|
| `workspace-shell` | the shell prefix (`CLAUDE_CODE_SHELL_PREFIX`, `claude.ts:1437`; `claudePrefixScript`, `packages/agent/src/boundary.ts:618`) | its plugin's `shell`, through the workspace's executor (`opencode-plugin.ts`) | `sessionBash` (`pi-runtime.ts:258`) |
| `workspace-files` | the judge hook (`packages/agent/src/boundary-judge.ts:199`) | the judge in its plugin (`opencode-plugin.ts:288`) | `boundedFileTools` (`pi-runtime.ts:291`, judging at `:306`) |
| `workspace-config` | its entry of `HARNESS_CONFIG_EMPTY_BY` (`.claude/*`, `.mcp.json`) | its entry (`opencode.json(c)`, `.opencode`) | its entry (`.pi`, and `.agents/skills`, which OpenCode reads too) |
| `credentials` | its entry of `HARNESS_CREDENTIALS` | its entry | its entry |
| `mcp-gate` | `claude.ts:2070` | the gate form its plugin judges with (`opencode.ts:328`) | `pi-runtime.ts:1657` |
| `browser-door` | `claude.ts:2080` | — | `pi-runtime.ts:1663` |
| `sessiond-custody` | a child under sessiond (§2.4) | an account's server under sessiond (`reattach`) | a pi host under sessiond (§2.4) |
| `permission-modes` | the SDK's `permissionMode` and `canUseTool`; `fullSend` is the CLI's `bypassPermissions` (`claude.ts:1500`) | its permission ruleset (`#rules`, `opencode-session.ts:1071`) | none |
| `questions` | `AskUserQuestion` denied for CawCo's `ask` (`NATIVE_TOOLS.questions`, `packages/core/src/delegate-types.ts:268`) | `question`, denied the same | none |
| `tool-denials` | `disallowedTools` (`claude.ts:2700`) | permission rules (`opencodeToolsFor`) | `piToolsFor` (`pi-runtime.ts:1701`) |
| `cawco-mcp` | HTTP with its bearer in a private file (`packages/agent/src/claude-mcp-config.ts`) | its plugin's `cawco_*` tools | the host's own list (`pi-runtime.ts:1427`) |
| `fleet-hooks` | settings hooks | CawCo's plugin (`HOOK_EVENTS_ON.opencode`, `opencode-plugin.ts:88`) | an inline extension (`HOOK_EVENTS_ON.pi`, `pi-runtime.ts:569`) |
| `instruction-files` | `withInstructions` (`claude.ts:2018`) | `instructionEntries` (`opencode-session.ts:405`) | `agentsFilesOverride` (`pi-runtime.ts:1687`) |
| `clean-session` | `CLEAN_OPTIONS`, `settingSources: []` (`claude.ts:1678`) | refused (`CLEAN_START_REFUSAL`, `packages/core/src/harness.ts:105`) | `noContextFiles` (`pi-runtime.ts:793`) |
| `transcripts` | JSONL (`claude-transcript.ts`) | its database (`opencode-transcript.ts`) | session files |
| `fork-rewind` | `resume.fork` / `resume.atMessage` (`claude.ts:2717`) | `opencode.ts:5572` | `pi-runtime.ts:1623` |

## 3. Places outside the adapters that name a harness

**typed**: a `Record<HarnessKind, …>`, a `satisfies Record<HarnessKind, …>`,
`everyOf<…>()`, a type derived per kind, or a switch ending in `unhandled()`
or `satisfies never`; adding a kind fails the type-check there until it is
answered. **untyped**: the new kind silently takes a branch, which must be
read; each says why it stays so. **generated**: follows its source when its
generator runs (`bun run check` names the stale ones).

A branch that tests one kind for that harness's own mechanism (Claude Code's
SDK result frames and accounts, OpenCode's shared server) stays a
comparison: every other kind takes the other branch, which is right unless
the new harness shares that mechanism. Those places are listed by file with
the §2 row that says whether the new harness shares it.

### 3.1 core (`packages/core/src`)

| Place | What a new kind needs there | Enforced |
|---|---|---|
| `harness.ts:36` `HARNESSES` | the kind, in bring-up order | source |
| `harness.ts:44` `HARNESS_TOOL` | its tool catalog id | typed |
| `harness.ts:105` `CLEAN_START_REFUSAL` | why it cannot start clean, or none (`clean-session`) | typed |
| `harness.ts:163` `PERMISSION_MODES` | nothing; which it offers is its `permissionModes` (§2.5) | per-adapter |
| `tools.ts:358`, `:516`, `:595` `TOOL_CATALOG` entries | a catalog entry: install, version gate, sign-in probe | untyped: keyed by tool id; `HARNESS_TOOL` is the typed link to it |
| `delegate-types.ts:253` `NATIVE_TOOLS` | its own subagent, todo and question tools, which every CawCo session is denied | typed |
| `delegate-types.ts:381` `HARNESS_TOOLS` | its tool names per class (shell, edit, fetch, search) | typed |
| `delegate-types.ts:483` `BOARD_ONLY_DENIED_TOOLS`, `CURATOR_DENIED_TOOLS` | its names | typed |
| `delegate-types.ts:704` `denyToolsProblem` | how a type's denied tools map to its names | typed (switch to `unhandled`) |
| `hooks.ts:417` `HookHarness`, `HOOK_EVENTS_ON`, `HOOK_TOOL_NAMES` | the hook events it raises and its tool names in Claude Code's words | typed (every kind but Claude Code) |
| `hooks.ts:590` `hookUnsupported` | its name (`accountsWords.harnesses`) | typed |
| `workspace-judge.ts:338` `SESSION_KEEPS` | what it keeps for the session to read back (its spill or transcript folder) | typed |
| `workspace-judge.ts:378` `BUILT_INS` | every file tool and its path fields | typed |
| `workspace-judge.ts:518` `CAWCO_PREFIX` | its CawCo tool prefix, or none | typed |
| `clone-denies.ts:143` `HARNESS_CONFIG_EMPTY_BY` | every config path it loads from a folder and runs on the host: **security** | typed |
| `paths.ts:1390` `HARNESS_CREDENTIALS` | its logins on the host, which no workspace reads: **security** | typed |
| `model-names.ts:238` `modelListed` | how a bare model id is accepted | typed (`unhandled`) |
| `model-names.ts:299` `modelListingOn` | Claude Code's models are its accounts' catalogs; every other harness's are its machine report's | untyped: one mechanism (`models-effort`) |
| `accounts.ts:93` `HomeStore` | a machine's own sign-in store | typed (every kind) |
| `accounts.ts:1100` `providersOpenedBy`, `:1125` `accountProvidersOf` | which account providers its models bill to | untyped: take any string from the wire; Claude Code's and OpenCode's own id rules |
| `accounts.ts:1399` `AccountMove.compactBy` | nothing: every kind but Claude Code | typed (derived) |
| `stored-shapes.ts` | the stored schemas | generated (`bun run stored-shapes` in packages/hub) |
| `protocol.ts:730` `chosenModes`; `protocol.ts:798` `opencode: boolean` | nothing | data: absent for a harness never started; OpenCode's server custody |
| `usage/types.ts:10` `UsageScanned` | whether CawCo scans its usage and limits | typed; `UsageHarness` derives from it |
| `binary-updates.ts:108` `"opencode"` restart-hold kind | nothing | untyped: OpenCode's server operations, not a harness kind |
| `harness-refusal.ts:86` | nothing | untyped: Claude Code's accounts sign in through its CLI |
| `words/accounts.ts:106` `harnesses` | its name in a sentence | typed |
| `words/harness.ts` | its refusal and not-installed words | untyped: words, reached through the typed places |
| `hub-routes.gen.ts` | the hub's routes | generated (`bun run route-types` in packages/hub) |

### 3.2 agent (`packages/agent/src`, outside `harnesses/`)

| Place | What a new kind needs there | Enforced |
|---|---|---|
| `harnesses/index.ts` | `registerHarness` | — |
| `proc-id.ts:11` `OWN_PROCESS` | whether each session is a keeper process of its own | typed; `SessionProcKind`, `SESSION_PROC_KINDS` and `isSessionProc` derive from it |
| `proc-id.ts:63` `procIdFor`; `parseProcId` | its procId prefix, for a kind of its own process | typed (`satisfies never`); `parseProcId` reads the prefix by hand |
| `sessiond-custody.ts:64` `ChildActivity.read` | how its keeper's ring says a turn runs | typed (`unhandled`) |
| `boundary.ts:6558`, `daemon.ts:1596`, `session.ts:3015`, `:3228`, `:4142`, `:4431`, `:7180` | nothing: they read `isSessionProc` | derived |
| `first-session.ts:60` `SPILLING` | whether its sessions keep a spill folder | typed |
| `capabilities.ts:275` `harnessItems` | its CLI as a machine capability, with install advice | typed |
| `provider-accounts.ts:1250` `STORE_ENTRY` | how an entry of its own sign-in store is read | typed |
| `session.ts:6408` `hooksByHarness` | nothing | data: filled per harness that reported |
| `session.ts` (14), `daemon.ts` (5), `first-session.ts:115`, `capabilities.ts:198`, `provider-accounts.ts:1271`, `usage/scanner.ts:562` | nothing unless it shares the mechanism | untyped: one harness's own mechanism (Claude Code's result frames, version gate and first session; OpenCode's server custody and usage DB; `sessiond-custody`, `transcripts`) |
| `stores/opencode-reads.ts`, `image-providers/antigravity.ts` | nothing | OpenCode's and Antigravity's own stores |

### 3.3 hub (`packages/hub/src`)

| Place | What a new kind needs there | Enforced |
|---|---|---|
| `delegation-tools.ts:337` `NO_REPLY_WORDS` | how its turn ends at a no-reply call | typed |
| `push.ts:702` `HARNESS_NAMES` | its name in a push | typed |
| `placement.ts:115` `harnessName` | nothing: `accountsWords.harnesses` | typed |
| `memory.ts:327` `ENDS_WITH_CALL` | whether its subagent ends with its call's result | typed |
| `at-limit.ts:383` `OWN_COMPACT` | whether its own `/compact` runs a move's compaction | typed |
| `server.ts:1741` `homeStore` | nothing: every `HomeStore` | typed (`everyOf`) |
| `delegation-mcp.ts:468` | nothing | untyped: OpenCode's shared discovery is a connection with no session |
| `db/schema.ts:2472`, `db/index.ts` usage buckets | nothing | typed through `UsageHarness` |
| `server.ts` (50), `session-lifecycle.ts` (5), `keep-alive.ts` (2), `accounts.ts` (2), `db/index.ts` (3) | nothing unless it shares the mechanism | untyped: one harness's own mechanism (Claude Code's moves, keep-alive, version gate, transcripts, context windows and account scope; OpenCode's server sessions) |
| `scripts/openapi.ts` → `apps/apple/…/CawCoAPI/openapi.json` `HarnessKind` | the enum | generated |

### 3.4 dashboard (`apps/dashboard/src`)

| Place | What a new kind needs there | Enforced |
|---|---|---|
| `lib/cawco/HarnessLogo.svelte:17` `MARKS` | its mark | typed |
| `lib/cawco/permission-modes.ts:52` `DESCRIPTIONS`, `:169` `FULL_SEND` | what each mode means on it, or none | typed |
| `lib/cawco/spawn/ToolChips.svelte:22`, `workspace/SessionDetails.svelte:258`, `transcript/speaker.ts` | its name | typed |
| `accounts/AtLimitBlock.svelte:73`, `accounts/model.svelte.ts:101`, `config/editors/DelegateTypeEditor.svelte:211`, `config/editors/RuleEditor.svelte:452` | nothing: they map `HARNESSES` | derived |
| `usage/WhereItGoes.svelte:55`, `usage/History.svelte:26`, `routes/(app)/usage/+page.svelte:102` | nothing: they read `UsageHarness` | typed (`everyOf`) / derived |
| `usage/History.svelte`, `usage/WhereItGoes.svelte`, `usage/forecast.svelte.ts` comparisons | its words, once its usage is scanned | untyped: two-way between Claude Code's API price and OpenCode's spend |
| `client.svelte.ts` (2), `harness-block.svelte.ts`, `machine.ts` (2), `models.svelte.ts` (3), `session-export.ts` (2), `spawn/NewSessionForm.svelte` (2), `transcript/Composer.svelte`, `transcript/MessageRow.svelte`, `workspace/SessionDetails.svelte` (2), `decides/preview/setup-records.ts` | nothing unless it shares the mechanism | untyped: one harness's own mechanism (Claude Code's accounts, catalogs, refusal shape, queued sends and cost; OpenCode Go's limits) |

### 3.5 iOS (`apps/apple/Packages/CawCoKit/Sources`)

None is typed against `HarnessKind`; each is a string list or map, walked by
hand.

| Place | What a new kind needs there |
|---|---|
| `CawCoCore/SpawnModels.swift:28`, `:32` | harness list and names |
| `CawCoScreens/NewSession/NewSessionModel.swift:359` | picker row |
| `CawCoScreens/NewSession/NewSessionPickers.swift:419`, `:430` | mode descriptions, modes not offered |
| `CawCoScreens/NewSession/NewSessionPrompt.swift:275`, `CawCoDesign/Glyph.swift:271`, `:321` | mark |
| `CawCoCore/Accounts.swift:210`, `CawCoCore/AskEnd.swift:40`, `CawCoCore/Notices.swift:421`, `CawCoCore/UsagePage.swift:314`, `CawCoTranscript/TranscriptView.swift:722` | names |
| `CawCoScreens/Workspace/SessionDetailsController.swift:265`, `CawCoCore/UsagePage.swift:63` | usage per harness |
| `CawCoAPI/OpenEnums.swift`, `CawCoAPI/openapi.json`, `CawCoCore/Words.generated.swift` | generated |

### 3.6 Other packages

| Place | What a new kind needs there | Enforced |
|---|---|---|
| `packages/jsonl-parser/src/docs.ts:15` `FILE_HARNESSES` | a parser for its transcripts, for transcript search | untyped: the parser's own ids (`claude-code`, `pi`); it does not depend on core |
| `packages/icons/src/marks.ts` | its mark | — |
| `packages/sessiond`, `packages/cli`, `packages/auth` | nothing | name no harness |
