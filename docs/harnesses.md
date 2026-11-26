# Adding a harness

**The invariant.** Everything CawCo knows about one harness lives in that
harness's plugin, and the TypeScript compiler names everything a new plugin
is missing. Code outside the plugins asks the plugin; it never compares a
harness kind to a name.

A plugin is two halves:

- **The descriptor** (`packages/core/src/harness/<kind>.ts`, typed by
  `HarnessDescriptor` in `descriptor.ts`): what the harness is. Plain data,
  wire-safe, read by the hub, core, the agent and the dashboard. Every field
  is required; a capability the harness lacks is an explicit value
  (`{ lacks: "…" }`, `null`, `false`, an empty list) with its reason beside
  it. Where a behaviour differs by harness, the field is a tag
  (`unlistedModels`, `callNaming`, `deniedTools`, `hooks`,
  `credentialPlaces`) and the module that owns the mechanism switches on
  the tag, ending in `unhandled()`.
- **The adapter** (`packages/agent/src/harnesses/`, typed by `Harness` and
  `HarnessSession` in `packages/agent/src/harness.ts`): what the harness
  does on a machine. Every member is required; an operation the harness
  cannot run is a member that refuses with its reason (`cannot(why)`,
  `noCarry(why)`), and a query with nothing to report answers empty.

The registry derives everything else: `HARNESS_PLUGINS` in
`packages/core/src/harness/kinds.ts` gives `HARNESSES` and `HarnessKind`;
`ADAPTERS` in `packages/agent/src/harnesses/index.ts` maps each kind to its
adapter. The lint rule `scripts/lint/no-harness-compare.grit` refuses a
harness name compared, switched on, looked for or looked up outside the two
plugin folders.

## Steps

1. **Write the descriptor.** Copy the shape of `claude.ts`, `opencode.ts`,
   `pi.ts`, `codex.ts` or `agy.ts` beside it, with `as const satisfies HarnessDescriptor<"<kind>">`,
   and its words in `packages/core/src/words/harness-plugins.ts`, written to
   DESIGN.md's Words section. Register it in `HARNESS_PLUGINS`.
2. **Write the adapter.** Implement `Harness<"<kind>">` and its sessions'
   `HarnessSession`, and register it in `ADAPTERS`. Read Claude Code's
   (`claude.ts`), OpenCode's (`opencode.ts`, `opencode-session.ts`) and
   pi's (`pi.ts`, `pi-services.ts`, `pi-sessiond.ts`) beside each member you
   write; for a harness that runs its tools itself on the host, Antigravity's
   (`agy.ts`, `agy-sessiond.ts`, `agy-runtime.ts`).
3. **Run `bun run check`** until it passes. The type-checker names the
   missing descriptor fields and adapter members (the first four and a
   count per error, and every read of a missing field where it is read), and
   each switch over a tag that a new value needs. Fill each.
4. **Set its capabilities.** Start from `FULL_CAPABILITIES`
   (`packages/agent/src/harnesses/capabilities.ts`) and turn off only what it
   cannot do, each with its reason, as `OPENCODE_CAPABILITIES`,
   `PI_CAPABILITIES`, `CODEX_CAPABILITIES` and `AGY_CAPABILITIES` do.
5. **Meet every part below** before any work item runs on it. A harness that
   cannot close the workspace boundary runs no work item.

