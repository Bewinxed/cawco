/**
 * The fleet's settings as an agent reads them (admin-tools.ts): one line per
 * delegate type, connection, skill, plugin, MCP server, rule, hook, subagent,
 * memory document, Claude Code settings row, OpenCode plugin or pi extension, each
 * by the name its write takes; a write answers the row it
 * saved, a removal what the dashboard can still undo.
 */
import type { ConnectionView } from "@cawco/core/connections";
import type { DelegateType } from "@cawco/core/delegate-types";
import {
  type FleetAgent,
  type FleetMarketplace,
  type FleetMemory,
  type FleetMemoryDoc,
  type FleetPlugin,
  type FleetSkillMeta,
  type MemoryScope,
  parseAgentFrontMatter,
} from "@cawco/core/fleet";
import type { FleetMcpServerView } from "@cawco/core/fleet-secrets";
import {
  type FleetHarnessConfig,
  type HarnessConfigKind,
  harnessConfigLabel,
} from "@cawco/core/harness-config";
import type { FleetHook } from "@cawco/core/hooks";
import type { Rule, RuleRow } from "@cawco/core/rules";
import { shortId } from "@cawco/core/short-id";
import {
  memoryKeptWords,
  memoryListWords,
  memoryReadHead,
} from "@cawco/core/tool-presentation";
import { rulesWords } from "@cawco/core/words/rules";
import type { Presented } from "../mcp-tool";
import { delegateTypesWords } from "./sessions";
import {
  ago,
  count,
  lasted,
  lines,
  listed,
  quote,
  valueExcerpt,
} from "./words";

/** The catalog's first line, which a saved type's answer says otherwise. */
const CATALOG_HEAD = /^1 delegate type;[^\n]*\n/u;

/** What every removal answers: how long the dashboard can still bring it back. */
interface Deleted {
  restorableForMs: number;
  restore: number;
}

const isDeleted = (answer: unknown): answer is Deleted =>
  typeof answer === "object" && answer !== null && "restorableForMs" in answer;

/** A removal, in words. */
const removedWords = (what: string, deleted: Deleted): string =>
  `Removed ${what}. The dashboard can bring it back for ${lasted(deleted.restorableForMs)}.`;

/** Where a placed row lives: every machine, or one project's places. */
const placeWords = (row: {
  areaId?: string;
  projectId?: string;
  scope?: string;
}): string => {
  if (row.projectId) {
    return `project ${shortId(row.projectId)} only`;
  }
  return row.areaId
    ? `area ${shortId(row.areaId)}'s projects only`
    : "every machine";
};

/** A fetched row's version, and whether a newer one waits. */
const versionWords = (row: {
  checkError?: string;
  error?: string;
  fetching?: boolean;
  latestVersion?: string;
  updateAvailable?: boolean;
  version?: string;
}): string[] => [
  ...(row.version ? [`version ${row.version}`] : []),
  ...(row.updateAvailable
    ? [`${row.latestVersion ?? "a newer version"} is out: refresh it`]
    : []),
  ...(row.fetching ? ["still fetching"] : []),
  ...(row.error ? [`failed: ${row.error}`] : []),
  ...(row.checkError ? [`its check failed: ${row.checkError}`] : []),
];

type Asked = { action: string } & Record<string, unknown>;

/** The fleet's account names by id, which a delegate types answer carries beside it. */
interface AccountNamed {
  accountNames?: Readonly<Record<string, string>>;
}

/** How much of a memory hash `expectedHash` takes (admin-tools.ts `wholeHash`). */
export const HASH_HANDLE = 12;

/** admin_delegate_types: the catalog, or the type saved. */
export const delegateTypeSettingsWords = (
  answer:
    | Deleted
    | (AccountNamed & { types: (DelegateType & { source?: string })[] })
    | (AccountNamed & DelegateType),
  asked: Asked
): Presented => {
  if (isDeleted(answer)) {
    return removedWords(`delegate type ${asked.name}`, answer);
  }
  if ("types" in answer) {
    return delegateTypesWords(answer);
  }
  const { accountNames, ...saved } = answer;
  return delegateTypesWords({
    types: [saved],
    ...(accountNames ? { accountNames } : {}),
  }).replace(CATALOG_HEAD, "Saved delegate type:\n");
};

