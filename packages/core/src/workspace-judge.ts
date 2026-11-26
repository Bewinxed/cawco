/**
 * Judges whether a workspace's harness may read or write a path, by the
 * workspace's policy (`workspace-policy.ts` builds it; the agent writes it
 * into the workspace's state dir as `policy.json`). One judge for every
 * harness: Claude Code's PreToolUse hook (through the workspace's judge,
 * `boundary-judge.ts`), CawCo's OpenCode plugin and pi's file tools all hand
 * it the call as the harness sees it, and it answers with the first path the
 * call may not touch.
 *
 * It imports only node's built-ins (and types, which Bun erases): the judge
 * runs it as a plain Bun script from the workspace's state dir, and
 * OpenCode's server imports that same copy (scripts/lint/standalone-scripts.grit).
 *
 * The policy has @anthropic-ai/sandbox-runtime's filesystem shape and
 * semantics (its README, "Filesystem Isolation"): reads are allowed unless
 * denied, and the most specific of a `denyRead` and an `allowRead` entry over
 * a path decides ("`allowRead` takes precedence over `denyRead`… A `denyRead`
 * entry that is more specific than the `allowRead` region it falls inside…
 * still stays denied"); writes are allowed only inside `allowWrite`, and a
 * `denyWrite` entry wins inside it. Every entry is a real path, but the
 * user-layer links in an account's config dir, which srt must bind at their
 * names (`accountLayers` in workspace-policy.ts). A path is judged at its
 * real path, so a link is judged where it points: through one of those
 * links, at the user layer's own entry.
 *
 * Anything the judge cannot decide is refused: a path it cannot resolve, a
 * call whose input is not an object, a policy file it cannot read.
 */

import {
  type Dirent,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgyKind } from "./harness/agy";
import type { HarnessKind } from "./harness/kinds";

/**
 * Every harness this judge has a table for: the registered ones, and agy,
 * whose session judge (agent harnesses/agy-judge.ts) hands it agy's file
 * tools ahead of agy's registration as a harness.
 */
type JudgedHarness = HarnessKind | AgyKind;

type Access = "read" | "write";

/**
 * Whether `value` is a JSON object (not null, not an array). Core's
 * `is-record.ts` says the same; this script keeps its own copy, since it
 * runs alone from a workspace's state dir.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The errno code a failed file call carries (`ENOENT`, `EACCES`, ...), if it carries one: core's `absent.ts` `errnoCode`, kept here for the same reason. */
const errnoCode = (error: unknown): string | undefined =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string"
    ? error.code
    : undefined;

/** A workspace's policy, every path a real path but an account's user-layer links. */
export interface Policy {
  readonly allowRead: readonly string[];
  readonly allowWrite: readonly string[];
  /** The workspace's clone: where a relative path an MCP server is handed may resolve, and where a refusal says to write. */
  readonly clone: string;
  readonly denyRead: readonly string[];
  readonly denyWrite: readonly string[];
  /** The user's home dir: what `~` names in a path a tool is handed. */
  readonly home: string;
  /**
   * A place, a person's own folder (core workspace-id.ts `place`): the
   * config a host program loads from a folder, by path from the dir it is
   * found in (clone-denies.ts `PROTECTED_CONFIG`), each refused for writing
   * at any depth, whether it exists or not ({@link protectedConfig}). Its
   * boundary stands nothing in for one that is absent (never write into a
   * person's own folder), so this judge, and the place's guard after each
   * command, keep it. Handed in the policy, as this judge imports nothing.
   */
  readonly protectConfig?: readonly string[];
  /** The workspace's scratch dir: where a refusal also says to write. */
  readonly scratch: string;
}

/**
 * The protected entry a path relative to a place lies at or in, as a
 * relative path: the first of its leading paths that ends in one of
 * `protect` (the policy's `protectConfig`); none when it lies in none.
 */
const protectedConfig = (
  relative: string,
  protect: readonly string[]
): string | undefined => {
  const parts = relative.split("/").filter((part) => part && part !== ".");
  for (const index of parts.keys()) {
    const lead = parts.slice(0, index + 1);
    if (
      protect.some((path) => {
        const names = path.split("/");
        return (
          names.length <= lead.length &&
          lead.slice(lead.length - names.length).join("/") === path
        );
      })
    ) {
      return lead.join("/");
    }
  }
};

export type Verdict =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** One tool call as a harness hands it over. */
export interface Call {
  /** The directory the harness resolves a relative path against. */
  readonly cwd: string;
  readonly harness: JudgedHarness;
  readonly input: unknown;
  readonly tool: string;
  /**
   * OpenCode: the dir its server saves a truncated tool output to
   * (`<data>/opencode/tool-output`, observed on 2.0.28). It holds every
   * session's on that server, named by tool-call id alone, so the session
   * reads none of it: the plugin copies each output into the session's own
   * folder, which the policy reads, and names the copy (opencode-plugin.ts
   * `spilled`).
   */
  readonly toolOutput?: string;
  /** Claude Code: the session's transcript, which says which `projects/<slug>/` dir is the session's own. */
  readonly transcript?: string;
}