The places that still key a table by harness, each typed so a new kind fails
to compile until it is filled: the dashboard's marks (`HarnessLogo.svelte`,
pictures that cannot live in core), the workspace judge's file tools
(`packages/core/src/workspace-judge.ts`, a standalone script that imports
nothing), the usage scanner's sources (`UsageHarness`, for a descriptor whose
`usage` is scanned) and the home credential stores' readers
(`CredentialStoreKind`, for a descriptor whose `homeLogin` is
`credentials`). The daemon still reaches three harnesses by name for beats
of their own (OpenCode's file watch and providers, pi's credential check,
Claude Code's re-read on a version answer and a keychain unlock), named in
the lint rule; the hub's Codex home sign-out and its keep select Codex's
rows by `CODEX.kind`, while which sign-ins a session runs on is read from
`homeLogin` and core traits.ts `SELF_SIGNIN` (`signsInApart`; core
accounts/harness-signins.ts `harnessSignins`, over `ApartSignins`, a table
keyed by each such kind); and the wire names OpenCode and pi in a few fields
of its own (a machine's providers, its OpenCode custody).
The iOS app (`apps/apple/Packages/CawCoKit`) keys harnesses by string and is
on hold.

## Parts no single member covers

Each says what must hold and which descriptor field or adapter member
carries it.

**Workspace boundary, shell.** Every shell command of a work item runs
through the workspace's executor, inside the boundary: Claude Code through
its shell prefix (`CLAUDE_CODE_SHELL_PREFIX`), OpenCode through CawCo's
plugin's `shell`, pi through `sessionBash`, Antigravity through the one `PreToolUse` hook
CawCo writes into each session's agy dir (agent `harnesses/agy-hook.ts` `writeAgyHook`),
whose session judge rewrites each `run_command` to the executor
(`agy-judge.ts` `agyAnswer`). A harness that runs its tools itself proves
the rewrite on every call: Antigravity's host stops the session when a
workspace command ran unjudged, or ran rewritten without agy's notice of
the rewrite on its output (`agy-runtime.ts` `#proven`, `agy-frames.ts`
`carriesHookNotice`). It also proves its hook holds on each account before
a session there starts: one scratch prompt whose command the judge rewrites
and whose write it denies, the verdict kept per account, sign-in method and
agy version (`agy-canary.ts` `agyHookHeld`, run by `agy-sessiond.ts`
`spawnAgy`).

**Workspace boundary, files.** Every file tool and its path arguments are
judged by the workspace's policy, whose table of each harness's file tools is
`BUILT_INS` in the standalone judge; Antigravity's are judged by the same
hook's judge (`BUILT_INS.agy`). A host that keeps the judge it started
with (pi's, Antigravity's, OpenCode's server) records its gate form
(`packages/agent/src/gate-form.ts`) and is relaunched at rest when the form
changes. A harness that reads what lies in its temp dir runs a workspace
session on one of its own, outside the workspace (Antigravity: agent
`agy-launch.ts` `agyLaunch`, its `bounded` launch).

**Clone denies (security).** Every config file the harness loads from a
folder and runs on the host is emptied in a workspace: descriptor
`cloneConfig`. Each descriptor names every path it reads, even one another
descriptor names: core `clone-denies.ts` stands a shared path in once
(read-only if any descriptor holds it so) and a path under another's dir
not at all, since the dir's bind holds it. Its logins on the host are unreadable from a workspace:
descriptor `credentialPlaces`. A path left out of either runs a clone's
config on the host or hands its credential to a workspace. A harness that
trusts a folder by itself (Codex's app-server does, for any folder it starts
a writable thread in) is told the clone is untrusted before its first
thread (agent `harnesses/codex-home.ts` `prepareHome`). Antigravity's
`cloneConfig` holds every folder agy loads customization from (`.agents`,
`.agent`, `_agents`, `_agent`, `.gemini`) as an empty read-only dir and each
`codeium.yml` it searches upward for as a read-only `version: v1`; its
`credentialPlaces` is the person's `~/.gemini`.

**Instruction files and their includes.** What a harness reads as
instructions from a clone, and each file it includes, is judged as a read of
the session's own at every launch and before every send (core
`workspace-judge.ts` `INSTRUCTIONS`, `judgeInstructions`; agent `session.ts`
`holdInstructions`). A harness that builds a prompt on turns it starts
itself, which no send comes before, has those files held read-only in the
workspace from its first session there on (`INSTRUCTIONS` `held`,
`heldInstructions`; core `workspace-policy.ts` `workspaceDenies`), a missing
one standing in as an empty read-only dir. Antigravity is that harness: its
`AGENTS.md` and `GEMINI.md`, with each `@[label](path)` they include, are
held, since agy builds a prompt when a background command ends or a
one-time wake-up fires.

**Saved outputs.** A harness that saves an output too large for its model
keeps it where its session alone reads it: a spill folder of the
workspace's (descriptor `spills`, `Harness.spill`), or a dir its judge names
for that session (core `workspace-judge.ts` `Call.ownOutputs`: Antigravity's
conversation dir, `brain/<id>` in its home, which its host names once agy
opens the conversation).

**CawCo MCP and fleet MCP.** The session reaches CawCo's tools with its own
credential (`HarnessContext.sessionCredential`), kept off argv. In a
workspace it starts no fleet server with a command itself: each comes
through the workspace's MCP gate (`HarnessContext.mcpGate`), which runs it on
the host, and chrome-devtools through the browser door
(`HarnessContext.browserDoor`). Antigravity takes them all in `session/new`
(agent `agy-sessiond.ts` `mcpServersOf`), through its gate, never in
its agy dir's `mcp_config.json`, which agy would start outside it; a server
whose transport agy's ACP lacks (remote SSE) is left out. How its calls
name a server is descriptor `callNaming` (Antigravity's:
`mcp_<server>_<tool>`). The few CawCo tools a session loads upfront carry
every harness's always-load `_meta` key in `tools/list` (descriptor
`mcpAlwaysLoadKey`, hub `delegation-mcp.ts` `listedFor`). agy 1.5.18
declares MCP tools smallest first within a budget it shares across servers,
drops the rest, and ignores its key on servers taken in `session/new`; so
its appended words send the model to the shell for a CawCo tool it lacks
(`agy-runtime.ts` `APPEND`), where `cawco tool` acts as the session because
a harness's own commands carry the session's identity (agent
`harnesses/command-env.ts` `commandEnv`).

**Running.** A session reads running, and its work item too, on its
`system`/`init` frame naming its conversation (hub
`agent-socket/session-signals.ts`): Claude Code's CLI says it, and pi's,
OpenCode's, Antigravity's and Codex's adapters say it as each conversation
opens or is taken up again, through agent `harnesses/session-opened.ts`
`sessionOpened`.

**Permission modes and asks.** Whether it takes modes is descriptor
`permissionModes`; which it takes, its `permissionModes` capability, drawn
from `PERMISSION_MODES` (`packages/core/src/harness/modes.ts`); what each
means there, descriptor `words.modes` and `words.fullSend`. A mode means the
same on every harness that offers it. Its own question, to-do and subagent
tools are denied so CawCo's `ask` and delegation are the one route:
descriptor `nativeTools`; a denied-tool list, written in Claude Code's names,
reaches it as descriptor `deniedTools` says. Antigravity runs in agy's own
`default` mode with `always-proceed` (agent `agy-launch.ts`
`prepareAgyHome`), and its judge answers by CawCo's mode (`agy-judge.ts`
`MODE_ACTION`): a call the mode asks about is `force_ask`, which agy raises
as `session/request_permission` and the host parks as CawCo's ask
(`agy-runtime.ts`). The judge is an allowlist over core `harness/agy.ts`
`AGY_TOOLS`, so a tool a new agy release adds is denied until it is
classed there.

