/**
 * Fleet administration tools: agents manage cawco's settings (delegate types,
 * skills, plugins, MCP servers, rules, hooks, subagents, memory) through the same MCP server
 * the handoff tools ride.
 *
 * Every write calls the function its route calls (admin-calls.ts), so it
 * shares the same validation, fan-out and persistence the dashboard uses. The
 * tools are read/write over fleet config — not session-scoped, not
 * delegation-scoped.
 */
import { accountNames } from "@cawco/core/accounts";
import { CLAUDE_JSON_LABEL, userLayerLabel } from "@cawco/core/claude-dirs";
import type { ConnectionAuth } from "@cawco/core/connections";
import {
  type FleetAgent,
  type FleetPlugin,
  type FleetSkillMeta,
  type MarketplaceLink,
  MCP_PLATFORMS,
  MEMORY_ROLES,
  type MemoryScope,
  scoped,
} from "@cawco/core/fleet";
import { EFFORT_LEVELS, HARNESSES } from "@cawco/core/harness/kinds";
import type { HarnessConfigKind } from "@cawco/core/harness-config";
import { mcpWords } from "@cawco/core/words/mcp";
import { ElysiaStatus } from "elysia";
import { z } from "zod";
import type { AdminCalls } from "./admin-calls";
import { landedFetch } from "./fleet-fetches";
import { byHandle } from "./handles";
import { answered, type Presenter, toolOn } from "./mcp-tool";
import {
  connectionSettingsWords,
  delegateTypeSettingsWords,
  HASH_HANDLE,
  harnessConfigSettingsWords,
  hookSettingsWords,
  mcpSettingsWords,
  memorySettingsWords,
  pluginSettingsWords,
  previewSettingsWords,
  ruleSettingsWords,
  skillSettingsWords,
  subagentSettingsWords,
} from "./presenters/fleet-settings";
import type { AnyProblem } from "./refusal";

/** The connection auths the `connections` tool's `auth` field takes. */
const MADE_AUTHS = [
  "none",
  "bearer",
  "header",
  "oauth",
] as const satisfies readonly ConnectionAuth[];

/**
 * A subagent write's answer, its two refusals as the presenter reads them
 * (presenters/fleet-settings.ts `AgentRefused`): the file it named is gone
 * (404, its words), or moved since its read (409, the stored file). Any other
 * problem is the call's own.
 */
const agentRefused = <A>(answer: A) => {
  if (!(answer instanceof ElysiaStatus)) {
    return answer;
  }
  if (answer.status === 409) {
    return { refused: answer.status, answer: answer.response };
  }
  if (answer.status === 404) {
    return { refused: answer.status, answer: answer.response.detail };
  }
  return answer;
};

/** Every subagent's name, for a refusal that names what there is. */
const listedNames = (agents: readonly FleetAgent[]): string =>
  agents.length === 0 ? "none" : agents.map((agent) => agent.name).join(", ");

/** The fields a call gave: none undefined, no empty list. */
const fieldsGiven = (
  fields: Record<string, unknown>
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(fields).filter(
      ([, value]) =>
        value !== undefined && !(Array.isArray(value) && value.length === 0)
    )
  );

/**
 * The marketplace half of `manage_plugins`. A link is a different resource from
 * the plugins it carries — its own route, its own key — and keeping it here is
 * what lets the tool's own handler stay about plugins.
 */
const marketplaceAction = async (
  on: AdminCalls,
  action: "link" | "unlink",
  name: string | undefined,
  source: string | undefined
) => {
  if (action === "unlink") {
    if (!name) {
      throw new Error("name is required to unlink a marketplace");
    }
    return on.marketplaces.unlink(name);
  }
  if (!source) {
    throw new Error("source is required to link a marketplace");
  }
  // Linked under the name its own marketplace.json gives; the row says it.
  // The route answers before the source is read; the link lands after.
  const wanted = source.trim();
  const link = await landedFetch<MarketplaceLink>(
    (news) => (news.link?.source === wanted ? news.link : undefined),
    () => Promise.resolve(on.marketplaces.link(wanted))
  );
  if (!answered(link)) {
    return link;
  }
  if (!link.marketplace) {
    throw new Error(`could not link ${wanted}: ${link.error}`);
  }
  return link.marketplace;
};

const adminTool = toolOn<AdminCalls>();

/** Every write's reason, which the person reads first on the approval (asks.ts `askRefusal`). */
const reason = z
  .string()
  .max(300)
  .optional()
  .describe("Required: why, for which task.");

/** What a memory write answers: the hash to write against next, when it landed, and the size kept; never the text back. */
const keptMemory = (
  saved: { hash: string; updatedAt: string },
  content: string
): { bytes: number; hash: string; lines: number; updatedAt: string } => ({
  hash: saved.hash,
  updatedAt: saved.updatedAt,
  lines: content === "" ? 0 : content.split("\n").length,
  bytes: Buffer.byteLength(content),
});

/**
 * The hash an `expectedHash` names: the whole one, or the handle the read
 * gave (its first {@link HASH_HANDLE} characters or more) of the copy the
 * fleet keeps now, the CLAUDE.md or the document at `path`. A handle the
 * kept copy no longer starts with goes on as given, and the write is
 * refused as moved, with the current version.
 */
const wholeHash = async (
  on: AdminCalls,
  asked: string,
  path: string | undefined
): Promise<string> => {
  if (asked.length >= 64 || asked.length < HASH_HANDLE) {
    return asked;
  }
  const fleet = await on.fleet();
  const kept =
    path === undefined
      ? fleet.memory?.hash
      : fleet.memoryDocs.find((doc) => doc.path === path)?.hash;
  return kept?.startsWith(asked) ? kept : asked;
};

