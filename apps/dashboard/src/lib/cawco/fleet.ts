/**
 * The dashboard's half of fleet MCP, skills and subagents (NEW.md §11): the
 * hub's desired state over REST, plus the two machine-scoped reads — a
 * marketplace's catalog and the subagent files a machine really has. Every
 * write fans out to the online machines from the hub itself, so nothing here
 * ever loops over machines — it changes the fleet's mind and lets the
 * `instances` frames say what came of it.
 */
import {
  CAWCO_OAUTH_URL,
  type ConfigInspection,
  type FleetAgent,
  type FleetConfig,
  type FleetHook,
  type FleetMarketplace,
  type FleetMcpConfig,
  type FleetMcpServer,
  type FleetPlugin,
  type FleetSkillMeta,
  type FsEntry,
  MARKETPLACE_CATALOG,
  type MachineHookScript,
  type MachineMemorySet,
  type MarketplacePluginInfo,
  type McpHttpServerConfig,
  type McpSSEServerConfig,
  parseAgentFrontMatter,
} from "@cawco/core";
import { CONTROL_TIMEOUT_MS } from "#lib/config.js";
import { type Machine, machineControl, machineFs } from "./client.svelte";
import type { ListedVersion } from "./config/PreviousVersions.svelte";
import { homeOf } from "./tasks.svelte";

/** The fleet's user-scope CLAUDE.md, as the hub stores it (NEW.md §11). */
export interface FleetMemoryRow {
  content: string;
  hash: string;
  /** ISO: a `Date` crossing JSON is a string by the time it is read here. */
  updatedAt: string;
}

/**
 * One document the main memory links, as the hub stores it: the path it lands
 * at under `~/.claude/memories/`, and the markdown that goes there.
 */
export interface FleetMemoryDocRow extends FleetMemoryRow {
  path: string;
}

/**
 * What `GET /api/fleet` answers with. The skills are a sibling of the config
 * rather than part of it: what the machines get carries every skill's files,
 * and a catalog read should not weigh megabytes.
 */
export interface FleetSnapshot {
  /**
   * The subagents, file and all: a definition is a page of markdown, so the
   * editor is seeded from this read rather than fetching each one again.
   */
  agents: FleetAgent[];
  config: FleetConfig;
  /** Null while the fleet keeps no memory, which is where every fleet starts. */
  memory: FleetMemoryRow | null;
  /**
   * The documents the main memory links, by path. Empty until somebody splits
   * the memory into a set, and carried with their files for the same reason the
   * subagents are — each one is a page of markdown.
   */
  memoryDocs: FleetMemoryDocRow[];
  skills: FleetSkillMeta[];
  /** Machines the hub could not write the subagents to, by machineId → why. */
  unpushable: Record<string, string>;
}

/**
 * What a skill write answers with: the row as the hub stored it, plus — when
 * the repo held several skills and the source named none — the ones it could
 * have meant. The row is stored either way, error and all.
 */
export interface SkillWriteResult extends FleetSkillMeta {
  choices?: string[];
}

/** The charset MCP server names are held to, on the hub and here. */
const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Splits an args field, or an installer command line, on runs of whitespace. */
const WHITESPACE_PATTERN = /\s+/;

/**
 * Names Claude Code keeps for its own servers. The hub turns these away, so the
 * form does too — a refusal you can read before you click beats one after.
 */
const RESERVED = [
  "workspace",
  "claude-in-chrome",
  "computer-use",
  "claude preview",
  "claude browser",
];

/** Why this name cannot be used, in a sentence, or nothing when it can. */
export function mcpNameProblem(
  name: string,
  taken: readonly string[] = []
): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Give the server a name.";
  }
  if (!NAME_PATTERN.test(trimmed)) {
    return "Letters, digits, dashes and underscores only.";
  }
  if (RESERVED.includes(trimmed.toLowerCase())) {
    return `Claude Code keeps “${trimmed}” for itself.`;
  }
  if (taken.includes(trimmed)) {
    return `There is already a server called “${trimmed}”.`;
  }
  return undefined;
}

/**
 * A name for the server a package would run — its last path segment, minus any
 * version, in the charset names are held to. Only a suggestion: the field it
 * fills stays editable.
 */
