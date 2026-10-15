/**
 * Judges whether a workspace's harness may read or write a path, by the
 * workspace's policy (`workspace-policy.ts` builds it; the agent writes it
 * into the workspace's state dir as `policy.json`). One judge for every
 * harness: Claude Code's PreToolUse hook (through the workspace's judge,
 * `boundary-judge.ts`), CawCo's OpenCode plugin and pi's file tools all hand
 * it the call as the harness sees it, and it answers with the first path the
 * call may not touch.
 *
 * It imports only node's built-ins: the judge runs it as a plain Bun script
 * from the workspace's state dir, and OpenCode's server imports that same copy.
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
import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Access = "read" | "write";

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
   * A project lead's place, a person's own folder (workspace-policy.ts
   * `isLeadPlace`): every path {@link protectedConfig} names is refused for
   * writing whether it exists or not. Its boundary stands nothing in for one
   * that is absent (never write into a person's own folder), so this judge,
   * and the place's guard after each command, keep it.
   */
  readonly protectConfig?: boolean;
  /** The workspace's scratch dir: where a refusal also says to write. */
  readonly scratch: string;
}

/**
 * Names a host harness, git or a host tool loads from a folder, outside any
 * boundary, wherever in the folder they lie: the harnesses' project config,
 * the editors' workspace settings, srt's own mandatory names. With
 * {@link PROTECTED_UNDER}, what a place's guard and judge protect.
 */
export const PROTECTED_NAMES: readonly string[] = [
  ".mcp.json",
  "opencode.json",
  "opencode.jsonc",
  ".opencode",
  ".vscode",
  ".idea",
  ".gitconfig",
  ".gitmodules",
  ".bashrc",
  ".bash_profile",
  ".zshrc",
  ".zprofile",
  ".profile",
  ".ripgreprc",
];

/** Names protected only inside a dir of the given name: Claude Code's project config, and git's config, hooks and submodule dirs. */
export const PROTECTED_UNDER: Readonly<Record<string, readonly string[]>> = {
  ".claude": [
    "settings.json",
    "settings.local.json",
    "hooks",
    "commands",
    "agents",
  ],
  ".git": ["config", "hooks", "modules"],
};

/**
 * The protected entry a path relative to a place lies at or in
 * ({@link PROTECTED_NAMES}, {@link PROTECTED_UNDER}), as a relative path;
 * none when it lies in none.
 */
export const protectedConfig = (relative: string): string | undefined => {
  const parts = relative.split("/").filter((part) => part && part !== ".");
  for (const [index, part] of parts.entries()) {
    const parent = index > 0 ? parts[index - 1] : undefined;
    if (
      PROTECTED_NAMES.includes(part) ||
      (parent !== undefined && PROTECTED_UNDER[parent]?.includes(part))
    ) {
      return parts.slice(0, index + 1).join("/");
    }
  }
};

export type Verdict =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** One tool call as a harness hands it over. */
export interface Call {
  /** The directory the harness resolves a relative path against. */
  readonly cwd: string;
  readonly harness: "claude" | "opencode" | "pi";
  readonly input: unknown;
  /**
   * OpenCode: the saved outputs this session may read back, each a file its
   * server named in the hint it gave the session ("full output saved to
   * <file>", with the file as the result's `metadata.outputPath`, 2.0.28) —
   * the session's own and its parent sessions' (the hint can hand the file
   * to a subagent). The bridge plugin records them as each call ends.
   */
  readonly savedOutputs?: readonly string[];
  readonly tool: string;
  /**
   * OpenCode: the dir its server saves a truncated tool output to
   * (`<data>/opencode/tool-output`, observed on 2.0.28). It holds every
   * session's on that server, named by tool-call id alone, so the session
   * reads none of it but {@link savedOutputs}.
   */
  readonly toolOutput?: string;
  /** Claude Code: the session's transcript, which says which `projects/<slug>/` dir is the session's own. */
  readonly transcript?: string;
}

const ALLOWED: Verdict = { ok: true };

