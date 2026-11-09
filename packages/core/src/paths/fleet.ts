/** What the fleet sync writes and reads back on this machine. */

import { join } from "node:path";
import { cawcoDataDir } from "./cawco";
import {
  claudeSkillsDir,
  treeStoreOf,
  USER_LAYER_FILES,
  userLayerPath,
  VENDOR_MARKETPLACES_DIR,
} from "./claude";
import { piMemoryFile, piSkillsDir } from "./harnesses";

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
 * the file already holds is not written again, through a restart too), and
 * what a workspace boundary's form names of what the fleet sync wrote
 * (agent boundary/plan.ts `SYNCED_PART`).
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
 * What the fleet sync writes on this machine that a harness loads: each
 * skills dir ({@link claudeSkillsDir}, {@link piSkillsDir}) with the tree
 * store its links land in ({@link treeStoreOf}), the vendored marketplaces
 * with their plugins' stores ({@link VENDOR_MARKETPLACES_DIR}), pi's
 * memory document, the user layer's files ({@link USER_LAYER_FILES}: Claude
 * Code's `CLAUDE.md` and `settings.json` among them), the fleet's installed
 * MCP servers ({@link fleetMcpInstallsDir}), which a session in a workspace
 * launches, and the fleet's hook scripts ({@link fleetHooksDir}), which a
 * workspace session's harness runs inside its boundary. A Linux boundary
 * binds a file as the file it was when the boundary started, and the sync
 * writes a file whole (a new inode), so a boundary in use keeps the old one
 * until it is handed over: each of these is in its form, named by the
 * hashes of the fleet items converged into it (agent fleet-converged.ts
 * `syncedHeld`), and a sync that changes one hands every boundary in use
 * over as its work ends. On 2026-10-25 running
 * boundaries read the CLAUDE.md of their start until each restarted. Its
 * dir is no bind instead: `~/.claude` holds a session's credential and
 * transcripts too. Every workspace reads each and writes none
 * (core workspace-policy.ts): a harness hands its model a skill's path, and
 * the model reads the skill's other files from there with its own tools,
 * through the boundary. pi's lie in its agent dir, a credential store, so
 * only these open there.
 */
export const fleetSyncedPaths = (): string[] => [
  ...[claudeSkillsDir(), piSkillsDir()].flatMap((dir) => [
    dir,
    treeStoreOf(dir),
  ]),
  userLayerPath(VENDOR_MARKETPLACES_DIR),
  piMemoryFile(),
  ...USER_LAYER_FILES.map((name) => userLayerPath(name)),
  fleetMcpInstallsDir(),
  fleetHooksDir(),
];