export function suggestMcpName(pkg: string): string {
  const segment = pkg.trim().split("/").pop() ?? "";
  const at = segment.lastIndexOf("@");
  const bare = at > 0 ? segment.slice(0, at) : segment;
  return bare.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Remote servers are the ones with an endpoint; stdio's `type` is optional. */
export const isRemoteMcp = (
  config: FleetMcpConfig
): config is McpHttpServerConfig | McpSSEServerConfig => "url" in config;

/** The one line a row shows: the command it runs, or the endpoint it calls. */
export const describeMcp = (config: FleetMcpConfig): string =>
  isRemoteMcp(config)
    ? config.url
    : [config.command, ...(config.args ?? [])].join(" ");

/**
 * Splits an args field the naive way — on whitespace, with no quoting. Args
 * with spaces in them are rare enough that the form says so rather than
 * shipping a shell parser nobody asked for.
 */
export const splitArgs = (line: string): string[] =>
  line.trim().split(WHITESPACE_PATTERN).filter(Boolean);

/** Drops the blank rows a key/value editor always ends up carrying. */
export function pairsToRecord(
  rows: readonly { key: string; value: string }[]
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) {
      record[key] = row.value;
    }
  }
  return record;
}

/** A record back into editor rows, always with one empty row to type into. */
export const recordToPairs = (
  record: Record<string, string> | undefined
): { key: string; value: string }[] => [
  ...Object.entries(record ?? {}).map(([key, value]) => ({ key, value })),
  { key: "", value: "" },
];

/** The charset skill names are held to, on the hub and here. */
const SKILL_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/** The source forms the hub's resolver takes as they are. */
const SKILL_SCHEME = /^(?:skills:|github:|npm:|https?:\/\/)/;

/** The scheme prefix a skill source names itself with, when it has one. */
const SKILL_SOURCE_SCHEME_PATTERN = /^(skills|github|npm):/;

/** Splits a skill source's path into segments, at either kind of separator. */
const SKILL_PATH_SPLIT_PATTERN = /[/?]/;

/**
 * The words an installer command line is built out of — the runner, its
 * subcommand, and the tool being run. A paste is stripped down to the slug
 * they surround.
 */
const WRAPPERS = new Set([
  "bunx",
  "bun",
  "npx",
  "npm",
  "pnpm",
  "pnpx",
  "yarn",
  "dlx",
  "x",
  "run",
  "skills",
  "add",
  "install",
  "i",
]);

/** Why this name cannot be used, in a sentence, or nothing when it can. */
export function skillNameProblem(
  name: string,
  taken: readonly string[] = []
): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Give the skill a name.";
  }
  if (!SKILL_NAME_PATTERN.test(trimmed)) {
    return "Letters, digits, dots, dashes and underscores only.";
  }
  if (taken.includes(trimmed)) {
    return `There is already a skill called “${trimmed}”.`;
  }
  return undefined;
}

/**
 * The source a paste really names. An installer command line is how a skill is
 * written down everywhere, so the field takes one whole and keeps the slug —
 * cawco fetches the files itself and runs no installer.
 */
export function normalizeSkillSource(input: string): string {
  const trimmed = input.trim();
  if (SKILL_SCHEME.test(trimmed)) {
    return trimmed;
  }
  const slug = trimmed
    .split(WHITESPACE_PATTERN)
    .filter((word) => word !== "" && !word.startsWith("-"))
    .find((word) => !WRAPPERS.has(word.toLowerCase()));
  if (!slug) {
    return "";
  }
  return SKILL_SCHEME.test(slug) ? slug : `skills:${slug}`;
}

/**
 * The name a source suggests: the skill it filters for, or the last segment of
 * its path, in the charset names are held to. Only a suggestion — the field it
 * fills stays editable.
 */
