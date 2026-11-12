# Adding a harness

**The invariant:** a CawCo session works the same whichever harness runs it,
delegates included. It takes the same sends, raises the same asks, reaches
the same CawCo and fleet tools, runs every shell command and file write of a
work item inside its workspace's boundary, survives an agent restart under
sessiond, and reads back as the same transcript. Where a harness cannot meet
a part, its capabilities say so and the product refuses or hides that
feature for it; it never half-does it.

The code is the list of what a harness provides: the `Harness`,
`HarnessSession` and `HarnessContext` interfaces in
`packages/agent/src/harness.ts`, `SessiondAdoption` in
`packages/agent/src/session.ts`, and `FULL_CAPABILITIES` in
`packages/agent/src/harnesses/capabilities.ts`, each member with its comment.
This page holds what the code cannot say: the order of the work, and the
parts that span several members.

## Steps

1. **Write the adapter.** Implement `Harness` and its `HarnessSession` in
   `packages/agent/src/harnesses/`, and register it in that folder's
   `index.ts`. Read Claude Code's (`claude.ts`), OpenCode's (`opencode.ts`,
   `opencode-session.ts`) and pi's (`pi.ts`, `pi-services.ts`,
   `pi-sessiond.ts`) beside each member you write.
2. **Name the kind.** Add it to `HARNESSES` in `packages/core/src/harness.ts`
   and run `bun run check`. The type-checker names every harness-keyed table
   (`Record<HarnessKind, …>`, `everyOf`, a switch ending in `unhandled()`);
   fill each one for the new kind. Two of them guard the host and are
   security: `HARNESS_CONFIG_EMPTY_BY` and `HARNESS_CREDENTIALS` (below).
3. **Read the comparisons it falls through.** Single-harness tests stay
   comparisons where they name one harness's own mechanism (Claude Code's
   SDK result frames, accounts and version gate; OpenCode's shared server).
   Find them with
   `git grep -nE '[!=]== "(claude|opencode|pi)"' -- packages apps/dashboard`
   and read each by file: the new kind takes the other branch, which is
   right unless it shares that mechanism. The iOS app
   (`apps/apple/Packages/CawCoKit`) keys harnesses by string; grep it for
   `"opencode"` and add the new kind beside each hit.
4. **Set its capabilities.** Start from `FULL_CAPABILITIES` and turn off only
   what it cannot do, each with its reason in a comment, as
   `OPENCODE_CAPABILITIES` and `PI_CAPABILITIES` do.
5. **Add its words.** Its name in `packages/core/src/words/accounts.ts`
   (`harnesses`), its refusals and not-installed text in
   `packages/core/src/words/harness.ts`, written to DESIGN.md's Words section.
6. **Meet every part below** before any work item runs on it. A harness that
   cannot close the workspace boundary runs no work item.

## Parts no single member covers

Each says what must hold, then where Claude Code, OpenCode and pi meet it.

**Workspace boundary, shell.** Every shell command of a work item runs
through the workspace's executor, inside the boundary.
Claude Code: the shell prefix, `CLAUDE_CODE_SHELL_PREFIX` set from
`claudePrefixScript` (`packages/agent/src/boundary.ts`).
OpenCode: CawCo's plugin's `shell` (`opencode-plugin.ts`).
pi: `sessionBash` (`pi-runtime.ts`).

**Workspace boundary, files.** Every file tool and its path arguments are
judged by the workspace's policy, whose table of each harness's file tools is
`BUILT_INS` (`packages/core/src/workspace-judge.ts`). A host that keeps the
judge it started with records its gate form (`packages/agent/src/gate-form.ts`)
and is relaunched at rest when the form changes.
Claude Code: the judge hook (`packages/agent/src/boundary-judge.ts`).
OpenCode: the judge in its plugin.
pi: `boundedFileTools` (`pi-runtime.ts`).

**Clone denies.** Every config file the harness loads from a folder and runs
on the host is emptied in a workspace: its entry of `HARNESS_CONFIG_EMPTY_BY`
(`packages/core/src/clone-denies.ts`). Its logins on the host are unreadable
from a workspace: its entry of `HARNESS_CREDENTIALS`
(`packages/core/src/paths.ts`).
Claude Code: `.claude/*`, `.mcp.json`. OpenCode: `opencode.json(c)`,
`.opencode`. pi: `.pi`, and `.agents/skills`.

