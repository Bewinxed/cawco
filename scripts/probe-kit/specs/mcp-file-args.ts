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
 *    `filePath` outside is refused. Each argument the hub only reads
 *    (`show_image` `path`, `send_to_user` `attachments`, `artifact_create`
 *    `dir`, `generate_image` `reference_images`) passes on a dir the policy
 *    reads but does not write; `generate_image`'s `output_path`, a write,
 *    is refused on that read-only dir; `reference_images` in a delegate's
 *    scratch dir is refused as a read.
 * 2b. Shown files, the judge then the hub (shown-files.ts) for a parent in
 *    a boundary: its delegate's scratch file and its nested delegate's
 *    clone pass; an unrelated workspace's scratch file or clone, a link
 *    from a delegate's scratch dir to one, a credential store inside it and
 *    a `..` climbing out of it are refused for reading; a session outside
 *    any boundary is left as it was.
 * 3. Controls: the judge as it stood before the cawco table (fdd325e91)
 *    refuses the live call, and the judge before the table carried each
 *    argument's access (c09c4a28f) refuses `show_image` on the read-only
 *    dir as a write (the live refusal of 2026-10-15), so the probe catches
 *    what each fix ends.
 *
 *   bun scripts/probe-kit/run.ts mcp-file-args
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
import {
  type ShownDeps,
  shownRefusal,
} from "../../../packages/hub/src/shown-files";
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
      { properties?: Record<string, unknown> } | undefined;
    return Object.keys(keys)
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
          !CAWCO_FILE_ARGS[tool.name]?.[key] &&
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

/** A screenshot a session took in a dir. */
const shot = (dir: string) => join(dir, "routines-shots", "s1.png");

/**
 * The fleet the hub's half answers for: the parent session runs in its own
 * workspace, delegated an item to `delegate`, which delegated one to
 * `nested`; `unrelated` is another parent's.
 */
const FLEET = {
  parent: {
    id: "p0000000-0000-4000-8000-000000000000",
    ws: "a1a1a1a1-0000-4000-8000-000000000000",
  },
  delegate: {
    id: "d0000000-0000-4000-8000-000000000000",
    ws: "b2b2b2b2-0000-4000-8000-000000000000",
    by: "p0000000-0000-4000-8000-000000000000",
  },
  nested: {
    id: "e0000000-0000-4000-8000-000000000000",
    ws: "c3c3c3c3-0000-4000-8000-000000000000",
    by: "d0000000-0000-4000-8000-000000000000",
  },
  unrelated: {
    id: "f0000000-0000-4000-8000-000000000000",
    ws: "704c3333-0000-4000-8000-000000000000",
    by: "9e000000-0000-4000-8000-000000000000",
  },
} as const;

/**
 * show_image and send_to_user as a parent in a boundary makes them: its
 * workspace's judge, then, for a call the judge lets through, the hub's
 * check on the same words (shown-files.ts).
 */