const ALLOWED: Verdict = { ok: true };

/** Reads the policy the agent wrote; throws when it is not there or not one. */
export const readPolicy = (file: string): Policy => {
  // A plain Bun script beside the policy (agent boundary/hook-judge.ts `JUDGE_SCRIPT`):
  // node's built-ins alone, so the record is narrowed here, not by a schema.
  const policy: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof policy !== "object" || policy === null) {
    throw new Error(`${file} is not a policy`);
  }
  const lists = (key: string): readonly string[] => {
    const list: unknown = Reflect.get(policy, key);
    if (!(
      Array.isArray(list) && list.every((one) => typeof one === "string")
    )) {
      throw new Error(`${file} has no ${key} list`);
    }
    return list;
  };
  const named = (key: string): string => {
    const value: unknown = Reflect.get(policy, key);
    if (typeof value !== "string") {
      throw new Error(`${file} names no ${key}`);
    }
    return value;
  };
  const protectConfig: unknown = Reflect.get(policy, "protectConfig");
  if (
    protectConfig !== undefined &&
    !(
      Array.isArray(protectConfig) &&
      protectConfig.every((path) => typeof path === "string")
    )
  ) {
    throw new Error(`${file}'s protectConfig is no list of paths`);
  }
  return {
    allowRead: lists("allowRead"),
    allowWrite: lists("allowWrite"),
    clone: named("clone"),
    denyRead: lists("denyRead"),
    denyWrite: lists("denyWrite"),
    home: named("home"),
    ...(protectConfig === undefined ? {} : { protectConfig }),
    scratch: named("scratch"),
  };
};

/**
 * `path` as the kernel resolves it: each component that exists is followed
 * to its real path, in order, so `..` after a link climbs from where the link
 * points. Past the first component that does not exist the rest is appended
 * as written; a `..` there is refused, because what it names depends on what
 * gets created first.
 */
export const resolveReal = (path: string): string => resolve(path, MISSING);

/**
 * {@link resolveReal} for a path that only ever goes into a deny rule. A
 * component this process may not look up (EPERM, EACCES) is treated like one
 * that does not exist: the path from it on is kept as written, and a `..`
 * after it is refused all the same. macOS's privacy protection answers EPERM
 * for another app's data (`~/Library/Application Support/Google/Chrome`, …)
 * to an agent launchd runs without Full Disk Access.
 *
 * Denying the path as written can only deny more, never open anything: every
 * component before it is still its real path, so the entry names the
 * directory this process would reach by that name, and a deny entry never
 * widens what the policy allows. A path an allow rule takes keeps
 * {@link resolveReal}'s strictness: one it cannot resolve throws.
 */
export const resolveDenied = (path: string): string =>
  resolve(path, UNREADABLE);

/** A component that does not exist: the rest of the path is appended as written. */
const MISSING = new Set(["ENOENT", "ENOTDIR"]);

/** For a deny entry, also a component this process may not look up. */
const UNREADABLE = new Set([...MISSING, "EPERM", "EACCES"]);

/**
 * `path` as one lookup of the kernel's, which follows each link in order and
 * climbs a `..` from where the link points, as {@link resolve}'s walk does a
 * component at a time; undefined when a component does not resolve, for the
 * walk to find which and why. A policy resolves a hundred-odd paths for each
 * workspace each look (agent boundary/looks.ts), and walking every one took
 * three system calls a component.
 */
const resolvedWhole = (path: string): string | undefined => {
  try {
    return realpathSync(path);
  } catch (error) {
    // Anything but a lookup that failed is no answer of the file system's.
    if (!errnoCode(error)) {
      throw error;
    }
  }
};

const resolve = (path: string, asWritten: ReadonlySet<string>): string => {
  if (!isAbsolute(path)) {
    throw new Error(`${path} is not an absolute path`);
  }
  const whole = resolvedWhole(path);
  if (whole !== undefined) {
    return whole;
  }
  const parts = path.split("/").filter(Boolean);
  let current = "/";
  for (const [index, part] of parts.entries()) {
    if (part === ".") {
      continue;
    }
    if (part === "..") {
      current = dirname(current);
      continue;
    }
    const next = join(current, part);
    try {
      current = realpathSync(next);
    } catch (error) {
      const code = errnoCode(error);
      if (!(code && asWritten.has(code))) {
        throw error;
      }
      const rest = parts.slice(index + 1);
      if (rest.includes("..")) {
        throw new Error(
          `${path} climbs out of ${next}, which ${MISSING.has(code) ? "does not exist" : "cannot be looked up"}`,
          { cause: error }
        );
      }
      return join(next, ...rest);
    }
  }
  return current;
};

