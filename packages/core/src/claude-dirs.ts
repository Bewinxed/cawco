/**
 * The browser-safe half of `paths.ts`, which owns every Claude Code dir: the
 * names a dashboard, a hub message or a shell script needs, with no
 * `node:fs` behind them. `paths.ts` builds every real path on a machine from
 * these, and nothing else spells Claude Code's dir name
 * (`bun run claude-paths:check`).
 */

/** Claude Code's dir name, in a home (the user layer) and in a project. */
const CLAUDE_DIR = ".claude";

/** The user layer as a person reads it on any machine: `~/.claude`. */
export const USER_LAYER_LABEL = `~/${CLAUDE_DIR}`;

/**
 * The user layer as a POSIX shell script names it on the machine it runs on:
 * `${HOME}/.claude`, the same dir `paths.ts`'s `claudeHome()` is.
 */
export const USER_LAYER_SHELL = `\${HOME}/${CLAUDE_DIR}`;

/** A path under the user layer, as a person reads it: `~/.claude/skills/x`. */
export const userLayerLabel = (...parts: string[]): string =>
  [USER_LAYER_LABEL, ...parts].join("/");

/**
 * A path inside a project's own Claude Code dir, relative to the project:
 * `.claude/skills`, `.claude/settings.json`. Claude Code reads a project's
 * skills, settings and subagents there whichever config dir it runs in.
 */
export const projectClaudeRelative = (...parts: string[]): string =>
  [CLAUDE_DIR, ...parts].join("/");

/** The file name `paths.ts` gives the `.claude.json` beside or inside a config dir. */
export const CLAUDE_JSON_NAME = `${CLAUDE_DIR}.json`;

/** The user's own `.claude.json`, as a person reads it: `~/.claude.json`. */
export const CLAUDE_JSON_LABEL = `~/${CLAUDE_JSON_NAME}`;

/** The dir name `paths.ts` joins onto a home or a project. */
export const CLAUDE_DIR_NAME = CLAUDE_DIR;

/**
 * Where the trees behind a dir of CawCo-written trees live: beside that dir,
 * `<parent>/.cawco-trees/<dir name>/` (paths.ts `treeStoreOf`). Each entry of
 * the dir (a fleet skill, a vendored plugin) is a relative link into it,
 * swapped with one rename (agent tree-swap.ts), so a session never reads a
 * missing or half-written tree. Kept outside the dir itself because OpenCode
 * finds skills with `**\/SKILL.md` and follows dot dirs. In `~/.claude` it
 * holds the fleet's skills, which every session reads; in a project's
 * `.claude`, the skills placed there. Here, with the names, so the
 * boundary's host names it too.
 */
export const TREE_STORE_DIR = ".cawco-trees";