const connectionLine = (connection: ConnectionView): string =>
  `- ${connection.name}: ${connection.service} as ${connection.account} · ${connection.transport}${connection.url ? ` ${connection.url}` : ""}${connection.command ? ` ${connection.command}` : ""} · ${connection.state}${connection.reason ? ` (${connection.reason})` : ""} · ${connection.hasSecret ? "key held" : "no key held"} · ${connection.tools ? `tools ${listed(connection.tools) || "none"}` : "tools not listed yet"}${connection.projects.length > 0 ? ` · projects ${connection.projects.map((id) => shortId(id)).join(", ")}` : ""}`;

/** admin_connections: each connection, or the one written. */
export const connectionSettingsWords = (
  answer:
    | Deleted
    | { connections: ConnectionView[] }
    | ConnectionView
    | { authorizationUrl: string },
  asked: Asked
): Presented => {
  if (isDeleted(answer)) {
    return removedWords(`connection ${asked.name}`, answer);
  }
  if ("authorizationUrl" in answer) {
    return `Open this to sign in: ${valueExcerpt(answer, 2000)}`;
  }
  if ("connections" in answer) {
    const { connections } = answer;
    return connections.length === 0
      ? "No connections: admin_connections_write's create adds one."
      : lines(
          `${count(connections.length, "connection")}; a delegate type or project lists one by name:`,
          connections.map(connectionLine)
        );
  }
  return lines(
    "Saved:",
    connectionLine(answer),
    (answer.auth === "bearer" || answer.auth === "header") &&
      !answer.hasSecret &&
      `Its key: the owner runs \`cawco connections set-key ${answer.name}\` on a machine joined to the hub. A key never passes through a session, so it is never asked for in chat.`
  );
};

const skillLine = (skill: FleetSkillMeta): string =>
  `- ${skill.name} from ${skill.source} · ${skill.enabled ? "on" : "off"} · ${placeWords(skill)}${versionWords(
    skill
  )
    .map((one) => ` · ${one}`)
    .join(
      ""
    )}${skill.choices?.length ? ` · the source holds several: ${listed(skill.choices)}` : ""}`;

/** admin_skills: each skill, or the one installed. */
export const skillSettingsWords = (
  answer: Deleted | { skills: FleetSkillMeta[] } | FleetSkillMeta,
  asked: Asked
): Presented => {
  if (isDeleted(answer)) {
    return removedWords(`skill ${asked.name}`, answer);
  }
  if ("skills" in answer) {
    const { skills } = answer;
    return skills.length === 0
      ? "No fleet skills."
      : lines(`${count(skills.length, "skill")}:`, skills.map(skillLine));
  }
  return lines("Saved:", skillLine(answer));
};

const pluginLine = (plugin: FleetPlugin): string =>
  `- ${plugin.id} · ${plugin.enabled ? "on" : "off"} · ${placeWords(plugin)}${versionWords(
    plugin
  )
    .map((one) => ` · ${one}`)
    .join("")}`;

/** admin_plugins: the marketplaces and plugins, or the one written. */
export const pluginSettingsWords = (
  answer:
    | Deleted
    | { marketplaces: FleetMarketplace[]; plugins: FleetPlugin[] }
    | FleetMarketplace
    | FleetPlugin,
  asked: Asked
): Presented => {
  if (isDeleted(answer)) {
    return removedWords(
      asked.action === "unlink"
        ? `marketplace ${asked.name}`
        : `plugin ${asked.id}`,
      answer
    );
  }
  if ("marketplaces" in answer) {
    const { marketplaces, plugins } = answer;
    return lines(
      marketplaces.length === 0
        ? "No marketplaces linked."
        : `Marketplaces: ${listed(marketplaces.map((one) => `${one.name} (${one.source})`))}.`,
      plugins.length === 0
        ? "No plugins installed."
        : `${count(plugins.length, "plugin")}:`,
      plugins.map(pluginLine)
    );
  }
  if ("id" in answer) {
    return lines("Saved:", pluginLine(answer));
  }
  return `Linked marketplace ${answer.name} from ${answer.source}: install takes <plugin>@${answer.name}.`;
};

