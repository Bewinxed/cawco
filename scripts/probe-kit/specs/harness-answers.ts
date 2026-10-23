/**
 * What each harness's model reads of a CawCo tool's answer (hub mcp-tool.ts):
 * the answer's `content`, its words, on Claude Code, OpenCode and pi alike.
 * On a scratch fleet (real hub, agent and sessiond; each harness against the
 * mock model, which records every request it is sent), a session on each
 * harness, two delegates seeded under it, calls `delegate_list` as its
 * harness offers it (declared, behind Claude Code's ToolSearch or pi's
 * `tool_search`, or in OpenCode's Code Mode), and the request that follows
 * the call carries the tool's result as the model reads it.
 *
 * a. Every harness's model reads the words: the delegates by their links and
 *    handles, their state and report.
 * b. None reads the hub's record instead: no `"instanceId"`, no JSON.
 *
 * Runs inside a workspace or on the host alike: it delegates nothing.
 *
 *   bun scripts/probe-kit/run.ts harness-answers
 */
import { join } from "node:path";
import {
  type Harness,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const HARNESSES: Harness[] = ["claude", "opencode", "pi"];
const TAG = /PROBE-ANSWERS-([A-Z]+)/g;
/** OpenCode's Code Mode tool, which runs MCP tools from a script. */
const CODE_MODE = "execute";
const TOOL = "delegate_list";
const REPORT = "The settings page reads quietly now; the settings spec passes.";

/** Each harness's ask: whether its search and its call went out, and what its model read back. */
const steps = new Map<string, { called?: boolean; searched?: boolean }>();
const answers = new Map<string, string>();

/** A message part's words: a string, or the text of its blocks. */
const wordsOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  return Array.isArray(content)
    ? (content as { text?: string; content?: unknown }[])
        .map((part) => part.text ?? wordsOf(part.content))
        .join("\n")
    : "";
};

/** The words of the request's last tool result: an Anthropic message's last `tool_result` block, or a chat completion's last `tool` message. */
const lastToolResult = (body: string): string => {
  const messages =
    (JSON.parse(body) as { messages?: { content?: unknown; role?: string }[] })
      .messages ?? [];
  for (const message of [...messages].reverse()) {
    if (message.role === "tool") {
      return wordsOf(message.content);
    }
    const block = Array.isArray(message.content)
      ? (message.content as { type?: string; content?: unknown }[]).findLast(
          (part) => part.type === "tool_result"
        )
      : undefined;
    if (block) {
      return wordsOf(block.content);
    }
  }
  return "";
};

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The call as the harness offers `delegate_list`: by its name, behind a search, or in Code Mode. */
const offered = (request: Seen, step: { searched?: boolean }): Reply | null => {
  const named = [`mcp__cawco__${TOOL}`, `cawco_${TOOL}`, TOOL].find((name) =>
    request.toolNames.includes(name)
  );
  if (named) {
    return call(named, {});
  }
  if (request.toolNames.includes(CODE_MODE)) {
    return call(CODE_MODE, { code: `return await tools.cawco.${TOOL}({});` });
  }
  if (!step.searched && request.toolNames.includes("ToolSearch")) {
    step.searched = true;
    return call("ToolSearch", {
      query: `select:mcp__cawco__${TOOL}`,
      max_results: 1,
    });
  }
  if (!step.searched && request.toolNames.includes("tool_search")) {
    step.searched = true;
    return call("tool_search", { query: `cawco ${TOOL}` });
  }
  return null;
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const harness = [...request.all.matchAll(TAG)].at(-1)?.[1];
  if (!harness) {
    return text("ok");
  }
  const step = steps.get(harness) ?? {};
  steps.set(harness, step);
  if (step.called) {
    if (request.afterTool && !answers.has(harness)) {
      answers.set(harness, lastToolResult(request.body));
    }
    return text("done");
  }
  const reply = offered(request, step);
  if (
    reply?.tool &&
    reply.tool.name !== "ToolSearch" &&
    reply.tool.name !== "tool_search"
  ) {
    step.called = true;
  }
  if (reply) {
    return reply;
  }
  step.called = true;
  answers.set(harness, "none offered");
  return text(`No ${TOOL} is offered.`);
};

/** Two ended delegates under `parent`, as the hub keeps them: workspace, session row and work item. */
const seedDelegates = (fleet: KitFleet, parent: string) => {
  const now = Date.now();
  for (const n of [1, 2]) {
    const id = crypto.randomUUID();
    const workspace = crypto.randomUUID();
    const started = now - n * 30 * 60_000;
    const path = join(fleet.workdir, `ws-${workspace.slice(0, 8)}`);
    fleet.write(
      "INSERT INTO workspaces (id, machine_id, repo_root, path, branch, base, state, ports, created_by_instance_id, created_at) VALUES (?, ?, ?, ?, ?, 'main', 'archived', '[]', ?, ?)",
      workspace,
      MACHINE,
      fleet.workdir,
      path,
      `ws/${workspace.slice(0, 8)}`,
      parent,
      started
    );
    fleet.write(
      "INSERT INTO instances (id, machine_id, harness, parent_instance_id, cwd, launch_dir, title, kind, can_delegate, status, created_at, updated_at) VALUES (?, ?, 'claude', ?, ?, 'known', ?, 'mainline', 0, 'stopped', ?, ?)",
      id,
      MACHINE,
      parent,
      path,
      `Quiet settings ${n}`,
      started,
      started + 20 * 60_000
    );
    fleet.write(
      "INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, harness, state, headline, created_at, ended_at) VALUES (?, ?, ?, ?, 'The brief.', ?, 'claude', 'done', ?, ?, ?)",
      crypto.randomUUID(),
      workspace,
      parent,
      id,
      `Quiet settings ${n}`,
      REPORT,
      started,
      started + 20 * 60_000
    );
  }
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  for (const harness of HARNESSES) {
    // biome-ignore lint/performance/noAwaitInLoops: one harness at a time, each its own session
    const session = await fleet.spawn(harness, `Answers on ${harness}`);
    seedDelegates(fleet, session);
    const tag = harness.toUpperCase();
    await fleet.send(session, `PROBE-ANSWERS-${tag}`);
    const read = await until(
      `${harness}'s model reading ${TOOL}'s answer`,
      () => answers.get(tag),
      Boolean,
      180_000
    ).catch(() => answers.get(tag) ?? "no answer read");
    kit.note(`${harness}'s model read: ${read.slice(0, 1200)}`);
    kit.check(
      `a: ${harness}'s model reads ${TOOL}'s words: the delegates by link and handle, their state and report`,
      read.includes("Quiet settings 1") &&
        read.includes("cawco:session/") &&
        read.includes("done") &&
        read.includes(REPORT),
      read.slice(0, 900)
    );
    kit.check(
      `b: ${harness}'s model reads no record in place of the words`,
      !(read.includes('"instanceId"') || read.trimStart().startsWith("{")),
      read.slice(0, 900)
    );
  }
};

export default { name: "harness-answers", run } satisfies Spec;