const shownChecks = (
  kit: Kit,
  at: {
    areas: Record<
      "delegateScratch" | "nestedClone" | "unrelatedClone" | "unrelatedScratch",
      string
    >;
    clone: string;
    home: string;
    policy: Policy;
    store: string;
  }
): void => {
  const { areas } = at;
  const delegated = [FLEET.delegate, FLEET.nested, FLEET.unrelated];
  const deps: ShownDeps = {
    boundaryOf: (id) => (id === FLEET.parent.id ? FLEET.parent.ws : undefined),
    home: (machineId) => (machineId === "m1" ? at.home : undefined),
    itemsIn: (ws) =>
      delegated
        .filter((one) => one.ws === ws)
        .map((one) => ({ instanceId: one.id, parentInstanceId: one.by })),
    ledBy: () => false,
    parentOf: (id) => delegated.find((one) => one.id === id)?.by,
    workspaces: (id8) =>
      delegated
        .filter((one) => one.ws.startsWith(id8))
        .map((one) => ({
          id: one.ws,
          path: join(at.home, ".worktrees", `cockpit-${one.ws.slice(0, 8)}`),
        })),
  };
  const shows = (
    harness: "claude" | "opencode",
    tool: "send_to_user" | "show_image",
    path: string
  ): Verdict => {
    const prefix = harness === "claude" ? "mcp__cawco__" : "cawco_";
    const input =
      tool === "show_image" ? { path } : { message: "x", attachments: [path] };
    const judged = judgeCall(at.policy, {
      harness,
      tool: `${prefix}${tool}`,
      input,
      cwd: at.clone,
    });
    if (!judged.ok) {
      return judged;
    }
    const refusal = shownRefusal(deps, {
      instanceId: FLEET.parent.id,
      machineId: "m1",
      paths: [path],
      tool,
    });
    return refusal ? { ok: false, reason: refusal } : { ok: true };
  };
  const cases: { allowed: boolean; label: string; path: string }[] = [
    {
      label: "its delegate's scratch file",
      path: shot(areas.delegateScratch),
      allowed: true,
    },
    {
      label: "a file in its nested delegate's clone",
      path: join(areas.nestedClone, "shot.png"),
      allowed: true,
    },
    {
      label: "an unrelated workspace's scratch file",
      path: shot(areas.unrelatedScratch),
      allowed: false,
    },
    {
      label: "a file in an unrelated workspace's clone",
      path: join(areas.unrelatedClone, "shot.png"),
      allowed: false,
    },
    {
      label:
        "a link in its delegate's scratch dir to an unrelated workspace's file",
      path: join(areas.delegateScratch, "borrowed.png"),
      allowed: false,
    },
    {
      label: "a credential store inside its delegate's scratch dir",
      path: join(at.store, "token.png"),
      allowed: false,
    },
    {
      label:
        "a path that climbs from its delegate's scratch dir into an unrelated one's",
      path: `${areas.delegateScratch}/../${FLEET.unrelated.ws.slice(0, 8)}/routines-shots/s1.png`,
      allowed: false,
    },
  ];
  for (const harness of ["claude", "opencode"] as const) {
    for (const tool of ["show_image", "send_to_user"] as const) {
      for (const one of cases) {
        const verdict = shows(harness, tool, one.path);
        const said =
          verdict.ok || verdict.reason.includes("was refused: reading ");
        kit.check(
          `${harness} ${tool}: a parent showing ${one.label} is ${one.allowed ? "allowed" : "refused for reading"}`,
          verdict.ok === one.allowed && said,
          verdict.ok ? "allowed" : verdict.reason
        );
      }
    }
  }
  // A session outside any boundary is the hub's to leave alone.
  const host = shownRefusal(deps, {
    instanceId: "h0000000-0000-4000-8000-000000000000",
    machineId: "m1",
    paths: [shot(areas.unrelatedScratch)],
    tool: "show_image",
  });
  kit.check(
    "a session outside any boundary shows an unrelated workspace's file as before",
    host === undefined,
    host ?? "allowed"
  );
};

const LIVE_PATH =
  "/motion/seed-tabs?ids=184477ed-6e6e-4fb1-ad43-f10fd3aae458,9b1c2d3e-0000-4000-8000-000000000000";

