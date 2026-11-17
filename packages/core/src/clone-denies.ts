/**
 * The one list of the paths CawCo protects in a workspace's copy, by path
 * from its root, each with what stands in for it where the copy has none
 * ({@link cloneDenies}): what host git runs or reads, the harness project
 * config a host harness loads, the fleet's placed skills and memory, and
 * srt's own mandatory names. Every reader takes it from here: the policy
 * (workspace-policy.ts), the boundary's host, which stands each in and
 * guards it (agent boundary-host.ts), a folder's view, whose stand-ins are
 * a layer of their own (agent layer.ts), and the change set and the commit
 * checks that keep each out of what lands.
 *
 * A leaf: it imports nothing but node's path module and claude-dirs.ts, so
 * the boundary's host, a plain Bun script, imports it as it is.
 */
import { join } from "node:path";
import { z } from "zod";
import { PLACED_MEMORY, PLACED_SYNCED } from "./claude-dirs";
import { HARNESS_PLUGINS } from "./harness/kinds";

/**
 * What stands in for a clone-side deny path its clone does not have, before
 * the sandbox starts: an empty directory, or a file holding the empty config
 * its reader takes as nothing set; `none` for one that is never made (a
 * clone without `.git/config` is no clone).
 */
const CloneDenyEmptySchema = z.discriminatedUnion("kind", [
  /** `readOnly`: made with no write bits, so no host tool fills it. */
  z.object({ kind: z.literal("dir"), readOnly: z.literal(true).optional() }),
  z.object({ kind: z.literal("file"), text: z.string() }),
  z.object({ kind: z.literal("none") }),
]);
type CloneDenyEmpty = z.infer<typeof CloneDenyEmptySchema>;

/** One path in a clone no workspace writes, and what stands in for it while the clone has none. */
export const CloneDenySchema = z
  .object({
    empty: CloneDenyEmptySchema,
    path: z.string(),
    /**
     * Denied by srt itself at the clone's root, whatever the policy says (its
     * mandatory names), rather than by the policy: given a stand-in and
     * guarded like the rest, never added to the policy's write denies.
     */
    srt: z.literal(true).optional(),
  })
  .readonly();
export type CloneDeny = z.infer<typeof CloneDenySchema>;

const DIR = { kind: "dir" } as const;
const EMPTY = { kind: "file", text: "" } as const;

/**
 * srt's own mandatory deny names at its working directory, the clone, that
 * the policy does not name already (`DANGEROUS_FILES` and
 * `getDangerousDirectories()` in sandbox-utils.js at 0.0.81; `.mcp.json`,
 * `.claude/commands` and `.claude/agents` are the policy's too). An empty
 * file is what each of these files' readers takes as nothing set (git an
 * empty `.gitmodules` as no submodules).
 */
const SRT_FILES = [
  ".gitconfig",
  ".gitmodules",
  ".bashrc",
  ".bash_profile",
  ".zshrc",
  ".zprofile",
  ".profile",
  ".ripgreprc",
];
const SRT_DIRS = [".vscode", ".idea"];

/*
 * Every project file or dir a harness loads and runs (or follows as
 * instructions only it may change) is its descriptor's `cloneConfig`, by its
 * path from the dir it is found in, with the stand-in its harness parses as
 * nothing set (a clone holds one at its root on Linux, {@link cloneDenies}).
 * Each is the harness's own and a fleet admin tool's, never a workspace's:
 * the owner picked "Admin tools only" (2026-10-23).
 */

/** Every harness's config, as one table. */
const HARNESS_CONFIG_EMPTY: Readonly<Record<string, CloneDenyEmpty>> =
  Object.assign({}, ...HARNESS_PLUGINS.map((plugin) => plugin.cloneConfig));

/**
 * {@link HARNESS_CONFIG_EMPTY}'s paths: the one list of harness config a
 * clone's root denies, and which no workspace's commit changes at any depth
 * or in any letter case (agent hub-command.ts `ownConfigChanges`,
 * worktree-guard.ts `gitShim`).
 */
export const HARNESS_CONFIG: readonly string[] =
  Object.keys(HARNESS_CONFIG_EMPTY);

/** What host git runs or reads from a repository, by path from its work tree: its config, its hooks, its submodules' git dirs. */
const GIT_EMPTY: Readonly<Record<string, CloneDenyEmpty>> = {
  ".git/config": { kind: "none" },
  ".git/hooks": DIR,
  ".git/modules": DIR,
};

/**
 * What the fleet places in a folder from outside any boundary, by path from
 * the folder: the project's skills and the store their links land in
 * (claude-dirs.ts `PLACED_SYNCED`), and its memory documents
 * (`PLACED_MEMORY`). The agent writes each whenever the fleet syncs, a
 * command running in the folder or not.
 */
const FLEET_PLACED: readonly string[] = [...PLACED_SYNCED, PLACED_MEMORY];