const within = (path: string, root: string): boolean =>
  root === "/" || path === root || path.startsWith(`${root}/`);

/** The longest entry of `roots` that `path` lies in, if any. */
const deepest = (roots: readonly string[], path: string): string | undefined =>
  roots
    .filter((root) => within(path, root))
    .reduce<string | undefined>(
      (found, root) => (found && found.length >= root.length ? found : root),
      undefined
    );

const refused = (reason: string): Verdict => ({ ok: false, reason });

const elsewhere = (policy: Policy): string =>
  `Write in the workspace's clone (${policy.clone}) or its scratch dir (${policy.scratch}) instead.`;

/**
 * Whether `policy` lets a harness `access` `path`, an absolute path. Reads:
 * the deeper of the deepest `denyRead` and `allowRead` entry over its real
 * path decides, a tie denies. Writes: a `denyWrite` entry over it refuses, and
 * so does no `allowWrite` entry over it.
 */
const judge = (policy: Policy, path: string, access: Access): Verdict => {
  let real: string;
  try {
    real = resolveReal(path);
  } catch (error) {
    return refused(
      `${path} could not be resolved (${error instanceof Error ? error.message : String(error)}), so it is not ${access === "read" ? "read" : "written"}.`
    );
  }
  const named = real === path ? path : `${path} (${real})`;
  if (access === "read") {
    const denied = deepest(policy.denyRead, real);
    const allowed = deepest(policy.allowRead, real);
    if (
      denied !== undefined &&
      (allowed === undefined || allowed.length <= denied.length)
    ) {
      return refused(
        `${named} lies in ${denied}, which this workspace does not read. It reads its clone (${policy.clone}), its scratch dir (${policy.scratch}), toolchains, the user's Claude Code layer and, on the hub's machine, its own project's folder.`
      );
    }
    return ALLOWED;
  }
  const config =
    policy.protectConfig && within(real, policy.clone)
      ? protectedConfig(real.slice(policy.clone.length), policy.protectConfig)
      : undefined;
  if (config !== undefined) {
    return refused(
      `${named} is protected config (${config}): a host session would load it from this folder outside any boundary, so it is never written from inside it.`
    );
  }
  const denied = deepest(policy.denyWrite, real);
  if (denied !== undefined) {
    return refused(
      `${named} lies in ${denied}, which this workspace never writes: the host reads it outside any boundary. ${elsewhere(policy)}`
    );
  }
  if (deepest(policy.allowWrite, real) === undefined) {
    return refused(
      `${named} is outside what this workspace writes. ${elsewhere(policy)}`
    );
  }
  return ALLOWED;
};

/**
 * The policy a Claude session judges by: the workspace's, with the session's
 * own `projects/<slug>/` dir (its transcripts and tool results) readable. The
 * transcript is named by the CLI, never by the model. A transcript in no
 * `projects/<slug>/` adds nothing.
 */
const claudeSession = (
  policy: Policy,
  transcript: string | undefined
): Policy => {
  if (!(transcript && isAbsolute(transcript))) {
    return policy;
  }
  const project = dirname(transcript);
  if (basename(dirname(project)) !== "projects") {
    return policy;
  }
  return {
    ...policy,
    allowRead: [...policy.allowRead, resolveReal(project)],
  };
};

/**
 * The policy an OpenCode session judges by: the workspace's, with its
 * server's saved-output dir denied ({@link Call.toolOutput}), every session's
 * on that server.
 */
const opencodeSession = (policy: Policy, call: Call): Policy => ({
  ...policy,
  denyRead: call.toolOutput
    ? [...policy.denyRead, resolveDenied(call.toolOutput)]
    : policy.denyRead,
});

/** What each harness adds to the policy for its own sessions; see {@link sessionPolicy}. */
const SESSION_POLICY: Record<
  JudgedHarness,
  ((policy: Policy, call: Call) => Policy) | undefined
> = {
  claude: (policy, call) => claudeSession(policy, call.transcript),
  opencode: opencodeSession,
  pi: undefined,
  codex: undefined,
  agy: undefined,
};

/**
 * The policy a call is judged by: the workspace's, with what the harness
 * itself keeps for the session to read back. Claude: {@link claudeSession}.
 * OpenCode: {@link opencodeSession}. pi keeps its saved outputs in the
 * session's own folder, which the policy already reads. Codex saves none
 * (it keeps a large output's head and tail). agy keeps its saved outputs in
 * its home's `brain/<conversation>/`, which no workspace reads; none of them
 * is read back yet.
 */
const sessionPolicy = (policy: Policy, call: Call): Policy => {
  const session = SESSION_POLICY[call.harness];
  return session ? session(policy, call) : policy;
};

