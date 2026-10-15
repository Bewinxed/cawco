/**
 * Which CawCo tools a session loads upfront, which it finds through
 * ToolSearch, and what the server's instructions tell it (hub
 * delegation-tools.ts `ALWAYS_LOAD` and `handoffInstructions`,
 * delegation-mcp.ts `listed`, `PROJECT_ONLY` and `listableOf`; agent
 * delegation.ts sets no server-level `alwaysLoad`). On a scratch fleet (real
 * hub, agent and sessiond; Claude Code and OpenCode against the mock model),
 * read from the requests the harnesses send.
 *
 * The mock is no first-party host, where Claude Code turns tool search off
 * unless `ENABLE_TOOL_SEARCH=true` ("MCP tools stay deferred when
 * ANTHROPIC_BASE_URL is a non-first-party host", code.claude.com/docs/en/mcp);
 * the fleet's sessions run with it, as a session on Anthropic's API defers
 * by default.
 *
 * (a) A session you started in a project: its first turn's request loads
 *     exactly delegate, handoff, set_title and artifact_create of CawCo's
 *     (no work item, so no finish_item), every other CawCo tool deferred.
 * (b) ToolSearch `select:mcp__cawco__task_read` there answers the tool.
 * (c) A session you started in no project: the same four upfront, and the
 *     same search finds nothing: the project's tools are not its to find.
 *     Its instructions name the same groups as (a)'s, the project's marked
 *     "(in a project)": what a session is told holds when it becomes one.
 * (d) A leaf with a work item, its row as a delegate's is (`can_delegate` 0,
 *     a `work_item_id`) before its session connects: its first request loads
 *     handoff, finish_item, set_title and artifact_create, names no spawning
 *     tool, and its instructions are a leaf's. (A delegate call itself needs
 *     a workspace boundary, which cannot start inside another one: a scratch
 *     fleet run from a workspace has none.)
 * (e) Words sent with the start itself, as a delegate's brief follows its
 *     spawn: the first request already loads the four.
 * (f) An OpenCode session made a leaf, then started again from the
 *     dashboard: the start carries its row's leaf-ness (server.ts, the
 *     dashboard's `spawn`), so OpenCode denies it the delegation tools.
 *
 *   bun scripts/probe-kit/run.ts tool-loading
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const CAWCO = "mcp__cawco__";
const TASK_READ = `${CAWCO}task_read`;
const TAGS = /PROBE-LOAD-(P|N|L|S|O1|O2)\b/g;
type Tag = "P" | "N" | "L" | "S" | "O1" | "O2";
const SPAWNING = ["delegate", "start_session", "delegate_list", "workflow_run"];
/** A tool of a project's own (hub delegation-mcp.ts `PROJECT_ONLY`), todo_write aside. */
const PROJECT_TOOL =
  /^(task_|routine_|relay_|event_route_|connector_poll_|action_|memory_|thread_|view_|folder_)|^(artifact_promote|project_settings)$/;
/** How the instructions open their loading paragraph (delegation-tools.ts `loadingLine`). */
const LOADING = /On Claude, [^\n]*/;

interface Body {
  messages?: { content: unknown; role: string }[];
  system?: unknown;
  tools?: { defer_loading?: boolean; name?: string }[];
}

/** Per tag: its first turn's request, and the one after its search (ToolSearch, or OpenCode's `search`). */
const first: Partial<Record<Tag, Body>> = {};
const searched: Partial<Record<Tag, Body>> = {};
const step: Partial<Record<Tag, number>> = {};

const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

