## Mechanism

The fleet sends `reloadSkills` while reading the slash-command catalog. It is a mutating SDK operation that clears Claude Code's already-announced skill names. The dashboard's pane effect also depended directly on the running-instance collection, so board updates repeatedly ran that read, throttled to one per three seconds. An open orchestrator pane received resets throughout its turn; a delegate with no open pane avoided that reader.

Fleet trigger before this change:

- `apps/dashboard/src/lib/cawco/client.svelte.ts:4569–4572`: `Promise.allSettled([request<SupportedCommands>(CONTROL_SUPPORTED_COMMANDS), request<{ skills: SlashCommand[] } | undefined>(CONTROL_RELOAD_SKILLS)])`.
- `apps/dashboard/src/lib/cawco/SessionPane.svelte:593–610`: the effect reads `session`, `cawco.runningInstances`, and connection state, then calls `refreshCommands`.
- `packages/hub/src/server.ts:11102–11116`: every fleet report unconditionally triggered both skill and plugin reloads, even when its content hashes were unchanged.

One own idle probe websocket captured nine repeated pairs of `supportedCommands` and `reloadSkills` between epoch milliseconds 1791150121473 and 1791150181487. No additional prompt was needed. The first pair in the cockpit probe occurred between the initial listing and the first tool result; a second initial listing followed that result.

Installed SDK: `/home/bewinxed/.cawco/app/packages/agent/node_modules/@anthropic-ai/claude-agent-sdk`, version 0.3.289. Its native CLI is `/home/bewinxed/.cawco/app/node_modules/.bun/@anthropic-ai+claude-agent-sdk-linux-x64@0.3.289/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude`, version 2.1.289. The probe debug attribution explicitly reported `cc_version=2.1.289.10b` and `cc_entrypoint=sdk-ts`.

Exact installed SDK operations:

```js
async supportedCommands(){let{commands:e}=await this.initialization;return this.latestCommands??e}
async reloadSkills(){return $t("sdk_reload_skills",async()=>(await this.request({subtype:"reload_skills"})).response)}
```

Exact native CLI tracking and reset code (embedded JavaScript in `chunk-wgfrtm7w.js`):

```js
class cnn{sentSkillNames=new Map;suppressNext=!1;resumeSeedNames=null;reportedUncBlockedPaths=new Set}
var unn=new kt(()=>new cnn);
function rW(){return unn.of(U())}
function e4(){let e=rW();e.sentSkillNames.clear(),e.suppressNext=!1,e.resumeSeedNames=null}
function PNr(e){let n=rW();for(let r of n.sentSkillNames.values())for(let s of e)r.delete(s);if(n.resumeSeedNames!==null)for(let r of e)n.resumeSeedNames.delete(r)}
function INr(e){rW().sentSkillNames.delete(e)}
```

The listing calculation uses `unn.of(e.session)` and `Amr(h,e.agentId,w)`. `Amr` creates a set under `n??""`, excludes names already present, and sets `isInitial` from `g.size===0`. It returns no listing when no new names exist. `kt` stores its state in a `WeakMap` keyed by `e.root`; a fresh session root begins with fresh state. Transcript resume seeds the state through `Anr` → `YDo` using stored `skill_listing.names`.

Every identified mutation of the sent-name record in this CLI:

| Path | Code / purpose |
| --- | --- |
| SDK `reload_skills` control | `vU(),e4(),await Xd()`; clears every sent-name set unconditionally. This is the measured fleet trigger. |
| Manual skill reload command | `vU(),EO(),e4()` even when its eventual message says “no changes”. |
| SessionStart hook requesting reload | `if(Fe)EO(),e4(),NN.emit(),y("hook_session_start_reload_skills")`. |
| Plugin cache invalidation | `gu(e,n)` calls `egr(e,n)`, invalidates commands, workflows, skill directories, Markdown and agents, then `e4()`. Plugin install/enable/disable/uninstall/marketplace operations and `qM` (`refreshActivePlugins`) use this path. |
| Directory skill reload | `HPt(){vU(),EO(),cde(),e4(),NN.emit();...uJ.rehome()}`; directory-add and register-repo-root reload controls use it. |
| Conversation clear/reset | `yvr(...)` includes `TR("clear"),e4()` alongside other conversation-state resets. |
| Actual filesystem skill change | The watcher compares skill fingerprints, logs “skill list unchanged — skipping re-announce” when equal, and calls `PNr(h)` only for names whose fingerprint changed. |
| Synced-skill collision change | `xmr` computes the symmetric difference of collision spellings and deletes only affected synced-skill names from sent sets and resume seeds. |
| Subagent cleanup | The `runAgent` cleanup stage `sentSkillNames` calls `INr(ge)` for that agent ID. |

The 2.1.288 binary has the same tracking structure and unconditional full reset (`KK` in that version). `npm view @anthropic-ai/claude-agent-sdk version` returned `0.3.289`; there was no upgrade to take.