/** A path field of a built-in tool, and what reading or writing it is. */
interface Field {
  readonly access: Access;
  /** Where the tool searches when the field is left out: the call's cwd. */
  readonly defaultsToCwd?: boolean;
  /** A glob pattern: its part before the first wildcard is the path. */
  readonly glob?: boolean;
  readonly key: string;
  /** OpenCode's and Codex's patch: the paths its patch text names. */
  readonly patch?: boolean;
  /**
   * The tool always names this path: a call without it is refused, so a
   * field the table misnames refuses the tool rather than lets it pass
   * unjudged. agy's, whose schemas the binary does not publish.
   */
  readonly required?: boolean;
}

const read = (key: string, extra: Partial<Field> = {}): Field => ({
  key,
  access: "read",
  ...extra,
});
const write = (key: string, extra: Partial<Field> = {}): Field => ({
  key,
  access: "write",
  ...extra,
});

/**
 * Each harness's built-in file tools, by the path fields their schemas
 * document. Claude Code: code.claude.com/docs/en/tools-reference. OpenCode
 * 2.0.28: the input schemas its server sends the model (`patch` replaces
 * `edit` and `write` for `gpt-` models). pi 1.0.1: dist/core/tools/*.d.ts.
 * agy 1.5.18: the arguments its `PreToolUse` hook is handed (`Path`,
 * absolute), each required (core harness/agy.ts `AGY_TOOLS` holds every
 * tool and its class).
 * A shell tool is judged by the boundary its command runs in, never here.
 * Every tool not in its harness's table is judged by {@link argumentPaths}.
 */
const BUILT_INS: Record<JudgedHarness, Record<string, readonly Field[]>> = {
  claude: {
    Bash: [],
    Monitor: [],
    Read: [read("file_path")],
    Write: [write("file_path")],
    Edit: [write("file_path")],
    MultiEdit: [write("file_path")],
    NotebookEdit: [write("notebook_path")],
    NotebookRead: [read("notebook_path")],
    Glob: [
      read("path", { defaultsToCwd: true }),
      read("pattern", { glob: true }),
    ],
    Grep: [read("path", { defaultsToCwd: true })],
    LS: [read("path")],
  },
  opencode: {
    shell: [],
    read: [read("path")],
    write: [write("path")],
    edit: [write("path")],
    glob: [
      read("path", { defaultsToCwd: true }),
      read("pattern", { glob: true }),
    ],
    grep: [read("path", { defaultsToCwd: true })],
    patch: [write("patchText", { patch: true })],
  },
  pi: {
    bash: [],
    read: [read("path")],
    write: [write("path")],
    edit: [write("path")],
    ls: [read("path", { defaultsToCwd: true })],
    find: [
      read("path", { defaultsToCwd: true }),
      read("pattern", { glob: true }),
    ],
    grep: [read("path", { defaultsToCwd: true })],
  },
  // Codex 0.169.0's hook payloads: `exec_command` as `Bash` with its
  // `command`, `apply_patch` with its patch text as `command`, in the patch
  // format OpenCode's is (Codex audit 2026-11-17, probe C-a). Its workspace
  // sessions run every tool in the boundary's execution environment, which
  // judges a file by the file system; this table judges the hook route.
  codex: {
    Bash: [],
    apply_patch: [write("command", { patch: true })],
    view_image: [read("path")],
  },
  agy: {
    run_command: [],
    read_file: [read("Path", { required: true })],
    write_file: [write("Path", { required: true })],
    edit_file: [write("Path", { required: true })],
  },
};

/**
 * CawCo's own MCP server: the arguments of each of its tools that name a
 * file on the machine, from the input schemas the hub serves
 * (packages/hub/src: artifacts/tools.ts, delegation-tools.ts), each with
 * what the hub does to the file on the session's behalf. Read: the hub
 * reads it and hands it to the person or a service, never back to the
 * session — `show_image`'s `path` (the dashboard renders it from disk),
 * `send_to_user`'s `attachments` (shown in the transcript), `artifact_create`'s
 * `dir` (a preview's folder served, or a page's page.html read) and
 * `generate_image`'s `reference_images` (uploaded with the prompt). Write:
 * `generate_image`'s `output_path`, the new PNG. Each is judged against the
 * workspace's own policy, its read set like its write set: the hub reads
 * outside any boundary, so a file the session may not read is not shown,
 * sent or uploaded for it either. Shown (`show`): a read that may also lie in
 * another workspace's scratch dir or clone, for the hub to decide
 * ({@link handedToHub}): a session shows the person its delegates'
 * screenshots, and only the hub knows its delegates (hub shown-files.ts).
 * Every other argument of a cawco
 * tool names no file, whatever its name: `artifact_create`'s `path` is a
 * preview's URL path, `artifact_update`'s `patch[].path` a JSON Pointer, `folder_*`
 * and `memory_*`'s `path` a file in the project's folder on the hub,
 * `admin_memory_write`'s `path` a document under the fleet's memories, a
 * connector's or relay's `*_path` a dot path into what it is answered,
 * `delegate`'s and `task_*`'s `outputs` files in the delegate's own
 * workspace. A cawco tool missing here names no file. The `mcp-file-args`
 * probe holds this table to the hub's schemas.
 */