const respond = (request: Seen): Reply => {
  // The newest tag a session was sent: a session started again keeps its
  // earlier words.
  const tag = request.tools
    ? ([...request.all.matchAll(TAGS)].at(-1)?.[1] as Tag | undefined)
    : undefined;
  if (!tag) {
    return { everyMs: 5, words: ["ok"] };
  }
  const body = JSON.parse(request.body) as Body;
  const at = step[tag] ?? 0;
  step[tag] = at + 1;
  if (at === 0) {
    first[tag] = body;
    // OpenCode's Code Mode: its MCP tools are reached inside `execute`, and
    // `search` lists every one the session may call; a denied tool is hidden.
    if (
      (tag === "O1" || tag === "O2") &&
      request.toolNames.includes("execute")
    ) {
      return tool("execute", {
        code: 'return search({ namespace: "cawco", limit: 500 }).items.map((item) => item.path)',
      });
    }
    if (
      (tag === "P" || tag === "N") &&
      request.toolNames.includes("ToolSearch")
    ) {
      return tool("ToolSearch", {
        query: `select:${TASK_READ}`,
        max_results: 1,
      });
    }
  }
  if (at === 1 && tag !== "L" && tag !== "S") {
    searched[tag] = body;
  }
  return { everyMs: 5, words: ["done"] };
};

/** Every string in `value`, at any depth. */
const strings = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(strings);
  }
  return value && typeof value === "object"
    ? Object.values(value).flatMap(strings)
    : [];
};

const CAWCO_NAME = /mcp__cawco__([a-z_]+)/g;
/** How Claude Code 2.1.299 opens its list of deferred tools, a name a line. */
const DEFERRED_LIST =
  "The following deferred tools are now available via ToolSearch.";

/**
 * A request's CawCo tools: upfront, its definitions in `tools`; deferred,
 * the names in Claude Code's own list of deferred tools (a system reminder
 * naming each for ToolSearch to load), not its other words.
 */
const cawcoTools = (body: Body | undefined) => {
  const upfront = (body?.tools ?? [])
    .flatMap((entry) =>
      entry.name?.startsWith(CAWCO) && !entry.defer_loading
        ? [entry.name.slice(CAWCO.length)]
        : []
    )
    .sort();
  const lists = strings(body?.messages).flatMap((text) => {
    const at = text.indexOf(DEFERRED_LIST);
    return at < 0
      ? []
      : [text.slice(at, text.indexOf("</system-reminder>", at))];
  });
  const named = new Set(
    [...lists.join("\n").matchAll(CAWCO_NAME)].map((match) => match[1] ?? "")
  );
  return {
    upfront,
    deferred: [...named].filter((name) => !upfront.includes(name)).sort(),
  };
};

/** The CawCo tool names a ToolSearch result referenced, from its tool_result. */
const referenced = (body: Body | undefined): string[] => {
  const last = body?.messages?.at(-1);
  const text = JSON.stringify(last?.content ?? "");
  return [...text.matchAll(/"tool_name":"([^"]+)"/g)].map((m) => m[1] ?? "");
};

/** The CawCo server's instructions, wherever the request carries them. */
const instructions = (body: Body | undefined): string => {
  const whole = strings([body?.system, body?.messages]).join("\n");
  const at = whole.indexOf("## cawco");
  if (at < 0) {
    return "(not found)";
  }
  const end = whole.indexOf("\n## ", at + 8);
  return whole.slice(at, end < 0 ? undefined : end);
};

