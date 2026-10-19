/**
 * Every session's browser tool goes through its browser's DevTools gate
 * (Projects spec §5.11, build item 2's cutover), on both hosts: a container
 * where the runtime answers, a local Chromium with the runtime hidden
 * (`DOCKER_HOST=unix:///nonexistent`).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) whose fleet runs chrome-devtools-mcp 1.11.0, two sessions A and
 * B of one project and a session C of another each call chrome-devtools'
 * `list_pages`, `new_page https://example.com/?who=<them>` and
 * `take_snapshot`, then `list_pages` again once A and B have both opened
 * theirs. On each host:
 *
 * - A's snapshot names Example Domain: the tool works through the gate;
 * - A's last list holds A's page and not B's, and B's the other way round;
 * - C's browser is its own project's: another key, through the same gate
 *   port, and C's list holds neither A's page nor B's;
 * - no Chromium on the machine has a chrome-devtools-mcp among its
 *   ancestors: the project browsers' are the only ones;
 * - no chrome-devtools-mcp command line holds a token: each names its
 *   door's 0600 config file alone (`--config=`);
 * - a brand-new project's first session's door reserves its browser (a
 *   record, no ports) and the machine's gate answers at once, with no wait
 *   for the agent's tick; that session's first call is answered, and only
 *   then does the browser take ports;
 * - a session outside any workspace whose row the hub deletes has its door
 *   folder (token, config, project) removed within the agent's next tick;
 * - after the agent's welcome, a door folder of a session the hub has no
 *   row for is gone, a workspace's folder stays, and a session that browsed
 *   before the agent restarted browses on;
 * - each session's door was made in at most 200 ms (the agent's
 *   `[browser] <id>'s door … made in N ms` lines), so a spawn grows by no
 *   more than that.
 *
 * Run on the host, outside every workspace boundary (a boundary hides the
 * runtime's socket):
 *
 *   bun scripts/probe-kit/run.ts browser-cutover
 */
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { BrowserKey } from "../../../packages/core/src/browser";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

type Browsers = typeof import("../../../packages/agent/src/browser/browsers");

const TAG = "PROBE-CUTOVER";
const MCP_VERSION = "1.11.0";
const DOOR_MS = 200;
const TOOL = "mcp__chrome-devtools__";
const WHO = /PROBE-CUTOVER-([A-Z]\d):/;
/** What chrome-devtools-mcp answers when it reached no browser. */
const CALL_FAILED =
  /ECONNREFUSED|Could not connect|Failed to fetch browser|socket hang up|Unexpected server response/i;
const PS_LINE = /^\s*(\d+)\s+(\d+)\s+(.*)$/;
const CHROMIUM =
  /(?:^|\/)(?:chrome|chromium|chromium-browser|headless_shell)(?:\s|$)/;
const DOOR_LINE =
  /\[browser\] (\S+)'s door to (\S+) at (\S+), made in (\d+) ms/g;

/** What each session's tools answered, in order, by who it is (`A1`, `B2`…). */
const results: Partial<Record<string, string[]>> = {};
/** Whose final list waits for whose page: A and B each wait for the other. */
const partner: Record<string, string> = {};
/** A session whose second call waits for this: the agent restarted under it. */
const heldUntil: Record<string, Promise<void>> = {};

/** A tool result's content as text: a string, or its text parts joined. */
const textOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  return Array.isArray(content)
    ? (content as { text?: string }[]).map((part) => part.text ?? "").join("\n")
    : "";
};

/** The text of every tool result in a request, in order. */
const toolResults = (body: string): string[] => {
  const parsed = JSON.parse(body) as {
    messages?: { content?: unknown }[];
  };
  const out: string[] = [];
  for (const message of parsed.messages ?? []) {
    if (!Array.isArray(message.content)) {
      continue;
    }
    for (const block of message.content as {
      type?: string;
      content?: unknown;
    }[]) {
      if (block.type !== "tool_result") {
        continue;
      }
      out.push(textOf(block.content));
    }
  }
  return out;
};

const SELECTED = /(\d+):[^\n]*\[selected\]/;

/**
 * Each session's four calls, a page-scoped one naming the page `new_page`
 * selected: chrome-devtools-mcp 1.11.0 requires `pageId` on page-scoped
 * tools (`pageIdRouting`, on by default).
 */