const CAWCO_FILE_ARGS: Readonly<
  Record<string, Readonly<Record<string, Access | "show">>>
> = {
  artifact_create: { dir: "read" },
  generate_image: { output_path: "write", reference_images: "read" },
  send_to_user: { attachments: "show" },
  show_image: { path: "show" },
};

/** Where on its machine a workspace keeps its files, named by its id's first 8 characters. */
export interface WorkspaceArea {
  readonly id8: string;
  readonly kind: "clone" | "scratch";
}

/** Its scratch dir `.cawco/tmp/<id8>` (paths/workspace.ts `workspaceScratchDir`) and its clone `.worktrees/<repo>-<id8>` (agent workspace.ts), under home. */
const AREA =
  /^(?:\.cawco\/tmp\/([0-9a-f]{8})|\.worktrees\/[^/]+-([0-9a-f]{8}))(?:\/|$)/u;

/**
 * The workspace area `path` lies in, read from the path as written under
 * `home`; none when it lies in none. The judge and the hub read a shown
 * path by this one rule.
 */
export const workspaceArea = (
  path: string,
  home: string
): WorkspaceArea | undefined => {
  if (!path.startsWith(`${home}/`)) {
    return;
  }
  const match = AREA.exec(path.slice(home.length + 1));
  if (!match) {
    return;
  }
  return match[1]
    ? { kind: "scratch", id8: match[1] }
    : { kind: "clone", id8: match[2] };
};

/**
 * Whether a shown path the policy does not read is the hub's to decide: it
 * is absolute, names no `.` or `..`, lies in a workspace area as written and
 * at its real path both (so the hub, which reads only the words, judges the
 * file itself), and nothing but the home dir's deny refuses it (a credential
 * store stays refused).
 */
const handedToHub = (policy: Policy, path: string): boolean => {
  const written = workspaceArea(path, policy.home);
  if (
    !written ||
    path.split("/").some((part) => part === "." || part === "..")
  ) {
    return false;
  }
  try {
    const real = resolveReal(path);
    const home = resolveReal(policy.home);
    const actual = workspaceArea(real, home);
    return (
      actual?.kind === written.kind &&
      actual.id8 === written.id8 &&
      deepest(policy.denyRead, real) === home
    );
  } catch {
    return false;
  }
};

/** The cawco tool a harness's tool name is: Claude Code's and Codex's `mcp__cawco__<tool>`, OpenCode's `cawco_<tool>`, agy's `mcp_cawco_<tool>`. */
const CAWCO_PREFIX: Record<JudgedHarness, string | undefined> = {
  claude: "mcp__cawco__",
  opencode: "cawco_",
  pi: undefined,
  codex: "mcp__cawco__",
  agy: "mcp_cawco_",
};

const cawcoTool = (call: Call): string | undefined => {
  const prefix = CAWCO_PREFIX[call.harness];
  return prefix && call.tool.startsWith(prefix)
    ? call.tool.slice(prefix.length)
    : undefined;
};

/**
 * The path parameters of the fleet's other MCP servers whose names the
 * suffix rule ({@link PATH_KEY}) misses: chrome-devtools `upload_file`
 * `filePaths`. Every other path parameter of chrome-devtools (`filePath`,
 * `baseFilePath`, `currentFilePath`, `outputDirPath`) ends in a suffix the
 * rule covers. backlot, Exa, Firecrawl and mobbins take no local path; a
 * `file://` URL any of them is handed is judged by {@link URL_KEY}.
 */
const PATH_PARAMS = new Set(["filePaths"]);

/** A parameter named as a path: one ending in path, file, dir, directory or filename. */
const PATH_KEY = /(path|file|dir|directory|filename)$/iu;

/** A parameter named as a URL, which a `file://` value makes a path. */
const URL_KEY = /(url|urls|uri)$/iu;

const strings = (value: unknown): string[] => {
  if (typeof value === "string") {
    return value ? [value] : [];
  }
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item !== ""
      )
    : [];
};

/**
 * Every path an argument of a tool in no table names, at any depth: each
 * value of a parameter named as a path ({@link PATH_KEY}, {@link
 * PATH_PARAMS}), and each `file://` value of one named as a URL. A server
 * whose schemas are not known here is judged by its arguments' names, so a
 * path it is handed never escapes the policy.
 */