export function suggestSkillName(source: string): string {
  const scheme = SKILL_SOURCE_SCHEME_PATTERN.exec(source)?.[1];
  const [body] = source.slice(scheme ? scheme.length + 1 : 0).split("#");
  const at = body.lastIndexOf("@");
  // `@` names the skill in a `skills:` slug, and a ref or a version elsewhere.
  const filter =
    at > 0 && (scheme === undefined || scheme === "skills")
      ? body.slice(at + 1)
      : "";
  const segments = (at > 0 ? body.slice(0, at) : body)
    .split(SKILL_PATH_SPLIT_PATTERN)
    .filter(Boolean);
  // A plain URL points at the skill's own file; the directory holds its name.
  if (segments.at(-1)?.toLowerCase() === "skill.md") {
    segments.pop();
  }
  return (filter || segments.at(-1) || "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The same source, narrowed to one skill of a repo that holds several. */
export function pickSkill(source: string, choice: string): string {
  const hash = source.indexOf("#");
  const body = hash === -1 ? source : source.slice(0, hash);
  const at = body.lastIndexOf("@");
  return `${at > 0 ? body.slice(0, at) : body}@${choice}${hash === -1 ? "" : source.slice(hash)}`;
}

/** A resolved skill's size, in the units a download is talked about in. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} kB`;
  }
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * A machine that can answer for a marketplace: online, and its last report says
 * the marketplace is really linked there. Any one will do — the clone is the
 * same on all of them.
 */
export const catalogHost = (
  machines: readonly Machine[],
  name: string
): Machine | undefined =>
  machines.find(
    (machine) =>
      machine.status === "online" &&
      machine.fleet?.marketplaces?.[name]?.state === "applied"
  );

/**
 * What the hub said went wrong. Elysia answers a refused write with a bare
 * string, so the body is the sentence; the status is the fallback for a hub
 * that fell over without one.
 */
const TRAILING_STOPS = /\.+$/;

async function said(response: Response): Promise<string> {
  const body = (await response.text()).trim();
  if (!body) {
    return `the hub answered ${response.status}`;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      const { message, error } = parsed as {
        message?: unknown;
        error?: unknown;
      };
      if (typeof message === "string") {
        return message;
      }
      if (typeof error === "string") {
        return error;
      }
    }
  } catch {
    // A plain-text refusal, which is Elysia's own default.
  }
  return body;
}

async function send<T>(
  url: string,
  init: RequestInit,
  attempt: string
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    // The hub's own sentences end in a full stop; the one added here must not double it.
    const reason = (await said(response)).replace(TRAILING_STOPS, "");
    throw new Error(`Could not ${attempt} — ${reason}.`);
  }
  return (await response.json()) as T;
}

const put = <T>(url: string, body: unknown, attempt: string): Promise<T> =>
  send<T>(
    url,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    attempt
  );

/**
 * `body` is for the one row whose identity will not fit in a path: a linked
 * document is keyed by `models/claude-opus-5.md`, and a slash in a route
 * parameter is a route somewhere else.
 */
async function erase(
  url: string,
  attempt: string,
  body?: unknown
): Promise<void> {
  const response = await fetch(url, {
    method: "DELETE",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    throw new Error(`Could not ${attempt} — ${await said(response)}.`);
  }
}

export const saveMcpServer = (
  name: string,
  config: FleetMcpConfig,
  enabled?: boolean
): Promise<FleetMcpServer> =>
  put(
    `/api/fleet/mcp/${encodeURIComponent(name)}`,
    { config, enabled },
    `save ${name}`
  );

export const removeMcpServer = (name: string): Promise<void> =>
  erase(`/api/fleet/mcp/${encodeURIComponent(name)}`, `remove ${name}`);

/**
 * Signs this browser in to a fleet MCP server: the hub answers with the
 * authorization page, which this window goes to, and the authorization server
 * sends it back to the hub under the address it is already using. That is what
 * lets a phone, or any browser, finish it, whichever machine runs the agent.
 */
export const signInToMcp = async (name: string): Promise<void> => {
  const { origin } = window.location;
  const { authorizationUrl, via } = await send<{
    authorizationUrl: string;
    via: "install" | "cawco";
  }>(
    `/api/fleet/mcp/${encodeURIComponent(name)}/sign-in`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin }),
    },
    `start sign-in to ${name}`
  );
  if (via === "install") {
    window.location.assign(authorizationUrl);
    return;
  }
  // CawCo's page hands the sign-in back to this install. The address rides in
  // the fragment, which the browser never sends to a server.
  const hop = btoa(JSON.stringify({ origin, auth: authorizationUrl }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  window.location.assign(`${CAWCO_OAUTH_URL}/start#${hop}`);
};

/**
 * Hands the provider's answer to the hub, which finishes the sign-in by
 * exchanging the code. It answers with the server that is now signed in.
 */
export const completeMcpSignIn = (
  code: string,
  state: string,
  iss: string | null
): Promise<{ name: string }> =>
  send(
    "/api/fleet/mcp/oauth/complete",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state, ...(iss ? { iss } : {}) }),
    },
    "finish the sign-in"
  );

