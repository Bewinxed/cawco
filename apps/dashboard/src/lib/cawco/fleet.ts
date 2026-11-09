/**
 * The dashboard's half of fleet MCP, skills and subagents (NEW.md §11): the
 * hub's desired state over REST, plus the two machine-scoped reads — a
 * marketplace's catalog and the subagent files a machine really has. Every
 * write fans out to the online machines from the hub itself, so nothing here
 * ever loops over machines — it changes the fleet's mind and lets the
 * `instances` frames say what came of it.
 */

import type { Bounded } from "@cawco/core/bounded";
import { PACKAGE_MANAGERS } from "@cawco/core/deps";
import {
  CAWCO_OAUTH_URL,
  type Deleted,
  type FleetAgent,
  type FleetMarketplace,
  type FleetPlugin,
  type FleetSkillMeta,
  type MarketplacePluginInfo,
  type MemoryScope,
  parseAgentFrontMatter,
} from "@cawco/core/fleet";
import type {
  FleetMcpConfigView,
  FleetMcpConfigWrite,
  FleetMcpServerView,
} from "@cawco/core/fleet-secrets";
import type { ConnectAccess, FleetFetchFrame } from "@cawco/core/frames";
import type { FsEntry } from "@cawco/core/protocol";
import { unhandled } from "@cawco/core/unhandled";
import { mcpWords } from "@cawco/core/words/mcp";
import { skillsWords } from "@cawco/core/words/skills";
import type { Treaty } from "@elysia/eden";
import { hub } from "#lib/platform/hub.js";
import { couldNot, couldNotOrAway } from "#lib/platform/hub-read.js";
import { machineFs, onFleetFetch } from "./stores/machines";

/**
 * What `GET /api/fleet` answers with (its route's own type). The skills are a
 * sibling of the config rather than part of it: what the machines get
 * carries every skill's files, and a catalog read should not weigh
 * megabytes.
 */
export type FleetSnapshot = Treaty.Data<typeof hub.api.fleet.get>;

/** The fleet's user-scope CLAUDE.md, as the hub stores it (NEW.md §11). */
export type FleetMemoryRow = NonNullable<FleetSnapshot["memory"]>;

/**
 * One document of the fleet's memory, as the hub stores it: its path, its
 * markdown, and the sessions it is loaded into. No scope is a document the
 * main memory links, landing at its path under `~/.claude/memories/`.
 */
export type FleetMemoryDocRow = FleetSnapshot["memoryDocs"][number];

/** The charset MCP server names are held to, on the hub and here. */
const NAME_PATTERN = /^[A-Za-z0-9_-]+$/u;

/** Splits an args field, or an installer command line, on runs of whitespace. */
const WHITESPACE_PATTERN = /\s+/u;

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
    return mcpWords.problemEmpty;
  }
  if (!NAME_PATTERN.test(trimmed)) {
    return mcpWords.problemCharacters;
  }
  if (RESERVED.includes(trimmed.toLowerCase())) {
    return mcpWords.problemReserved(trimmed);
  }
  if (taken.includes(trimmed)) {
    return mcpWords.problemTaken(trimmed);
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
  return bare.replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "");
}

/** Remote servers are the ones with an endpoint; stdio's `type` is optional. */
export const isRemoteMcp = (
  config: FleetMcpConfigView
): config is Extract<FleetMcpConfigView, { url: string }> => "url" in config;

/** The one line a row shows: the command it runs, or the endpoint it calls. */
export const describeMcp = (config: FleetMcpConfigView): string =>
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

/** One line of the key/value editor; `held` is a secret the hub holds, in the place of a value it never says. */
export interface Pair {
  held?: boolean;
  key: string;
  value: string;
}

/**
 * The lines a key/value editor sends: a typed value sets or replaces its key;
 * a line that holds a secret and was left empty is not sent, so the hub keeps
 * it; a held key whose line is gone is `null`, which clears it. Blank lines
 * are dropped.
 */
export function pairsToWrite(
  rows: readonly Pair[],
  heldKeys: readonly string[]
): Record<string, string | null> {
  const record: Record<string, string | null> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key && !(row.held && row.value === "")) {
      record[key] = row.value;
    }
  }
  const standing = new Set(rows.map((row) => row.key.trim()));
  for (const key of heldKeys) {
    if (!standing.has(key)) {
      record[key] = null;
    }
  }
  return record;
}