const argumentPaths = (input: unknown): string[] => {
  const found: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    for (const [key, field] of Object.entries(value)) {
      if (PATH_KEY.test(key) || PATH_PARAMS.has(key)) {
        found.push(...strings(field));
      } else if (URL_KEY.test(key)) {
        found.push(
          ...strings(field)
            .filter((url) => url.startsWith("file:"))
            .map((url) => fileURLToPath(url))
        );
      }
      walk(field);
    }
  };
  walk(input);
  return found;
};

/** OpenCode's patch headers: each file a patch adds, deletes, updates or moves to (packages/opencode/src/patch). */
const PATCH_HEADER =
  /^\*\*\* (?:Add File|Delete File|Update File|Move to):(.*)$/u;

const patchPaths = (text: string): string[] =>
  text
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .flatMap((line) => {
      const path = PATCH_HEADER.exec(line)?.[1]?.trim();
      return path ? [path] : [];
    });

/** A glob pattern's part before its first wildcard, as a path; `.` when it starts with one. */
const globRoot = (pattern: string): string => {
  const parts = pattern.split("/");
  const fixed: string[] = [];
  for (const part of parts) {
    if (WILDCARD.test(part)) {
      break;
    }
    fixed.push(part);
  }
  const root = fixed.join("/");
  if (root !== "") {
    return root;
  }
  return pattern.startsWith("/") ? "/" : ".";
};

const WILDCARD = /[*?[\]{}]/u;

/**
 * `~` and `~/…` name the home dir, as several tools expand them. Joined as
 * written, as {@link against} joins.
 */
const expandHome = (path: string, home: string): string => {
  if (path === "~") {
    return home;
  }
  return path.startsWith("~/") ? `${home}/${path.slice(2)}` : path;
};

/**
 * `path` against each base it may be resolved from. Joined as written, never
 * normalised: {@link resolveReal} climbs each `..` from where a link points.
 */
const against = (
  path: string,
  bases: readonly string[],
  home: string
): string[] => {
  const expanded = expandHome(path, home);
  return isAbsolute(expanded)
    ? [expanded]
    : bases.map((base) => `${base}/${expanded}`);
};

interface Target {
  readonly access: Access;
  readonly path: string;
  /** A shown path named absolute: the hub decides it when the policy does not read it ({@link handedToHub}). */
  readonly shown?: boolean;
}

/** Every path a call names, with the access it asks. */
const targets = (policy: Policy, call: Call): Target[] => {
  const { input } = call;
  if (!isRecord(input)) {
    throw new Error("its input is not an object");
  }
  const fields = BUILT_INS[call.harness][call.tool];
  if (!fields) {
    // An MCP tool: every path it names is judged against the call's
    // directory and the clone, where an MCP server may resolve it. A cawco
    // tool names the files its table says, with the access it gives each;
    // any other tool, those its arguments' names say, each judged as a
    // write, the strictest case.
    const cawco = cawcoTool(call);
    const paths: { access: Access | "show"; path: string }[] =
      cawco === undefined
        ? argumentPaths(input).map((path) => ({ path, access: "write" }))
        : Object.entries(CAWCO_FILE_ARGS[cawco] ?? {}).flatMap(
            ([key, access]) =>
              strings(input[key]).map((path) => ({ path, access }))
          );
    return paths.flatMap(({ path, access }) =>
      against(path, [...new Set([call.cwd, policy.clone])], policy.home).map(
        (resolved): Target =>
          access === "show"
            ? { path: resolved, access: "read", shown: isAbsolute(path) }
            : { path: resolved, access }
      )
    );
  }
  const base =
    typeof input.path === "string" && input.path !== ""
      ? against(input.path, [call.cwd], policy.home)[0]
      : call.cwd;
  return fields.flatMap((field) => {
    const value = input[field.key];
    if (typeof value !== "string" || value === "") {
      if (field.required) {
        throw new Error(`it names no ${field.key}`);
      }
      return field.defaultsToCwd
        ? [{ path: call.cwd, access: field.access }]
        : [];
    }
    if (field.patch) {
      return patchPaths(value).flatMap((path) =>
        against(path, [call.cwd], policy.home).map((resolved) => ({
          path: resolved,
          access: field.access,
        }))
      );
    }
    if (field.glob) {
      return against(globRoot(value), [base], policy.home).map((resolved) => ({
        path: resolved,
        access: field.access,
      }));
    }
    return against(value, [call.cwd], policy.home).map((resolved) => ({
      path: resolved,
      access: field.access,
    }));
  });
};

/**
 * Whether a harness may make `call`: the first path it names that the policy
 * refuses, said for the model with what was refused and why; allowed when
 * every path is. A call the judge cannot read is refused.
 */