/** Reads the policy the agent wrote; throws when it is not there or not one. */
export const readPolicy = (file: string): Policy => {
  const policy = JSON.parse(readFileSync(file, "utf8")) as Partial<Policy>;
  for (const key of [
    "allowRead",
    "allowWrite",
    "denyRead",
    "denyWrite",
  ] as const) {
    if (!Array.isArray(policy[key])) {
      throw new Error(`${file} has no ${key} list`);
    }
  }
  for (const key of ["clone", "home", "scratch"] as const) {
    if (typeof policy[key] !== "string") {
      throw new Error(`${file} names no ${key}`);
    }
  }
  return policy as Policy;
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

const resolve = (path: string, asWritten: ReadonlySet<string>): string => {
  if (!isAbsolute(path)) {
    throw new Error(`${path} is not an absolute path`);
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
      const { code } = error as NodeJS.ErrnoException;
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
export const judge = (
  policy: Policy,
  path: string,
  access: Access
): Verdict => {
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
        `${named} lies in ${denied}, which this workspace does not read. It reads its clone (${policy.clone}), its scratch dir (${policy.scratch}), toolchains and the user's Claude Code layer.`
      );
    }
    return ALLOWED;
  }
  const config =
    policy.protectConfig && within(real, policy.clone)
      ? protectedConfig(real.slice(policy.clone.length))
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
 * own `projects/<slug>/` dir (its transcripts and tool results) readable and
 * its auto memory there readable and writable. The transcript is named by the
 * CLI, never by the model. A transcript in no `projects/<slug>/` adds nothing.
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
  const own = resolveReal(project);
  const memory = resolveReal(join(project, "memory"));
  return {
    ...policy,
    allowRead: [...policy.allowRead, own, memory],
    allowWrite: [...policy.allowWrite, memory],
  };
};

/**
 * The policy an OpenCode session judges by: the workspace's, with its
 * server's saved-output dir denied ({@link Call.toolOutput}) and each output
 * it was told it saved ({@link Call.savedOutputs}) read back, a file deeper
 * than the dir. Every other file there is another session's.
 */
const opencodeSession = (policy: Policy, call: Call): Policy => ({
  ...policy,
  denyRead: call.toolOutput
    ? [...policy.denyRead, resolveDenied(call.toolOutput)]
    : policy.denyRead,
  allowRead: [
    ...policy.allowRead,
    ...(call.savedOutputs ?? [])
      .filter((path) => isAbsolute(path))
      .map(resolveReal),
  ],
});

/**
 * The policy a call is judged by: the workspace's, with what the harness
 * itself keeps for the session to read back. Claude: {@link claudeSession}.
 * OpenCode: {@link opencodeSession}. pi keeps its own in the host's temp dir,
 * which the policy already reads.
 */
const sessionPolicy = (policy: Policy, call: Call): Policy => {
  if (call.harness === "claude") {
    return claudeSession(policy, call.transcript);
  }
  if (call.harness === "opencode") {
    return opencodeSession(policy, call);
  }
  return policy;
};

