/** What the fleet sync writes and reads back on this machine. */

import { join } from "node:path";
import { FLEET_MEMORY_DIR } from "../claude-dirs";
import {
  fleetClaudeRoot,
  fleetPluginsDir,
  USER_LAYER_FILES,
  userLayerPath,
} from "./claude";
import { harnessRecordsDir, piFleetRoot } from "./harnesses";
import { cawcoDataDir } from "./roots";

/**
 * Where the fleet sync installs each fleet MCP server a row runs with npx,
 * one dir per package and exact version (agent mcp-install.ts): every
 * session launches the package's bin from here with node, so none runs npx.
 */
export const fleetMcpInstallsDir = (): string =>
  join(cawcoDataDir(), "fleet-mcp");

/**
 * The fleet's own MCP servers as this machine launches them, written whole
 * by each converge of them (agent fleet-mcp-set.ts); a project's placed
 * copies are in each place's file ({@link fleetPlacesDir}): what every CawCo session on
 * Claude Code and pi loads beside its person's own servers, through its
 * harness's per-session API. No harness reads it of its own accord, so the
 * person's own `claude` and `pi` never load it.
 */
export const fleetMcpSetFile = (): string =>
  join(cawcoDataDir(), "fleet-mcp-set.json");

/**
 * What the fleet sync manages for Claude Code, by what it last wrote (agent
 * fleet.ts `ClaudeFleetSidecar`), and the fleet's denied tools as the hub
 * last sent them (agent denied-tools.ts): anything it does not name is never
 * touched. Earlier versions kept it in the user layer
 * ({@link earlierClaudeFleetSidecarFile}).
 */
export const claudeFleetSidecarFile = (): string =>
  join(harnessRecordsDir("claude"), "fleet.json");

/** Where earlier versions kept {@link claudeFleetSidecarFile}: moved from there once, as the agent starts (agent harness-records-move.ts). */
export const earlierClaudeFleetSidecarFile = (): string =>
  userLayerPath("cawco-fleet.json");

/**
 * The sidecar the agent kept before CawCo was named CawCo, which named the
 * servers it wrote into `.claude.json` then: folded into
 * {@link claudeFleetSidecarFile} once, as the agent starts (agent
 * fleet-sidecar-move.ts), and read by nothing else.
 */
export const legacyClaudeFleetSidecarFile = (): string =>
  userLayerPath("cockpit-fleet.json");

/**
 * Where each fleet hook's script is written, one file per hook id (a placed
 * copy's id is `<hook id>@<place id>`): agent fleet.ts writes them, and every
 * harness runs a command hook from here. A workspace reads it
 * ({@link fleetSyncedPaths}), since a command hook of a workspace session
 * runs inside its boundary.
 */
export const fleetHooksDir = (): string => join(cawcoDataDir(), "fleet-hooks");

/**
 * Each place's file (agent fleet-place-set.ts): what CawCo's sessions in
 * one checkout or workspace clone take of its project's rows (its MCP
 * servers, hooks, harness settings and skills), one file per place, named
 * by its place key, written only for that place and removed with it.
 */
export const fleetPlacesDir = (): string =>
  join(cawcoDataDir(), "fleet-places");

/**
 * What this machine's agent holds of the fleet (agent fleet-desired.ts):
 * the generation of the desired state it last acknowledged (its
 * `observedGeneration`) and every item the hub's deltas carried, written
 * whole before it answers each delta. What its register claims after a
 * restart, so the hub sends only what moved while it was away, and the
 * project rows a workspace cut before that welcome places in its clone.
 */
export const fleetDesiredFile = (): string =>
  join(cawcoDataDir(), "fleet-desired.json");

/**
 * What this machine's harnesses last converged of the fleet (agent
 * fleet-converged.ts): each item's hash as a converge wrote it, and the
 * report that converge came to. The converge's basis (an item whose hash
 * the file already holds is not written again, through a restart too).
 */
