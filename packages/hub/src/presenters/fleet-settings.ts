/**
 * The fleet's settings as an agent reads them (admin-tools.ts): one line per
 * delegate type, connection, skill, plugin, MCP server, rule, hook or memory
 * document, each by the name its write takes; a write answers the row it
 * saved, a removal what the dashboard can still undo.
 */
import type {
  ConnectionView,
  DelegateType,
  FleetHook,
  FleetMarketplace,
  FleetMcpServer,
  FleetMemory,
  FleetMemoryDoc,
  FleetPlugin,
  FleetSkillMeta,
  MemoryScope,
  RuleRow,
} from "@cawco/core";
import type { Presented } from "../mcp-tool";
import { delegateTypesWords } from "./sessions";
import { ago, count, lasted, lines, listed, quote, valueWords } from "./words";

/** The catalog's first line, which a saved type's answer says otherwise. */
const CATALOG_HEAD = /^1 delegate type;[^\n]*\n/;

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
const placeWords = (row: { projectId?: string; scope?: string }): string =>
  row.projectId ? `project ${row.projectId.slice(0, 8)} only` : "every machine";

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

/** How much of a memory hash `expectedHash` takes (admin-tools.ts `wholeHash`). */
export const HASH_HANDLE = 12;

/** admin_delegate_types: the catalog, or the type saved. */
export const delegateTypeSettingsWords = (
  answer: unknown,
  asked: Asked
): Presented => {
  if (isDeleted(answer)) {
    return removedWords(`delegate type ${asked.name}`, answer);
  }
  if (asked.action === "list") {
    return delegateTypesWords(answer as { types: DelegateType[] });
  }
  return delegateTypesWords({ types: [answer as DelegateType] }).replace(
    CATALOG_HEAD,
    "Saved delegate type:\n"
  );
};

const connectionLine = (connection: ConnectionView): string =>
  `- ${connection.name}: ${connection.service} as ${connection.account} · ${connection.transport}${connection.url ? ` ${connection.url}` : ""}${connection.command ? ` ${connection.command}` : ""} · ${connection.state}${connection.reason ? ` (${connection.reason})` : ""} · ${connection.hasSecret ? "key held" : "no key held"} · ${connection.tools ? `tools ${listed(connection.tools) || "none"}` : "tools not listed yet"}${connection.projects.length > 0 ? ` · projects ${connection.projects.map((id) => id.slice(0, 8)).join(", ")}` : ""}`;

/** admin_connections: each connection, or the one written. */
export const connectionSettingsWords = (
  answer: unknown,
  asked: Asked
): Presented => {
  if (isDeleted(answer)) {
    return removedWords(`connection ${asked.name}`, answer);
  }
  if (asked.action === "list") {
    const { connections } = answer as { connections: ConnectionView[] };
    return connections.length === 0
      ? "No connections: admin_connections_write's create adds one."
      : lines(
          `${count(connections.length, "connection")}; a delegate type or project lists one by name:`,
          connections.map(connectionLine)
        );
  }
  if (asked.action === "sign_in") {
    return `Open this to sign in: ${valueWords(answer, 2000)}`;
  }
  return lines("Saved:", connectionLine(answer as ConnectionView));
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
  answer: unknown,
  asked: Asked
): Presented => {
  if (isDeleted(answer)) {
    return removedWords(`skill ${asked.name}`, answer);
  }
  if (asked.action === "list") {
    const { skills } = answer as { skills: FleetSkillMeta[] };
    return skills.length === 0
      ? "No fleet skills."
      : lines(`${count(skills.length, "skill")}:`, skills.map(skillLine));
  }
  return lines("Saved:", skillLine(answer as FleetSkillMeta));
};

const pluginLine = (plugin: FleetPlugin): string =>
  `- ${plugin.id} · ${plugin.enabled ? "on" : "off"} · ${placeWords(plugin)}${versionWords(
    plugin
  )
    .map((one) => ` · ${one}`)
    .join("")}`;