const STEPS = (who: string, done: readonly string[]) => [
  { name: `${TOOL}list_pages`, input: {} },
  {
    name: `${TOOL}new_page`,
    input: { url: `https://example.com/?who=${who}` },
  },
  {
    name: `${TOOL}take_snapshot`,
    input: { pageId: Number(SELECTED.exec(done[1] ?? "")?.[1]) },
  },
  { name: `${TOOL}list_pages`, input: {} },
];

/** Each session's four calls in turn; the last list waits for its partner's page. */
const respond = async (request: Seen): Promise<Reply> => {
  const who = WHO.exec(request.all)?.[1];
  if (!(request.tools && who)) {
    return { everyMs: 5, words: ["ok"] };
  }
  const done = toolResults(request.body);
  results[who] = done;
  const steps = STEPS(who, done);
  const next = steps[done.length];
  if (!next) {
    return { everyMs: 5, words: ["done"] };
  }
  const held = heldUntil[who];
  if (done.length === 1 && held) {
    await held;
  }
  const other = partner[who];
  if (done.length === 3 && other) {
    await until(
      `${other}'s page open before ${who} lists again`,
      () => results[other]?.length,
      (count) => count >= 3,
      300_000
    ).catch(() => undefined);
  }
  return { everyMs: 5, words: [], tool: next };
};

type Procs = Map<number, { ppid: number; args: string }>;

/** Every process of the machine, by pid. */
const processes = async (): Promise<Procs> => {
  const lines = (await Bun.$`ps -eo pid=,ppid=,args=`.text()).split("\n");
  const procs: Procs = new Map();
  for (const line of lines) {
    const match = PS_LINE.exec(line);
    if (match) {
      procs.set(Number(match[1]), {
        ppid: Number(match[2]),
        args: match[3] ?? "",
      });
    }
  }
  return procs;
};

/** The first of `pid`'s ancestors `holds` accepts. */
const ancestor = (
  procs: Procs,
  pid: number,
  holds: (pid: number, args: string) => boolean
): number | undefined => {
  for (
    let up = procs.get(pid)?.ppid ?? 0, hops = 0;
    up > 1 && hops < 64;
    up = procs.get(up)?.ppid ?? 0, hops += 1
  ) {
    if (holds(up, procs.get(up)?.args ?? "")) {
      return up;
    }
  }
};

/** Whether `pid` is one of the scratch fleet's own processes: under its sessiond or its agent, never a live session's. */
const inFleet = (procs: Procs, pid: number, roots: ReadonlySet<number>) =>
  roots.has(pid) || !!ancestor(procs, pid, (up) => roots.has(up));

/**
 * Every Chromium a chrome-devtools-mcp of the scratch fleet launched (the
 * server among its ancestors, and the fleet's sessiond or agent among the
 * server's): none is the cutover. Another fleet's on the host (the live
 * one's) is not this fleet's to judge. Also counts the fleet's own
 * browsers' Chromium processes (the local host's, under its agent).
 */
const chromiumUnderMcp = (
  procs: Procs,
  roots: ReadonlySet<number>
): { chromium: number; underMcp: string[] } => {
  const isChromium = (args: string) =>
    CHROMIUM.test(args.split(" --")[0] ?? "") && !args.includes("--type=");
  let chromium = 0;
  const underMcp: string[] = [];
  for (const [pid, proc] of procs) {
    if (!(isChromium(proc.args) && inFleet(procs, pid, roots))) {
      continue;
    }
    chromium += 1;
    const mcp = ancestor(procs, pid, (_, args) =>
      args.includes("chrome-devtools-mcp")
    );
    if (mcp) {
      underMcp.push(`${pid} under ${mcp}: ${proc.args.slice(0, 120)}`);
    }
  }
  return { chromium, underMcp };
};

/** The scratch fleet's chrome-devtools-mcp processes' command lines: those under its sessiond or agent. */
const fleetMcpLines = (procs: Procs, roots: ReadonlySet<number>): string[] =>
  [...procs.entries()]
    .filter(
      ([pid, proc]) =>
        proc.args.includes("chrome-devtools-mcp") && inFleet(procs, pid, roots)
    )
    .map(([, proc]) => proc.args);