/**
 * What `/mcp auth [server]` means in a composer. Claude Code's own `/mcp` has
 * no `auth`, and the hub signs fleet servers in, so the dashboard answers it:
 * the server is matched without regard to case, and with no name it is the one
 * server still waiting for a sign-in. `none` means the text is not this command
 * and goes to the agent as typed.
 */
const MCP_AUTH_RE = /^\/mcp\s+(?:auth|login)(?:\s+(\S+))?$/i;

export type McpSignInIntent =
  | { kind: "none" }
  | { kind: "go"; name: string }
  | { kind: "say"; level: "error" | "info"; message: string };

export const mcpSignInIntent = (
  text: string,
  servers: readonly FleetMcpServer[]
): McpSignInIntent => {
  const match = text.trim().match(MCP_AUTH_RE);
  if (!match) {
    return { kind: "none" };
  }
  const oauth = servers.filter((server) => server.auth?.mode === "oauth");
  const waiting = oauth.filter((server) => server.auth?.state !== "signed-in");
  const names = (list: readonly FleetMcpServer[]) =>
    list.map((server) => server.name).join(", ");
  const [, asked] = match;
  if (asked) {
    const found = oauth.find(
      (server) => server.name.toLowerCase() === asked.toLowerCase()
    );
    if (found) {
      return { kind: "go", name: found.name };
    }
    return {
      kind: "say",
      level: "error",
      message: oauth.length
        ? `No sign-in server named "${asked}". Servers that sign in: ${names(oauth)}.`
        : "No fleet MCP server uses a sign-in.",
    };
  }
  if (waiting.length === 1) {
    return { kind: "go", name: waiting[0].name };
  }
  if (waiting.length === 0) {
    return {
      kind: "say",
      level: "info",
      message: oauth.length
        ? `Every server that signs in is already signed in (${names(oauth)}).`
        : "No fleet MCP server uses a sign-in.",
    };
  }
  return {
    kind: "say",
    level: "error",
    message: `More than one server needs a sign-in: ${names(waiting)}. Say which: /mcp auth <server>.`,
  };
};

export const saveMarketplace = (
  name: string,
  source: string
): Promise<FleetMarketplace> =>
  put(
    `/api/fleet/marketplaces/${encodeURIComponent(name)}`,
    { source },
    `link ${name}`
  );

export const removeMarketplace = (name: string): Promise<void> =>
  erase(
    `/api/fleet/marketplaces/${encodeURIComponent(name)}`,
    `unlink ${name}`
  );

export const savePlugin = (
  id: string,
  patch: { enabled?: boolean }
): Promise<FleetPlugin> =>
  put(`/api/fleet/plugins/${encodeURIComponent(id)}`, patch, `save ${id}`);

export const removePlugin = (id: string): Promise<void> =>
  erase(`/api/fleet/plugins/${encodeURIComponent(id)}`, `remove ${id}`);

/**
 * Resolves a plugin's bytes at the hub again — the answer to a plugin the hub
 * could not fetch, and to a machine that could not fetch it for itself. Comes
 * back with the row, `error` and all, so a retry that failed again says so
 * without a reload.
 */
export const refreshPlugin = (id: string): Promise<FleetPlugin> =>
  send(
    `/api/fleet/plugins/${encodeURIComponent(id)}/refresh`,
    { method: "POST" },
    `refresh ${id}`
  );

/**
 * Stores a skill and resolves it on the hub, once, for every machine. A source
 * the hub could not resolve still answers with a row — the failure is the row's
 * to carry, not this call's to throw.
 */
export const saveSkill = (
  name: string,
  body: { source: string; enabled?: boolean }
): Promise<SkillWriteResult> =>
  put(`/api/fleet/skills/${encodeURIComponent(name)}`, body, `save ${name}`);

