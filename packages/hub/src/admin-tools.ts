/**
 * Fleet administration tools: agents manage cawco's settings (delegate types,
 * skills, plugins, MCP servers, rules, hooks, memory) through the same MCP server
 * the handoff tools ride.
 *
 * Every write goes through the hub's own REST API so it shares the same
 * validation, fan-out and persistence the dashboard uses. The tools are
 * read/write over fleet config — not session-scoped, not delegation-scoped.
 */
import {
  type FleetPlugin,
  type FleetSkillMeta,
  type MarketplaceLink,
  MCP_PLATFORMS,
  MEMORY_ROLES,
  type MemoryScope,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { CLAUDE_JSON_LABEL, userLayerLabel } from "@cawco/core/claude-dirs";
import { z } from "zod";
import { landedFetch } from "./fleet-fetches";
import { hubHttpUrl, selfFetch } from "./hub-self";

/**
 * API timeout for one admin call. A fetch from GitHub is not waited on in
 * the request: its route answers at once and the tool waits on the hub's own
 * announcement of the outcome (fleet-fetches.ts).
 */
const TIMEOUT_MS = 30_000;

/** One MCP tool: its zod input as JSON Schema, and a handler that parses its input first. */
export function tool<T extends z.ZodRawShape>(
  name: string,
  description: string,
  input: T,
  handler: (args: z.infer<z.ZodObject<T>>) => Promise<unknown>
) {
  const schema = z.object(input);
  return {
    name,
    description,
    inputSchema: z.toJSONSchema(schema, { target: "draft-07", io: "input" }),
    handler: (args: unknown) => handler(schema.parse(args)),
  };
}

/** JSON helper — calls a hub route and returns the parsed response, or throws a sentence. */
const api = async (
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> => {
  const url = `${hubHttpUrl()}${path}`;
  const asked = await readWithin(TIMEOUT_MS, async (signal) => {
    // The hub calling its own route, as itself (hub-self.ts).
    const response = await selfFetch(url, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
      signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `${method} ${path} → ${response.status}: ${text.slice(0, 500)}`
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    return (await (contentType.includes("json")
      ? response.json()
      : response.text())) as unknown;
  });
  switch (asked.kind) {
    case "answered":
      return asked.value;
    case "unanswered":
      throw new Error(
        `${method} ${path}: the hub did not answer within ${Math.round(asked.after / 1000)} s`
      );
    default: {
      const unhandled: never = asked;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

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

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
  structuredContent: data,
});

/**
 * The marketplace half of `manage_plugins`. A link is a different resource from
 * the plugins it carries — its own route, its own key — and keeping it here is
 * what lets the tool's own handler stay about plugins.
 */
const marketplaceAction = async (
  action: "link" | "unlink",
  name: string | undefined,
  source: string | undefined
): Promise<unknown> => {
  if (action === "unlink") {
    if (!name) {
      throw new Error("name is required to unlink a marketplace");
    }
    return await api(
      "DELETE",
      `/api/fleet/marketplaces/${encodeURIComponent(name)}`
    );
  }
  if (!source) {
    throw new Error("source is required to link a marketplace");
  }
  // Linked under the name its own marketplace.json gives; the row says it.
  // The route answers before the source is read; the link lands after.
  const wanted = source.trim();
  const link = await landedFetch<MarketplaceLink>(
    (news) => (news.link?.source === wanted ? news.link : undefined),
    async () =>
      (await api("POST", "/api/fleet/marketplace-links", {
        source: wanted,
      })) as MarketplaceLink
  );
  if (!link.marketplace) {
    throw new Error(`could not link ${wanted}: ${link.error}`);
  }
  return link.marketplace;
};

/** Every write's reason, which the person reads first on the approval (admin-asks.ts `askRefusal`). */
const reason = z
  .string()
  .max(300)
  .optional()
  .describe("Required: one sentence on why, for which task.");

/** What a memory write answers: the hash to write against next, when it landed, and the size kept; never the text back. */
const keptMemory = (
  saved: unknown,
  content: string
): { bytes: number; hash: string; lines: number; updatedAt: string } => {
  const row = saved as { hash: string; updatedAt: string };
  return {
    hash: row.hash,
    updatedAt: row.updatedAt,
    lines: content === "" ? 0 : content.split("\n").length,
    bytes: Buffer.byteLength(content),
  };
};

const ADMIN_WRITE_TOOL = /^admin_[a-z_]+_write$/;

/** Whether a tool is an admin write: the hub asks the person before each call runs (admin-asks.ts). */
export const isAdminWrite = (name: string): boolean =>
  ADMIN_WRITE_TOOL.test(name);

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
 * handler serves both, through the hub's own REST routes; a write runs only
 * once the person approves it (admin-asks.ts).
 */
function admin<T extends z.ZodRawShape>(
  group: string,
  about: string,
  reads: readonly [string, ...string[]],
  writes: readonly [string, ...string[]],
  input: T,
  handler: (
    args: { action: string } & Partial<z.infer<z.ZodObject<T>>>
  ) => Promise<unknown>,
  writeNote = "",
  /** The fields of `input` a read takes too, by name; none by default. */
  readFields: readonly (keyof T & string)[] = []
) {
  const read = tool(
    `admin_${group}_read`,
    `Read ${about} \`action\`: ${reads.map((action) => `'${action}'`).join(", ")}.`,
    {
      action: z.enum(reads),
      ...Object.fromEntries(readFields.map((name) => [name, input[name]])),
    },
    // A read names its action and the fields it was given; every other field is the write's.
    (args) =>
      handler(args as { action: string } & Partial<z.infer<z.ZodObject<T>>>)
  );
  const write = tool(
    `admin_${group}_write`,
    `Change ${about} \`action\`: ${writes.map((action) => `'${action}'`).join(", ")}.${writeNote} The call waits while the person approves it, then runs once with these arguments; a refusal comes back with their reason. Read with admin_${group}_read first.`,
    { action: z.enum(writes), reason, ...input },
    // The reason is the person's to read on the approval, not a setting.
    (args) => {
      const { reason: _reason, ...setting } = args as Record<string, unknown>;
      return handler(
        setting as { action: string } & Partial<z.infer<z.ZodObject<T>>>
      );
    }
  );
  return [read, write];
}

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
          .enum(["claude", "opencode", "pi"])
          .optional()
          .describe(
            "Which runtime runs delegates of this type. Required for put."
          ),
        model: z
          .string()
          .optional()
          .describe("Model id for the harness. Required for put."),
        effort: z
          .enum(["low", "medium", "high", "xhigh", "max"])
          .optional()
          .describe("Reasoning effort. Optional for put."),
        skills: z
          .array(z.string())
          .optional()
          .describe(
            "Skill names loaded into delegates of this type. Optional for put."
          ),
        denyTools: z
          .array(z.string())
          .optional()
          .describe(
            "Tool names denied to delegates of this type. Optional for put."
          ),
        canDelegate: z
          .boolean()
          .optional()
          .describe(
            "Whether delegates of this type may themselves delegate. Default false."
          ),
        cawcoTodos: z
          .boolean()
          .optional()
          .describe(
            "True: its sessions use CawCo's to-dos and spec, never their harness's own list or plan mode."
          ),
        connections: z
          .array(z.string())
          .optional()
          .describe(
            "Connections its sessions may call (admin_connections_read)."
          ),
      },
      async ({
        action,
        name,
        description,
        harness,
        model,
        effort,
        skills,
        denyTools,
        canDelegate,
        cawcoTodos,
        connections,
      }) => {
        if (action === "list") {
          return ok(await api("GET", "/api/delegate-types"));
        }
        if (!name) {
          throw new Error("name is required for put and delete");
        }
        if (action === "delete") {
          return ok(
            await api(
              "DELETE",
              `/api/delegate-types/${encodeURIComponent(name)}`
            )
          );
        }
        // put
        if (!(description && harness && model)) {
          throw new Error(
            "description, harness, and model are required to create or update a delegate type"
          );
        }
        return ok(
          await api("PUT", `/api/delegate-types/${encodeURIComponent(name)}`, {
            description,
            harness,
            model,
            ...fieldsGiven({
              effort,
              skills,
              denyTools,
              canDelegate,
              cawcoTodos: cawcoTodos || undefined,
              connections,
            }),
          })
        );
      }
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
        auth: z.enum(["none", "bearer", "header", "oauth"]).optional(),
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
      async (args) => {
        const { action, name } = args;
        if (action === "list") {
          return ok(await api("GET", "/api/connections"));
        }
        if (!name) {
          throw new Error("name is required for every connection write");
        }
        const path = `/api/connections/${encodeURIComponent(name)}`;
        if (action === "remove") {
          return ok(await api("DELETE", path));
        }
        if (action === "sign_in") {
          return ok(
            await api(
              "POST",
              `${path}/sign-in`,
              fieldsGiven({ origin: args.origin })
            )
          );
        }
        const {
          action: _action,
          name: _name,
          origin: _origin,
          ...fields
        } = args;
        if (action === "create") {
          return ok(
            await api("POST", "/api/connections", {
              name,
              ...fieldsGiven(fields),
            })
          );
        }
        return ok(await api("PATCH", path, fieldsGiven(fields)));
      },
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
              "'skills:owner/repo@skill-name'."
          ),
        projectId: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Install for one project only: it lands in every checkout and workspace of it. null: every machine."
          ),
      },
      async ({ action, name, source, projectId }) => {
        if (action === "list") {
          const fleet = (await api("GET", "/api/fleet")) as {
            skills?: unknown[];
          };
          return ok({ skills: fleet.skills ?? [] });
        }
        if (!name) {
          throw new Error("name is required");
        }
        if (action === "remove") {
          return ok(
            await api("DELETE", `/api/fleet/skills/${encodeURIComponent(name)}`)
          );
        }
        if (action === "enable" || action === "disable") {
          // The stored skill's flag; nothing is fetched.
          return ok(
            await api(
              "PATCH",
              `/api/fleet/skills/${encodeURIComponent(name)}`,
              { enabled: action === "enable" }
            )
          );
        }
        // install
        if (!source) {
          throw new Error("source is required to install a skill");
        }
        // The route answers before the source is fetched; the row as the
        // fetch landed it (files, the sentence it failed with, or `choices`).
        return ok(
          await landedFetch<FleetSkillMeta>(
            (news) => (news.skill?.name === name ? news.skill : undefined),
            async () =>
              (await api(
                "PUT",
                `/api/fleet/skills/${encodeURIComponent(name)}`,
                {
                  source,
                  enabled: true,
                  ...(projectId === undefined ? {} : { projectId }),
                }
              )) as FleetSkillMeta
          )
        );
      },
      " Install fetches the source (github:owner/repo, npm:package, a URL, or skills:slug) once at the hub and distributes the files to every machine."
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
      async ({ action, id, name, source }) => {
        if (action === "list") {
          const fleet = (await api("GET", "/api/fleet")) as {
            config?: { marketplaces?: unknown[]; plugins?: unknown[] };
          };
          return ok({
            marketplaces: fleet.config?.marketplaces ?? [],
            plugins: fleet.config?.plugins ?? [],
          });
        }

        if (action === "link" || action === "unlink") {
          return ok(await marketplaceAction(action, name, source));
        }

        if (!id) {
          throw new Error("id is required");
        }
        const path = `/api/fleet/plugins/${encodeURIComponent(id)}`;
        if (action === "remove") {
          return ok(await api("DELETE", path));
        }
        if (action === "enable" || action === "disable") {
          // The stored plugin's flag; nothing is fetched.
          return ok(await api("PATCH", path, { enabled: action === "enable" }));
        }
        // Install and refresh answer before the bytes are fetched; the row as
        // the fetch landed it.
        const landed = (ask: () => Promise<unknown>) =>
          landedFetch<FleetPlugin>(
            (news) => (news.plugin?.id === id ? news.plugin : undefined),
            async () => (await ask()) as FleetPlugin
          );
        if (action === "refresh") {
          return ok(await landed(() => api("POST", `${path}/refresh`)));
        }
        return ok(await landed(() => api("PUT", path, { enabled: true })));
      },
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
              '{ type: "http"|"sse", url }.'
          ),
        enabled: z
          .boolean()
          .optional()
          .describe("Whether the server is enabled. Defaults to true for put."),
        projectId: z
          .string()
          .nullable()
          .optional()
          .describe(
            "For one project only: placed in every checkout and workspace of it. null: every machine."
          ),
        platforms: z
          .array(z.enum(MCP_PLATFORMS))
          .nullable()
          .optional()
          .describe("Only machines of these platforms get it. null: all."),
      },
      async ({ action, name, config, enabled, projectId, platforms }) => {
        if (action === "list") {
          const fleet = (await api("GET", "/api/fleet")) as {
            config?: { mcp?: unknown[] };
          };
          return ok({ mcp: fleet.config?.mcp ?? [] });
        }
        if (!name) {
          throw new Error("name is required for put and remove");
        }
        if (action === "remove") {
          return ok(
            await api("DELETE", `/api/fleet/mcp/${encodeURIComponent(name)}`)
          );
        }
        // put
        if (!config) {
          throw new Error("config is required to add or update an MCP server");
        }
        return ok(
          await api("PUT", `/api/fleet/mcp/${encodeURIComponent(name)}`, {
            config,
            ...(enabled === undefined ? {} : { enabled }),
            ...(projectId === undefined ? {} : { projectId }),
            ...(platforms === undefined ? {} : { platforms }),
          })
        );
      },
      " A change reaches sessions already running within seconds: a server put, enabled or signed in" +
        " connects in them, and one removed, disabled or signed out leaves them. No new session is needed."
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
              "question Jev answers about the output (needs Jev on: a TypeSafe key or OpenRouter set in Settings; " +
              "timing 'turn' or 'message' only)."
          ),
        caseSensitive: z.boolean().optional(),
        wholeWord: z.boolean().optional(),
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
      async (args) => {
        const { action } = args;
        if (action === "list") {
          return ok(await api("GET", "/api/rules"));
        }
        if (action === "templates") {
          const data = (await api("GET", "/api/rules")) as {
            templates?: unknown;
          };
          return ok({ templates: data.templates ?? [] });
        }
        if (action === "remove") {
          if (!args.id) {
            throw new Error("id is required to remove a rule");
          }
          return ok(
            await api("DELETE", `/api/rules/${encodeURIComponent(args.id)}`)
          );
        }

        // Only the fields the call names.
        const { action: _verb, id, ...named } = args;
        const given = Object.fromEntries(
          Object.entries(named).filter(([, value]) => value !== undefined)
        );

        if (action === "create") {
          return ok(
            await api("POST", "/api/rules", {
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
        if (!id) {
          throw new Error("id is required to update a rule");
        }
        const { rules } = (await api("GET", "/api/rules")) as {
          rules: (Record<string, unknown> & { id: string })[];
        };
        const stored = rules.find((rule) => rule.id === id);
        if (!stored) {
          throw new Error(`there is no rule ${id} to update`);
        }
        const {
          id: _id,
          createdAt: _createdAt,
          stats: _stats,
          orphaned: _orphaned,
          ...current
        } = stored;
        return ok(
          await api("PUT", `/api/rules/${encodeURIComponent(id)}`, {
            ...current,
            ...given,
          })
        );
      }
    ),

    // ── hooks ────────────────────────────────────────────────────────────
    ...admin(
      "hooks",
      "the fleet's hooks: Claude Code settings.json hooks synced to every " +
        "machine. A hook attaches a command, prompt or agent to a lifecycle event " +
        "(SessionStart, PreToolUse, PostToolUse, Stop, etc.) and runs unattended. " +
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
      },
      async (args) => {
        const { action } = args;
        if (action === "list") {
          return ok(await api("GET", "/api/fleet/hooks"));
        }
        if (action === "remove") {
          if (!args.id) {
            throw new Error("id is required to remove a hook");
          }
          return ok(
            await api(
              "DELETE",
              `/api/fleet/hooks/${encodeURIComponent(args.id)}`
            )
          );
        }

        const id = action === "create" ? crypto.randomUUID() : args.id;
        if (!id) {
          throw new Error("id is required to update a hook");
        }

        // Only the fields given: the hub merges an update over the stored hook
        // and validates the result, so `update {id, enabled: false}` touches
        // nothing else. A create is validated the same way, from nothing.
        const { action: _action, id: _id, ...given } = args;
        const body =
          action === "create"
            ? { ...given, enabled: given.enabled ?? true }
            : given;

        return ok(
          await api("PUT", `/api/fleet/hooks/${encodeURIComponent(id)}`, body)
        );
      },
      " 'create' adds one (the hub mints the id), 'update' edits by id, 'remove' deletes by id."
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
            "Optimistic concurrency: the hash of the content you read. If the server's copy " +
              "has moved, the write is refused and the current version is returned."
          ),
      },
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches all five memory actions (get, set, list_docs, set_doc, remove_doc) with their validation in one handler; splitting would scatter the action enum's contract across several functions.
      async ({ action, content, path, scope, expectedHash }) => {
        if (action === "get") {
          const fleet = (await api("GET", "/api/fleet")) as {
            memory?: unknown;
          };
          return ok({ memory: fleet.memory ?? null });
        }
        if (action === "list_docs") {
          const fleet = (await api("GET", "/api/fleet")) as {
            memoryDocs?: { scope?: MemoryScope }[];
          };
          const docs = fleet.memoryDocs ?? [];
          const sameList = (a?: string[], b?: string[]) =>
            [...(a ?? [])].sort().join() === [...(b ?? [])].sort().join();
          return ok({
            docs: scope
              ? docs.filter(
                  (doc) =>
                    doc.scope?.role === scope.role &&
                    doc.scope?.model === scope.model &&
                    doc.scope?.briefer === scope.briefer &&
                    sameList(doc.scope?.delegateTypes, scope.delegateTypes) &&
                    sameList(doc.scope?.projectIds, scope.projectIds)
                )
              : docs,
          });
        }
        if (action === "set") {
          if (content === undefined) {
            throw new Error("content is required to set fleet memory");
          }
          return ok(
            keptMemory(
              await api("PUT", "/api/fleet/memory", {
                content,
                ...(expectedHash ? { expectedHash } : {}),
              }),
              content
            )
          );
        }
        if (action === "set_doc") {
          if (!(path && content !== undefined)) {
            throw new Error(
              "path and content are required to set a memory document"
            );
          }
          return ok({
            path,
            ...keptMemory(
              await api("PUT", "/api/fleet/memory/docs", {
                path,
                content,
                ...(scope ? { scope } : {}),
                ...(expectedHash ? { expectedHash } : {}),
              }),
              content
            ),
          });
        }
        // remove_doc
        if (!path) {
          throw new Error("path is required to remove a memory document");
        }
        return ok(await api("DELETE", "/api/fleet/memory/docs", { path }));
      },
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
      async ({ action, mode, pattern }) => {
        if (action === "get") {
          return ok(await api("GET", "/api/preview-settings"));
        }
        if (!mode) {
          throw new Error("mode is required to set how previews are reached");
        }
        return ok(
          await api(
            "PUT",
            "/api/preview-settings",
            fieldsGiven({ mode, pattern })
          )
        );
      },
      " It changes how every preview on the fleet is reached, so the person approves it first."
    ),
  ];
}
