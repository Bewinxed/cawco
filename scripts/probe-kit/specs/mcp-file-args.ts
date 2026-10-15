/**
 * A workspace's boundary judges only the arguments of an MCP tool that name
 * files on the machine. CawCo's own tools name theirs in one table
 * (`CAWCO_FILE_ARGS`, core workspace-judge.ts); any other server's tool is
 * judged by its arguments' names, as before.
 *
 * 1. The table against the schemas: a scratch fleet's hub answers its whole
 *    catalogue (`tools/list` on `/mcp/cawco` with no credential, OpenCode's
 *    shared discovery). Each argument the table names is a property of its
 *    tool; every property named like a path or URL, at any depth, is in the
 *    table or in {@link NOT_FILES} here with what it names. A new cawco
 *    argument named like a path fails here until it is classified.
 * 2. The judge, as the Claude hook and OpenCode's plugin call it, against a
 *    policy whose clone and scratch dir lie in a home it does not read: a
 *    preview's `artifact_create` with a URL `path` (the live refusal of
 *    workspace 7c34546f) passes; `dir` outside the workspace is refused, and
 *    inside it passes; `artifact_update`'s JSON Pointer passes; each other
 *    file argument outside the workspace is refused; another server's
 *    `filePath` outside is refused.
 * 3. Control: the judge as it stood before the cawco table (fdd325e91)
 *    refuses the live call, so the probe catches what the fix ends.
 *
 *   bun scripts/probe-kit/run.ts mcp-file-args
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CAWCO_FILE_ARGS,
  type Call,
  judgeCall,
  type Policy,
  resolveReal,
  type Verdict,
} from "../../../packages/core/src/workspace-judge";
import type { Kit, Spec } from "../kit";

/**
 * The cawco arguments named like a path or URL that name no file on the
 * machine, each with what it names. Keyed by tool, then argument (a nested
 * one by its own name).
 */
const NOT_FILES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  artifact_create: { path: "a preview's start page, a URL path" },
  artifact_update: { path: "patch[].path, a JSON Pointer into its state" },
  workflow_read: { path: "a path into the run's result" },
  run_workflow: {
    path: "workspace.path, where on its machine the workflow's steps run",
  },
  task_create: { outputs: "files the task's work makes in its workspace" },
  task_update: { outputs: "files the task's work makes in its workspace" },
  connector_poll_create: {
    items_path: "a dot path into the connector's answer",
    id_path: "a dot path into the connector's answer",
    version_path: "a dot path into the connector's answer",
  },
  connector_poll_update: {
    items_path: "a dot path into the connector's answer",
    id_path: "a dot path into the connector's answer",
    version_path: "a dot path into the connector's answer",
  },
  relay_create: { id_path: "a dot path into a webhook's event" },
  memory_read: { path: "a file of the project's memory on the hub" },
  folder_read: { path: "a file or folder in the project's folder on the hub" },
  folder_write: { path: "a file in the project's folder on the hub" },
  memory_propose: { path: "AGENTS.md or knowledge/<topic>.md on the hub" },
  admin_memory_write: { path: "a document under the fleet's memories" },
  admin_connections_write: { url: "a remote MCP server's address" },
  delegate: {
    outputs: "files in the delegate's own workspace",
    cwd: "the directory the delegate's workspace is cloned from",
  },
  start_session: { cwd: "the directory a new session starts in" },
};

/** A property named like a path or URL: the old name rule's, with the names it missed. */
const PATH_LIKE =
  /(path|file|dir|directory|filename|url|urls|uri|images|attachments|outputs|cwd)$/i;

interface Listed {
  inputSchema: unknown;
  name: string;
}