/** A read's secrets back into editor rows (each one held, its value empty), always with one empty row to type into. */
export const recordToPairs = (
  record: Record<string, unknown> | undefined
): Pair[] => [
  ...Object.keys(record ?? {}).map((key) => ({
    key,
    value: "",
    held: true,
  })),
  { key: "", value: "" },
];

/** The charset skill names are held to, on the hub and here. */
const SKILL_NAME_PATTERN = /^[A-Za-z0-9._-]+$/u;

/** The source forms the hub's resolver takes as they are. */
const SKILL_SCHEME = /^(?:skills:|github:|npm:|https?:\/\/|file:\/\/)/u;

/** The scheme prefix a skill source names itself with, when it has one. */
const SKILL_SOURCE_SCHEME_PATTERN = /^(skills|github|npm):/u;

/** Splits a skill source's path into segments, at either kind of separator. */
const SKILL_PATH_SPLIT_PATTERN = /[/?]/u;

/**
 * The words an installer command line is built out of — the runner, its
 * subcommand, and the tool being run. A paste is stripped down to the slug
 * they surround.
 */
const WRAPPERS: ReadonlySet<string> = new Set([
  ...PACKAGE_MANAGERS,
  "bunx",
  "npx",
  "pnpx",
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
    return skillsWords.problemEmpty;
  }
  if (!SKILL_NAME_PATTERN.test(trimmed)) {
    return skillsWords.problemCharacters;
  }
  if (taken.includes(trimmed)) {
    return skillsWords.problemTaken(trimmed);
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
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
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

/** A machine's own words' closing stops, dropped so they sit inside a sentence of ours. */
const TRAILING_STOPS = /\.+$/u;

/**
 * Saves an MCP server. `projectId` binds it to one project, placed at each of
 * its checkouts and workspaces; null makes it every machine's.
 */
export const saveMcpServer = async (
  name: string,
  config: FleetMcpConfigWrite,
  enabled: boolean,
  projectId: string | null
) => {
  const answer = await hub.api.fleet
    .mcp({ name })
    .put({ config: { ...config }, enabled, projectId });
  if (answer.error) {
    throw couldNotOrAway(`save ${name}`)(answer);
  }
  return answer.data;
};

/**
 * A server somebody set up on one machine, taken into the fleet: the hub
 * reads its config off that machine, keys and all, which no screen is sent.
 */
export const adoptMcpServer = async (
  name: string,
  machineId: string,
  cwd?: string
) => {
  const answer = await hub.api.fleet.mcp({ name }).put({
    fromMachine: machineId,
    ...(cwd ? { cwd } : {}),
    enabled: true,
    projectId: null,
  });
  if (answer.error) {
    throw couldNotOrAway(`adopt ${name}`)(answer);
  }
  return answer.data;
};

export const removeMcpServer = async (name: string) => {
  const answer = await hub.api.fleet.mcp({ name }).delete();
  if (answer.error) {
    throw couldNotOrAway(`remove ${name}`)(answer);
  }
  return answer.data;
};

/**
 * Signs this browser in to a fleet MCP server, in a tab of its own: the
 * dashboard stays where the person asked (an editor, a session's composer),
 * and the server's row turns when the hub reports it signed in. The hub
 * answers with the authorization page, which the new tab reaches through
 * CawCo's start page. That page records the address this browser reached
 * the hub by, and CawCo's hand-back page forwards the provider's answer only
 * there, where the exchange finishes and the tab closes itself. That is what
 * lets a phone, or any browser, finish it, whichever machine runs the agent.
 *
 * The tab is opened in the press itself (before anything is awaited), so a
 * pop-up blocker lets it through; a refused start closes it again. Resolves
 * with the tab, which the caller watches for closing before it finished,
 * and when the provider's page stops taking its answer. `access` is a
 * connect ask's pick of what to ask the provider for (core `ConnectAccess`);
 * none asks for what the last sign-in did.
 */
export const signInToMcp = async (
  name: string,
  access?: ConnectAccess
): Promise<{ tab: Window; expiresAt: number }> => {
  const tab = window.open("", "_blank");
  if (!tab) {
    throw new Error(
      "The browser blocked the sign-in tab. Allow pop-ups for this page, then try again."
    );
  }
  const { origin } = window.location;
  const answer = await hub.api.fleet
    .mcp({ name })
    ["sign-in"].post(access ? { access } : undefined)
    .catch((error: unknown) => {
      tab.close();
      throw error;
    });
  if (answer.error) {
    tab.close();
    throw couldNotOrAway(`start sign-in to ${name}`)(answer);
  }
  const { authorizationUrl, expiresAt } = answer.data;
  // The address rides in the fragment, which the browser never sends to a server.
  const hop = btoa(JSON.stringify({ origin, auth: authorizationUrl }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  tab.location.assign(`${CAWCO_OAUTH_URL}/start#${hop}`);
  return { tab, expiresAt };
};

/**
 * Hands the provider's answer to the hub, which finishes the sign-in by
 * exchanging the code. It answers with the server that is now signed in.
 */
export const completeMcpSignIn = async (
  code: string,
  state: string,
  iss: string | null
) => {
  const answer = await hub.api.fleet.mcp.oauth.complete.post({
    code,
    state,
    ...(iss ? { iss } : {}),
  });
  if (answer.error) {
    throw couldNotOrAway("finish the sign-in")(answer);
  }
  return answer.data;
};

/**
 * What `/mcp auth [server]` means in a composer. Claude Code's own `/mcp` has
 * no `auth`, and the hub signs fleet servers in, so the dashboard answers it:
 * the server is matched without regard to case, and with no name it is the one
 * server still waiting for a sign-in. `none` means the text is not this command
 * and goes to the agent as typed.
 */
const MCP_AUTH_RE = /^\/mcp\s+(?:auth|login)(?:\s+(\S+))?$/iu;

export type McpSignInIntent =
  | { kind: "none" }
  | { kind: "go"; name: string }
  | { kind: "say"; level: "error" | "info"; message: string };

export const mcpSignInIntent = (
  text: string,
  servers: readonly FleetMcpServerView[]
): McpSignInIntent => {
  const match = text.trim().match(MCP_AUTH_RE);
  if (!match) {
    return { kind: "none" };
  }
  const oauth = servers.filter((server) => server.auth?.mode === "oauth");
  const waiting = oauth.filter((server) => server.auth?.state !== "signed-in");
  const names = (list: readonly FleetMcpServerView[]) =>
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

/**
 * What the marketplace at `source` calls itself: the `name` of its own
 * `marketplace.json`, read by the hub. The only name it can be linked under,
 * since it is the one Claude Code registers it and installs its plugins by.
 */
export const readMarketplaceName = async (wanted: string): Promise<string> => {
  const source = wanted.trim();
  const read = await untilFetched(
    `read ${source}`,
    (frame) =>
      frame.marketplace?.source === source ? frame.marketplace : undefined,
    async () => {
      const answer = await hub.api.fleet["marketplace-read"].get({
        query: { source },
      });
      if (answer.error) {
        throw couldNotOrAway(`read ${source}`)(answer);
      }
      return answer.data;
    }
  );
  if (!read.name) {
    throw new Error(
      skillsWords.couldNotRead(
        source,
        (read.error ?? skillsWords.saidNothing).replace(TRAILING_STOPS, "")
      )
    );
  }
  return read.name;
};

/**
 * Asks the hub to link the marketplace at `source`, under the name its
 * manifest gives. Answers at once, `fetching`: the hub keeps the link under
 * way, and a refusal, in the snapshot's `links` until it lands or is let go,
 * and every `fleet.fetch` frame says how it stands.
 */
export const linkMarketplace = async (wanted: string) => {
  const source = wanted.trim();
  const answer = await hub.api.fleet["marketplace-links"].post({ source });
  if (answer.error) {
    throw couldNotOrAway(`link ${source}`)(answer);
  }
  return answer.data;
};

/** Lets a refused link go: it leaves the marketplace list. */
export const dropMarketplaceLink = async (source: string) => {
  const answer = await hub.api.fleet["marketplace-links"].delete(undefined, {
    query: { source },
  });
  if (answer.error) {
    throw couldNotOrAway(`let go of ${source}`)(answer);
  }
  return answer.data;
};

export const removeMarketplace = async (name: string) => {
  const answer = await hub.api.fleet.marketplaces({ name }).delete();
  if (answer.error) {
    throw couldNotOrAway(`unlink ${name}`)(answer);
  }
  return answer.data;
};

/**
 * A fetch asked of the hub, resolved with the row once it has landed. The
 * request answers at once with the row marked `fetching`, because a large
 * repo's download outlasts any HTTP request; what came of it is the
 * `fleet.fetch` frame that follows, which may even arrive before the answer.
 */
const untilFetched = <T extends { fetching?: boolean }>(
  attempt: string,
  pick: (frame: FleetFetchFrame) => T | undefined,
  ask: () => Promise<T>
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    let answered = false;
    let landed: T | undefined;
    const stop = onFleetFetch({
      heard: (frame) => {
        const row = pick(frame);
        if (!row || row.fetching) {
          return;
        }
        landed = row;
        if (answered) {
          stop();
          resolve(row);
        }
      },
      dropped: () => {
        stop();
        reject(
          new Error(
            `Couldn't ${attempt} — the connection to the hub dropped while it fetched. The row says what came of it once the page reconnects.`
          )
        );
      },
    });
    ask().then(
      (row) => {
        answered = true;
        if (!row.fetching) {
          stop();
          resolve(row);
        } else if (landed) {
          stop();
          resolve(landed);
        }
      },
      (error: unknown) => {
        stop();
        reject(error);
      }
    );
  });

/**
 * Installs a plugin. The hub fetches its bytes after it answers; the row
 * comes back marked `fetching`, and its `fleet.fetch` frame says how that
 * went.
 */
export const installPlugin = async (id: string) => {
  const answer = await hub.api.fleet.plugins({ id }).put({ enabled: true });
  if (answer.error) {
    throw couldNotOrAway(`install ${id}`)(answer);
  }
  return answer.data;
};

/** A switch's refusal: "Couldn't turn on `what`." and the hub's words. */
const switchRefusal = (enabled: boolean, what: string) =>
  couldNotOrAway(`${enabled ? "turn on" : "turn off"} ${what}`);

/**
 * Switches an installed plugin on or off: the stored row's flag, nothing
 * fetched. A disabled plugin is uninstalled from the machines.
 */
export const switchPlugin = async (id: string, enabled: boolean) => {
  const answer = await hub.api.fleet.plugins({ id }).patch({ enabled });
  if (answer.error) {
    throw switchRefusal(enabled, id)(answer);
  }
  return answer.data;
};

/**
 * Switches a fleet skill on or off: the stored row's flag, its files as
 * they are, nothing fetched.
 */
export const switchSkill = async (name: string, enabled: boolean) => {
  const answer = await hub.api.fleet.skills({ name }).patch({ enabled });
  if (answer.error) {
    throw switchRefusal(enabled, name)(answer);
  }
  return answer.data;
};

export const removePlugin = async (id: string) => {
  const answer = await hub.api.fleet.plugins({ id }).delete();
  if (answer.error) {
    throw couldNotOrAway(`remove ${id}`)(answer);
  }
  return answer.data;
};

/**
 * Resolves a plugin's bytes at the hub again — the answer to a plugin the hub
 * could not fetch, and to a machine that could not fetch it for itself. Comes
 * back with the row once the fetch has landed, `error` and all, so a retry
 * that failed again says so without a reload.
 */
export const refreshPlugin = (id: string): Promise<FleetPlugin> =>
  untilFetched(
    `refresh ${id}`,
    (frame) => (frame.plugin?.id === id ? frame.plugin : undefined),
    async () => {
      const answer = await hub.api.fleet.plugins({ id }).refresh.post();
      if (answer.error) {
        throw couldNotOrAway(`refresh ${id}`)(answer);
      }
      return answer.data;
    }
  );

/**
 * Stores a skill and has the hub resolve it, once, for every machine.
 * Answers at once with the row marked `fetching`; what the fetch came to is
 * the row's, as the `fleet.fetch` frames bring it: its files, the hub's
 * reason it could not resolve, or the `choices` an ambiguous source holds.
 */
export const saveSkill = async (
  name: string,
  body: { source: string; enabled?: boolean; projectId?: string | null }
) => {
  const answer = await hub.api.fleet.skills({ name }).put(body);
  if (answer.error) {
    throw couldNotOrAway(`save ${name}`)(answer);
  }
  return answer.data;
};

/**
 * What a machine really has, fleet or not (NEW.md §11), and what a session in
 * `cwd` would see. Asked on demand and never stored: it is the machine's own
 * word at the moment of asking.
 */
export const inspectMachine = async (machineId: string, cwd?: string) => {
  const answer = await hub.api
    .agents({ machineId })
    .inspect.post(cwd ? { cwd } : {});
  if (answer.error) {
    throw couldNotOrAway("read what this machine has")(answer);
  }
  return answer.data;
};

/**
 * A skill somebody wrote on one machine, taken into the fleet: the hub reads
 * its files off that machine and stores them like any it fetched itself.
 */
export const adoptSkill = async (
  name: string,
  machineId: string,
  cwd?: string
) => {
  const answer = await hub.api.fleet
    .skills({ name })
    .put({ fromMachine: machineId, ...(cwd ? { cwd } : {}) });
  if (answer.error) {
    throw couldNotOrAway(`adopt ${name}`)(answer);
  }
  return answer.data;
};

/**
 * The fleet's copy of a skill over the one a machine edited. The machine sets
 * its edited copy aside before it writes the fleet's.
 */
export const pushSkill = async (name: string, machineId: string) => {
  const answer = await hub.api.fleet.skills({ name }).push.post({ machineId });
  if (answer.error) {
    throw couldNotOrAway("overwrite this machine")(answer);
  }
  return answer.data;
};

/**
 * What a skill used to be, newest first, without its files — the hub keeps a
 * version on every change to the fleet's copy, on a delete, and of a
 * machine's edited copy an overwrite replaced.
 */
export const skillHistory = async (name: string) => {
  const answer = await hub.api.fleet.skills.history.get({ query: { name } });
  if (answer.error) {
    throw couldNotOrAway("load this skill’s history")(answer);
  }
  return answer.data;
};

/** Writes a past version back as the fleet's copy, keeping what it replaces. */
export const restoreSkillVersion = async (id: number) => {
  const answer = await hub.api.fleet.skills.restore.post({ id });
  if (answer.error) {
    throw couldNotOrAway("restore that version")(answer);
  }
  return answer.data;
};

/**
 * Resolves the same source again — for a skill whose repo has moved on. Comes
 * back with the row once the fetch has landed (an adopted skill's machine
 * read answers whole, as it is bounded).
 */
export const refreshSkill = (name: string): Promise<FleetSkillMeta> =>
  untilFetched(
    `refresh ${name}`,
    (frame) => (frame.skill?.name === name ? frame.skill : undefined),
    async () => {
      const answer = await hub.api.fleet.skills({ name }).refresh.post();
      if (answer.error) {
        throw couldNotOrAway(`refresh ${name}`)(answer);
      }
      return answer.data;
    }
  );

/**
 * Asks the hub to read every skill's and plugin's source for what it holds
 * now, nothing fetched into the fleet. Resolves once the check has ended;
 * each row it read arrived meanwhile as its own `fleet.fetch` frame.
 */
export const checkForUpdates = (): Promise<{ fetching: boolean }> =>
  untilFetched(
    "check for updates",
    (frame) => frame.check,
    async () => {
      const answer = await hub.api.fleet.updates.check.post();
      if (answer.error) {
        throw couldNotOrAway("check for updates")(answer);
      }
      return answer.data;
    }
  );

/**
 * What a copy is called: the version it declares, else its content hash's
 * first seven characters.
 */
export const versionLabel = (
  version: string | undefined,
  hash: string | undefined
): string => version ?? hash?.slice(0, 7) ?? "";

/**
 * Two copies' names side by side: their versions where those tell them
 * apart, else their short hashes (a source that changed without bumping its
 * version, or one that declares none).
 */
export const versionPair = (
  from: { version?: string; hash?: string },
  to: { version?: string; hash?: string }
): [string, string] =>
  from.version && to.version && from.version !== to.version
    ? [from.version, to.version]
    : [versionLabel(undefined, from.hash), versionLabel(undefined, to.hash)];

export const removeSkill = async (name: string) => {
  const answer = await hub.api.fleet.skills({ name }).delete();
  if (answer.error) {
    throw couldNotOrAway(`remove ${name}`)(answer);
  }
  return answer.data;
};

/** What a subagent write came to: what the hub did, or the file it has instead. */
export type AgentWrite<T> =
  { ok: true; done: T } | { ok: false; latest: FleetAgent };

/**
 * A subagent write names `expectedHash`, the hash of the file the writer had
 * in front of them ("" for a new one): a file somebody else moved comes back
 * (a 409) with what is really there, unwritten, as a memory save does.
 */
export const saveAgent = async (
  name: string,
  content: string,
  expectedHash: string
): Promise<AgentWrite<FleetAgent>> => {
  const answer = await hub.api.fleet
    .agents({ name })
    .put({ content, expectedHash });
  if (answer.error) {
    if (answer.error.status === 409 && typeof answer.error.value === "object") {
      return { ok: false, latest: answer.error.value };
    }
    throw couldNot(`save ${name}`, answer);
  }
  return { ok: true, done: answer.data };
};

/**
 * Forgets it here, if it is still the file at `expectedHash`. The file stays
 * on the machines — the `fs` verb has no delete — so discovery lists it as
 * unmanaged until the daemon can take it away itself.
 */
export const removeAgent = async (
  name: string,
  expectedHash: string
): Promise<AgentWrite<Deleted>> => {
  const answer = await hub.api.fleet
    .agents({ name })
    .delete(undefined, { query: { expectedHash } });
  if (answer.error) {
    if (answer.error.status === 409 && typeof answer.error.value === "object") {
      return { ok: false, latest: answer.error.value };
    }
    throw couldNot(`remove ${name}`, answer);
  }
  return { ok: true, done: answer.data };
};

/** Writes the subagents again, at every machine that is online. */
export const pushAgents = async () => {
  const answer = await hub.api.fleet.agents.push.post();
  if (answer.error) {
    throw couldNotOrAway("push the subagents to the machines")(answer);
  }
  return answer.data;
};

/** One subagent found on a machine, whoever wrote it. */
export interface DiscoveredAgent {
  content: string;
  description?: string;
  /** The front matter's `name` — the identity, whatever the file is called. */
  name: string;
  /** Its file, under the machine's user layer: `agents/<file>.md`. */
  path: string;
}

/** A `.md` under the agents directory, as a listing gives it. */
const markdown = (entry: FsEntry): boolean =>
  entry.kind === "file" && entry.name.endsWith(".md");

/** A listing or read under a machine's user layer, which the machine itself places. */
const userLayerFs = <T>(
  machineId: string,
  op: "list" | "read",
  path: string
): Promise<Bounded<T>> =>
  machineFs<T>(machineId, op, path, undefined, "claude-home");

/**
 * The subagent files a machine really has under its user layer's `agents`.
 * Claude Code scans that directory recursively; one level down is as deep as
 * anybody files them, and a walk that goes deeper over a socket is a walk
 * that keeps the page waiting.
 *
 * A machine which has no such directory answers with nothing at all —
 * absence over placeholder. A listing or read it did not answer in time
 * makes the walk `unanswered`: a partial list is never shown as the whole.
 */
export async function discoverAgents(
  machineId: string
): Promise<Bounded<DiscoveredAgent[]>> {
  const root = "agents";
  let listed: Bounded<FsEntry[]>;
  try {
    listed = await userLayerFs<FsEntry[]>(machineId, "list", root);
  } catch {
    return { kind: "answered", value: [] };
  }
  switch (listed.kind) {
    case "unanswered":
      return listed;
    case "answered":
      break;
    default:
      unhandled("read", listed);
  }
  const entries = listed.value;

  const paths = entries
    .filter(markdown)
    .map((entry) => `${root}/${entry.name}`);
  for (const dir of entries.filter((entry) => entry.kind === "dir")) {
    let nested: Bounded<FsEntry[]>;
    try {
      nested = await userLayerFs<FsEntry[]>(
        machineId,
        "list",
        `${root}/${dir.name}`
      );
    } catch {
      // One unreadable subdirectory is not a reason to lose the rest of them.
      continue;
    }
    switch (nested.kind) {
      case "unanswered":
        return nested;
      case "answered":
        paths.push(
          ...nested.value
            .filter(markdown)
            .map((entry) => `${root}/${dir.name}/${entry.name}`)
        );
        break;
      default:
        unhandled("read", nested);
    }
  }

  let missed: Bounded<never> | undefined;
  const read = await Promise.all(
    paths.map(async (path) => {
      try {
        const got = await userLayerFs<string>(machineId, "read", path);
        let content: string;
        switch (got.kind) {
          case "unanswered":
            missed ??= got;
            return null;
          case "answered":
            content = got.value;
            break;
          default:
            unhandled("read", got);
        }
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
  if (missed) {
    return missed;
  }
  return {
    kind: "answered",
    value: read.filter((row): row is DiscoveredAgent => row !== null),
  };
}

/** One superseded version of the memory, as `GET /api/fleet/memory/history` sends it. */
export type FleetMemoryVersion = Treaty.Data<
  typeof hub.api.fleet.memory.history.get
>[number];

/** What a save came to: the row the hub stored, or the one it has instead. */
export type MemorySave =
  { ok: true; memory: FleetMemoryRow } | { ok: false; latest: FleetMemoryRow };

/**
 * Stores the fleet's user-scope CLAUDE.md; every machine gets it from the hub.
 * `expectedHash` is what the writer had in front of them — a save against a row
 * somebody else moved comes back with what is really there, unwritten.
 */
export async function saveMemory(
  content: string,
  expectedHash?: string
): Promise<MemorySave> {
  const answer = await hub.api.fleet.memory.put({ content, expectedHash });
  if (answer.error) {
    if (answer.error.status === 409) {
      return { ok: false, latest: answer.error.value };
    }
    throw couldNot("save the memory", answer);
  }
  return { ok: true, memory: answer.data };
}

/** What one machine really has, without adopting it: the read behind Compare. */
/** A machine with no user CLAUDE.md is answered 204 — a fact, not a failure. */
export async function peekMemory(machineId: string) {
  const answer = await hub.api.fleet.memory.peek.post({ machineId });
  if (answer.error) {
    throw couldNotOrAway("read this machine's memory")(answer);
  }
  return answer.data || null;
}

/**
 * What the memory used to say, newest first and without the content. One
 * document at a time: a `path` for a linked one, the main file without.
 */
export const memoryHistory = async (path?: string) => {
  const answer = await hub.api.fleet.memory.history.get({
    query: path === undefined ? {} : { path },
  });
  if (answer.error) {
    throw couldNotOrAway("read the memory history")(answer);
  }
  return answer.data;
};

export const memoryVersion = async (id: number) => {
  const answer = await hub.api.fleet.memory.history({ id }).get();
  if (answer.error) {
    throw couldNotOrAway("read that version")(answer);
  }
  return answer.data;
};

/** The memory's documents as they stand now, files and all (`GET /api/fleet`'s `memoryDocs`). */
export const memoryDocsNow = async () => {
  const answer = await hub.api.fleet.get();
  if (answer.error) {
    throw couldNotOrAway("read the memory documents")(answer);
  }
  return answer.data.memoryDocs;
};

/** Undo: the version becomes the fleet's, and what it replaced joins the history. */
export const restoreMemory = async (id: number) => {
  const answer = await hub.api.fleet.memory.restore.post({ id });
  if (answer.error) {
    throw couldNotOrAway("restore that version")(answer);
  }
  return answer.data;
};

/** Drops it, and with it the copy on every machine that still has cawco's. */
export const removeMemory = async () => {
  const answer = await hub.api.fleet.memory.delete();
  if (answer.error) {
    throw couldNotOrAway("remove the memory")(answer);
  }
  return answer.data;
};

/**
 * Stores one document, keyed by its path: a linked one lands on every
 * machine under `~/.claude/memories/`, a scoped one in the sessions its
 * scope names. The same save the main file gets. `scope` replaces the
 * stored one (`{}` makes it linked again); left out, it stays.
 */
export async function saveMemoryDoc(
  path: string,
  content: string,
  expectedHash?: string,
  scope?: MemoryScope
): Promise<
  | { ok: true; doc: FleetMemoryDocRow }
  | { ok: false; latest: FleetMemoryDocRow }
> {
  const answer = await hub.api.fleet.memory.docs.put({
    path,
    content,
    expectedHash,
    scope,
  });
  if (answer.error) {
    if (answer.error.status === 409) {
      return { ok: false, latest: answer.error.value };
    }
    throw couldNot(`save ${path}`, answer);
  }
  return { ok: true, doc: answer.data };
}

/** Drops one document, and with it the copy on every machine that has cawco's. */
export const removeMemoryDoc = async (path: string) => {
  const answer = await hub.api.fleet.memory.docs.delete({ path });
  if (answer.error) {
    throw couldNotOrAway(`remove ${path}`)(answer);
  }
  return answer.data;
};

/**
 * Takes one machine's whole memory as the fleet's — the main file and every
 * document beside it. Where the first document comes from, and how a machine
 * that drifted has its version win.
 */
export const adoptMemory = async (machineId: string) => {
  const answer = await hub.api.fleet.memory.adopt.post({ machineId });
  if (answer.error) {
    throw couldNotOrAway("adopt this machine's memory")(answer);
  }
  return answer.data;
};

/** The same for one document of the set, for the drifted row being settled. */
export const adoptMemoryDoc = async (machineId: string, path: string) => {
  const answer = await hub.api.fleet.memory.adopt.post({ machineId, path });
  if (answer.error) {
    throw couldNotOrAway(`adopt this machine's ${path}`)(answer);
  }
  return answer.data;
};

/**
 * The other direction: the fleet's document over a machine copy that drifted.
 * A `path` forces the one document, so settling a drifted `models/…` does not
 * also overwrite a main file nobody looked at.
 */
export const pushMemory = async (machineId: string, path?: string) => {
  const answer = await hub.api.fleet.memory.push.post({ machineId, path });
  if (answer.error) {
    throw couldNotOrAway("overwrite this machine")(answer);
  }
  return answer.data;
};

/**
 * One machine's copy of a hook's script, for the compare beside a drift; 204
 * when the machine has none.
 */
export async function peekHook(machineId: string, id: string) {
  const answer = await hub.api.fleet.hooks.peek.post({ machineId, id });
  if (answer.error) {
    throw couldNotOrAway("read this machine's script")(answer);
  }
  return answer.data || null;
}

/** Takes one machine's edited script for a hook as the fleet's. */
export const adoptHook = async (machineId: string, id: string) => {
  const answer = await hub.api.fleet.hooks.adopt.post({ machineId, id });
  if (answer.error) {
    throw couldNotOrAway("adopt this machine's script")(answer);
  }
  return answer.data;
};

/** The other direction: the fleet's script over a machine's edited one. */
export const pushHook = async (machineId: string, id: string) => {
  const answer = await hub.api.fleet.hooks.push.post({ machineId, id });
  if (answer.error) {
    throw couldNotOrAway("overwrite this machine")(answer);
  }
  return answer.data;
};

/** The items that did not set up on a machine, converged again: the hub sends them forced in one delta (hub fleet-sync.ts `retry`). */
export const retryFleetItems = async (
  machineId: string,
  ids: readonly string[]
) => {
  const answer = await hub.api.fleet.items.retry.post({
    machineId,
    ids: [...ids],
  });
  if (answer.error) {
    throw couldNotOrAway("set these up again")(answer);
  }
  return answer.data;
};

/**
 * Asks the hub to push the desired state again — at one machine, or at every
 * machine that is online. A change already syncs itself; this is for the
 * machine that was asleep when one happened.
 */
export const syncFleet = async (machineId?: string) => {
  const answer = await hub.api.fleet.sync.post(machineId ? { machineId } : {});
  if (answer.error) {
    throw couldNotOrAway("sync the fleet")(answer);
  }
  return answer.data;
};

/**
 * What a linked marketplace offers, read by the hub from its source: the
 * same fetch its installs resolve from, so the list is what an install gets,
 * and no machine has to hold a copy (a directory on the hub has none elsewhere).
 * Comes back once the hub's read of the row's source has landed.
 */
export const marketplaceCatalog = async (
  row: FleetMarketplace
): Promise<MarketplacePluginInfo[]> => {
  const read = await untilFetched(
    `read ${row.name}`,
    (frame) =>
      frame.marketplace?.source === row.source ? frame.marketplace : undefined,
    async () => {
      const answer = await hub.api.fleet["marketplace-read"].get({
        query: { source: row.source },
      });
      if (answer.error) {
        throw couldNotOrAway(`read ${row.name}`)(answer);
      }
      return answer.data;
    }
  );
  if (read.error) {
    throw new Error(
      skillsWords.couldNotRead(row.name, read.error.replace(TRAILING_STOPS, ""))
    );
  }
  return read.plugins ?? [];
};