/** Where a server runs, after its other facts: nothing when it is every machine. */
const platformWords = (server: FleetMcpServerView): string => {
  if (server.platformsUnread) {
    return ` · saved platforms unreadable${server.platforms?.length ? ` (${listed(server.platforms)} read)` : ""}: on no machine until saved`;
  }
  if (!server.platforms) {
    return "";
  }
  return server.platforms.length > 0
    ? ` · ${listed(server.platforms)} only`
    : " · on no machine";
};

const mcpLine = (server: FleetMcpServerView): string => {
  const { config } = server;
  const where =
    config.type === "http" || config.type === "sse"
      ? config.url
      : config.command;
  return `- ${server.name}: ${config.type ?? "stdio"} ${where} · ${server.enabled ? "on" : "off"} · ${placeWords(server)}${platformWords(server)}${server.shared ? " · shared per machine" : ""}${server.auth ? ` · sign-in ${server.auth.state}${server.auth.detail ? ` (${server.auth.detail})` : ""}` : ""}`;
};

/** admin_mcp_servers: each server, or the one written. */
export const mcpSettingsWords = (
  answer: Deleted | { mcp: FleetMcpServerView[] } | FleetMcpServerView,
  asked: Asked
): Presented => {
  if (isDeleted(answer)) {
    return `${removedWords(`MCP server ${asked.name}`, answer)} Running sessions let it go within seconds.`;
  }
  if ("mcp" in answer) {
    const { mcp } = answer;
    return mcp.length === 0
      ? "No fleet MCP servers."
      : lines(`${count(mcp.length, "MCP server")}:`, mcp.map(mcpLine));
  }
  return `Saved MCP server ${asked.name}: ${valueExcerpt(answer, 600)}\nRunning sessions connect to it within seconds; no new session is needed.`;
};

interface RuleTemplate {
  blurb: string;
  draft: Partial<RuleRow>;
  title: string;
}

const ruleLine = (rule: RuleRow): string => {
  const now = Date.now();
  const fired =
    rule.stats.lastFiredAt === null
      ? "never fired"
      : `fired ${count(rule.stats.totalFires, "time")}, last ${ago(rule.stats.lastFiredAt, now)}`;
  return `- ${rule.name} (${shortId(rule.id)}) · ${rule.enabled ? "on" : "off"} · watches ${rule.watch} for ${rule.matchKind} ${quote(rule.pattern)} · replies ${quote(rule.reply)} at ${rule.timing}${rule.repeat ? ", every match" : ", once a session"} · ${fired}${rule.stats.pending > 0 ? ` · ${rule.stats.pending} pending` : ""}${rule.stats.unjudged > 0 ? ` · ${rulesWords.unjudged(rule.stats.unjudged, rule.stats.lastUnjudgedWhy ?? "no reason kept")}` : ""}`;
};

const templateLine = (template: RuleTemplate): string =>
  `- ${template.title}: ${template.blurb}`;

/** admin_rules: each rule and the starter templates, or the one written. */
export const ruleSettingsWords = (
  answer: Deleted | { rules?: RuleRow[]; templates: RuleTemplate[] } | Rule,
  asked: Asked
): Presented => {
  if (isDeleted(answer)) {
    return removedWords(`rule ${asked.id}`, answer);
  }
  if ("templates" in answer) {
    const { rules, templates } = answer;
    return lines(
      rules !== undefined &&
        (rules.length === 0
          ? "No rules."
          : `${count(rules.length, "rule")}; update and remove take the id:`),
      (rules ?? []).map(ruleLine),
      templates.length > 0 &&
        `Starter templates (create takes a template's fields; response_format "detailed" has each one's draft):`,
      templates.map(templateLine)
    );
  }
  return `Saved rule ${answer.name} (${shortId(answer.id)}): ${answer.enabled ? "on" : "off"}, ${answer.matchKind} ${quote(answer.pattern)}.`;
};

interface HookTemplate {
  blurb: string;
  title: string;
}

