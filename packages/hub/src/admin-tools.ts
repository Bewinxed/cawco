/**
 * Fleet administration tools: agents manage cawco's settings (delegate types,
 * skills, plugins, MCP servers, rules, hooks, memory) through the same MCP server
 * the handoff tools ride.
 *
 * Every write goes through the hub's own REST API so it shares the same
 * validation, fan-out and persistence the dashboard uses. The tools are
 * read/write over fleet config — not session-scoped, not delegation-scoped.
 */
import { z } from "zod";
import { hubHttpUrl } from "./delegation-actions";

/** API timeout for admin calls — generous for skill installs that fetch from GitHub. */
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
  const response = await fetch(url, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `${method} ${path} → ${response.status}: ${text.slice(0, 500)}`
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("json") ? response.json() : response.text();
};

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
  if (!name) {
    throw new Error("name is required to link or unlink a marketplace");
  }
  const path = `/api/fleet/marketplaces/${encodeURIComponent(name)}`;
  if (action === "unlink") {
    return await api("DELETE", path);
  }
  if (!source) {
    throw new Error("source is required to link a marketplace");
  }
  return await api("PUT", path, { source });
};

const ADMIN_WRITE_TOOL = /^admin_[a-z_]+_write$/;

/** Whether a tool is an admin write: the hub asks the person before each call runs (admin-asks.ts). */
export const isAdminWrite = (name: string): boolean =>
  ADMIN_WRITE_TOOL.test(name);

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
  writeNote = ""
) {
  const read = tool(
    `admin_${group}_read`,
    `Read ${about} \`action\`: ${reads.map((action) => `'${action}'`).join(", ")}.`,
    { action: z.enum(reads) },
    // A read names only its action; every other field is the write's.
    (args) =>
      handler(args as { action: string } & Partial<z.infer<z.ZodObject<T>>>)
  );
  const write = tool(
    `admin_${group}_write`,
    `Change ${about} \`action\`: ${writes.map((action) => `'${action}'`).join(", ")}.${writeNote} The call waits while the person approves it, then runs once with these arguments; a refusal comes back with their reason. Read with admin_${group}_read first.`,
    { action: z.enum(writes), ...input },
    (args) =>
      handler(args as { action: string } & Partial<z.infer<z.ZodObject<T>>>)
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
            ...(effort ? { effort } : {}),
            ...(skills?.length ? { skills } : {}),
            ...(denyTools?.length ? { denyTools } : {}),
            ...(canDelegate === undefined ? {} : { canDelegate }),
          })
        );
      }
    ),

    // ── skills ───────────────────────────────────────────────────────────
    ...admin(
      "skills",
      "the fleet's skills: the slash-command skill directories synced to every " +
        "machine under ~/.claude/skills/.",
      ["list"],
      ["install", "enable", "disable", "remove"],
      {
        name: z
          .string()
          .optional()
          .describe(
            "The skill name (its directory name under ~/.claude/skills/). Required for all " +
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
      },
      async ({ action, name, source }) => {
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
          return ok(
            await api("PUT", `/api/fleet/skills/${encodeURIComponent(name)}`, {
              enabled: action === "enable",
            })
          );
        }
        // install
        if (!source) {
          throw new Error("source is required to install a skill");
        }
        return ok(
          await api("PUT", `/api/fleet/skills/${encodeURIComponent(name)}`, {
            source,
            enabled: true,
          })
        );
      },
      " Install fetches the source (github:owner/repo, npm:package, a URL, or skills:slug) once at the hub and distributes the files to every machine."
    ),

    // ── plugins ──────────────────────────────────────────────────────────
    ...admin(
      "plugins",
      "the fleet's Claude Code plugins: whole marketplace bundles synced to " +
        "every machine under ~/.claude/plugins/. A plugin is the unit to reach for when " +
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
            "The marketplace's name in this fleet — the half after the `@` in a plugin " +
              "id. Required for link and unlink."
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
        if (action === "refresh") {
          return ok(await api("POST", `${path}/refresh`));
        }
        // install is enable on a row that did not exist yet: the route stores the
        // id either way and resolves its bytes before the fan-out, so the two
        // differ only in what the caller already believes about the plugin.
        return ok(await api("PUT", path, { enabled: action !== "disable" }));
      },
      " Order matters: 'link' the marketplace first, then 'install' a plugin from it by its `plugin@marketplace` id; 'refresh' re-fetches one whose upstream moved. The hub resolves the bytes once and distributes them."
    ),

    // ── MCP servers ──────────────────────────────────────────────────────
    ...admin(
      "mcp_servers",
      "the fleet's MCP servers: the servers synced to every machine's ~/.claude.json.",
      ["list"],
      ["put", "remove"],
      {
        name: z
          .string()
          .optional()
          .describe(
            "The MCP server name (as it appears in ~/.claude.json). Required for put and remove."
          ),
        config: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "The server configuration object. Required for put. A stdio server needs " +
              "{ command: string, args?: string[] }. A remote server needs " +
              '{ type: "http"|"sse", url: string }.'
          ),
        enabled: z
          .boolean()
          .optional()
          .describe("Whether the server is enabled. Defaults to true for put."),
      },
      async ({ action, name, config, enabled }) => {
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
          })
        );
      },
      " A stdio server needs a 'command' in its config; a remote server needs 'type' and 'url'."
    ),

    // ── rules ────────────────────────────────────────────────────────────
    ...admin(
      "rules",
      "the fleet's rules: standing instructions the hub enforces on every session's " +
        "output stream. A rule watches for a phrase or regex in what sessions say (or think) " +
        "and replies with a fixed message or an LLM evaluation. 'list' answers them with " +
        "stats, 'templates' starter recipes.",
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
              "question Jev answers about the output (needs OpenRouter connected in Settings; " +
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
            "What to send back when the rule fires. Required for create when action is 'reply'."
          ),
        timing: z
          .enum(["turn", "message", "immediate"])
          .optional()
          .describe(
            "'turn' fires after the session stops (wakes it); 'message' fires after each " +
              "assistant message; 'immediate' fires mid-stream."
          ),
        interrupt: z
          .boolean()
          .optional()
          .describe("For immediate: cut into the running turn."),
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
          })
          .optional()
          .describe(
            "Narrow the rule to specific machines, projects, harnesses or models."
          ),
        trigger: z
          .enum(["pattern", "every-turn"])
          .optional()
          .describe("What starts evaluation. Default 'pattern'."),
        ruleAction: z
          .enum(["reply", "llm"])
          .optional()
          .describe(
            "What a firing does. 'reply' sends the reply verbatim; 'llm' hands the turn to " +
              "the supervisor. Default 'reply'. Named ruleAction to avoid collision with action."
          ),
        prompt: z
          .string()
          .optional()
          .describe(
            "For action 'llm': the supervisor's standing instructions."
          ),
      },
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches all five rule actions (list, templates, create, update, remove) with their validation in one handler; splitting would scatter the action enum's contract across several functions.
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

        // Build the rule draft from the args
        const draft = {
          name: args.name ?? "",
          enabled: args.enabled ?? true,
          pattern: args.pattern ?? "",
          matchKind: args.matchKind ?? "phrase",
          caseSensitive: args.caseSensitive ?? false,
          wholeWord: args.wholeWord ?? false,
          watch: args.watch ?? "text",
          reply: args.reply ?? "",
          timing: args.timing ?? "turn",
          interrupt: args.interrupt ?? false,
          repeat: args.repeat ?? false,
          scope: args.scope ?? {},
          trigger: args.trigger ?? "pattern",
          action: args.ruleAction ?? "reply",
          prompt: args.prompt ?? null,
        };

        if (action === "create") {
          return ok(await api("POST", "/api/rules", draft));
        }
        // update
        if (!args.id) {
          throw new Error("id is required to update a rule");
        }
        return ok(
          await api("PUT", `/api/rules/${encodeURIComponent(args.id)}`, draft)
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
      "the fleet's user-scope CLAUDE.md, the instructions every session loads, and " +
        "its linked documents under ~/.claude/memories/ (e.g. model-specific guidance " +
        "files). 'get' answers the CLAUDE.md, 'list_docs' the documents.",
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
            "The document path under ~/.claude/memories/ (e.g. 'models/claude-opus-5.md'). " +
              "Required for 'set_doc' and 'remove_doc'."
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
      async ({ action, content, path, expectedHash }) => {
        if (action === "get") {
          const fleet = (await api("GET", "/api/fleet")) as {
            memory?: unknown;
          };
          return ok({ memory: fleet.memory ?? null });
        }
        if (action === "list_docs") {
          const fleet = (await api("GET", "/api/fleet")) as {
            memoryDocs?: unknown[];
          };
          return ok({ docs: fleet.memoryDocs ?? [] });
        }
        if (action === "set") {
          if (content === undefined) {
            throw new Error("content is required to set fleet memory");
          }
          return ok(
            await api("PUT", "/api/fleet/memory", {
              content,
              ...(expectedHash ? { expectedHash } : {}),
            })
          );
        }
        if (action === "set_doc") {
          if (!(path && content !== undefined)) {
            throw new Error(
              "path and content are required to set a memory document"
            );
          }
          return ok(
            await api("PUT", "/api/fleet/memory/docs", {
              path,
              content,
              ...(expectedHash ? { expectedHash } : {}),
            })
          );
        }
        // remove_doc
        if (!path) {
          throw new Error("path is required to remove a memory document");
        }
        return ok(await api("DELETE", "/api/fleet/memory/docs", { path }));
      }
    ),
  ];
}