const same = (a: string[], b: string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const spec: Spec = {
  name: "tool-loading",
  async run(kit) {
    const fleet = await kit.fleet(respond);
    fleet.env.ENABLE_TOOL_SEARCH = "true";
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const home = fleet.env.HOME as string;
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    const code = join(fleet.sandbox, "code");
    await mkdir(code, { recursive: true });
    await Bun.$`git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'`
      .cwd(code)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Tool loading",
      machineId: MACHINE,
      cwd: code,
    });

    /** A dashboard start under `instanceId`, unwaited. */
    const start = (
      instanceId: string,
      harness: "claude" | "opencode",
      title: string
    ) =>
      fleet.post({
        verb: "spawn",
        machineId: MACHINE,
        instanceId,
        requestId: crypto.randomUUID(),
        payload: {
          instanceId,
          cwd: fleet.repo,
          harness,
          model: MODEL[harness],
          title,
          permissionMode: "bypassPermissions",
        },
      });
    const running = (instanceId: string) =>
      until(
        "the session running",
        () => fleet.instance(instanceId),
        (row) => row?.status === "running",
        180_000
      );

    const inProject = await fleet.spawn("claude", "In a project", code, {
      projectId: project.id,
    });
    const outside = await fleet.spawn("claude", "In no project", fleet.repo);
    // (d) The leaf's row is a delegate's before its session connects: the
    // hub writes the row as the start arrives, and Claude Code connects to
    // its MCP servers once it has booted, seconds later.
    const leafId = crypto.randomUUID();
    await start(leafId, "claude", "A leaf");
    for (let at = 0; !fleet.instance(leafId) && at < 1500; at += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: the row, as soon as the hub has written it
      await Bun.sleep(10);
    }
    fleet.write(
      "UPDATE instances SET can_delegate = 0, work_item_id = 'probe-item' WHERE id = ?",
      leafId
    );
    await running(leafId);
    await fleet.send(inProject, "PROBE-LOAD-P: go.");
    await fleet.send(outside, "PROBE-LOAD-N: go.");
    await fleet.send(leafId, "PROBE-LOAD-L: go.");
    // (e) Words that follow the start at once.
    const startedId = crypto.randomUUID();
    await start(startedId, "claude", "Words at once");
    await fleet.send(startedId, "PROBE-LOAD-S: go.");
    // (f) OpenCode: a session, its row then made a leaf, stopped and started
    // again from the dashboard.
    const openId = await fleet.spawn("opencode", "OpenCode", fleet.repo);
    await fleet.send(openId, "PROBE-LOAD-O1: go.");
    await until(
      "OpenCode's search answered",
      () => (searched.O1 ? true : undefined),
      Boolean,
      180_000
    );
    fleet.write("UPDATE instances SET can_delegate = 0 WHERE id = ?", openId);
    await fleet.stopSession(openId);
    await until(
      "OpenCode stopped",
      () => fleet.instance(openId),
      (row) => row?.status !== "running",
      90_000
    );
    await start(openId, "opencode", "OpenCode");
    await running(openId);
    await fleet.send(openId, "PROBE-LOAD-O2: go.");
    await until(
      "every session's turns",
      () =>
        searched.P && searched.N && first.L && first.S && searched.O2
          ? true
          : undefined,
      Boolean,
      240_000
    ).catch(() => undefined);
    // The hub's own listing for the leaf, `_meta` and all.
    const listing = await fleet.api<{ tools: Listed[] }>(
      `/api/delegation/tools?instanceId=${leafId}`
    );
    report(kit.check, listing.tools);
  },
};

/** A tool as the hub's REST listing answers it. */
interface Listed {
  _meta?: Record<string, unknown>;
  name: string;
}

/** The CawCo tools OpenCode's `search` found, by name, from the tool's result. */
const cawcoOf = (tag: Tag): string[] => [
  ...new Set(
    [
      ...JSON.stringify(searched[tag]?.messages?.at(-1) ?? "").matchAll(
        /tools\.cawco\.([a-z_]+)/g
      ),
    ].map((match) => match[1] ?? "")
  ),
];