const hookLine = (hook: FleetHook): string =>
  `- ${hook.name} (${shortId(hook.id)}) · ${hook.enabled ? "on" : "off"} · on ${hook.event}${hook.matcher ? ` matching ${hook.matcher}` : ""} · ${hook.handler.type}${hook.script ? ", with a script" : ""} · ${placeWords(hook)}`;

/** admin_hooks: each hook and the templates, or the one written. */
export const hookSettingsWords = (
  answer:
    Deleted | { hooks: FleetHook[]; templates?: HookTemplate[] } | FleetHook,
  asked: Asked
): Presented => {
  if (isDeleted(answer)) {
    return removedWords(`hook ${asked.id}`, answer);
  }
  if ("hooks" in answer) {
    const { hooks, templates } = answer;
    return lines(
      hooks.length === 0
        ? "No hooks."
        : `${count(hooks.length, "hook")}; update and remove take the id:`,
      hooks.map(hookLine),
      (templates ?? []).length > 0 &&
        `Templates (response_format "detailed" has each one's draft and script):`,
      (templates ?? []).map(
        (template) => `- ${template.title}: ${template.blurb}`
      )
    );
  }
  return lines("Saved:", hookLine(answer));
};

/** A refusal the subagent routes answer (admin-tools.ts `AGENT_REFUSALS`). */
interface AgentRefused {
  answer: FleetAgent | string;
  refused: number;
}

/** One subagent's file, under the hash put and remove take back. */
const agentFileWords = (agent: FleetAgent, lead = ""): string =>
  lines(
    // @limit measured: 12 hex characters are 48 bits of a hash; one project's subagent files and memories share the namespace, so two collide after about 2^24 names
    `${lead}Subagent ${agent.name}, hash ${agent.hash.slice(0, HASH_HANDLE)} (expectedHash takes it):`,
    agent.content
  );

/** admin_subagents: each name and description, one file, or what a write did. */
export const subagentSettingsWords = (
  answer: AgentRefused | Deleted | { agents: FleetAgent[] } | FleetAgent,
  asked: Asked
): Presented => {
  if ("refused" in answer) {
    return typeof answer.answer === "string"
      ? `Refused: ${answer.answer}; list names them.`
      : agentFileWords(
          answer.answer,
          `Refused, nothing written: ${asked.expectedHash === "" ? "the name is taken" : "it moved since your read"}. Now: `
        );
  }
  if (isDeleted(answer)) {
    return `${removedWords(`subagent ${asked.name}`, answer)} Each machine keeps its copy of the file until its next sync.`;
  }
  if ("agents" in answer) {
    const { agents } = answer;
    return agents.length === 0
      ? 'No subagents: put with expectedHash "" adds one.'
      : lines(
          `${count(agents.length, "subagent")}; get takes the name:`,
          agents.map(
            (agent) =>
              `- ${agent.name}: ${parseAgentFrontMatter(agent.content).description ?? "no description"}`
          )
        );
  }
  return asked.action === "get"
    ? agentFileWords(answer)
    : `Saved subagent ${answer.name}, ${count(answer.content.split("\n").length, "line")}, hash ${answer.hash.slice(0, /* @limit measured: 12 hex characters are 48 bits of a hash; one project's subagent files and memories share the namespace, so two collide after about 2^24 names */ HASH_HANDLE)}.`;
};

const scopeWords = (scope: MemoryScope | undefined): string => {
  if (!scope) {
    return "linked, read on purpose";
  }
  const parts = [
    ...(scope.role ? [`${scope.role}s`] : []),
    ...(scope.delegateTypes?.length
      ? [`types ${listed(scope.delegateTypes)}`]
      : []),
    ...(scope.model ? [`models matching ${scope.model}`] : []),
    ...(scope.projectIds?.length
      ? [`projects ${scope.projectIds.map((id) => shortId(id)).join(", ")}`]
      : []),
    ...(scope.areaIds?.length
      ? [`areas ${scope.areaIds.map((id) => shortId(id)).join(", ")}`]
      : []),
    ...(scope.briefer ? ["handed to the delegate's caller"] : []),
  ];
  return parts.length > 0 ? `loaded by ${parts.join(", ")}` : "every session";
};