/**
 * The config a host program loads from a folder outside any boundary, by its
 * path from the dir it is found in: git's ({@link GIT_EMPTY}), the
 * harnesses' ({@link HARNESS_CONFIG}), what the fleet places
 * ({@link FLEET_PLACED}) and srt's mandatory names: every clone deny's path.
 * A place (a person's own folder, workspace-policy.ts `isPlace`) protects
 * each at any depth from what runs inside it: its policy hands this list to
 * its judge, which refuses writing one (workspace-judge.ts
 * `protectedConfig`), and its boundary binds each one the place has
 * (`protectedIn`). Its guard holds a command to {@link GUARDED_CONFIG}.
 */
export const PROTECTED_CONFIG: readonly string[] = [
  ...new Set([
    ...Object.keys(GIT_EMPTY),
    ...HARNESS_CONFIG,
    ...FLEET_PLACED,
    ...SRT_FILES,
    ...SRT_DIRS,
  ]),
];

/**
 * What a place's guard moves aside when a command made or changed it while
 * no bind held it (agent boundary/place-guard.ts `placeGuard`): {@link PROTECTED_CONFIG}
 * but what the fleet places. The guard tells who wrote an entry only by
 * whether it changed while the command ran, and the fleet writes its
 * placements from outside at any time, a first skill into a folder that had
 * none included, so a placement is never the command's doing to it. The
 * judge and the bind still keep the workspace from writing one.
 */
export const GUARDED_CONFIG: readonly string[] = PROTECTED_CONFIG.filter(
  (path) => !FLEET_PLACED.includes(path)
);

/** `find`'s tests for an entry at one of `paths`, at any depth: a one-name path by its name, a longer one by its path's end. */
export const protectedFindTests = (paths: readonly string[]): string[] => [
  "(",
  ...paths.flatMap((path, at) => [
    ...(at > 0 ? ["-o"] : []),
    ...(path.includes("/") ? ["-path", `*/${path}`] : ["-name", path]),
  ]),
  ")",
];

/** The dir names a {@link PROTECTED_CONFIG} path lies under (`.git`, `.claude`, `.agents`, `rules`): a dir of one of these names holds protected config below it. */
export const PROTECTED_PARENTS: ReadonlySet<string> = new Set(
  PROTECTED_CONFIG.flatMap((path) => path.split("/").slice(0, -1))
);

/**
 * Every path in a clone the workspace's policy denies writing, and srt's own
 * mandatory names at its root ({@link SRT_FILES}, {@link SRT_DIRS}), each
 * with its stand-in. What host git runs or reads from a clone
 * ({@link GIT_EMPTY}): its config, its hooks, its submodules' git dirs. And
 * the harness project config the host
 * loads at the workspace's next session, outside any boundary, at the clone's
 * root ({@link HARNESS_CONFIG_EMPTY}: Claude Code's, OpenCode's, pi's and Codex's);
 * and what the fleet places ({@link FLEET_PLACED}): the project skills with
 * the store their links land in, and the project's memory documents.
 * On Linux a link in a dir the sandbox writes can be swapped for another,
 * so the whole skills dir is held, as `commands` and `agents` are. srt binds
 * literal paths alone ("`allowWrite` / `denyWrite` take literal paths",
 * github.com/anthropics/sandbox-runtime), so a nested copy of one is kept
 * out of what lands, at any depth, by the commit check instead.
 *
 * Linux: srt binds `/dev/null` over a deny path that does not exist, and
 * bwrap leaves a read-only empty file on the host at it for the sandbox's
 * whole life (an empty directory at a missing parent). A host harness then
 * reads that file as its config: OpenCode answered every request for such a
 * clone with ENOTDIR on `.opencode/opencode.json` (2026-10-10). A path that
 * exists is bound onto itself, which leaves nothing (srt #139: "Denied paths
 * that already exist are handled separately via --ro-bind, create no
 * artifact"), so the boundary's host makes each stand-in before every
 * sandbox it starts (`boundary-host.ts`).
 */
export const cloneDenies = (clone: string): readonly CloneDeny[] => {
  const denies: CloneDeny[] = [
    ...Object.entries(GIT_EMPTY).map(([name, empty]) => ({
      path: join(clone, name),
      empty,
    })),
    ...Object.entries(HARNESS_CONFIG_EMPTY).map(([name, empty]) => ({
      path: join(clone, name),
      empty,
    })),
    // The skills the fleet places in the clone, the store their links land
    // in, and the project's memory documents as the fleet places them:
    // a fleet skill, and instructions Claude Code loads at launch, never the
    // delegate's to change.
    ...FLEET_PLACED.map((name) => ({ path: join(clone, name), empty: DIR })),
    ...srtDenies(clone),
  ];
  const seen = new Set<string>();
  return denies.filter(({ path }) => !seen.has(path) && seen.add(path));
};

/** srt's own mandatory names at the clone's root, each with its stand-in ({@link SRT_FILES}, {@link SRT_DIRS}). */
const srtDenies = (clone: string): CloneDeny[] => [
  ...SRT_FILES.map((name) => ({
    path: join(clone, name),
    empty: EMPTY,
    srt: true as const,
  })),
  ...SRT_DIRS.map((name) => ({
    path: join(clone, name),
    empty: DIR,
    srt: true as const,
  })),
];