/** A row an admin read lists by id, name and the handle it shows. */
interface Listed {
  id: string;
  name: string;
}

/**
 * The row `asked` names among `rows`: its whole id, the handle a read shows
 * (handles.ts), or its name. Refused in one sentence naming the matches
 * when ambiguous, or what there is when none.
 */
const listedNamed = <T extends Listed>(
  asked: string,
  rows: readonly T[],
  what: string
): T =>
  byHandle(
    asked,
    rows,
    {
      id: (row) => row.id,
      names: (row) => [row.name],
      said: (row) => `${row.name} (${row.id.slice(0, 8)})`,
    },
    what
  );

/** The whole ids of the projects `asked` names, each by id, handle or name. */
const projectIdsOf = (on: AdminCalls, asked: readonly string[]): string[] => {
  if (asked.length === 0) {
    return [];
  }
  const projects = on.projects();
  return asked.map((one) => listedNamed(one, projects, "project").id);
};

/** {@link projectIdsOf} for one project field: null, undefined and blank go on as given. */
const projectIdOf = <T extends string | null | undefined>(
  on: AdminCalls,
  asked: T
): T | string => (asked ? (projectIdsOf(on, [asked])[0] ?? asked) : asked);

/** The whole ids of the areas `asked` names, each by id, handle or name. */
const areaIdsOf = (on: AdminCalls, asked: readonly string[]): string[] => {
  if (asked.length === 0) {
    return [];
  }
  const { areas } = on.areas();
  return asked.map((one) => listedNamed(one, areas, "area").id);
};

/** {@link areaIdsOf} for one area field: null, undefined and blank go on as given. */
const areaIdOf = <T extends string | null | undefined>(
  on: AdminCalls,
  asked: T
): T | string => (asked ? (areaIdsOf(on, [asked])[0] ?? asked) : asked);

/** A fleet row's `areaId` parameter: bound to every project in an area instead of one. */
const areaIdParameter = z
  .string()
  .nullable()
  .optional()
  .describe(
    "Every project in one area instead (its id or name), as the area holds them when read. null: none."
  );

/**
 * A fleet row's binding as its route takes it: its project or its area by
 * whole id, each left out when not given.
 */
const bindingAsked = (
  on: AdminCalls,
  asked: {
    areaId?: string | null;
    projectId?: string | null;
  }
): { areaId?: string | null; projectId?: string | null } => ({
  ...(asked.projectId === undefined
    ? {}
    : { projectId: projectIdOf(on, asked.projectId) }),
  ...(asked.areaId === undefined ? {} : { areaId: areaIdOf(on, asked.areaId) }),
});

/** The memory scope `scope` names, its projects and areas by whole id. */
const scopeWithProjects = (
  on: AdminCalls,
  scope: MemoryScope | undefined
): MemoryScope | undefined =>
  scope && {
    ...scope,
    ...(scope.projectIds
      ? { projectIds: projectIdsOf(on, scope.projectIds) }
      : {}),
    ...(scope.areaIds ? { areaIds: areaIdsOf(on, scope.areaIds) } : {}),
  };

/**
 * Whether a document's scope has every field `filter` gives: the same role,
 * model and briefer, and every delegate type and project listed. An empty
 * filter matches the unscoped documents.
 */
const scopeHas = (
  scope: MemoryScope | undefined,
  filter: MemoryScope
): boolean => {
  if (!scoped(filter)) {
    return !scoped(scope);
  }
  const lists = (given: string[] | undefined, held: string[] | undefined) =>
    (given ?? []).every((one) => (held ?? []).includes(one));
  return (
    (filter.role === undefined || filter.role === scope?.role) &&
    (filter.model === undefined || filter.model === scope?.model) &&
    (filter.briefer === undefined || filter.briefer === scope?.briefer) &&
    lists(filter.delegateTypes, scope?.delegateTypes) &&
    lists(filter.projectIds, scope?.projectIds) &&
    lists(filter.areaIds, scope?.areaIds)
  );
};

/** What a session is told to have the owner run to give a connection its key. */
const setKeyCommand = (name: string): string =>
  `Run on a machine joined to this hub: cawco connections set-key ${name}`;

/**
 * The answer to an admin write that changes nothing and so asks nobody: a
 * session asking to set a connection's key. A key never passes through a
 * session, so it lands in no transcript: the owner gives it to the hub with
 * the CLI, and the session is told the exact command. Undefined for every
 * other call.
 */
export const answeredWithoutAsking = (
  name: string,
  input: Record<string, unknown>
): string | undefined => {
  if (name !== "admin_connections_write" || input.action !== "set_key") {
    return;
  }
  const connection =
    typeof input.name === "string" && input.name ? input.name : "<name>";
  return `${setKeyCommand(connection)}\nA connection's key is never given to a session: don't ask the owner to paste it here.`;
};

/**
 * One group of fleet settings as two tools, named group first (§5.3):
 * `admin_<group>_read`, which takes only its read actions, and
 * `admin_<group>_write`, which takes the rest with the fields they need. One
 * handler serves both, through the hub's own REST routes; a write is the
 * person's ask, run by the hub once they approve it, or at once in Full Send
 * (asks.ts).
 */