const judgeChecks = async (kit: Kit, root: string): Promise<void> => {
  const home = join(root, "home");
  const clone = join(home, "clone");
  const scratch = join(root, "scratch");
  const elsewhere = join(home, "elsewhere");
  // A dir the workspace reads but never writes, as it reads a toolchain.
  const readOnly = join(home, "toolchain");
  // Other workspaces' areas on the machine, which this one does not read:
  // its delegate's, that delegate's own delegate's, and an unrelated one's.
  const areas = {
    delegateScratch: join(home, ".cawco", "tmp", FLEET.delegate.ws.slice(0, 8)),
    nestedClone: join(
      home,
      ".worktrees",
      `cockpit-${FLEET.nested.ws.slice(0, 8)}`
    ),
    unrelatedScratch: join(
      home,
      ".cawco",
      "tmp",
      FLEET.unrelated.ws.slice(0, 8)
    ),
    unrelatedClone: join(
      home,
      ".worktrees",
      `cockpit-${FLEET.unrelated.ws.slice(0, 8)}`
    ),
  };
  await Promise.all(
    [clone, scratch, elsewhere, readOnly, ...Object.values(areas)].map((dir) =>
      mkdir(dir, { recursive: true })
    )
  );
  // A credential store inside the delegate's scratch dir, and a link there
  // to the unrelated workspace's file.
  const store = join(areas.delegateScratch, "store");
  await mkdir(store, { recursive: true });
  await mkdir(join(areas.unrelatedScratch, "routines-shots"));
  await writeFile(shot(areas.unrelatedScratch), "x");
  await symlink(
    shot(areas.unrelatedScratch),
    join(areas.delegateScratch, "borrowed.png")
  );
  const real = {
    home: resolveReal(home),
    clone: resolveReal(clone),
    scratch: resolveReal(scratch),
    readOnly: resolveReal(readOnly),
  };
  const policy: Policy = {
    allowRead: [real.clone, real.scratch, real.readOnly],
    allowWrite: [real.clone, real.scratch],
    clone: real.clone,
    denyRead: [real.home, resolveReal(store)],
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
    /** What a refusal must say, when it is one. */
    says?: string;
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
    {
      label: "an image shown from a dir the workspace reads but never writes",
      tool: "show_image",
      input: { path: shot(readOnly), caption: "x" },
      allowed: true,
    },
    {
      label: "an attachment from a dir the workspace only reads",
      tool: "send_to_user",
      input: { message: "x", attachments: [shot(readOnly)] },
      allowed: true,
    },
    {
      label: "a preview of a folder the workspace only reads",
      tool: "artifact_create",
      input: { kind: "preview", name: "folder", dir: readOnly },
      allowed: true,
    },
    {
      label: "a reference image from a dir the workspace only reads",
      tool: "generate_image",
      input: {
        prompt: "x",
        output_path: join(clone, "out.png"),
        reference_images: [shot(readOnly)],
      },
      allowed: true,
    },
    {
      label: "an image written to a dir the workspace only reads",
      tool: "generate_image",
      input: { prompt: "x", output_path: join(readOnly, "out.png") },
      allowed: false,
      says: "writing",
    },
    {
      label:
        "a reference image from a delegate's scratch dir (only shown files reach the hub)",
      tool: "generate_image",
      input: {
        prompt: "x",
        output_path: join(clone, "out.png"),
        reference_images: [shot(areas.delegateScratch)],
      },
      allowed: false,
      says: "reading",
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
      const said =
        verdict.ok ||
        one.says === undefined ||
        verdict.reason.includes(`was refused: ${one.says} `);
      kit.check(
        `${harness} ${one.tool}: ${one.label} is ${one.allowed ? "allowed" : `refused${one.says ? ` for ${one.says}` : ""}`}`,
        verdict.ok === one.allowed && said,
        verdict.ok ? "allowed" : verdict.reason
      );
    }
  }
  shownChecks(kit, {
    policy,
    clone,
    home: real.home,
    areas,
    store,
  });

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

  // Control: the judge before the table carried each argument's access
  // (c09c4a28f), on show_image from a dir the workspace only reads.
  const allWrites = join(root, "judge-all-writes.ts");
  await writeFile(
    allWrites,
    await Bun.$`git show c09c4a28f:packages/core/src/workspace-judge.ts`
      .quiet()
      .text()
  );
  const writes = (await import(allWrites)) as { judgeCall: Judge };
  const shown = writes.judgeCall(policy, {
    harness: "claude",
    tool: "mcp__cawco__show_image",
    input: { path: shot(readOnly) },
    cwd: clone,
  });
  kit.check(
    "control: the judge before the table's access refuses show_image on a read-only dir as a write",
    !shown.ok && shown.reason.includes("is outside what this workspace writes"),
    shown.ok ? "allowed" : shown.reason
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