/** Every assertion, on what the sessions sent and the leaf's listing. */
function report(check: Kit["check"], listing: Listed[]): void {
  const marked = listing
    .filter((entry) => entry._meta?.["anthropic/alwaysLoad"] === true)
    .map((entry) => entry.name);
  const p = cawcoTools(first.P);
  const n = cawcoTools(first.N);
  const l = cawcoTools(first.L);
  const s = cawcoTools(first.S);
  const worker = ["artifact_create", "delegate", "handoff", "set_title"];
  const leaf = ["artifact_create", "finish_item", "handoff", "set_title"];
  for (const [tag, body] of Object.entries({
    P: first.P,
    N: first.N,
    L: first.L,
  })) {
    const { upfront, deferred } = cawcoTools(body);
    console.log(`  ${tag} upfront: ${upfront.join(", ")}`);
    console.log(
      `  ${tag} deferred (${deferred.length}): ${deferred.join(", ")}`
    );
    console.log(`  ${tag} instructions:\n${instructions(body)}\n`);
  }
  console.log(`  the leaf's listing, marked upfront: ${marked.join(", ")}`);
  console.log(`  OpenCode before: ${cawcoOf("O1").join(", ")}`);
  console.log(`  OpenCode after: ${cawcoOf("O2").join(", ")}`);

  check(
    "(a) in a project, the first turn loads exactly delegate, handoff, set_title and artifact_create upfront",
    same(p.upfront, worker) && p.deferred.length > 0,
    `upfront: ${p.upfront.join(", ")}; deferred: ${p.deferred.length}`
  );
  check(
    "(a) in a project, task_read is deferred, not missing",
    p.deferred.includes("task_read")
  );
  const foundP = referenced(searched.P);
  check(
    "(b) ToolSearch select:mcp__cawco__task_read answers it in a project",
    foundP.includes(TASK_READ),
    `referenced: ${foundP.join(", ") || "(none)"}; result: ${JSON.stringify(searched.P?.messages?.at(-1)?.content ?? null).slice(0, 400)}`
  );
  check(
    "(c) in no project, the same four load upfront",
    same(n.upfront, worker),
    `upfront: ${n.upfront.join(", ")}`
  );
  const foundN = referenced(searched.N);
  check(
    "(c) in no project, the search finds no task_read, and no project tool is listed",
    !(
      foundN.includes(TASK_READ) ||
      [...n.upfront, ...n.deferred].some((name) => PROJECT_TOOL.test(name))
    ),
    `referenced: ${foundN.join(", ") || "(none)"}; result: ${JSON.stringify(searched.N?.messages?.at(-1)?.content ?? null).slice(0, 400)}`
  );
  const loadingP = LOADING.exec(instructions(first.P))?.[0];
  const loadingN = LOADING.exec(instructions(first.N))?.[0];
  check(
    "(c) in a project and out of one, the instructions name the same groups, the project's marked as such",
    loadingP !== undefined &&
      loadingP === loadingN &&
      loadingP.includes("task_*: project tasks (in a project)") &&
      loadingP.includes("project_from_session (outside a project)"),
    `in a project: ${loadingP}; in none: ${loadingN}`
  );
  check(
    "(d) the leaf's first turn loads exactly handoff, finish_item, set_title and artifact_create upfront",
    same(l.upfront, leaf),
    `upfront: ${l.upfront.join(", ") || "(no leaf request)"}`
  );
  check(
    "(d) the leaf's first turn names no spawning tool, upfront or deferred",
    first.L !== undefined &&
      !SPAWNING.some(
        (name) => l.upfront.includes(name) || l.deferred.includes(name)
      ),
    `upfront: ${l.upfront.join(", ")}; deferred: ${l.deferred.join(", ")}`
  );
  const leafSays = instructions(first.L);
  check(
    "(d) the leaf is told it is a leaf, with finish_item upfront and no delegate",
    leafSays.includes("This session is a leaf delegate.") &&
      (LOADING.exec(leafSays)?.[0] ?? "").startsWith(
        "On Claude, handoff, finish_item, set_title, artifact_create load upfront"
      ) &&
      !leafSays.includes("This session orchestrates"),
    leafSays
  );
  check(
    "(d) the hub lists the leaf those four marked upfront, and no spawning tool",
    same(marked, leaf) &&
      !listing.some((entry) => SPAWNING.includes(entry.name)),
    `marked: ${marked.join(", ")}; listed: ${listing.map((entry) => entry.name).join(", ")}`
  );
  check(
    "(e) words sent with the start itself: the first turn already loads the same four upfront",
    same(s.upfront, worker),
    `upfront: ${s.upfront.join(", ") || "(none)"}; the request's tools: ${(first.S?.tools ?? []).map((entry) => entry.name).join(", ")}`
  );
  check(
    "(f) OpenCode can reach delegate before its row is a leaf, and not after a dashboard start",
    cawcoOf("O1").includes("delegate") &&
      !["delegate", "start_session"].some((name) =>
        cawcoOf("O2").includes(name)
      ) &&
      cawcoOf("O2").includes("handoff"),
    `before: ${cawcoOf("O1").join(", ") || "(no search)"}; after: ${cawcoOf("O2").join(", ") || "(no search)"}`
  );
}

export default spec;