**A harness pinned to one release.** One whose adapter speaks a protocol
its release generates (Codex's app-server) pins that release in its catalog
entry (`exactVersion`) and moves only with its generated types and its
scripted-model check: `bun scripts/codex-protocol.ts --check` and
`bun scripts/codex-check.ts`. Antigravity is held to a floor instead:
its catalog entry's `minVersion` (core `tools.ts`), checked at every launch
(agent `agy-launch.ts` `agyToStart`); its host's state names the agy it
runs, so an agent that takes the host back reads it as outdated against
the machine's (core `harness/agy-host-state.ts` `version`).

**Custody under sessiond.** A running session survives an agent restart.
Descriptor `custody` says how: `keeper`, a process per session under
sessiond, named with descriptor `procIdPrefix`, adopted through the
adapter's `SessiondAdoption`; or `server`, one server per account holding
many sessions, reattached through `Harness.reattach`. Antigravity is
`keeper` (`agy:`): a host per session holding `agy acp` (agent
`agy-host.ts`, `agy-runtime.ts`), started by `agy-sessiond.ts` `spawnAgy`
and taken back by `adoptAgy`.

**Accounts and sign-in.** A session runs on one account or the machine's
own sign-in. Descriptor `accountDir` says whether an account is a config dir
(and so whether a session's conversation is carried between accounts,
`Harness.carrier`); `homeLogin` and `soleProvider` what the machine's own
sign-in is; `storeOAuthProviders` how its store names an OAuth provider.
Which harnesses an account's credential reaches is core `accounts.ts`
`accountRunsIn`: a provider a harness owns by `soleProvider` runs there
alone, any other in every harness that owns none. A harness whose
`homeLogin` is `none` is signed in by each account in a home of its own,
and core `harness/traits.ts` `SELF_SIGNIN` says whether that sign-in is
apart from the account's (Codex) or is the account's (Antigravity); core
`accounts/harness-signins.ts` `hasHarnessSignin` offers such a harness on a
machine only where an account is signed in for it there.

Antigravity runs on its own provider (`antigravity`) alone, by one of four
methods (core `harness/agy-account.ts` `AGY_METHODS`; agent
`agy-signin.ts`): `oauth-personal` through agy's own `--login`;
`oauth-business` through ACP `authenticate`, its redirect URL pasted back
when the browser is on another device; `gemini-api-key`, handed to agy at
launch and never written where agy reads; `agent-platform`, on the
machine's gcloud credentials and a Google Cloud project and location. Its
launch keeps the host from signing it in behind the account's back (agent
`agy-launch.ts` `agyEnvironment`): Google's, Gemini's, gcloud's, Vertex's
and agy's own variables stripped, `--disable-telemetry`,
`AGY_CLI_FORCE_FILE_TOKEN_STORAGE` so the sign-in lives in the home, a
session bus that is never there so no keyring is reached, and opener
stand-ins first on its `PATH` so no browser opens on the machine.