The linked reverse-engineering description agrees: https://github.com/Windy3f3f3f3f/how-claude-code-works/blob/main/en/docs/09-skills-system.md — “It tracks already-sent skill names per agentId via `sentSkillNames`, avoiding redundant injection.” The upstream report https://github.com/anthropics/claude-code/issues/35051 describes “the full skill list is re-injected in every ... block” and is closed as not planned. The installed code and own probe establish the fleet-side cause here.

Protection preserved:

- Commit `b239db4402839d16139464544e9b96ec226db30c` (“ask the session for commands when the menu opens”, 22 September) added the reload beside command discovery, allowing fresh skill names/classification to appear in the slash menu. Read-only `supportedCommands` returns `latestCommands`; the existing SDK `commands_changed` and turn `init.skills` frames continue to update the menu.
- Commit `1c670050b7d2df3748c86b8568650149270a5b58` (8 August) introduced hub reloads because newly adopted skills and installed plugins were invisible to running sessions. That reload remains, owned by the hub and gated by changes in the machine's persisted skill/plugin hashes. A plugin reload includes skill invalidation, so simultaneous plugin and skill changes send one plugin reload.
- Dashboard `reloadSkills` controls are answered locally with a correlated refusal, through both legacy websocket and tracked-command routing. They never reach the agent or SDK, including from an already-open old dashboard. No agent or sessiond restart is required.
- The pane's loading effect now observes a derived live boolean, so unrelated board updates cannot retrigger it.

## Proof

Before, live New session modal, `claude-sonnet-5-5`, persistent session, full access, pane open. Each prompt required five separate sequential `Bash` calls, each only `pwd`; the second turn required one `pwd` call. All six calls and both completion replies were present.

Metadata-only transcript counting command:

```sh
python3 -c 'import pathlib,json,hashlib; ids=[("-tmp-skill-listing-sonnet-before","2e700466-adde-460f-897a-901ce4ef01aa"),("-home-bewinxed-cockpit","14929ac0-5181-4c65-9643-7b7910fc9e21")];
for slug,sid in ids:
 rows=[json.loads(x) for x in (pathlib.Path("/home/bewinxed/.claude/projects")/slug/(sid+".jsonl")).open()]; lists=[r for r in rows if r.get("attachment",{}).get("type")=="skill_listing"]; tools=[b for r in rows if r.get("type")=="assistant" for b in r.get("message",{}).get("content",[]) if b.get("type")=="tool_use"]; print(sid,"lists",len(lists),"tools",len(tools),"chars",[len(r["attachment"].get("content","")) for r in lists],"hashes",len({hashlib.sha256(r["attachment"].get("content","").encode()).hexdigest() for r in lists}),"models",list({r.get("message",{}).get("model") for r in rows if r.get("type")=="assistant"}));'
```

Output:

```text
2e700466-adde-460f-897a-901ce4ef01aa lists 4 tools 6 chars [30010, 30010, 30010, 30010] hashes 1 models ['claude-sonnet-5-5']
14929ac0-5181-4c65-9643-7b7910fc9e21 lists 3 tools 6 chars [30010, 30010, 30010] hashes 1 models ['claude-sonnet-5-5']
```

Counts vary with how the three-second reader throttle intersects model/tool timing; both cases repeat exactly identical content. These are separate cwd cases, not retries of a contradictory experiment.

An earlier pair of probes used Haiku before the parent supplied the no-Haiku rule. Both sessions and their transcripts were deleted through fleet controls. A filename-only existence check returned `Haiku probe transcripts exist []`. They are excluded from the before/after comparison.

Checks on the implementation:

```text
bun run lint
Checked 1090 files in 1271ms. No fixes applied.
Found 3 warnings. [existing unused suppressions, exit 0]

bun run typecheck
All workspace packages exited with code 0.
svelte-check found 0 errors and 0 warnings
openapi.json is up to date

bun run build
Dashboard: built in 5.38s; adapter-node done; exited with code 0.
All declared package builds exited with code 0.
```

Deployed after results will be appended after landing and the poller's hub restart.

## Saving

The supplied orchestrator measurement was about 60 redundant lists per hour, each 30,010 characters, approximately 7,500 tokens. Removing that reader-triggered reset avoids approximately 450,000 newly appended skill-list tokens per hour in that session, plus subsequent rereads of those appended tokens. This estimate uses the measured list rate and four characters per token; it is not a claim about billing/cache savings.

The own Sonnet before probes added three and two redundant lists respectively: approximately 22,500 and 15,000 avoidable newly appended tokens across six tool calls and two turns.

## Not done

Deployed after probes are pending the code landing and automatic hub restart. No dependency patch, skill-budget setting, live fleet configuration mutation, unit test, service restart, or sessiond change was made. Compaction and real skill/plugin changes were not artificially provoked; their existing CLI and hub paths remain in place.