function admin<G extends string, T extends z.ZodRawShape>(
  group: G,
  about: string,
  reads: readonly [string, ...string[]],
  writes: readonly [string, ...string[]],
  input: T,
  handler: (
    args: { action: string } & Partial<z.infer<z.ZodObject<T>>>,
    on: AdminCalls
  ) => Promise<unknown>,
  /** How an agent reads the group's answers, knowing the action asked. */
  present: Presenter<unknown, { action: string } & Record<string, unknown>>,
  writeNote = "",
  /** The fields of `input` a read takes too, by name; none by default. */
  readFields: readonly (keyof T & string)[] = []
) {
  const read = adminTool(
    `admin_${group}_read` as const,
    `Read ${about} \`action\`: ${reads.map((action) => `'${action}'`).join(", ")}.`,
    {
      action: z.enum(reads),
      ...Object.fromEntries(readFields.map((name) => [name, input[name]])),
    },
    // A read names its action and the fields it was given; every other field is the write's.
    (args, _format, on) =>
      handler(
        args as { action: string } & Partial<z.infer<z.ZodObject<T>>>,
        on
      ),
    (answer, asked) =>
      present(answer, asked as { action: string } & Record<string, unknown>)
  );
  const write = adminTool(
    `admin_${group}_write` as const,
    `Change what admin_${group}_read reads. \`action\`: ${writes.map((action) => `'${action}'`).join(", ")}.${writeNote} The person approves it first, unless in Full Send; their answer arrives as a message.`,
    { action: z.enum(writes), reason, ...input },
    // The reason is the person's to read on the approval, not a setting.
    (args, _format, on) => {
      const { reason: _reason, ...setting } = args as Record<string, unknown>;
      return handler(
        setting as { action: string } & Partial<z.infer<z.ZodObject<T>>>,
        on
      );
    },
    (answer, asked) =>
      present(answer, asked as { action: string } & Record<string, unknown>)
  );
  return [read, write];
}

/** Where a Claude Code settings row, OpenCode plugin or pi extension applies, and whether it is on. */
const harnessConfigPlacement = {
  enabled: z.boolean().optional().describe("Defaults to true for a new row."),
  projectId: z
    .string()
    .nullable()
    .optional()
    .describe(
      "One project's only: its sessions in every checkout and workspace of it. null: every machine."
    ),
  areaId: areaIdParameter,
};

/** A plugin's or extension's code: one module, or one npm package. */
const harnessConfigCode = (module: string) => ({
  module: z
    .string()
    .optional()
    .describe(`Its source. ${module} Give module or package.`),
  package: z
    .string()
    .optional()
    .describe("An npm package with its exact version, name@version."),
});

/**
 * The one handler of the three harness config groups, through their kind's
 * calls: a put sends only the fields given, and a module or a package clears
 * the other.
 */
const harnessConfigHandler =
  (kind: HarnessConfigKind) =>
  async (
    {
      action,
      name,
      settings,
      module,
      package: pkg,
      enabled,
      projectId,
      areaId,
    }: {
      action: string;
      areaId?: string | null;
      enabled?: boolean;
      module?: string;
      name?: string;
      package?: string;
      projectId?: string | null;
      settings?: Record<string, unknown>;
    },
    on: AdminCalls
  ): Promise<unknown> => {
    if (action === "list") {
      return await Promise.resolve(on.harnessConfigs.list(kind));
    }
    if (!name) {
      throw new Error("name is required for put and remove");
    }
    if (action === "remove") {
      return await Promise.resolve(on.harnessConfigs.remove(kind, name));
    }
    return await Promise.resolve(
      on.harnessConfigs.put(kind, name, {
        ...fieldsGiven({ settings, enabled }),
        ...(module === undefined ? {} : { module, package: null }),
        ...(pkg === undefined ? {} : { package: pkg, module: null }),
        ...bindingAsked(on, { projectId, areaId }),
      })
    );
  };

/** The delegate type tool's `account` parameter, as the agent calling it reads it. */
const TYPE_ACCOUNT_DESCRIPTION =
  "Account id its sessions start on wherever it can take them; otherwise the provider's strategy chooses.";

/** The delegate type tool's `startingSet` parameter, as the agent calling it reads it. */
const STARTING_SET_DESCRIPTION =
  "Its sessions' only skills (plugin:skill) and fleet MCP servers, besides CawCo's.";

/**
 * A delegate types answer (the list, or one type saved) with the fleet's
 * account names beside it, so a type's preferred account reads by the name
 * CawCo gives it (core `accountNames`).
 */
const withAccountNames = (on: AdminCalls, answer: object): object => {
  const { accounts } = on.accounts();
  return {
    ...answer,
    accountNames: Object.fromEntries(accountNames(accounts)),
  };
};