/** admin_plugins: the marketplaces and plugins, or the one written. */
export const pluginSettingsWords = (
  answer: unknown,
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
  if (asked.action === "list") {
    const { marketplaces, plugins } = answer as {
      marketplaces: FleetMarketplace[];
      plugins: FleetPlugin[];
    };
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
  if (asked.action === "link") {
    const marketplace = answer as FleetMarketplace;
    return `Linked marketplace ${marketplace.name} from ${marketplace.source}: install takes <plugin>@${marketplace.name}.`;
  }
  return lines("Saved:", pluginLine(answer as FleetPlugin));
};

const mcpLine = (server: FleetMcpServer): string => {
  const config = server.config as {
    command?: string;
    type?: string;
    url?: string;
  };
  const where = config.url ?? config.command ?? "";
  return `- ${server.name}: ${config.type ?? "stdio"} ${where} · ${server.enabled ? "on" : "off"} · ${placeWords(server)}${server.platforms?.length ? ` · ${listed(server.platforms)} only` : ""}${server.shared ? " · shared per machine" : ""}${server.auth ? ` · sign-in ${server.auth.state}${server.auth.detail ? ` (${server.auth.detail})` : ""}` : ""}`;
};

/** admin_mcp_servers: each server, or the one written. */
export const mcpSettingsWords = (answer: unknown, asked: Asked): Presented => {
  if (isDeleted(answer)) {
    return removedWords(`MCP server ${asked.name}`, answer);
  }
  if (asked.action === "list") {
    const { mcp } = answer as { mcp: FleetMcpServer[] };
    return mcp.length === 0
      ? "No fleet MCP servers."
      : lines(`${count(mcp.length, "MCP server")}:`, mcp.map(mcpLine));
  }
  return `Saved MCP server ${asked.name}: ${valueWords(answer, 600)}`;
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
  return `- ${rule.name} (${rule.id.slice(0, 8)}) · ${rule.enabled ? "on" : "off"} · watches ${rule.watch} for ${rule.matchKind} ${quote(rule.pattern, 120)} · replies ${quote(rule.reply, 160)} at ${rule.timing}${rule.repeat ? ", every match" : ", once a session"} · ${fired}${rule.stats.pending > 0 ? ` · ${rule.stats.pending} pending` : ""}`;
};

const templateLine = (template: RuleTemplate): string =>
  `- ${template.title}: ${template.blurb}`;

/** admin_rules: each rule and the starter templates, or the one written. */
export const ruleSettingsWords = (answer: unknown, asked: Asked): Presented => {
  if (isDeleted(answer)) {
    return removedWords(`rule ${asked.id}`, answer);
  }
  if (asked.action === "list" || asked.action === "templates") {
    const { rules, templates } = answer as {
      rules?: RuleRow[];
      templates?: RuleTemplate[];
    };
    return lines(
      rules !== undefined &&
        (rules.length === 0
          ? "No rules."
          : `${count(rules.length, "rule")}; update and remove take the id:`),
      (rules ?? []).map(ruleLine),
      (templates ?? []).length > 0 &&
        `Starter templates (create takes a template's fields; response_format "detailed" has each one's draft):`,
      (templates ?? []).map(templateLine)
    );
  }
  const rule = answer as RuleRow;
  return `Saved rule ${rule.name} (${rule.id.slice(0, 8)}): ${rule.enabled ? "on" : "off"}, ${rule.matchKind} ${quote(rule.pattern, 120)}.`;
};

interface HookTemplate {
  blurb: string;
  title: string;
}

const hookLine = (hook: FleetHook): string =>
  `- ${hook.name} (${hook.id.slice(0, 8)}) · ${hook.enabled ? "on" : "off"} · on ${hook.event}${hook.matcher ? ` matching ${hook.matcher}` : ""} · ${hook.handler.type}${hook.script ? ", with a script" : ""} · ${placeWords(hook)}`;

/** admin_hooks: each hook and the templates, or the one written. */
export const hookSettingsWords = (answer: unknown, asked: Asked): Presented => {
  if (isDeleted(answer)) {
    return removedWords(`hook ${asked.id}`, answer);
  }
  if (asked.action === "list") {
    const { hooks, templates } = answer as {
      hooks: FleetHook[];
      templates?: HookTemplate[];
    };
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
  return lines("Saved:", hookLine(answer as FleetHook));
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
      ? [`projects ${scope.projectIds.map((id) => id.slice(0, 8)).join(", ")}`]
      : []),
    ...(scope.briefer ? ["handed to the delegate's caller"] : []),
  ];
  return parts.length > 0 ? `loaded by ${parts.join(", ")}` : "every session";
};

/** admin_memory: CLAUDE.md or the documents, or what a write kept. */
export const memorySettingsWords = (
  answer: unknown,
  asked: Asked
): Presented => {
  switch (asked.action) {
    case "get": {
      const { memory } = answer as { memory: FleetMemory | null };
      return memory
        ? lines(
            `The fleet's CLAUDE.md, ${count(memory.docs.length, "linked document")}; a write's expectedHash takes ${memory.hash.slice(0, HASH_HANDLE)}:`,
            memory.content
          )
        : "The fleet keeps no CLAUDE.md: set writes one.";
    }
    case "list_docs": {
      const { docs } = answer as {
        docs: (FleetMemoryDoc & { scope?: MemoryScope })[];
      };
      return docs.length === 0
        ? "No memory documents."
        : lines(
            `${count(docs.length, "document")}; set_doc and remove_doc take the path:`,
            docs.map(
              (doc) =>
                `- ${doc.path} · ${scopeWords(doc.scope)} · ${count(doc.content.split("\n").length, "line")}`
            )
          );
    }
    case "remove_doc":
      return isDeleted(answer)
        ? removedWords(`document ${asked.path}`, answer)
        : `Removed document ${asked.path}.`;
    default: {
      const kept = answer as {
        bytes: number;
        hash: string;
        lines: number;
        path?: string;
      };
      return `Kept ${kept.path ?? "CLAUDE.md"}: ${count(kept.lines, "line")}, ${kept.bytes} bytes; the next write's expectedHash takes ${kept.hash.slice(0, HASH_HANDLE)}.`;
    }
  }
};

/** admin_previews: how previews are reached. */
export const previewSettingsWords = (answer: unknown): Presented => {
  const settings = answer as {
    mode: "port" | "host";
    pattern?: string;
    ports?: string;
  };
  return settings.mode === "host"
    ? `Previews are reached by host: ${settings.pattern ?? "no pattern"}, routed to the range ${settings.ports ?? "the hub keeps"}.`
    : `Previews are reached by port, on the hub's range ${settings.ports ?? "it keeps"}.`;
};