**CawCo MCP and fleet MCP.** The session reaches CawCo's tools with its own
credential (`HarnessContext.sessionCredential`), kept off argv. In a
workspace it starts no fleet server with a command itself: each comes
through the workspace's MCP gate (`HarnessContext.mcpGate`,
`packages/agent/src/mcp-gate.ts`), which runs it on the host, and
chrome-devtools comes through the workspace's browser door
(`HarnessContext.browserDoor`).
Claude Code: `fleetMcpFor` (`claude.ts`); CawCo's server from a private file
(`packages/agent/src/claude-mcp-config.ts`).
OpenCode: its plugin's `ctx.mcp.transform` and `cawco_*` tools, the
credential stamped per call (`opencode-credentials.ts`), since one server
runs every session.
pi: `FleetMcp` (`pi-runtime.ts`), its servers registered by CawCo's inline
extension (`pi-mcp.ts`).

**Permission modes and asks.** The modes the harness offers are its
`permissionModes` capability, drawn from `PERMISSION_MODES`
(`packages/core/src/harness.ts`); a mode means the same on every harness
that offers it, and the dashboard says what it means there (`DESCRIPTIONS`,
`apps/dashboard/src/lib/cawco/permission-modes.ts`). Its
own question, todo and subagent tools are denied so CawCo's `ask` and
delegation are the one route (`NATIVE_TOOLS`, `HARNESS_TOOLS`,
`packages/core/src/delegate-types.ts`).
Claude Code: the SDK's `permissionMode` and `canUseTool`; `fullSend` is
`bypassPermissions`; denials through `disallowedTools`.
OpenCode: its permission ruleset (`opencode-session.ts`), denials through
`opencodeToolsFor`.
pi: no modes; denials through `piToolsFor`.

**Custody under sessiond.** A running session survives an agent restart.
When each session is a keeper process of its own, mark it in `OWN_PROCESS`
(`packages/agent/src/proc-id.ts`), give it a procId in `procIdFor` and
`parseProcId`, and implement `SessiondAdoption`.
Claude Code: an Agent SDK child under sessiond, adopted.
OpenCode: one server per account under sessiond, holding many sessions;
the agent reattaches to it (`Harness.reattach`).
pi: a pi host per session under sessiond, adopted.

**Accounts and sign-in.** A session runs on one account or the machine's own
sign-in, and the hub reads which (`HomeStore`,
`packages/core/src/accounts.ts`; `STORE_ENTRY`,
`packages/agent/src/provider-accounts.ts`).
Claude Code: a config dir per account (`CLAUDE_CONFIG_DIR`,
`packages/agent/src/accounts.ts`).
OpenCode: an account's own server.
pi: a composite credential store over the account's credential
(`pi-accounts.ts`).

**Fleet config placement.** The hub's fleet config (skills, memory, hooks,
MCP servers, plugins) lands in the harness's own config home
(`Harness.fleetHome`, `Harness.syncFleet`, through `fleet-common.ts`).
Claude Code: `~/.claude` or the account's config dir, hooks in its settings.
OpenCode: `~/.config/opencode` (`XDG_CONFIG_HOME`), hooks through CawCo's
plugin (`HOOK_EVENTS_ON`, `packages/core/src/hooks.ts`).
pi: `~/.pi/agent` (`PI_CODING_AGENT_DIR`), hooks through the inline extension.

**Stored sessions and transcripts.** Sessions run outside CawCo list, read
back and resume as they ran (`listSessions`, `readTranscriptWindow`,
`storedRun`); transcript search parses its format
(`packages/jsonl-parser`).
Claude Code: JSONL (`claude-transcript.ts`, `claude-stored-run.ts`).
OpenCode: its database (`opencode-transcript.ts`).
pi: session files, line-indexed (`pi-services.ts`).

**Clean sessions.** A clean session starts with no instruction files,
memory, skills or hooks, or the harness refuses it with a reason in
`CLEAN_START_REFUSAL` (`packages/core/src/harness.ts`).
Claude Code: `CLEAN_OPTIONS` (`claude.ts`).
OpenCode: refused.
pi: `noContextFiles` (`pi-runtime.ts`).