/**
 * What a machine really has, fleet or not (NEW.md §11), and what a session in
 * `cwd` would see. Asked on demand and never stored: it is the machine's own
 * word at the moment of asking.
 */
export const inspectMachine = (
  machineId: string,
  cwd?: string
): Promise<ConfigInspection> =>
  send(
    `/api/agents/${encodeURIComponent(machineId)}/inspect`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cwd ? { cwd } : {}),
    },
    "read what this machine has"
  );

/**
 * A skill somebody wrote on one machine, taken into the fleet: the hub reads
 * its files off that machine and stores them like any it fetched itself.
 */
export const adoptSkill = (
  name: string,
  machineId: string,
  cwd?: string
): Promise<FleetSkillMeta> =>
  put(
    `/api/fleet/skills/${encodeURIComponent(name)}`,
    { fromMachine: machineId, ...(cwd ? { cwd } : {}) },
    `adopt ${name}`
  );

/**
 * The fleet's copy of a skill over the one a machine edited. The machine sets
 * its edited copy aside before it writes the fleet's.
 */
export const pushSkill = (name: string, machineId: string): Promise<unknown> =>
  send(
    `/api/fleet/skills/${encodeURIComponent(name)}/push`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId }),
    },
    "overwrite this machine"
  );

/**
 * What a skill used to be, newest first, without its files — the hub keeps a
 * version on every change to the fleet's copy, on a delete, and of a
 * machine's edited copy an overwrite replaced.
 */
export const skillHistory = (name: string): Promise<ListedVersion[]> =>
  send(
    `/api/fleet/skills/history?name=${encodeURIComponent(name)}`,
    {},
    "load this skill’s history"
  );

/** Writes a past version back as the fleet's copy, keeping what it replaces. */
export const restoreSkillVersion = (id: number): Promise<FleetSkillMeta> =>
  send(
    "/api/fleet/skills/restore",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    },
    "restore that version"
  );

/** Resolves the same source again — for a skill whose repo has moved on. */
export const refreshSkill = (name: string): Promise<FleetSkillMeta> =>
  send(
    `/api/fleet/skills/${encodeURIComponent(name)}/refresh`,
    { method: "POST" },
    `refresh ${name}`
  );

export const removeSkill = (name: string): Promise<void> =>
  erase(`/api/fleet/skills/${encodeURIComponent(name)}`, `remove ${name}`);

/**
 * Stores a subagent's file and writes it to every machine that is online. The
 * markdown is the whole of it: the hub parses the front matter to refuse a
 * broken one and stores what it was given either way.
 */
export const saveAgent = (name: string, content: string): Promise<FleetAgent> =>
  put(
    `/api/fleet/agents/${encodeURIComponent(name)}`,
    { content },
    `save ${name}`
  );

/**
 * Forgets it here. The file stays on the machines — the `fs` verb has no
 * delete — so discovery lists it as unmanaged until the daemon can take it
 * away itself.
 */
export const removeAgent = (name: string): Promise<void> =>
  erase(`/api/fleet/agents/${encodeURIComponent(name)}`, `remove ${name}`);

/** Writes the subagents again, at every machine that is online. */
export const pushAgents = (): Promise<{ unpushable: Record<string, string> }> =>
  send(
    "/api/fleet/agents/push",
    { method: "POST" },
    "push the subagents to the machines"
  );

/** One subagent found on a machine, whoever wrote it. */
export interface DiscoveredAgent {
  content: string;
  description?: string;
  /** The front matter's `name` — the identity, whatever the file is called. */
  name: string;
  path: string;
}

/** A `.md` under the agents directory, as a listing gives it. */
const markdown = (entry: FsEntry): boolean =>
  entry.kind === "file" && entry.name.endsWith(".md");

/**
 * The subagent files a machine really has under `~/.claude/agents`. Claude Code
 * scans that directory recursively; one level down is as deep as anybody files
 * them, and a walk that goes deeper over a socket is a walk that keeps the page
 * waiting.
 *
 * A machine whose home cannot be worked out, or which has no such directory,
 * answers with nothing at all — absence over placeholder.
 */