/** Every property name in a JSON schema, at any depth. */
const properties = (schema: unknown, into = new Set<string>()): Set<string> => {
  if (Array.isArray(schema)) {
    for (const item of schema) {
      properties(item, into);
    }
    return into;
  }
  if (!schema || typeof schema !== "object") {
    return into;
  }
  const record = schema as Record<string, unknown>;
  const own = record.properties;
  if (own && typeof own === "object") {
    for (const [key, value] of Object.entries(own)) {
      into.add(key);
      properties(value, into);
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (key !== "properties") {
      properties(value, into);
    }
  }
  return into;
};

/** The hub's whole catalogue: `tools/list` with no credential. */
const catalogue = async (base: string): Promise<Listed[]> => {
  const response = await fetch(`${base}/mcp/cawco`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const raw = await response.text();
  const data = raw.includes("data:")
    ? raw
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => JSON.parse(line.slice(5)))
        .find((message) => message.id === 1)
    : JSON.parse(raw);
  const tools = data?.result?.tools as Listed[] | undefined;
  if (!tools?.length) {
    throw new Error(
      `tools/list answered ${response.status}: ${raw.slice(0, 300)}`
    );
  }
  return tools;
};

const schemaChecks = (kit: Kit, tools: Listed[]): void => {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  kit.note(`the hub lists ${tools.length} cawco tools`);
  const missing = Object.entries(CAWCO_FILE_ARGS).flatMap(([name, keys]) => {
    const schema = byName.get(name)?.inputSchema as
      | { properties?: Record<string, unknown> }
      | undefined;
    return keys
      .filter((key) => !schema?.properties?.[key])
      .map((key) => `${name}.${key}`);
  });
  kit.check(
    "each file argument the table names is a property of its tool's schema",
    missing.length === 0,
    missing.join(", ")
  );
  const unclassified = tools.flatMap((tool) =>
    [...properties(tool.inputSchema)]
      .filter(
        (key) =>
          PATH_LIKE.test(key) &&
          !CAWCO_FILE_ARGS[tool.name]?.includes(key) &&
          !NOT_FILES[tool.name]?.[key]
      )
      .map((key) => `${tool.name}.${key}`)
  );
  kit.check(
    "every cawco argument named like a path or URL is a file in the table or named here as no file",
    unclassified.length === 0,
    unclassified.join(", ")
  );
  const stale = Object.entries(NOT_FILES).flatMap(([name, keys]) => {
    const tool = byName.get(name);
    const own = tool ? properties(tool.inputSchema) : new Set<string>();
    return Object.keys(keys)
      .filter((key) => !own.has(key))
      .map((key) => `${name}.${key}`);
  });
  kit.check(
    "every argument named here as no file is in its tool's schema",
    stale.length === 0,
    stale.join(", ")
  );
};

type Judge = (policy: Policy, call: Call) => Verdict;

const LIVE_PATH =
  "/motion/seed-tabs?ids=184477ed-6e6e-4fb1-ad43-f10fd3aae458,9b1c2d3e-0000-4000-8000-000000000000";

const judgeChecks = async (kit: Kit, root: string): Promise<void> => {
  const home = join(root, "home");
  const clone = join(home, "clone");
  const scratch = join(root, "scratch");
  const elsewhere = join(home, "elsewhere");
  await Promise.all(
    [clone, scratch, elsewhere].map((dir) => mkdir(dir, { recursive: true }))
  );
  const real = {
    home: resolveReal(home),
    clone: resolveReal(clone),
    scratch: resolveReal(scratch),
  };
  const policy: Policy = {
    allowRead: [real.clone, real.scratch],
    allowWrite: [real.clone, real.scratch],
    clone: real.clone,
    denyRead: [real.home],
    denyWrite: [],
    home: real.home,
    scratch: real.scratch,
  };
  const outside = (name: string) => join(elsewhere, name);
  const harnesses = [
    { harness: "claude", prefix: "mcp__cawco__" },
    { harness: "opencode", prefix: "cawco_" },
  ] as const;
  const cases: {
    allowed: boolean;
    input: Record<string, unknown>;
    label: string;
    tool: string;
  }[] = [
    {
      label: "a preview with a URL path (the live call)",
      tool: "artifact_create",
      input: {
        kind: "preview",
        name: "folder-tabs",
        port: 5199,
        path: LIVE_PATH,
      },
      allowed: true,
    },
    {
      label: "a preview of a folder outside the workspace",
      tool: "artifact_create",
      input: { kind: "preview", name: "folder", dir: elsewhere },
      allowed: false,
    },
    {
      label: "a preview of a folder in the clone",
      tool: "artifact_create",
      input: {
        kind: "preview",
        name: "folder",
        dir: clone,
        path: "/index.html",
      },
      allowed: true,
    },
    {
      label: "a JSON Pointer patch",
      tool: "artifact_update",
      input: {
        id: "00000000-0000-4000-8000-000000000000",
        patch: [{ op: "replace", path: "/hero/options", value: ["b"] }],
      },
      allowed: true,
    },
    {
      label: "an image written outside the workspace",
      tool: "generate_image",
      input: { prompt: "x", output_path: outside("out.png") },
      allowed: false,
    },
    {
      label: "an image written in the clone",
      tool: "generate_image",
      input: { prompt: "x", output_path: "art/out.png" },
      allowed: true,
    },
    {
      label: "a reference image outside the workspace",
      tool: "generate_image",
      input: {
        prompt: "x",
        output_path: join(clone, "out.png"),
        reference_images: [outside("ref.png")],
      },
      allowed: false,
    },
    {
      label: "an image shown from outside the workspace",
      tool: "show_image",
      input: { path: outside("shot.png") },
      allowed: false,
    },
    {
      label: "an attachment from outside the workspace",
      tool: "send_to_user",
      input: { message: "x", attachments: [outside("clip.mp4")] },
      allowed: false,
    },
  ];
  for (const { harness, prefix } of harnesses) {
    for (const one of cases) {
      const verdict = judgeCall(policy, {
        harness,
        tool: `${prefix}${one.tool}`,
        input: one.input,
        cwd: clone,
      });
      kit.check(
        `${harness} ${one.tool}: ${one.label} is ${one.allowed ? "allowed" : "refused"}`,
        verdict.ok === one.allowed,
        verdict.ok ? "allowed" : verdict.reason
      );
    }
  }
  const other = judgeCall(policy, {
    harness: "claude",
    tool: "mcp__chrome-devtools__take_screenshot",
    input: { filePath: outside("shot.png") },
    cwd: clone,
  });
  kit.check(
    "another server's filePath outside the workspace is still refused by its name",
    !other.ok,
    other.ok ? "allowed" : other.reason
  );

  // Control: the judge as it stood before the cawco table (fdd325e91), on
  // the live call.
  const before = join(root, "judge-before.ts");
  const text =
    await Bun.$`git show fdd325e91:packages/core/src/workspace-judge.ts`
      .quiet()
      .text();
  await writeFile(before, text);
  const old = (await import(before)) as { judgeCall: Judge };
  const live = old.judgeCall(policy, {
    harness: "claude",
    tool: "mcp__cawco__artifact_create",
    input: {
      kind: "preview",
      name: "folder-tabs",
      port: 5199,
      path: LIVE_PATH,
    },
    cwd: clone,
  });
  kit.check(
    "control: the judge before this change refuses the live call as a write",
    !live.ok && live.reason.includes("is outside what this workspace writes"),
    live.ok ? "allowed" : live.reason
  );
};

const spec: Spec = {
  name: "mcp-file-args",
  run: async (kit) => {
    const root = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "mcp-file-args-")
    );
    try {
      await judgeChecks(kit, root);
      const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
      fleet.launch("hub");
      await fleet.hubUp();
      schemaChecks(kit, await catalogue(fleet.base));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
};

export default spec;