export const fleetConvergedFile = (): string =>
  join(cawcoDataDir(), "fleet-converged.json");

/**
 * Where the fleet sync writes each OpenCode plugin's and pi extension's
 * module, and installs each one's npm package (agent
 * fleet-harness-config.ts): files of CawCo's own, loaded by the OpenCode
 * server and the pi host on this machine, outside every checkout.
 */
export const fleetPlacedDir = (): string =>
  join(cawcoDataDir(), "fleet-placed");

/**
 * The fleet's own harness config, as this machine's sessions take it at
 * their launch (agent fleet-harness-set.ts): its hooks and settings, with
 * every command resolved to its script; a project's placed copies are in
 * each place's file ({@link fleetPlacesDir}). Written by each fleet sync; read by CawCo's Claude Code, OpenCode and pi
 * sessions alone, never by the person's own `claude`, `opencode` or `pi`.
 */
export const fleetHarnessSetFile = (): string =>
  join(cawcoDataDir(), "fleet-harness-set.json");

/**
 * The fleet's memory, one dir of CawCo's own: its main document
 * ({@link fleetMemoryFile}) and the documents it links
 * ({@link fleetMemoriesDir}). Every CawCo session takes the main document
 * at its launch, through its harness's own channel (Claude Code's system
 * prompt append, OpenCode's instruction entries, pi's context files); the
 * person's own `claude`, `opencode` and `pi` read none of it.
 */
const fleetMemoryDir = (): string => join(cawcoDataDir(), FLEET_MEMORY_DIR);

/** The fleet's main memory document, which every harness's converge writes (agent fleet.ts `syncMemory`). */
export const fleetMemoryFile = (): string =>
  join(fleetMemoryDir(), "CLAUDE.md");

/** The documents the fleet's main memory links, one file per path the set names, read on purpose. */
export const fleetMemoriesDir = (): string =>
  join(fleetMemoryDir(), "memories");

/**
 * The dirs of CawCo's own a harness loads the fleet from, each made before
 * any workspace's boundary starts (agent boundary/plan.ts `planFor`), since a
 * dir bind shows what the dir holds as it changes only when the dir stood as
 * the boundary started.
 */
export const fleetLoadedDirs = (): string[] => [
  fleetClaudeRoot(),
  piFleetRoot(),
  fleetPluginsDir(),
  fleetMemoryDir(),
];

/**
 * What the fleet sync writes on this machine that a harness in a workspace
 * loads, read only there ({@link fleetLoadedDirs}): the fleet's skills and
 * subagents for Claude Code and pi's skills, each with the tree store its
 * links land in, the fleet's plugins, which Claude Code runs from where
 * they lie (without them every hook of such a plugin failed, `python3:
 * can't open file '…/plugins/axiom/hooks/…'`), the fleet's memory, the
 * user layer's files ({@link USER_LAYER_FILES}: the person's own
 * `CLAUDE.md` and `settings.json`, which the CLI reads), the fleet's
 * installed MCP servers ({@link fleetMcpInstallsDir}), which a session in a
 * workspace launches, and the fleet's hook scripts ({@link fleetHooksDir}),
 * which a workspace session's harness runs inside its boundary. A Linux
 * boundary binds a file as the file it was when the boundary started, and
 * a write replaces a file whole (a new inode), so a boundary in use keeps
 * the old one until it is handed over: the user layer's files are in its
 * form, named by what each holds (agent boundary/plan.ts
 * `USER_LAYER_PART`). Every workspace reads each and writes
 * none (core workspace-policy.ts): a harness hands its model a skill's path,
 * and the model reads the skill's other files from there with its own
 * tools, through the boundary.
 */
export const fleetSyncedPaths = (): string[] => [
  ...fleetLoadedDirs(),
  ...USER_LAYER_FILES.map((name) => userLayerPath(name)),
  fleetMcpInstallsDir(),
  fleetHooksDir(),
];
