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
 * - C's browser is its own project's: another key, another gate port, and
 *   C's list holds neither A's page nor B's;
 * - no Chromium on the machine has a chrome-devtools-mcp among its
 *   ancestors: the project browsers' are the only ones;
 * - a brand-new project's gate answers as its first session's door is made,
 *   with no wait for the agent's tick, and that session's first call is
 *   answered;
 * - each session's door was made in at most 200 ms (the agent's
 *   `[browser] <id>'s door … made in N ms` lines), so a spawn grows by no
 *   more than that.
 *
 * Run on the host, outside every workspace boundary (a boundary hides the
 * runtime's socket):
 *
 *   bun scripts/probe-kit/run.ts browser-cutover
 */
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
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
const results: Record<string, string[]> = {};
/** Whose final list waits for whose page: A and B each wait for the other. */
const partner: Record<string, string> = {};

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

const STEPS = (who: string) => [
  { name: `${TOOL}list_pages`, input: {} },
  {
    name: `${TOOL}new_page`,
    input: { url: `https://example.com/?who=${who}` },
  },
  { name: `${TOOL}take_snapshot`, input: {} },
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
  const steps = STEPS(who);
  const next = steps[done.length];
  if (!next) {
    return { everyMs: 5, words: ["done"] };
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

/** Every Chromium whose ancestors hold a chrome-devtools-mcp: none is the cutover. */
const chromiumUnderMcp = async (): Promise<{
  chromium: number;
  underMcp: string[];
}> => {
  const lines = (await Bun.$`ps -eo pid=,ppid=,args=`.text()).split("\n");
  const procs = new Map<number, { ppid: number; args: string }>();
  for (const line of lines) {
    const match = PS_LINE.exec(line);
    if (match) {
      procs.set(Number(match[1]), {
        ppid: Number(match[2]),
        args: match[3] ?? "",
      });
    }
  }
  const isChromium = (args: string) =>
    CHROMIUM.test(args.split(" --")[0] ?? "") && !args.includes("--type=");
  let chromium = 0;
  const underMcp: string[] = [];
  for (const [pid, proc] of procs) {
    if (!isChromium(proc.args)) {
      continue;
    }
    chromium += 1;
    for (
      let up = proc.ppid, hops = 0;
      up > 1 && hops < 64;
      up = procs.get(up)?.ppid ?? 0, hops += 1
    ) {
      if (procs.get(up)?.args.includes("chrome-devtools-mcp")) {
        underMcp.push(`${pid} under ${up}: ${proc.args.slice(0, 120)}`);
        break;
      }
    }
  }
  return { chromium, underMcp };
};

/** The agent's door lines, by gate id. */
const doors = (
  logs: string
): Map<string, { key: string; endpoint: string; ms: number }> => {
  const found = new Map<
    string,
    { key: string; endpoint: string; ms: number }
  >();
  for (const match of logs.matchAll(DOOR_LINE)) {
    found.set(match[1] ?? "", {
      key: match[2] ?? "",
      endpoint: match[3] ?? "",
      ms: Number(match[4]),
    });
  }
  return found;
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
  const agentOn = async (dockerHost: string) => {
    fleet.launch("agent", [], {
      DOCKER_HOST: dockerHost,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    });
    await fleet.agentUp();
  };
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  await agentOn(`unix://${runtime.endpoint}`);
  await fleet.accountSignedIn();

  // The fleet's chrome-devtools, as a person adds it; npx's cache is the
  // person's, not the fleet's home.
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
        env: { npm_config_cache: join(realHome, ".npm") },
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

  /** One host's sessions A, B (project one) and C (project two). */
  const leg = async (n: number, host: "container" | "local") => {
    const A = `A${n}`;
    const B = `B${n}`;
    const C = `C${n}`;
    partner[A] = B;
    partner[B] = A;
    const started = async (who: string, at: { id: string; repo: string }) => {
      const id = await fleet.spawn("claude", `Cutover ${who}`, at.repo, {
        projectId: at.id,
      });
      await fleet.send(id, `${TAG}-${who}: browse.`);
      return id;
    };
    // Project one's first session: a key with no record yet, whose gate
    // listens as the session's door is made, before the agent's next tick.
    const fresh = !(await browsers.browserRows()).some(
      (kept) => kept.key === keys[0]
    );
    const spawnedAt = Date.now();
    const first = await started(A, ours);
    const firstDoor = doors(await fleet.logs("agent")).get(first);
    const gate = firstDoor?.endpoint.replace("ws://", "http://");
    const answer = gate
      ? await fetch(gate).then(
          async (response) => `${response.status} ${await response.text()}`,
          (error: unknown) => String(error)
        )
      : "no door line";
    const listening = Date.now() - spawnedAt;
    kit.check(
      `${host}: ${fresh ? "a brand-new" : "the"} project's gate answers as its first session's door is made (${listening} ms after the spawn, under the agent's 60 s tick)`,
      answer.startsWith("404") && listening < 60_000,
      `${gate}: ${answer}`
    );
    const ids = {
      [A]: first,
      [B]: await started(B, ours),
      [C]: await started(C, theirs),
    };
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
      `${host}: C's browser is its own project's (another key and gate), and C's list holds neither A's page nor B's`,
      door(A)?.key === keys[0] &&
        door(B)?.key === keys[0] &&
        door(C)?.key === keys[1] &&
        door(A)?.endpoint.split("/")[2] !== door(C)?.endpoint.split("/")[2] &&
        !!said(C)[3]?.includes(`who=${C}`) &&
        !said(C)[3]?.includes(`who=${A}`) &&
        !said(C)[3]?.includes(`who=${B}`),
      JSON.stringify({
        A: door(A),
        B: door(B),
        C: door(C),
        list: said(C)[3]?.slice(0, 300),
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
    const ps = await chromiumUnderMcp();
    kit.check(
      `${host}: ps shows no Chromium launched by an MCP server (${ps.chromium} Chromium browser process(es), the projects' own)`,
      ps.underMcp.length === 0 && ps.chromium >= 1,
      ps.underMcp.join("; ") || `${ps.chromium} browser process(es)`
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