/** admin_memory: CLAUDE.md or the documents, or what a write kept. */
export const memorySettingsWords = (
  answer:
    | Deleted
    | { memory: FleetMemory | null }
    | { docs: (FleetMemoryDoc & { scope?: MemoryScope })[] }
    | { bytes: number; hash: string; lines: number; path?: string },
  asked: Asked
): Presented => {
  if ("memory" in answer) {
    const { memory } = answer;
    return memory
      ? lines(
          // @limit measured: 12 hex characters are 48 bits of a hash; one project's subagent files and memories share the namespace, so two collide after about 2^24 names
          memoryReadHead(memory.docs.length, memory.hash.slice(0, HASH_HANDLE)),
          memory.content
        )
      : "The fleet keeps no CLAUDE.md: set writes one.";
  }
  if ("docs" in answer) {
    return memoryListWords(
      answer.docs.map((doc) => ({
        path: doc.path,
        about: [
          scopeWords(doc.scope),
          count(doc.content.split("\n").length, "line"),
        ],
      }))
    );
  }
  if (isDeleted(answer)) {
    return removedWords(`document ${asked.path}`, answer);
  }
  return memoryKeptWords({
    path: answer.path ?? "CLAUDE.md",
    lines: answer.lines,
    bytes: answer.bytes,
    // @limit measured: 12 hex characters are 48 bits of a hash; one project's subagent files and memories share the namespace, so two collide after about 2^24 names
    handle: answer.hash.slice(0, HASH_HANDLE),
  });
};

/** admin_previews: how previews are reached. */
export const previewSettingsWords = (settings: {
  mode: "port" | "host";
  pattern?: string;
  ports?: string;
}): Presented =>
  settings.mode === "host"
    ? `Previews are reached by host: ${settings.pattern ?? "no pattern"}, routed to the range ${settings.ports ?? "the hub keeps"}.`
    : `Previews are reached by port, on the hub's range ${settings.ports ?? "it keeps"}.`;

/** What one row of each kind is called in a count. */
const HARNESS_CONFIG_NOUN: Record<HarnessConfigKind, [string, string]> = {
  claudeSettings: ["Claude Code settings row", "Claude Code settings rows"],
  opencodePlugins: ["OpenCode plugin", "OpenCode plugins"],
  piExtensions: ["pi extension", "pi extensions"],
};

const harnessConfigLine = (row: FleetHarnessConfig): string => {
  let what = `module, ${count(row.module?.split("\n").length ?? 0, "line")}`;
  if (row.settings) {
    what = `sets ${listed(Object.keys(row.settings)) || "nothing"}`;
  } else if (row.package) {
    what = `package ${row.package}`;
  }
  return `- ${row.name} · ${row.enabled ? "on" : "off"} · ${what} · ${placeWords(row)}`;
};

/** When a row written of each kind takes effect. */
const HARNESS_CONFIG_TAKEN: Record<HarnessConfigKind, string> = {
  claudeSettings:
    "A new session takes it as it starts; a running one keeps what it started with.",
  opencodePlugins:
    "Each machine writes the module, or installs the package with npm; a location booted after that sets it up.",
  piExtensions:
    "Each machine writes the module, or installs the package with npm; a new session loads it.",
};

/** admin_claude_settings, admin_opencode_plugins, admin_pi_extensions: each row of the kind, or the one written. */
export const harnessConfigSettingsWords =
  (kind: HarnessConfigKind) =>
  (
    answer: Deleted | { rows: FleetHarnessConfig[] } | FleetHarnessConfig,
    asked: Asked
  ): Presented => {
    if (isDeleted(answer)) {
      return removedWords(`${harnessConfigLabel(kind)} ${asked.name}`, answer);
    }
    if ("rows" in answer) {
      const { rows } = answer;
      const [one, many] = HARNESS_CONFIG_NOUN[kind];
      return rows.length === 0
        ? `No ${many}.`
        : lines(
            `${count(rows.length, one, many)}; put and remove take the name:`,
            rows.map(harnessConfigLine)
          );
    }
    return lines(
      "Saved:",
      harnessConfigLine(answer),
      HARNESS_CONFIG_TAKEN[kind]
    );
  };
