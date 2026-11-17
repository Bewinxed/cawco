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

1. **Write the descriptor.** Copy the shape of `claude.ts`, `opencode.ts` or
   `pi.ts` beside it, with `as const satisfies HarnessDescriptor<"<kind>">`,
   and its words in `packages/core/src/words/harness-plugins.ts`, written to
   DESIGN.md's Words section. Register it in `HARNESS_PLUGINS`.
2. **Write the adapter.** Implement `Harness<"<kind>">` and its sessions'
   `HarnessSession`, and register it in `ADAPTERS`. Read Claude Code's
   (`claude.ts`), OpenCode's (`opencode.ts`, `opencode-session.ts`) and
   pi's (`pi.ts`, `pi-services.ts`, `pi-sessiond.ts`) beside each member you
   write.
3. **Run `bun run check`** until it passes. The type-checker names the
   missing descriptor fields and adapter members (the first four and a
   count per error, and every read of a missing field where it is read), and
   each switch over a tag that a new value needs. Fill each.
4. **Set its capabilities.** Start from `FULL_CAPABILITIES`
   (`packages/agent/src/harnesses/capabilities.ts`) and turn off only what it
   cannot do, each with its reason, as `OPENCODE_CAPABILITIES` and
   `PI_CAPABILITIES` do.
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
the lint rule; and the wire names OpenCode and pi in a few fields of its
own (a machine's providers, its OpenCode custody).
The iOS app (`apps/apple/Packages/CawCoKit`) keys harnesses by string and is
on hold.

## Parts no single member covers

Each says what must hold and which descriptor field or adapter member
carries it.

**Workspace boundary, shell.** Every shell command of a work item runs
through the workspace's executor, inside the boundary: Claude Code through
its shell prefix (`CLAUDE_CODE_SHELL_PREFIX`), OpenCode through CawCo's
plugin's `shell`, pi through `sessionBash`.

**Workspace boundary, files.** Every file tool and its path arguments are
judged by the workspace's policy, whose table of each harness's file tools is
`BUILT_INS` in the standalone judge. A host that keeps the judge it started
with records its gate form (`packages/agent/src/gate-form.ts`) and is
relaunched at rest when the form changes.

**Clone denies (security).** Every config file the harness loads from a
folder and runs on the host is emptied in a workspace: descriptor
`cloneConfig`. Its logins on the host are unreadable from a workspace:
descriptor `credentialPlaces`. A path left out of either runs a clone's
config on the host or hands its credential to a workspace. A harness that
trusts a folder by itself (Codex's app-server does, for any folder it starts
a writable thread in) is told the clone is untrusted before its first
thread (agent `harnesses/codex-home.ts` `prepareHome`).

**CawCo MCP and fleet MCP.** The session reaches CawCo's tools with its own
credential (`HarnessContext.sessionCredential`), kept off argv. In a
workspace it starts no fleet server with a command itself: each comes
through the workspace's MCP gate (`HarnessContext.mcpGate`), which runs it on
the host, and chrome-devtools through the browser door
(`HarnessContext.browserDoor`). How its calls name a server is descriptor
`callNaming`.

**Permission modes and asks.** Whether it takes modes is descriptor
`permissionModes`; which it takes, its `permissionModes` capability, drawn
from `PERMISSION_MODES` (`packages/core/src/harness/modes.ts`); what each
means there, descriptor `words.modes` and `words.fullSend`. A mode means the
same on every harness that offers it. Its own question, to-do and subagent
tools are denied so CawCo's `ask` and delegation are the one route:
descriptor `nativeTools`; a denied-tool list, written in Claude Code's names,
reaches it as descriptor `deniedTools` says.

**A harness pinned to one release.** One whose adapter speaks a protocol
its release generates (Codex's app-server) pins that release in its catalog
entry (`exactVersion`) and moves only with its generated types and its
scripted-model check: `bun scripts/codex-protocol.ts --check` and
`bun scripts/codex-check.ts`.

**Custody under sessiond.** A running session survives an agent restart.
Descriptor `custody` says how: `keeper`, a process per session under
sessiond, named with descriptor `procIdPrefix`, adopted through the
adapter's `SessiondAdoption`; or `server`, one server per account holding
many sessions, reattached through `Harness.reattach`.

**Accounts and sign-in.** A session runs on one account or the machine's
own sign-in. Descriptor `accountDir` says whether an account is a config dir
(and so whether a session's conversation is carried between accounts,
`Harness.carrier`); `homeLogin` and `soleProvider` what the machine's own
sign-in is; `storeOAuthProviders` how its store names an OAuth provider.

**Fleet config placement.** The hub's fleet config (skills, memory, hooks,
MCP servers, plugins, subagents) lands in files of CawCo's own under its data
dir (`Harness.syncFleet`, `Harness.fleetHome`), and each session takes it
through its own launch. Nothing is written into the person's own agent
config. Who runs the fleet's hooks, on which events and with which tool
names, is descriptor `hooks`.

**Stored sessions and transcripts.** Sessions run outside CawCo list, read
back and resume as they ran (`listSessions`, `readTranscriptWindow`,
`storedRun`), and a name given to one is kept in the harness's own store
(`renameSession`); transcript search parses its format
(`packages/jsonl-parser`). What a listing proves is descriptor
`listsAllConversations` and `catalogProvesGone`.

**Clean sessions.** A clean session starts with no instruction files,
memory, skills or hooks, or the harness refuses it: descriptor
`cleanStartRefused`, its words.