export const judgeCall = (policy: Policy, call: Call): Verdict => {
  let session: Policy;
  let named: Target[];
  try {
    session = sessionPolicy(policy, call);
    named = targets(policy, call);
  } catch (error) {
    return refused(
      `cawco: ${call.tool} was refused: the workspace's file policy could not judge it (${error instanceof Error ? error.message : String(error)}).`
    );
  }
  for (const target of named) {
    const verdict = judge(session, target.path, target.access);
    if (!(verdict.ok || (target.shown && handedToHub(session, target.path)))) {
      return refused(
        `cawco: ${call.tool} was refused: ${target.access === "read" ? "reading" : "writing"} ${verdict.reason}`
      );
    }
  }
  // A nested harness reads the instruction files of each folder down to a
  // file it reads, edits or writes, as the call runs: a link made since the
  // turn began is judged before the call reads through it.
  return judgeInstructions(session, {
    harness: call.harness,
    cwd: call.cwd,
    reading: named.map((target) => target.path),
    refusing: call.tool,
  });
};

/**
 * Where a harness reads its instruction files from a folder: on the host,
 * outside any boundary, and through any link they are (an include-time
 * realpath is the harness's own business; the file's own read follows the
 * link). Each instruction file the harness would read from inside the
 * workspace's clone is judged as a read of the session's own
 * ({@link judgeInstructions}), so a link a command makes, or one the
 * repository arrives with, never takes a file the workspace does not read
 * into the model's context. Host probe 2026-11-26 (Claude Code 2.1.326,
 * OpenCode 2.3.0, pi 1.5.2, Codex 0.169.0; the project's
 * `assets/tsk-528/`): each read an instruction file that is a link to a
 * file outside the clone, and none expanded an include out of it: Claude
 * Code refuses an `@path` import whose real path is outside the project
 * until the person approves external imports there, which no workspace's
 * clone has; the others take none.
 */
interface InstructionFiles {
  /**
   * The include it expands while it reads one, the included path in group
   * 1: agy's `@[label](path)` (the project's `assets/cc1d4173/REPORT.md`),
   * each included file judged as the instruction file is, and read for its
   * own includes.
   */
  readonly includes?: RegExp;
  /** Each name it reads from a folder, as a path from that folder. */
  readonly names: readonly string[];
  /**
   * It also reads them from each folder below the clone's root that a file
   * it reads lies under, mid-turn: Claude Code's nested `CLAUDE.md`, loaded
   * when a tool reads, edits or writes a file there; OpenCode 2.3's read
   * tool, which hands back each `AGENTS.md` from the clone's root down to
   * the file it read.
   */
  readonly nested: boolean;
}

/**
 * Each harness's instruction files. Claude Code: `CLAUDE.md`,
 * `CLAUDE.local.md` and `.claude/CLAUDE.md` (code.claude.com/docs/en/memory);
 * its `.claude/rules` keeps a linked rule from outside the project out on its
 * own (the probe's `cc-rules-symlink`, `cc-rules-dirlink`), as it does an
 * import. OpenCode 2.3.0: `AGENTS.md` alone (its instruction plugin's
 * `projectSource`, `targets:["AGENTS.md"]`), reread when it changes, mid-turn
 * (the probe's `oc-midturn-watch`). pi 1.5.2: the first of its candidates in
 * each folder (resource-loader.js `loadContextFileFromDir`). Codex 0.169.0:
 * `AGENTS.override.md`, then `AGENTS.md`, from the repository's root down to
 * its folder. agy: `AGENTS.md` with its includes.
 */
const INSTRUCTIONS: Record<JudgedHarness, InstructionFiles> = {
  claude: {
    names: ["CLAUDE.md", "CLAUDE.local.md", ".claude/CLAUDE.md"],
    nested: true,
  },
  opencode: { names: ["AGENTS.md"], nested: true },
  pi: {
    names: [
      "AGENTS.override.md",
      "AGENTS.md",
      "AGENTS.MD",
      "CLAUDE.md",
      "CLAUDE.MD",
    ],
    nested: false,
  },
  codex: { names: ["AGENTS.override.md", "AGENTS.md"], nested: false },
  agy: {
    names: ["AGENTS.md"],
    nested: false,
    includes: /@\[[^\]\n]*\]\(([^)\n]+)\)/gu,
  },
};

/** `path` without `.` or `..` parts, as written: the folders a harness names on its way to it. */
const lexical = (path: string): string => {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") {
      parts.pop();
    } else if (part && part !== ".") {
      parts.push(part);
    }
  }
  return `/${parts.join("/")}`;
};

/** The folders from the clone's root down to `dir`, as written; none when `dir` lies outside the clone. */
const foldersDownTo = (clone: string, dir: string): string[] => {
  const at = lexical(dir);
  if (!within(at, clone)) {
    return [];
  }
  const below = at.slice(clone.length).split("/").filter(Boolean);
  return [
    clone,
    ...below.map((_, index) => join(clone, ...below.slice(0, index + 1))),
  ];
};

