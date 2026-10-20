/**
 * A session's plan is CawCo's list on every harness, always (Projects spec
 * §5.2, "Every session keeps CawCo's list, always"): no harness offers a
 * session its own list, and nothing turns it back on.
 *
 * On a scratch fleet (real hub, agent and sessiond, against the mock model)
 * with nobody having set any fleet choice:
 *
 * (a1) a Claude Code session's turn offers none of its own list's tools,
 *      `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TodoWrite`, neither
 *      sent as a tool nor defined anywhere in the request (deferred behind
 *      ToolSearch included), and offers CawCo's `todo_write`; on main it offered them,
 *      the fleet's "CawCo's to-dos" being off until someone turned it on;
 * (a2) an OpenCode session's turn offers neither `todowrite` nor `todoread`
 *      (OpenCode 2.0 has neither: 2.0.29's V2 migration says "The `todowrite`
 *      tool is no longer available and must not be called"), and offers
 *      CawCo's `cawco_todo_write`;
 * (a3) the machine's own `claude` is denied the same list in
 *      `~/.claude/settings.json`;
 * (a4) the fleet's choices no longer take a to-dos answer: `PUT
 *      /api/fleet/choices` with `todos: false` changes nothing a session is
 *      denied, and its answer still says every session keeps CawCo's list.
 *
 * Runs inside a workspace or on the host alike: it delegates nothing.
 *
 *   bun scripts/probe-kit/run.ts own-list-denied
 */
import { readFile } from "node:fs/promises";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const CLAUDE_LIST = [
  "TaskCreate",
  "TaskUpdate",
  "TaskList",
  "TaskGet",
  "TodoWrite",
];
const OPENCODE_LIST = ["todowrite", "todoread"];
const MARK = /PROBE-OWN-LIST-([a-z]+)/;
const TODO_WRITE = /todo_write/;

/** Every turn's request, by the harness its marker names. */
const turns = new Map<string, Seen>();

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  const harness = MARK.exec(request.all)?.[1];
  if (harness && !turns.has(harness)) {
    turns.set(harness, request);
  }
  return { everyMs: 5, words: ["ok"] };
};

/**
 * How a request offers `name`: as a tool it sends (`toolNames`), or as a tool
 * definition anywhere in its body (`"name":"TaskCreate"`, a deferred one
 * included). A tool's description may name another in its words ("NEVER use
 * the TaskCreate or Agent tools", Claude Code's Bash tool), which offers
 * nothing.
 */
const offered = (request: Seen, name: string): string[] => [
  ...(request.toolNames.includes(name) ? ["sent as a tool"] : []),
  ...(request.body.includes(`"name":"${name}"`) ? ["defined in the body"] : []),
];

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

  // (a1) Claude Code.
  const claude = await fleet.spawn("claude", "Own list", fleet.repo);
  await fleet.send(claude, "PROBE-OWN-LIST-claude");
  const claudeTurn = await until(
    "the Claude Code session's turn reaches the model",
    () => turns.get("claude"),
    (seen) => seen !== undefined,
    120_000
  ).catch(() => undefined);
  const claudeHas = Object.fromEntries(
    CLAUDE_LIST.flatMap((name) => {
      const where = claudeTurn ? offered(claudeTurn, name) : [];
      return where.length > 0 ? [[name, where]] : [];
    })
  );
  kit.check(
    `(a1) a Claude Code session is offered none of ${CLAUDE_LIST.join(", ")}`,
    claudeTurn !== undefined && Object.keys(claudeHas).length === 0,
    claudeTurn
      ? JSON.stringify({ found: claudeHas, tools: claudeTurn.toolNames.length })
      : "no turn reached the model"
  );
  kit.check(
    "(a1) and is offered CawCo's todo_write, loaded or behind ToolSearch",
    claudeTurn !== undefined &&
      offered(claudeTurn, "mcp__cawco__todo_write").length > 0,
    claudeTurn ? claudeTurn.toolNames.join(", ").slice(0, 400) : "no turn"
  );

  // (a2) OpenCode.
  const opencode = await fleet.spawn("opencode", "Own list", fleet.repo);
  await fleet.send(opencode, "PROBE-OWN-LIST-opencode");
  const opencodeTurn = await until(
    "the OpenCode session's turn reaches the model",
    () => turns.get("opencode"),
    (seen) => seen !== undefined,
    120_000
  ).catch(() => undefined);
  const opencodeHas = OPENCODE_LIST.filter((name) =>
    opencodeTurn?.toolNames.includes(name)
  );
  kit.check(
    `(a2) an OpenCode session is offered neither ${OPENCODE_LIST.join(" nor ")}`,
    opencodeTurn !== undefined && opencodeHas.length === 0,
    opencodeTurn
      ? JSON.stringify({ found: opencodeHas, tools: opencodeTurn.toolNames })
      : "no turn reached the model"
  );
  kit.check(
    "(a2) and is offered CawCo's todo_write, as a tool or in Code Mode's catalog",
    opencodeTurn !== undefined && TODO_WRITE.test(opencodeTurn.body),
    opencodeTurn ? opencodeTurn.toolNames.join(", ").slice(0, 400) : "no turn"
  );

  // (a3) The machine's own `claude`.
  const settings = JSON.parse(
    await readFile(projectClaudeDir(fleet.home, "settings.json"), "utf8").catch(
      () => "{}"
    )
  ) as { permissions?: { deny?: string[] } };
  const deny = settings.permissions?.deny ?? [];
  kit.check(
    "(a3) the machine's own claude settings deny the same list",
    CLAUDE_LIST.every((name) => deny.includes(name)),
    JSON.stringify(deny)
  );

  // (a4) No to-dos answer turns it back.
  const put = await fetch(`${fleet.base}/api/fleet/choices`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ todos: false }),
  });
  const choices = (await put.json().catch(() => ({}))) as { todos?: unknown };
  const after = JSON.parse(
    await readFile(projectClaudeDir(fleet.home, "settings.json"), "utf8").catch(
      () => "{}"
    )
  ) as { permissions?: { deny?: string[] } };
  kit.check(
    "(a4) a to-dos answer of false leaves every session on CawCo's list",
    put.ok &&
      choices.todos === true &&
      CLAUDE_LIST.every((name) =>
        (after.permissions?.deny ?? []).includes(name)
      ),
    JSON.stringify({ status: put.status, todos: choices.todos })
  );

  // The plan the session's ring and panel read is CawCo's list.
  const plan = await fleet.api<{ source?: string; steps?: unknown[] }>(
    `/api/instances/${claude}/plan`
  );
  kit.check(
    "the plan route answers CawCo's list for a Claude Code session",
    plan?.source === "cawco" && Array.isArray(plan.steps),
    JSON.stringify(plan)
  );
};

const spec: Spec = { name: "own-list-denied", run };
export default spec;