**Fleet config placement.** The hub's fleet config (skills, memory, hooks,
MCP servers, plugins, subagents) lands in files of CawCo's own under its data
dir (`Harness.syncFleet`, `Harness.fleetHome`), and each session takes it
through its own launch. Nothing is written into the person's own agent
config. Who runs the fleet's hooks, on which events and with which tool
names, is descriptor `hooks`. Antigravity's skills, held to the session's
starting set, and its memory with the session's own documents are placed
in each session's own agy dir (agent `agy-fleet.ts` `placeAgyFleet`,
`syncAgyFleet`), and its fleet hooks run through CawCo's one hook and ACP
client, handed Claude Code's payload (`agy-fleet-hooks.ts`
`AgyFleetHooks`), never as entries of agy's own `hooks.json`.

**Stored sessions and transcripts.** Sessions run outside CawCo list, read
back and resume as they ran (`listSessions`, `readTranscriptWindow`,
`storedRun`), and a name given to one is kept in the harness's own store
(`renameSession`); transcript search parses its format
(`packages/jsonl-parser`). What a listing proves is descriptor
`listsAllConversations` and `catalogProvesGone`.

Antigravity's home is one per account, under the account's dir (core
`paths/harnesses.ts` `agyAccountHome`), its app-data dir shared by that
account's sessions, each of which runs in a dir of its own (`agySessionDir`;
its launch, agent `agy-launch.ts` `agyLaunch`), removed with its
conversation. Its conversations are
read from agy's own files, every account's home and agy's own `~/.gemini`
alike, the latter read-only (`agy-store.ts` `listAgyConversations`;
`agy-history.ts`; search, `packages/jsonl-parser/src/agy.ts`). A name or a
tag goes in CawCo's note on the conversation, not agy's store
(`agy-notes.ts`). A delete removes every file agy keeps of it and lists the
id in the home's delete list, applied again before each launch there,
since agy can write its summaries back (`agy-store-files.ts`
`applyAgyDeletes`). A conversation the person started in agy's terminal
continues under agy's own settings and sign-in, never a work item's
(`agy-launch.ts` `agyOwnLaunch`). A call's result agy's ACP leaves out is
read from the transcript step its `PostToolUse` hook names
(`agy-transcript.ts` `writtenResult`). agy's ACP offers no fork and no
rewind (capabilities `fork`, `rewind`), so a fork is refused, and a
conversation Google refuses goes on in a new one that carries what was said
(`agy-carry.ts`).

**Clean sessions.** A clean session starts with no instruction files,
memory, skills or hooks, or the harness refuses it: descriptor
`cleanStartRefused`, its words. Antigravity refuses (`AGY_NOT_CLEAN`): agy
always loads `AGENTS.md`, `GEMINI.md` and `.agents`.