/** Every folder in the clone, links to folders not followed (each is judged where a harness reads through it, {@link foldersDownTo}), `.git` left out. */
const everyFolder = (clone: string): string[] => {
  const found = [clone];
  // A for-of over an array reaches what is pushed onto it as it runs.
  for (const dir of found) {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== ".git") {
        found.push(join(dir, entry.name));
      }
    }
  }
  return found;
};

/** Whether anything is at `path`, a link that leads nowhere included. */
const present = (path: string): boolean => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

/** `path`'s real path, or how it fails to resolve. */
const realOrWhy = (path: string): string => {
  try {
    return resolveReal(path);
  } catch (error) {
    return `nowhere it can be resolved (${error instanceof Error ? error.message : String(error)})`;
  }
};

/**
 * The first file of `files` (instruction files, or what one includes) that
 * `policy` does not let the session read, as the instruction file that led
 * to it and where it resolves; reading each it does read for its includes.
 */
const firstUnread = (
  policy: Policy,
  harness: InstructionFiles,
  files: readonly { file: string; from: string }[],
  seen: Set<string>
): { file: string; from: string; real: string } | undefined => {
  for (const { file, from } of files) {
    if (seen.has(file) || !present(file)) {
      continue;
    }
    seen.add(file);
    if (!judge(policy, file, "read").ok) {
      return { file, from, real: realOrWhy(file) };
    }
    if (!harness.includes) {
      continue;
    }
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const included = [...text.matchAll(harness.includes)].flatMap((match) =>
      against(match[1].trim(), [dirname(file)], policy.home)
    );
    const unread = firstUnread(
      policy,
      harness,
      included.map((path) => ({ file: path, from })),
      seen
    );
    if (unread) {
      return unread;
    }
  }
};

/**
 * Whether a harness may put instruction file `file`, which it found, in the
 * model's context: one outside the workspace's clone (a folder above it) is
 * the host's own, and one inside it must be a file the workspace reads
 * ({@link judgeInstructions}). A place's folder is its person's own.
 */
export const instructionRead = (policy: Policy, file: string): boolean =>
  policy.protectConfig !== undefined ||
  !within(lexical(file), policy.clone) ||
  judge(policy, file, "read").ok;

/** What {@link judgeInstructions} judges. */
export interface InstructionsAt {
  /** The session's folder: its harness reads instruction files from the clone's root down to it. */
  readonly cwd: string;
  readonly harness: JudgedHarness;
  /**
   * The paths a tool call names: a nested harness reads the instruction
   * files of each folder down to each as the call runs
   * ({@link InstructionFiles.nested}). Absent at a launch or a turn, when
   * every folder in the clone is judged for a nested harness.
   */
  readonly reading?: readonly string[];
  /** What is refused, as the refusal begins: `this turn`, a tool's name. */
  readonly refusing: string;
}

/**
 * Whether the instruction files `at.harness` reads from the workspace's
 * clone are files the workspace reads: each, and each file it includes, at
 * its real path, by {@link judge}. The first that is not refuses, in one
 * sentence naming it and where it leads. Judged at a session's launch and
 * before each of its turns (agent session.ts), and for a nested harness
 * before each file call ({@link judgeCall}) and, on OpenCode, before each
 * model request (opencode-plugin-module.ts), so no read of the harness's
 * own takes a file the workspace does not read into the model's context.
 * A place's own folder is its person's, whose instruction files are theirs
 * to link anywhere: a place's policy alone has `protectConfig`
 * (workspace-policy.ts), and nothing is judged for it.
 */
export const judgeInstructions = (
  policy: Policy,
  at: InstructionsAt
): Verdict => {
  if (policy.protectConfig !== undefined) {
    return ALLOWED;
  }
  const harness = INSTRUCTIONS[at.harness];
  const folders = new Set(foldersDownTo(policy.clone, at.cwd));
  if (harness.nested) {
    const below =
      at.reading?.flatMap((dir) => foldersDownTo(policy.clone, dir)) ??
      everyFolder(policy.clone);
    for (const dir of below) {
      folders.add(dir);
    }
  }
  const files = [...folders].flatMap((dir) =>
    harness.names.map((name) => {
      const file = join(dir, name);
      return { file, from: file };
    })
  );
  const unread = firstUnread(policy, harness, files, new Set());
  if (!unread) {
    return ALLOWED;
  }
  const what =
    unread.file === unread.from
      ? `${unread.file} is an instruction file ${at.harness} reads on the host`
      : `${unread.from}, an instruction file ${at.harness} reads on the host, includes ${unread.file}`;
  return refused(
    `cawco: ${at.refusing} was refused: ${what}, and it leads to ${unread.real}, which this workspace does not read, so remove it or point it inside the clone (${policy.clone}).`
  );
};