/** The admin tools, separated from the handoff tools so the MCP server composes them. */
export function adminTools() {
  return [
    // ── delegate types ───────────────────────────────────────────────────
    ...admin(
      "delegate_types",
      "the fleet's delegate type presets: the named routes a `delegate` call's " +
        "`type` parameter resolves against. Each type bundles a harness, model, effort, " +
        "skills and denied tools so callers route by what the work needs, not by a model " +
        "string.",
      ["list"],
      ["put", "delete"],
      {
        name: z
          .string()
          .optional()
          .describe("The type name. Required for put and delete."),
        description: z
          .string()
          .optional()
          .describe("What this type is for. Required for put."),
        harness: z
          .enum(HARNESSES)
          .optional()
          .describe(
            "Which runtime runs delegates of this type. Required for put."
          ),
        model: z
          .string()
          .optional()
          .describe("Model id for the harness. Required for put."),
        effort: z.enum(EFFORT_LEVELS).optional().describe("Reasoning effort."),
        skills: z
          .array(z.string())
          .optional()
          .describe("Skills its delegates load at start."),
        denyTools: z
          .array(z.string())
          .optional()
          .describe("Tools its delegates are denied."),
        mayStart: z
          .array(z.string())
          .optional()
          .describe(
            'Type names its sessions may start; ["any"] every type. Default none.'
          ),
        connections: z
          .array(z.string())
          .optional()
          .describe(
            "Connections its sessions may call (admin_connections_read)."
          ),
        account: z.string().optional().describe(TYPE_ACCOUNT_DESCRIPTION),
        startingSet: z
          .object({ skills: z.array(z.string()), servers: z.array(z.string()) })
          .optional()
          .describe(STARTING_SET_DESCRIPTION),
      },
      async (
        {
          action,
          name,
          description,
          harness,
          model,
          effort,
          skills,
          denyTools,
          mayStart,
          connections,
          account,
          startingSet,
        },
        on
      ) => {
        if (action === "list") {
          return withAccountNames(on, on.delegateTypes.list());
        }
        if (!name) {
          throw new Error("name is required for put and delete");
        }
        if (action === "delete") {
          return await Promise.resolve(on.delegateTypes.remove(name));
        }
        // put
        if (!(description && harness && model)) {
          throw new Error(
            "description, harness, and model are required to create or update a delegate type"
          );
        }
        const saved = on.delegateTypes.put(name, {
          description,
          harness,
          model,
          ...fieldsGiven({
            effort,
            skills,
            denyTools,
            mayStart,
            connections,
            account,
            startingSet,
          }),
        });
        return saved instanceof ElysiaStatus
          ? saved
          : withAccountNames(on, saved);
      },
      delegateTypeSettingsWords
    ),

    // ── connections ──────────────────────────────────────────────────────
    ...admin(
      "connections",
      "the hub's connections: outside services it signs in to, one per account. " +
        "Sessions whose delegate type or project lists one call its tools as " +
        "conn__<name>__<tool>; the hub keeps the key.",
      ["list"],
      ["create", "update", "sign_in", "remove"],
      {
        name: z
          .string()
          .optional()
          .describe("Lowercase, digits, hyphens: github-petra."),
        service: z.string().optional().describe("github, x, linear…"),
        account: z.string().optional().describe("Which account of it."),
        transport: z
          .enum(["http", "sse", "stdio"])
          .optional()
          .describe("stdio: a command the hub runs."),
        url: z.string().optional(),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        auth: z.enum(MADE_AUTHS).optional(),
        header: z
          .string()
          .optional()
          .describe(
            "auth header: the header (stdio: env var) the key goes in."
          ),
        projects: z
          .array(z.string())
          .optional()
          .describe("Project ids whose sessions may use it."),
        origin: z
          .string()
          .optional()
          .describe("sign_in: the hub address the browser reaches."),
      },
      async (args, on) => {
        const { action, name } = args;
        if (action === "list") {
          return on.connections.list();
        }
        if (!name) {
          throw new Error("name is required for every connection write");
        }
        if (action === "remove") {
          return await Promise.resolve(on.connections.remove(name));
        }
        if (action === "sign_in") {
          return await on.connections.signIn(
            name,
            fieldsGiven({ origin: args.origin })
          );
        }
        const {
          action: _action,
          name: _name,
          origin: _origin,
          projects,
          ...rest
        } = args;
        const fields = {
          ...rest,
          ...(projects ? { projects: projectIdsOf(on, projects) } : {}),
        };
        if (action === "create") {
          return await on.connections.create({ name, ...fieldsGiven(fields) });
        }
        return await on.connections.update(name, fieldsGiven(fields));
      },
      connectionSettingsWords,
      " A key never goes through a session: the owner runs `cawco connections set-key <name>` on a machine joined to the hub. Never ask for a key in chat. sign_in answers the URL to open. Changing where it points drops the key."
    ),

    // ── skills ───────────────────────────────────────────────────────────
    ...admin(
      "skills",
      "the fleet's skills: the slash-command skill directories synced to every " +
        `machine under ${userLayerLabel("skills")}/.`,
      ["list"],
      ["install", "enable", "disable", "remove"],
      {
        name: z
          .string()
          .optional()
          .describe(
            `The skill name (its directory name under ${userLayerLabel("skills")}/). Required for all ` +
              "actions except list."
          ),
        source: z
          .string()
          .optional()
          .describe(
            "Where to fetch the skill from. Required for install. Examples: " +
              "'github:owner/repo', 'npm:package-name', 'https://example.com/skill.tar.gz', " +
              "'skills:owner/repo@skill-name', 'file:/abs/path/to/skill-folder' (a folder " +
              "holding a SKILL.md on your own machine, no publishing needed)."
          ),
        projectId: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Install for one project only: it lands in every checkout and workspace of it. null: every machine."
          ),
        areaId: areaIdParameter,
        contentHash: z
          .string()
          .optional()
          .describe(
            "Leave out: the hub sets it for a folder install, pinning the files the person approves."
          ),
      },
      async ({ action, name, source, projectId, areaId, contentHash }, on) => {
        if (action === "list") {
          const { skills } = await on.fleet();
          return { skills };
        }
        if (!name) {
          throw new Error("name is required");
        }
        if (action === "remove") {
          return await Promise.resolve(on.skills.remove(name));
        }
        if (action === "enable" || action === "disable") {
          // The stored skill's flag; nothing is fetched.
          return await Promise.resolve(
            on.skills.setEnabled(name, action === "enable")
          );
        }
        // install
        if (!source) {
          throw new Error("source is required to install a skill");
        }
        // The route answers before the source is fetched; the row as the
        // fetch landed it (files, the sentence it failed with, or `choices`).
        return await landedFetch<FleetSkillMeta>(
          (news) => (news.skill?.name === name ? news.skill : undefined),
          () =>
            on.skills.put(name, {
              source,
              ...(contentHash === undefined ? {} : { contentHash }),
              enabled: true,
              ...bindingAsked(on, { projectId, areaId }),
            })
        );
      },
      skillSettingsWords,
      " Install fetches the source (github:owner/repo, npm:package, a URL, skills:slug, or file:<absolute path> to a skill folder on your machine) once at the hub and distributes the files to every machine. A folder's SKILL.md needs a name and description; installing from the same folder again updates it."
    ),

    // ── plugins ──────────────────────────────────────────────────────────
    ...admin(
      "plugins",
      "the fleet's Claude Code plugins: whole marketplace bundles synced to " +
        `every machine under ${userLayerLabel("plugins")}/. A plugin is the unit to reach for when ` +
        "a repo ships MANY skills, or skills that read shared files beside them " +
        "(references/, agents/, commands/); a skill copies one directory and " +
        "cannot carry those.",
      ["list"],
      ["link", "unlink", "install", "enable", "disable", "refresh", "remove"],
      {
        id: z
          .string()
          .optional()
          .describe(
            "The plugin's `plugin@marketplace` id, which is the CLI's own form — e.g. " +
              "'compound-writing@compound-writing'. Required for install, enable, " +
              "disable, refresh, and remove."
          ),
        name: z
          .string()
          .optional()
          .describe(
            "The marketplace's name — the half after the `@` in a plugin id. It is " +
              "always the `name` its own marketplace.json gives: link reads it from " +
              "the source and answers with it. Required for unlink."
          ),
        source: z
          .string()
          .optional()
          .describe(
            "Where the marketplace is fetched from — whatever `claude plugin " +
              "marketplace add` accepts: 'owner/repo', a git URL, or a local directory " +
              "path. Required for link."
          ),
      },
      async ({ action, id, name, source }, on) => {
        if (action === "list") {
          const { config } = await on.fleet();
          return {
            marketplaces: config.marketplaces,
            plugins: config.plugins,
          };
        }

        if (action === "link" || action === "unlink") {
          return await marketplaceAction(on, action, name, source);
        }

        if (!id) {
          throw new Error("id is required");
        }
        if (action === "remove") {
          return await Promise.resolve(on.plugins.remove(id));
        }
        if (action === "enable" || action === "disable") {
          // The stored plugin's flag; nothing is fetched.
          return await Promise.resolve(
            on.plugins.setEnabled(id, action === "enable")
          );
        }
        // Install and refresh answer before the bytes are fetched; the row as
        // the fetch landed it.
        const landed = (ask: () => Promise<FleetPlugin | AnyProblem>) =>
          landedFetch<FleetPlugin>(
            (news) => (news.plugin?.id === id ? news.plugin : undefined),
            ask
          );
        if (action === "refresh") {
          return await landed(() => Promise.resolve(on.plugins.refresh(id)));
        }
        return await landed(() =>
          Promise.resolve(on.plugins.put(id, { enabled: true }))
        );
      },
      pluginSettingsWords,
      " Order matters: 'link' the marketplace first, then 'install' a plugin from it by its `plugin@marketplace` id, with the name link answered; 'refresh' re-fetches one whose upstream moved. The hub resolves the bytes once and distributes them."
    ),

    // ── MCP servers ──────────────────────────────────────────────────────
    ...admin(
      "mcp_servers",
      `the fleet's MCP servers: the servers synced to every machine's ${CLAUDE_JSON_LABEL}.`,
      ["list"],
      ["put", "remove"],
      {
        name: z
          .string()
          .optional()
          .describe(
            `The server name, as in ${CLAUDE_JSON_LABEL}. Required for put and remove.`
          ),
        config: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Required for put. stdio: { command, args? }; remote: " +
              `{ type: "http"|"sse", url }. ${mcpWords.secretToolNote}`
          ),
        enabled: z.boolean().optional().describe("Defaults to true for put."),
        projectId: z
          .string()
          .nullable()
          .optional()
          .describe(
            "One project's only: placed in its every checkout and workspace. null: every machine."
          ),
        areaId: areaIdParameter,
        platforms: z
          .array(z.enum(MCP_PLATFORMS))
          .nullable()
          .optional()
          .describe("Only machines of these platforms get it. null: all."),
        shared: z
          .boolean()
          .optional()
          .describe("One process per machine; stdio, no per-session state."),
      },
      async (
        { action, name, config, enabled, projectId, areaId, platforms, shared },
        on
      ) => {
        if (action === "list") {
          const { config: fleet } = await on.fleet();
          return { mcp: fleet.mcp };
        }
        if (!name) {
          throw new Error("name is required for put and remove");
        }
        if (action === "remove") {
          return await Promise.resolve(on.mcp.remove(name));
        }
        // put
        if (!config) {
          throw new Error("config is required to add or update an MCP server");
        }
        return await on.mcp.put(name, {
          config,
          ...(enabled === undefined ? {} : { enabled }),
          ...bindingAsked(on, { projectId, areaId }),
          ...(platforms === undefined ? {} : { platforms }),
          ...(shared === undefined ? {} : { shared }),
        });
      },
      mcpSettingsWords,
      " A change reaches running sessions within seconds (a put connects, a removal leaves);" +
        " no new session is needed."
    ),

    // ── rules ────────────────────────────────────────────────────────────
    ...admin(
      "rules",
      "the fleet's rules: standing instructions the hub enforces on every session's " +
        "output stream. A rule watches for a phrase or regex in what sessions say (or think) " +
        "and replies with a fixed message or an LLM evaluation. 'list' answers them with " +
        "stats, 'templates' starter recipes; one scoped to a removed machine carries `orphaned`.",
      ["list", "templates"],
      ["create", "update", "remove"],
      {
        id: z
          .string()
          .optional()
          .describe("The rule id. Required for update and remove."),
        // Rule fields — required for create, optional for update (merged with existing)
        name: z
          .string()
          .optional()
          .describe("What the rule is called. Required for create."),
        enabled: z.boolean().optional().describe("Whether the rule is active."),
        pattern: z
          .string()
          .optional()
          .describe(
            "The phrase or regex to watch for, or the yes/no question for meaning. Required for create."
          ),
        matchKind: z
          .enum(["phrase", "regex", "meaning"])
          .optional()
          .describe(
            "How to read the pattern. Default 'phrase'. 'meaning' makes the pattern a yes/no " +
              "question CawCo's Jev model answers about the output (needs its route: a TypeSafe key or OpenRouter set in Settings; " +
              "timing 'turn' or 'message' only)."
          ),
        caseSensitive: z
          .boolean()
          .optional()
          .describe("Match a phrase's case. Default false."),
        wholeWord: z
          .boolean()
          .optional()
          .describe("Match a phrase only as whole words. Default false."),
        watch: z
          .enum(["text", "thinking", "both"])
          .optional()
          .describe(
            "Which part of the output to read. 'text' for speech, 'thinking' for reasoning, " +
              "'both' for either."
          ),
        reply: z
          .string()
          .optional()
          .describe(
            "What to send back when the rule fires. Required for create."
          ),
        timing: z
          .enum(["turn", "message", "immediate"])
          .optional()
          .describe(
            "'turn' fires after the session stops (wakes it); 'message' fires after each " +
              "assistant message; 'immediate' fires mid-stream."
          ),
        repeat: z
          .boolean()
          .optional()
          .describe(
            "Fire again on every later match. Off fires once per session."
          ),
        scope: z
          .object({
            machineId: z.string().optional(),
            projectId: z.string().optional(),
            harness: z.string().optional(),
            model: z.string().optional(),
            role: z.enum(MEMORY_ROLES).optional(),
            delegateType: z.string().optional(),
          })
          .optional()
          .describe("Narrow the rule; every field given must match."),
      },
      async (args, on) => {
        const { action } = args;
        if (action === "list") {
          return on.rules.list();
        }
        if (action === "templates") {
          return { templates: on.rules.list().templates };
        }
        // The rule an id names: whole, or the handle the list shows.
        const ruleNamed = (asked: string | undefined) => {
          if (!asked) {
            throw new Error(`id is required to ${action} a rule`);
          }
          return listedNamed(asked, on.rules.list().rules, "rule");
        };
        if (action === "remove") {
          const { id } = ruleNamed(args.id);
          return await Promise.resolve(on.rules.remove(id));
        }

        // Only the fields the call names; a project by its whole id.
        const { action: _verb, id, scope, ...named } = args;
        const given = Object.fromEntries(
          Object.entries({
            ...named,
            scope: scope && {
              ...scope,
              projectId: projectIdOf(on, scope.projectId),
            },
          }).filter(([, value]) => value !== undefined)
        );

        if (action === "create") {
          return await Promise.resolve(
            on.rules.create({
              name: "",
              enabled: true,
              pattern: "",
              matchKind: "phrase",
              caseSensitive: false,
              wholeWord: false,
              watch: "text",
              reply: "",
              timing: "turn",
              repeat: false,
              scope: {},
              ...given,
            })
          );
        }
        // update: the route replaces the whole rule, so the given fields are
        // laid over the rule as it is stored; every other field stays.
        const {
          id: storedId,
          createdAt: _createdAt,
          stats: _stats,
          orphaned: _orphaned,
          ...current
        } = ruleNamed(id);
        return await Promise.resolve(
          on.rules.update(storedId, { ...current, ...given })
        );
      },
      ruleSettingsWords
    ),

    // ── hooks ────────────────────────────────────────────────────────────
    ...admin(
      "hooks",
      "the fleet's hooks: Claude Code hooks synced to every machine, or to one " +
        "project's sessions. A hook attaches a command, prompt or agent to a lifecycle event " +
        "(SessionStart, PreToolUse, PostToolUse, Stop, etc.) and runs unattended. " +
        "OpenCode runs command hooks on PreToolUse, PostToolUse and PostToolUseFailure, " +
        "pi on those and SessionStart, UserPromptSubmit and Stop, matched on Claude's tool " +
        "names; each machine's row says unsupported for the rest. " +
        "'list' answers the hooks and the templates.",
      ["list"],
      ["create", "update", "remove"],
      {
        id: z
          .string()
          .optional()
          .describe("The hook id. Required for update and remove."),
        name: z
          .string()
          .optional()
          .describe("What the hook is called. Required for create."),
        enabled: z
          .boolean()
          .optional()
          .describe("Whether the hook is active. Default true."),
        event: z
          .string()
          .optional()
          .describe(
            "The lifecycle event: SessionStart, PreToolUse, PostToolUse, Stop, " +
              "UserPromptSubmit, MessageDisplay, etc. Required for create."
          ),
        matcher: z
          .string()
          .optional()
          .describe("Filter which firings of the event this hook runs on."),
        handler: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "The handler configuration. A command hook: { type: 'command', command: string, " +
              "args?: string[], timeout?: number }. A prompt hook: { type: 'prompt', prompt: string }. " +
              "An agent hook: { type: 'agent', agent: string }. Required for create."
          ),
        script: z
          .string()
          .optional()
          .describe(
            "A command hook's script body. CawCo writes it to a file on every machine " +
              "and points the registration at that path. Optional for command hooks."
          ),
        projectId: z
          .string()
          .nullable()
          .optional()
          .describe(
            "One project's only: every session in its checkouts and workspaces runs it. null: every machine."
          ),
        areaId: areaIdParameter,
      },
      async (args, on) => {
        const { action } = args;
        if (action === "list") {
          return on.hooks.list();
        }
        // The hook an id names: whole, or the handle the list shows.
        const hookNamed = (asked: string | undefined): string => {
          if (!asked) {
            throw new Error(`id is required to ${action} a hook`);
          }
          return listedNamed(asked, on.hooks.list().hooks, "hook").id;
        };
        if (action === "remove") {
          return await Promise.resolve(on.hooks.remove(hookNamed(args.id)));
        }

        const id =
          action === "create" ? crypto.randomUUID() : hookNamed(args.id);

        // Only the fields given: the hub merges an update over the stored hook
        // and validates the result, so `update {id, enabled: false}` touches
        // nothing else. A create is validated the same way, from nothing.
        const { action: _action, id: _id, projectId, areaId, ...fields } = args;
        // A project's or an area's hook is bound by its scope as the hub
        // stores it; null for both makes it every machine's again.
        const bound = bindingAsked(on, { projectId, areaId });
        const given = {
          ...fields,
          ...bound,
          ...(projectId === undefined && areaId === undefined
            ? {}
            : { scope: bound.projectId || bound.areaId ? "project" : null }),
        };
        const body =
          action === "create"
            ? { ...given, enabled: given.enabled ?? true }
            : given;

        return await Promise.resolve(on.hooks.put(id, body));
      },
      hookSettingsWords,
      " 'create' adds one (the hub mints the id), 'update' edits by id, 'remove' deletes by id."
    ),

    // ── subagents ────────────────────────────────────────────────────────
    ...admin(
      "subagents",
      `the fleet's Claude Code subagents, the files in every machine's ${userLayerLabel("agents")}/. ` +
        "'list': names and descriptions; 'get': one file and its hash.",
      ["list", "get"],
      ["put", "remove"],
      {
        name: z
          .string()
          .optional()
          .describe("Its front matter's `name`. Required but for list."),
        content: z
          .string()
          .optional()
          .describe(
            "The whole file: front matter (name, description) over the prompt. Required for put."
          ),
        expectedHash: z
          .string()
          .optional()
          .describe(
            'Required: the hash get answered, "" for a new one. A moved file is refused with what it holds now.'
          ),
      },
      async ({ action, name, content, expectedHash }, on) => {
        const { agents } = await on.fleet();
        if (action === "list") {
          return { agents };
        }
        if (!name) {
          throw new Error(`name is required to ${action} a subagent`);
        }
        const kept = agents.find((agent) => agent.name === name);
        if (action === "get") {
          if (!kept) {
            throw new Error(
              `the fleet keeps no subagent ${name}; it keeps ${listedNames(agents)}`
            );
          }
          return kept;
        }
        if (expectedHash === undefined) {
          throw new Error(
            `expectedHash is required to ${action} a subagent: the hash get answered, or "" for a new one`
          );
        }
        // The handle a read shows stands for the stored hash it starts.
        const hash =
          expectedHash.length >= HASH_HANDLE &&
          kept?.hash.startsWith(expectedHash)
            ? kept.hash
            : expectedHash;
        if (action === "remove") {
          return agentRefused(on.agents.remove(name, hash));
        }
        if (content === undefined) {
          throw new Error("content is required to put a subagent");
        }
        return agentRefused(
          on.agents.put(name, { content, expectedHash: hash })
        );
      },
      subagentSettingsWords,
      " A removal leaves each machine's copy until its next sync.",
      ["name"]
    ),

    // ── Claude Code settings, OpenCode plugins, pi extensions ────────────
    ...admin(
      "claude_settings",
      "the fleet's Claude Code settings: each row a settings object merged into " +
        "the flag settings of CawCo's Claude Code sessions, every machine's or one " +
        "project's. Hooks go through admin_hooks_write, Claude plugins through " +
        "admin_plugins_write.",
      ["list"],
      ["put", "remove"],
      {
        name: z.string().optional().describe("Required for put and remove."),
        settings: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Required for a new row. Claude Code settings.json keys, e.g. " +
              '{ "env": { "FOO": "1" }, "permissions": { "deny": ["WebFetch"] } }. ' +
              "Refused: hooks, disableAllHooks. A key CawCo sets for its sessions wins."
          ),
        ...harnessConfigPlacement,
      },
      harnessConfigHandler("claudeSettings"),
      harnessConfigSettingsWords("claudeSettings"),
      " A new session takes it as it starts; a running one keeps what it started with."
    ),
    ...admin(
      "opencode_plugins",
      "the fleet's OpenCode plugins: each an OpenCode 2 plugin module or npm " +
        "package that CawCo's own plugin sets up in every location of CawCo's " +
        "OpenCode sessions, every machine's or one project's.",
      ["list"],
      ["put", "remove"],
      {
        name: z.string().optional().describe("Required for put and remove."),
        ...harnessConfigCode(
          "An ES module whose default export is { id, setup(ctx) }, as an OpenCode 2 plugin's."
        ),
        ...harnessConfigPlacement,
      },
      harnessConfigHandler("opencodePlugins"),
      harnessConfigSettingsWords("opencodePlugins"),
      " Each machine writes the module, or installs the package with npm; a location booted after that sets it up."
    ),
    ...admin(
      "pi_extensions",
      "the fleet's pi extensions: each a pi extension module or npm package " +
        "that CawCo's pi sessions load, every machine's or one project's.",
      ["list"],
      ["put", "remove"],
      {
        name: z.string().optional().describe("Required for put and remove."),
        ...harnessConfigCode(
          "An ES module whose default export is a function taking pi's ExtensionAPI, as a pi extension's."
        ),
        ...harnessConfigPlacement,
      },
      harnessConfigHandler("piExtensions"),
      harnessConfigSettingsWords("piExtensions"),
      " Each machine writes the module, or installs the package with npm; a new session loads it."
    ),

    // ── memory (fleet CLAUDE.md) ─────────────────────────────────────────
    ...admin(
      "memory",
      "the fleet's CLAUDE.md, loaded into every session, and its documents: " +
        `unscoped, linked under ${userLayerLabel("memories")}/; scoped, loaded into the ` +
        "sessions matching every `scope` field (role: orchestrator has delegate, else leaf; " +
        "model: substring). `briefer`: handed to the delegate's caller instead. " +
        "'get': CLAUDE.md; 'list_docs': the documents.",
      ["get", "list_docs"],
      ["set", "set_doc", "remove_doc"],
      {
        content: z
          .string()
          .optional()
          .describe(
            "The markdown content to write. Required for 'set' and 'set_doc'."
          ),
        path: z
          .string()
          .optional()
          .describe(
            "The document path (e.g. 'models/claude-opus-5.md'). Required for 'set_doc' " +
              "and 'remove_doc'."
          ),
        scope: z
          .object({
            role: z.enum(MEMORY_ROLES).optional(),
            delegateTypes: z.array(z.string()).min(1).optional(),
            model: z.string().min(1).optional(),
            projectIds: z.array(z.string()).min(1).optional(),
            areaIds: z
              .array(z.string())
              .min(1)
              .optional()
              .describe(
                "Areas, by id or name: every project in each, as read when a session launches."
              ),
            briefer: z.literal(true).optional(),
          })
          .optional()
          .describe(
            "set_doc: {} unscopes; omitted keeps it. list_docs: a filter."
          ),
        expectedHash: z
          .string()
          .optional()
          .describe(
            "Optimistic concurrency: the hash of the content you read, whole or as the handle the read gave. If the server's copy " +
              "has moved, the write is refused and the current version is returned."
          ),
      },
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches all five memory actions (get, set, list_docs, set_doc, remove_doc) with their validation in one handler; splitting would scatter the action enum's contract across several functions.
      async ({ action, content, path, scope, expectedHash }, on) => {
        if (action === "get") {
          // CLAUDE.md with its linked documents, as a machine is sent it
          // (FleetMemory): the hub's read keeps the two apart.
          const fleet = await on.fleet();
          return {
            memory: fleet.memory
              ? { ...fleet.memory, docs: fleet.memoryDocs }
              : null,
          };
        }
        if (action === "list_docs") {
          const { memoryDocs } = await on.fleet();
          const filter = scopeWithProjects(on, scope);
          return {
            docs: filter
              ? memoryDocs.filter((doc) => scopeHas(doc.scope, filter))
              : memoryDocs,
          };
        }
        if (action === "set") {
          if (content === undefined) {
            throw new Error("content is required to set fleet memory");
          }
          const saved = on.memory.set({
            content,
            ...(expectedHash
              ? { expectedHash: await wholeHash(on, expectedHash, undefined) }
              : {}),
          });
          return saved instanceof ElysiaStatus
            ? saved
            : keptMemory(saved, content);
        }
        if (action === "set_doc") {
          if (!(path && content !== undefined)) {
            throw new Error(
              "path and content are required to set a memory document"
            );
          }
          const saved = on.memory.setDoc({
            path,
            content,
            ...(scope ? { scope: scopeWithProjects(on, scope) } : {}),
            ...(expectedHash
              ? { expectedHash: await wholeHash(on, expectedHash, path) }
              : {}),
          });
          return saved instanceof ElysiaStatus
            ? saved
            : { path, ...keptMemory(saved, content) };
        }
        // remove_doc
        if (!path) {
          throw new Error("path is required to remove a memory document");
        }
        return await Promise.resolve(on.memory.removeDoc(path));
      },
      memorySettingsWords,
      "",
      ["scope"]
    ),

    // ── previews ─────────────────────────────────────────────────────────
    ...admin(
      "previews",
      "how every session's previews are reached, fleet-wide: 'port' (the default, " +
        "no setup) gives each session a port of the hub's preview range on the hub's " +
        "host; 'host' adds an origin per session from `pattern`, routed to the range's " +
        "first port, for clients under its domain. Host-mode names need " +
        "the hub's own pass, no sign-in. " +
        "'get' answers the mode, the pattern and the range.",
      ["get"],
      ["set"],
      {
        mode: z
          .enum(["port", "host"])
          .optional()
          .describe("Required for 'set'."),
        pattern: z
          .string()
          .optional()
          .describe(
            "Required for 'host': a scheme and host name with {session} (its id) or {port} " +
              "(its kept preview port), e.g. 'https://p-{port}.example.com'. Refused unless " +
              "its first name resolves."
          ),
      },
      async ({ action, mode, pattern }, on) => {
        if (action === "get") {
          return on.previews.get();
        }
        if (!mode) {
          throw new Error("mode is required to set how previews are reached");
        }
        return await on.previews.set(fieldsGiven({ mode, pattern }));
      },
      previewSettingsWords,
      " It changes how every preview on the fleet is reached, so the person approves it first."
    ),
  ];
}