export async function discoverAgents(
  machineId: string
): Promise<DiscoveredAgent[]> {
  const home = await homeOf(machineId);
  if (!home) {
    return [];
  }

  const root = `${home}/.claude/agents`;
  let entries: FsEntry[];
  try {
    entries = await machineFs<FsEntry[]>(machineId, "list", root);
  } catch {
    return [];
  }

  const paths = entries
    .filter(markdown)
    .map((entry) => `${root}/${entry.name}`);
  for (const dir of entries.filter((entry) => entry.kind === "dir")) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one control call in flight per machine socket at a time
      const nested = await machineFs<FsEntry[]>(
        machineId,
        "list",
        `${root}/${dir.name}`
      );
      paths.push(
        ...nested
          .filter(markdown)
          .map((entry) => `${root}/${dir.name}/${entry.name}`)
      );
    } catch {
      // One unreadable subdirectory is not a reason to lose the rest of them.
    }
  }

  const read = await Promise.all(
    paths.map(async (path) => {
      try {
        const content = await machineFs<string>(machineId, "read", path);
        const front = parseAgentFrontMatter(content);
        // A markdown file with no `name` is not a subagent — it is a note
        // somebody left in the directory, and Claude Code ignores it too.
        if (!front.name) {
          return null;
        }
        return {
          name: front.name,
          path,
          content,
          ...(front.description ? { description: front.description } : {}),
        };
      } catch {
        return null;
      }
    })
  );
  return read.filter((row): row is DiscoveredAgent => row !== null);
}

/** One superseded version of the memory, as the history list reads it. */
export interface FleetMemoryVersion {
  bytes: number;
  createdAt: string;
  hash: string;
  id: number;
  /** Which document of the set it was a version of; absent is the main file. */
  path?: string;
  /** `fleet`, or `machine:<machineId>` for a copy an overwrite took off one. */
  source: string;
}

/** What a save came to: the row the hub stored, or the one it has instead. */
export type MemorySave =
  | { ok: true; memory: FleetMemoryRow }
  | { ok: false; latest: FleetMemoryRow };

/**
 * Stores the fleet's user-scope CLAUDE.md; every machine gets it from the hub.
 * `expectedHash` is what the writer had in front of them — a save against a row
 * somebody else moved comes back with what is really there, unwritten.
 */
export async function saveMemory(
  content: string,
  expectedHash?: string
): Promise<MemorySave> {
  const response = await fetch("/api/fleet/memory", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, expectedHash }),
  });
  if (response.status === 409) {
    return { ok: false, latest: (await response.json()) as FleetMemoryRow };
  }
  if (!response.ok) {
    throw new Error(`Could not save the memory — ${await said(response)}.`);
  }
  return { ok: true, memory: (await response.json()) as FleetMemoryRow };
}

/** What one machine really has, without adopting it: the read behind Compare. */
/**
 * A machine with no user CLAUDE.md is answered 204 — a fact, not a failure.
 * `send` would choke parsing that empty answer as JSON, and the memory tab
 * would report the fetch's own exception as what the machine said.
 */
export async function peekMemory(
  machineId: string
): Promise<MachineMemorySet | null> {
  const response = await fetch("/api/fleet/memory/peek", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ machineId }),
  });
  if (!response.ok) {
    throw new Error(
      `Could not read this machine's memory — ${await said(response)}.`
    );
  }
  if (response.status === 204) {
    return null;
  }
  return (await response.json()) as MachineMemorySet;
}

/**
 * What the memory used to say, newest first and without the content. One
 * document at a time: a `path` for a linked one, the main file without.
 */
export const memoryHistory = (path?: string): Promise<FleetMemoryVersion[]> =>
  send(
    path === undefined
      ? "/api/fleet/memory/history"
      : `/api/fleet/memory/history?path=${encodeURIComponent(path)}`,
    {},
    "read the memory history"
  );

export const memoryVersion = (
  id: number
): Promise<FleetMemoryVersion & { content: string }> =>
  send(`/api/fleet/memory/history/${id}`, {}, "read that version");

/** Undo: the version becomes the fleet's, and what it replaced joins the history. */
export const restoreMemory = (id: number): Promise<FleetMemoryRow> =>
  send(
    "/api/fleet/memory/restore",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    },
    "restore that version"
  );

