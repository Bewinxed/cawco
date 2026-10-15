/**
 * Which CawCo tools a Claude session loads upfront, and which it finds
 * through ToolSearch (hub delegation-tools.ts `ALWAYS_LOAD`, delegation-mcp.ts
 * `listed` and `PROJECT_ONLY`; agent delegation.ts sets no server-level
 * `alwaysLoad`). On a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model), read from the requests Claude Code sends.
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
 * (d) A leaf with a work item, as a delegate's row is (`can_delegate` 0,
 *     a `work_item_id`): its first request loads handoff, finish_item,
 *     set_title and artifact_create, and names no spawning tool at all. The
 *     row is made one once its session runs, and the hub's list_changed
 *     carries it: a delegate call itself needs a workspace boundary, which
 *     cannot start inside another one (a scratch fleet run from a workspace).
 *
 *   bun scripts/probe-kit/run.ts tool-loading
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const CAWCO = "mcp__cawco__";
const TASK_READ = `${CAWCO}task_read`;
const TAG = /PROBE-LOAD-([PNLS])/;
type Tag = "P" | "N" | "L" | "S";
const SPAWNING = ["delegate", "start_session", "delegate_list", "workflow_run"];
/** A tool of a project's own (hub delegation-mcp.ts `PROJECT_ONLY`), todo_write aside. */
const PROJECT_TOOL =
  /^(task_|routine_|relay_|event_route_|connector_poll_|action_|memory_|thread_|view_|folder_)|^(artifact_promote|project_settings)$/;

interface Body {
  messages?: { content: unknown; role: string }[];
  system?: unknown;
  tools?: { defer_loading?: boolean; name?: string }[];
}

/** Per tag: its first turn's request, and the one after its ToolSearch. */
const first: Partial<Record<Tag, Body>> = {};
const searched: Partial<Record<Tag, Body>> = {};
const step: Partial<Record<Tag, number>> = {};

const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

const respond = (request: Seen): Reply => {
  const tag = request.tools
    ? (TAG.exec(request.all)?.[1] as Tag | undefined)
    : undefined;
  if (!tag) {
    return { everyMs: 5, words: ["ok"] };
  }
  const body = JSON.parse(request.body) as Body;
  const at = step[tag] ?? 0;
  step[tag] = at + 1;
  if (at === 0) {
    first[tag] = body;
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
  if (at === 1 && (tag === "P" || tag === "N")) {
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
    const { check } = kit;
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

    const inProject = await fleet.spawn("claude", "In a project", code, {
      projectId: project.id,
    });
    const outside = await fleet.spawn("claude", "In no project", fleet.repo);
    // A leaf: a delegate's row is a leaf with a work item. The row is made one
    // once the session runs, and the hub tells its open stream that its list
    // changed (delegation-mcp.ts `reconcileLists`); its first turn follows.
    const leafId = await fleet.spawn("claude", "A leaf", fleet.repo);
    fleet.write(
      "UPDATE instances SET can_delegate = 0, work_item_id = 'probe-item' WHERE id = ?",
      leafId
    );
    await until(
      "the hub telling the leaf its tools changed",
      () => fleet.logs("hub"),
      (log) => log.includes(`tools/list_changed -> ${leafId}`),
      90_000
    );
    await fleet.send(inProject, "PROBE-LOAD-P: go.");
    await fleet.send(outside, "PROBE-LOAD-N: go.");
    await fleet.send(leafId, "PROBE-LOAD-L: go.");
    // (e) A start whose first words follow it at once, as a delegate's brief
    // follows its spawn: sent before the session runs, before its MCP
    // servers can have connected.
    const startedId = crypto.randomUUID();
    await fleet.post({
      verb: "spawn",
      machineId: MACHINE,
      instanceId: startedId,
      requestId: crypto.randomUUID(),
      payload: {
        instanceId: startedId,
        cwd: fleet.repo,
        harness: "claude",
        model: "claude-haiku-4-5",
        title: "Words at once",
        permissionMode: "bypassPermissions",
      },
    });
    await fleet.send(startedId, "PROBE-LOAD-S: go.");
    await until(
      "both sessions searched, the leaf's first turn and the prompt start's",
      () => (searched.P && searched.N && first.L && first.S ? true : undefined),
      Boolean,
      240_000
    ).catch(() => undefined);
    // The hub's own listing for the leaf, `_meta` and all.
    const listing = await fleet.api<{
      tools: { _meta?: Record<string, unknown>; name: string }[];
    }>(`/api/delegation/tools?instanceId=${leafId}`);
    const marked = listing.tools
      .filter((entry) => entry._meta?.["anthropic/alwaysLoad"] === true)
      .map((entry) => entry.name);

    const p = cawcoTools(first.P);
    const n = cawcoTools(first.N);
    const l = cawcoTools(first.L);
    const s = cawcoTools(first.S);
    console.log(`  S upfront: ${s.upfront.join(", ")}`);
    const worker = ["artifact_create", "delegate", "handoff", "set_title"];
    const leaf = ["artifact_create", "finish_item", "handoff", "set_title"];
    console.log(`  P upfront: ${p.upfront.join(", ")}`);
    console.log(
      `  P deferred (${p.deferred.length}): ${p.deferred.join(", ")}`
    );
    console.log(`  N upfront: ${n.upfront.join(", ")}`);
    console.log(
      `  N deferred (${n.deferred.length}): ${n.deferred.join(", ")}`
    );
    console.log(`  L upfront: ${l.upfront.join(", ")}`);
    console.log(
      `  L deferred (${l.deferred.length}): ${l.deferred.join(", ")}`
    );
    for (const [tag, body] of Object.entries(first)) {
      console.log(`  ${tag} instructions:\n${instructions(body)}\n`);
    }
    console.log(
      `  the leaf with a work item, marked upfront: ${marked.join(", ")}`
    );

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
    check(
      "(e) words sent with the start itself: the first turn already loads the same four upfront",
      same(s.upfront, worker),
      `upfront: ${s.upfront.join(", ") || "(none)"}; the request's tools: ${(first.S?.tools ?? []).map((entry) => entry.name).join(", ")}`
    );
    check(
      "(d) the hub lists the leaf those four marked upfront, and no spawning tool",
      same(marked, leaf) &&
        !listing.tools.some((entry) => SPAWNING.includes(entry.name)),
      `marked: ${marked.join(", ")}; listed: ${listing.tools.map((entry) => entry.name).join(", ")}`
    );
  },
};

export default spec;