/** Whether `path` is there. */
const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false
  );

/** The agent's door lines, by gate id: the browser's key, the door's config file, and how long it took. */
const doors = (
  logs: string
): Map<string, { key: string; config: string; ms: number }> => {
  const found = new Map<string, { key: string; config: string; ms: number }>();
  for (const match of logs.matchAll(DOOR_LINE)) {
    found.set(match[1] ?? "", {
      key: match[2] ?? "",
      config: match[3] ?? "",
      ms: Number(match[4]),
    });
  }
  return found;
};

/** A door's config as chrome-devtools-mcp reads it, and its file's mode. */
const doorConfig = async (
  file: string
): Promise<{ wsEndpoint?: string; mode: string }> => {
  const read = await Bun.file(file)
    .json()
    .catch(() => ({}) as { wsEndpoint?: string });
  const stat = await Bun.file(file)
    .stat()
    .catch(() => undefined);
  return {
    ...(read as { wsEndpoint?: string }),
    mode: stat ? (stat.mode % 0o1000).toString(8) : "missing",
  };
};

const run = async (kit: Kit): Promise<void> => {
  const realHome = homedir();
  const fleet = await kit.fleet(respond);
  const browsersPath =
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    join(
      realHome,
      process.platform === "darwin" ? "Library/Caches" : ".cache",
      "ms-playwright"
    );
  const { findRuntime } =
    await import("../../../packages/agent/src/browser/runtime");
  const runtime = await findRuntime();
  if ("missing" in runtime) {
    kit.check(
      "a container runtime answers on this host",
      false,
      runtime.missing
    );
    return;
  }
  /** The agent now running: with the sessiond, the roots of the fleet's own process tree. */
  let agent = 0;
  const agentOn = async (dockerHost: string) => {
    agent = fleet.launch("agent", [], {
      DOCKER_HOST: dockerHost,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    }).pid;
    await fleet.agentUp();
  };
  const sessiond = fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  await agentOn(`unix://${runtime.endpoint}`);
  await fleet.accountSignedIn();

  // The fleet's chrome-devtools, as a person adds it: the machine's sync
  // installs it and every session launches that install.
  const put = await fetch(`${fleet.base}/api/fleet/mcp/chrome-devtools`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      config: {
        command: "npx",
        args: [
          "-y",
          `chrome-devtools-mcp@${MCP_VERSION}`,
          "--no-usage-statistics",
        ],
      },
      enabled: true,
    }),
  });
  kit.check(
    "the fleet runs chrome-devtools-mcp",
    put.ok,
    `${put.status} ${await put.text()}`
  );
  // The machine's word on the fleet: chrome-devtools applied for every
  // harness that reports MCP (the fleet sync wrote it, with no browser of
  // its own, into Claude Code's config).
  const applied = await until(
    "the machine applied the fleet's chrome-devtools",
    () =>
      fleet
        .query<{ fleet: string | null }>("SELECT fleet FROM agents")
        .map((row) => row.fleet ?? "")
        .find((text) => text.includes("chrome-devtools")),
    (text) =>
      (
        JSON.parse(text) as {
          mcp?: Record<string, { state?: string }>;
        }
      ).mcp?.["chrome-devtools"]?.state === "applied",
    180_000
  ).catch(() => undefined);
  kit.check(
    "the machine applied the fleet's chrome-devtools",
    !!applied,
    applied?.slice(0, 300) ?? "no report naming it"
  );

  const project = async (name: string) => {
    const repo = join(fleet.sandbox, name);
    await mkdir(repo, { recursive: true });
    await Bun.$`git init -q -b main && echo code > README.md && git -c user.name=O -c user.email=o@probe.test add -A && git -c user.name=O -c user.email=o@probe.test commit -qm 'First commit'`
      .cwd(repo)
      .quiet();
    const made = await fleet.api<{ id: string }>("/api/projects", {
      name,
      machineId: "scratch-fleet",
      cwd: repo,
      caw: false,
    });
    return { id: made.id, repo };
  };
  const ours = await project("cutover-one");
  const theirs = await project("cutover-two");
  const keys: BrowserKey[] = [`project:${ours.id}`, `project:${theirs.id}`];

  process.env.XDG_DATA_HOME = fleet.env.XDG_DATA_HOME as string;
  const hidden = process.env.DOCKER_HOST;
  const browsers: Browsers =
    await import("../../../packages/agent/src/browser/browsers");

  /**
   * A project's first session: its door reserves the browser (a record, no
   * ports) and the machine's gate listens for it at once, before the agent's
   * next tick and before any tool call. Answers the session.
   */
  const firstDoor = async (
    host: string,
    key: BrowserKey,
    spawn: () => Promise<string>
  ): Promise<string> => {
    const fresh = !(await browsers.browserRows()).some(
      (kept) => kept.key === key
    );
    const spawnedAt = Date.now();
    const id = await spawn();
    const door = doors(await fleet.logs("agent")).get(id);
    const config = door ? await doorConfig(door.config) : { mode: "missing" };
    const gate = config.wsEndpoint?.replace("ws://", "http://");
    const answer = gate
      ? await fetch(gate).then(
          async (response) => `${response.status} ${await response.text()}`,
          (error: unknown) => String(error)
        )
      : "no door";
    const listening = Date.now() - spawnedAt;
    const reserved = (await browsers.browserRows()).find(
      (kept) => kept.key === key
    );
    kit.check(
      `${host}: ${fresh ? "a brand-new" : "the"} project's first door reserves its browser (${reserved?.state}, ${reserved?.ports ? "with" : "no"} ports) and the gate at ${config.wsEndpoint} answers ${listening} ms after the spawn, under the agent's 60 s tick; the door's config is mode ${config.mode}`,
      answer.startsWith("404") &&
        listening < 60_000 &&
        config.mode === "600" &&
        reserved?.state === "asleep" &&
        reserved.ports === undefined,
      `${gate}: ${answer}; ${JSON.stringify(reserved)}`
    );
    return id;
  };

  /** One host's sessions A, B (project one) and C (project two). */
  const leg = async (n: number, host: "container" | "local") => {
    const A = `A${n}`;
    const B = `B${n}`;
    const C = `C${n}`;
    partner[A] = B;
    partner[B] = A;
    const spawned = (who: string, at: { id: string; repo: string }) =>
      fleet.spawn("claude", `Cutover ${who}`, at.repo, { projectId: at.id });
    const browse = (who: string, id: string) =>
      fleet.send(id, `${TAG}-${who}: browse.`);
    const first = await firstDoor(host, keys[0] as BrowserKey, () =>
      spawned(A, ours)
    );
    await browse(A, first);
    const ids = {
      [A]: first,
      [B]: await spawned(B, ours),
      [C]: await spawned(C, theirs),
    };
    await browse(B, ids[B] ?? "");
    await browse(C, ids[C] ?? "");
    for (const who of [A, B, C]) {
      // biome-ignore lint/performance/noAwaitInLoops: one session's four calls, then the next's.
      await until(
        `${who}'s four browser calls`,
        () => results[who]?.length,
        (count) => count >= 4,
        300_000
      ).catch(() => undefined);
    }
    const said = (who: string) => results[who] ?? [];
    kit.check(
      `${host}: A's first tool call (list_pages) reached the gate and was answered`,
      said(A)[0] !== undefined && !CALL_FAILED.test(said(A)[0] ?? ""),
      (said(A)[0] ?? "no answer").slice(0, 300)
    );
    kit.check(
      `${host}: A's new_page https://example.com and take_snapshot work through the gate`,
      said(A)[2]?.includes("Example Domain") === true,
      (said(A)[2] ?? said(A).join(" | ")).slice(0, 300)
    );
    kit.check(
      `${host}: A's list_pages holds A's page only, B's holds B's only`,
      !!said(A)[3]?.includes(`who=${A}`) &&
        !said(A)[3]?.includes(`who=${B}`) &&
        !!said(B)[3]?.includes(`who=${B}`) &&
        !said(B)[3]?.includes(`who=${A}`),
      JSON.stringify({ A: said(A)[3], B: said(B)[3] }).slice(0, 600)
    );

    const logs = await fleet.logs("agent");
    const made = doors(logs);
    const door = (who: string) => made.get(ids[who] ?? "");
    const rows = await browsers.browserRows();
    const row = (key: BrowserKey) => rows.find((kept) => kept.key === key);
    kit.check(
      `${host}: C's browser is its own project's (another key and DevTools port, the same gate), and C's list holds neither A's page nor B's`,
      door(A)?.key === keys[0] &&
        door(B)?.key === keys[0] &&
        door(C)?.key === keys[1] &&
        !!row(keys[0])?.ports &&
        row(keys[0])?.ports?.devtools !== row(keys[1])?.ports?.devtools &&
        !!said(C)[3]?.includes(`who=${C}`) &&
        !said(C)[3]?.includes(`who=${A}`) &&
        !said(C)[3]?.includes(`who=${B}`),
      JSON.stringify({
        A: door(A),
        B: door(B),
        C: door(C),
        list: said(C)[3]?.slice(0, 300),
        ports: rows.map(({ key, ports }) => ({ key, ports })),
      })
    );
    kit.check(
      `${host}: both browsers run on the ${host} host`,
      row(keys[0])?.host === host &&
        row(keys[1])?.host === host &&
        row(keys[0])?.state === "live" &&
        row(keys[1])?.state === "live",
      JSON.stringify(
        rows.map(({ key, host: on, state }) => ({ key, on, state }))
      )
    );
    const procs = await processes();
    const roots = new Set([sessiond.pid, agent]);
    const ps = chromiumUnderMcp(procs, roots);
    kit.check(
      `${host}: ps shows no Chromium launched by the fleet's chrome-devtools-mcp (${ps.chromium} Chromium browser process(es) in the fleet's own tree; a container's run outside it)`,
      ps.underMcp.length === 0 && (host === "container" || ps.chromium >= 1),
      ps.underMcp.join("; ") || `${ps.chromium} browser process(es)`
    );
    // npm exec and its shell carry the arguments; the server itself shows
    // only its process title. None holds a token, and the door's config is
    // what they name.
    const lines = fleetMcpLines(procs, roots);
    kit.check(
      `${host}: no chrome-devtools-mcp command line of the fleet holds a token (${lines.length} process(es), naming the door's config)`,
      lines.some((line) => line.includes("--config=")) &&
        lines.every(
          (line) => !(line.includes("Bearer") || line.includes("--wsHeaders"))
        ),
      lines.map((line) => line.slice(0, 200)).join(" | ")
    );
    const ms = [A, B, C].map((who) => door(who)?.ms ?? Number.NaN);
    kit.check(
      `${host}: each session's door made in ≤ ${DOOR_MS} ms (${ms.join(", ")} ms), so its spawn grows by no more`,
      ms.every((took) => took <= DOOR_MS),
      [...made.entries()].map(([id, line]) => `${id} ${line.ms} ms`).join(", ")
    );
    await Promise.allSettled(
      Object.values(ids).map((id) => fleet.stopSession(id))
    );
  };

  /**
   * A session outside any workspace makes its own door as it launches; the
   * person stops it, then deletes it, as the dashboard has them. The delete
   * owes the machine a stop of its own carrying `forget`, which the agent
   * takes for a session already ended: the door's folder is gone, and the
   * row with it, within the agent's next tick.
   */
  const forgotten = async (): Promise<void> => {
    const id = await fleet.spawn("claude", "Cutover forgotten", ours.repo, {
      projectId: ours.id,
    });
    const door = doors(await fleet.logs("agent")).get(id);
    const folder = door ? dirname(door.config) : undefined;
    const made = folder ? await exists(folder) : false;
    await fleet.stopSession(id);
    const stopped = await until(
      "the session to stop",
      () => fleet.instance(id)?.status,
      (status) => status === "stopped",
      120_000
    ).catch(() => fleet.instance(id)?.status);
    // The hub refuses while its last reading of the machine still has the
    // process: the person tries again, as the dashboard's Delete does.
    const said = await until(
      "the hub to take the delete",
      async () => {
        const answer = await fetch(`${fleet.base}/api/instances/${id}`, {
          method: "DELETE",
        });
        const text = `${answer.status} ${await answer.text()}`;
        return text.includes("still running") ? undefined : text;
      },
      Boolean,
      60_000
    ).catch(() => "409 still running after 60 s");
    const gone = folder
      ? await until(
          "the session's door folder to go",
          async () => !(await exists(folder)),
          Boolean,
          70_000
        ).catch(() => false)
      : false;
    const dropped = await until(
      "the session's row to go",
      () => fleet.instance(id) === undefined,
      Boolean,
      70_000
    ).catch(() => false);
    kit.check(
      `a session outside any workspace made its door (${folder}), was stopped (${stopped}) then deleted (${said}), and its door folder and row are gone within the agent's next tick`,
      made &&
        stopped === "stopped" &&
        said.startsWith("200") &&
        gone &&
        dropped,
      JSON.stringify({ made, stopped, said, gone, row: fleet.instance(id) })
    );
  };

  /**
   * The welcome's sweep: while the agent is stopped, a door folder of a
   * session the hub has no row for and a workspace-shaped folder are left in
   * the workspaces dir; the agent starts, and once its welcome is read the
   * stray door is gone, the workspace's folder stays, and a session that
   * browsed before the restart browses on through its own door.
   */
  const welcomeSwept = async (): Promise<void> => {
    const E = "E3";
    let restarted: () => void = () => undefined;
    heldUntil[E] = new Promise<void>((resolve) => {
      restarted = resolve;
    });
    const live = await fleet.spawn("claude", "Cutover live", ours.repo, {
      projectId: ours.id,
    });
    await fleet.send(live, `${TAG}-${E}: browse.`);
    await until(
      `${E}'s first browser call`,
      () => results[E]?.length,
      (count) => count >= 1,
      300_000
    ).catch(() => undefined);
    await fleet.stop("agent");
    const workspaces = join(fleet.env.HOME as string, ".cawco", "workspaces");
    const stray = join(workspaces, `stray-${crypto.randomUUID()}`);
    const workspace = join(workspaces, `kept-${crypto.randomUUID()}`);
    await mkdir(stray, { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(join(stray, "browser-token"), "stray\n");
    await writeFile(join(stray, "browser-mcp.json"), "{}\n");
    await writeFile(join(workspace, "browser-token"), "kept\n");
    await writeFile(
      join(workspace, "create.json"),
      // A clone that is not there: the agent's scans pass it by.
      `${JSON.stringify({ path: join(fleet.sandbox, "no-clone") })}\n`
    );
    await agentOn("unix:///nonexistent");
    const strayGone = await until(
      "the stray door folder to go after the welcome",
      async () => !(await exists(stray)),
      Boolean,
      30_000
    ).catch(() => false);
    const workspaceKept =
      (await exists(join(workspace, "browser-token"))) &&
      (await exists(join(workspace, "create.json")));
    restarted();
    await until(
      `${E}'s calls after the restart`,
      () => results[E]?.length,
      (count) => count >= 4,
      300_000
    ).catch(() => undefined);
    const after = results[E]?.[3] ?? "";
    kit.check(
      "after the agent's welcome the stray door folder is gone, the workspace's folder stays, and a live session's next list_pages answers through its door",
      strayGone &&
        workspaceKept &&
        after.includes(`who=${E}`) &&
        !CALL_FAILED.test(after),
      JSON.stringify({ strayGone, workspaceKept, after: after.slice(0, 300) })
    );
    await fleet.stopSession(live);
    await rm(workspace, { recursive: true, force: true });
  };

  try {
    process.env.DOCKER_HOST = `unix://${runtime.endpoint}`;
    await leg(1, "container");

    // The local host: the runtime hidden from the agent, and the containers
    // and their volumes gone first (a browser that moves host leaves them).
    await fleet.stop("agent");
    await Promise.all(keys.map((key) => browsers.removeBrowser(key)));
    process.env.DOCKER_HOST = "unix:///nonexistent";
    await browsers.browserRuntime(true);
    await agentOn("unix:///nonexistent");
    await leg(2, "local");
    await forgotten();
    await welcomeSwept();
  } finally {
    await fleet.stop("agent").catch(() => undefined);
    process.env.DOCKER_HOST = `unix://${runtime.endpoint}`;
    await browsers.browserRuntime(true);
    await Promise.allSettled(keys.map((key) => browsers.removeBrowser(key)));
    if (hidden === undefined) {
      delete process.env.DOCKER_HOST;
    } else {
      process.env.DOCKER_HOST = hidden;
    }
  }
};

const spec: Spec = {
  name: "browser-cutover",
  host: "its agent reaches the container runtime's socket, which a workspace boundary hides",
  run,
};

export default spec;