/** Drops it, and with it the copy on every machine that still has cawco's. */
export const removeMemory = (): Promise<void> =>
  erase("/api/fleet/memory", "remove the memory");

/**
 * Stores one linked document; every machine gets it under `~/.claude/memories/`.
 * The same save the main file gets, keyed by the path it lands at.
 */
export async function saveMemoryDoc(
  path: string,
  content: string,
  expectedHash?: string
): Promise<
  | { ok: true; doc: FleetMemoryDocRow }
  | { ok: false; latest: FleetMemoryDocRow }
> {
  const response = await fetch("/api/fleet/memory/docs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content, expectedHash }),
  });
  if (response.status === 409) {
    return { ok: false, latest: (await response.json()) as FleetMemoryDocRow };
  }
  if (!response.ok) {
    throw new Error(`Could not save ${path} — ${await said(response)}.`);
  }
  return { ok: true, doc: (await response.json()) as FleetMemoryDocRow };
}

/** Drops one document, and with it the copy on every machine that has cawco's. */
export const removeMemoryDoc = (path: string): Promise<void> =>
  erase("/api/fleet/memory/docs", `remove ${path}`, { path });

/**
 * Takes one machine's whole memory as the fleet's — the main file and every
 * document beside it. Where the first document comes from, and how a machine
 * that drifted has its version win.
 */
export const adoptMemory = (machineId: string): Promise<FleetMemoryRow> =>
  send(
    "/api/fleet/memory/adopt",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId }),
    },
    "adopt this machine's memory"
  );

/** The same for one document of the set, for the drifted row being settled. */
export const adoptMemoryDoc = (
  machineId: string,
  path: string
): Promise<FleetMemoryDocRow> =>
  send(
    "/api/fleet/memory/adopt",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId, path }),
    },
    `adopt this machine's ${path}`
  );

/**
 * The other direction: the fleet's document over a machine copy that drifted.
 * A `path` forces the one document, so settling a drifted `models/…` does not
 * also overwrite a main file nobody looked at.
 */
export const pushMemory = (
  machineId: string,
  path?: string
): Promise<unknown> =>
  send(
    "/api/fleet/memory/push",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId, path }),
    },
    "overwrite this machine"
  );

/**
 * One machine's copy of a hook's script, for the compare beside a drift; 204
 * when the machine has none.
 */
export async function peekHook(
  machineId: string,
  id: string
): Promise<MachineHookScript | null> {
  const response = await fetch("/api/fleet/hooks/peek", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ machineId, id }),
  });
  if (!response.ok) {
    throw new Error(
      `Could not read this machine's script — ${await said(response)}.`
    );
  }
  if (response.status === 204) {
    return null;
  }
  return (await response.json()) as MachineHookScript;
}

/** Takes one machine's edited script for a hook as the fleet's. */
export const adoptHook = (machineId: string, id: string): Promise<FleetHook> =>
  send(
    "/api/fleet/hooks/adopt",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId, id }),
    },
    "adopt this machine's script"
  );

/** The other direction: the fleet's script over a machine's edited one. */
export const pushHook = (machineId: string, id: string): Promise<unknown> =>
  send(
    "/api/fleet/hooks/push",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId, id }),
    },
    "overwrite this machine"
  );

/**
 * Asks the hub to push the desired state again — at one machine, or at every
 * machine that is online. A change already syncs itself; this is for the
 * machine that was asleep when one happened.
 */
export const syncFleet = (machineId?: string): Promise<unknown> =>
  send(
    "/api/fleet/sync",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(machineId ? { machineId } : {}),
    },
    "sync the fleet"
  );

/**
 * What a linked marketplace offers, read from its clone on one machine. A
 * machine-scoped control like `listRepos`: the answer is the same everywhere
 * the marketplace is linked, so the caller picks any online machine that has it.
 */
export const marketplaceCatalog = (
  machineId: string,
  name: string
): Promise<MarketplacePluginInfo[]> =>
  machineControl<MarketplacePluginInfo[]>(
    machineId,
    MARKETPLACE_CATALOG,
    [name],
    CONTROL_TIMEOUT_MS
  );