/** A path field of a built-in tool, and what reading or writing it is. */
interface Field {
  readonly access: Access;
  /** Where the tool searches when the field is left out: the call's cwd. */
  readonly defaultsToCwd?: boolean;
  /** A glob pattern: its part before the first wildcard is the path. */
  readonly glob?: boolean;
  readonly key: string;
  /** OpenCode's patch: the paths its patch text names. */
  readonly patch?: boolean;
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
 * A shell tool is judged by the boundary its command runs in, never here.
 * Every tool not in its harness's table is judged by {@link argumentPaths}.
 */
const BUILT_INS: Record<Call["harness"], Record<string, readonly Field[]>> = {
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
};

/**
 * CawCo's own MCP server: the arguments of each of its tools that name a
 * file on the machine, from the input schemas the hub serves
 * (packages/hub/src: artifacts/tools.ts, delegation-tools.ts), each with
 * what the hub does to the file on the session's behalf. Read: the hub
 * reads it and hands it to the person or a service, never back to the
 * session — `show_image`'s `path` (the dashboard renders it from disk),
 * `send_to_user`'s `attachments` (sent to Telegram), `artifact_create`'s
 * `dir` (a preview's folder served, or a page's page.html read) and
 * `generate_image`'s `reference_images` (uploaded with the prompt). Write:
 * `generate_image`'s `output_path`, the new PNG. Each is judged against the
 * workspace's own policy, its read set like its write set: the hub reads
 * outside any boundary, so a file the session may not read is not shown,
 * sent or uploaded for it either. Every other argument of a cawco
 * tool names no file, whatever its name: `artifact_create`'s `path` is a
 * preview's URL path, `artifact_update`'s `patch[].path` a JSON Pointer,
 * `workflow_read`'s `path` a path into a result, `run_workflow`'s
 * `workspace.path` where on its machine a workflow's steps run, `folder_*`
 * and `memory_*`'s `path` a file in the project's folder on the hub,
 * `admin_memory_write`'s `path` a document under the fleet's memories, a
 * connector's or relay's `*_path` a dot path into what it is answered,
 * `delegate`'s and `task_*`'s `outputs` files in the delegate's own
 * workspace. A cawco tool missing here names no file. The `mcp-file-args`
 * probe holds this table to the hub's schemas.
 */
export const CAWCO_FILE_ARGS: Readonly<
  Record<string, Readonly<Record<string, Access>>>
> = {
  artifact_create: { dir: "read" },
  generate_image: { output_path: "write", reference_images: "read" },
  send_to_user: { attachments: "read" },
  show_image: { path: "read" },
};

/** The cawco tool a harness's tool name is: Claude Code's `mcp__cawco__<tool>`, OpenCode's `cawco_<tool>`. */
const CAWCO_PREFIX: Partial<Record<Call["harness"], string>> = {
  claude: "mcp__cawco__",
  opencode: "cawco_",
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
const PATH_KEY = /(path|file|dir|directory|filename)$/i;

/** A parameter named as a URL, which a `file://` value makes a path. */
const URL_KEY = /(url|urls|uri)$/i;

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
  /^\*\*\* (?:Add File|Delete File|Update File|Move to):(.*)$/;

const patchPaths = (text: string): string[] =>
  text
    .replace(/\r\n?/g, "\n")
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

const WILDCARD = /[*?[\]{}]/;

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
}

/** Every path a call names, with the access it asks. */
const targets = (policy: Policy, call: Call): Target[] => {
  if (
    !call.input ||
    typeof call.input !== "object" ||
    Array.isArray(call.input)
  ) {
    throw new Error("its input is not an object");
  }
  const input = call.input as Record<string, unknown>;
  const fields = BUILT_INS[call.harness][call.tool];
  if (!fields) {
    // An MCP tool: every path it names is judged against the call's
    // directory and the clone, where an MCP server may resolve it. A cawco
    // tool names the files its table says, with the access it gives each;
    // any other tool, those its arguments' names say, each judged as a
    // write, the strictest case.
    const cawco = cawcoTool(call);
    const paths: { access: Access; path: string }[] =
      cawco === undefined
        ? argumentPaths(input).map((path) => ({ path, access: "write" }))
        : Object.entries(CAWCO_FILE_ARGS[cawco] ?? {}).flatMap(
            ([key, access]) =>
              strings(input[key]).map((path) => ({ path, access }))
          );
    return paths.flatMap(({ path, access }) =>
      against(path, [...new Set([call.cwd, policy.clone])], policy.home).map(
        (resolved) => ({ path: resolved, access })
      )
    );
  }
  const base =
    typeof input.path === "string" && input.path !== ""
      ? (against(input.path, [call.cwd], policy.home)[0] as string)
      : call.cwd;
  return fields.flatMap((field) => {
    const value = input[field.key];
    if (typeof value !== "string" || value === "") {
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
    if (!verdict.ok) {
      return refused(
        `cawco: ${call.tool} was refused: ${target.access === "read" ? "reading" : "writing"} ${verdict.reason}`
      );
    }
  }
  return ALLOWED;
};
