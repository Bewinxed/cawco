/**
 * A project's browser behind its DevTools gate (Projects spec §5.11, build
 * item 2), on both hosts: a container where the runtime answers, a local
 * Chromium with the runtime hidden (`DOCKER_HOST=unix:///nonexistent`).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), two delegates A and B of one project start their boundaries,
 * which mint each workspace's gate token in its state dir. The agent's
 * registry runs, as the daemon runs it, in a process of the kit's started
 * with the fleet's HOME (browser-gate-host.ts) and a data dir of its own: it
 * reserves the project's browser (a record, no ports, its gate served on the
 * machine's one gate port, here a free port of its own as a second agent on
 * the host names one), then starts it, reading the delegates' tokens and
 * projects from the fleet's home. chrome-devtools-mcp
 * 1.11.0 connects to the gate as A and as B (`--wsEndpoint`, `--wsHeaders`);
 * raw CDP connections with the same tokens read what the tool cannot name.
 * On each host:
 *
 * - A's `new_page https://example.com`, `take_snapshot`, `take_screenshot`
 *   and `fill` (a form page's field, read back) work through the gate (C4);
 * - B's `list_pages` omits A's pages, and B naming A's page (attach,
 *   activate) answers the ownership sentence: B's own `select_page` takes
 *   B's page numbers, so the tool cannot name A's page at all;
 * - `navigate_page chrome://history` is refused (chrome-devtools-mcp 1.11.0
 *   refuses `chrome:` itself), and the gate's own sentence answers a
 *   `Page.navigate` to it on A's page and a `new_page file://…`;
 * - `Network.getAllCookies` answers the sign-ins sentence;
 * - the shield's `closeAll` drops A and B with 4423, a new connection gets
 *   423 with its sentence until `open()`, then connects;
 * - with B connected and holding a page, A's `performance_start_trace` is
 *   refused with the gate's sentence (a trace records every page); B's
 *   boundary ended (`forget`), A's trace starts and stops;
 * - from each delegate's workspace shell, `curl --max-time 3` to the
 *   browser's DevTools port and to the runtime's socket are both refused.
 *
 * Between the legs the browser stops and the runtime is hidden, as a
 * runtime going away leaves it: the browser moves to the local host, its
 * container marked to be removed, and once the runtime answers again its
 * removal takes the container and the volume too.
 *
 * Run on the host, outside every workspace boundary (it starts two, and a
 * boundary hides the runtime's socket):
 *
 *   bun scripts/probe-kit/run.ts browser-gate
 */
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { GATE_WORDS } from "../../../packages/agent/src/browser/gate";
import type {
  BrowserKey,
  BrowserRow,
} from "../../../packages/core/src/browser";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** How the gate host prefixes its answers. */
const HOST_LINE = "GATE-HOST ";

/**
 * The machine side (browser-gate-host.ts): the registry and its gates in a
 * process started with the fleet's HOME, driven one command at a time.
 */
interface GateHost {
  call: (verb: string, args?: object) => Promise<unknown>;
  end: () => void;
}

const startGateHost = (env: Record<string, string>): GateHost => {
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "..", "browser-gate-host.ts")],
    { env, stdin: "pipe", stdout: "pipe", stderr: "inherit" }
  );
  let next = 0;
  const waiting = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  const answered = (line: string): void => {
    if (!line.startsWith(HOST_LINE)) {
      if (line.trim()) {
        console.log(line);
      }
      return;
    }
    const body = JSON.parse(line.slice(HOST_LINE.length)) as {
      error?: string;
      id: number;
      ok: boolean;
      value?: unknown;
    };
    const one = waiting.get(body.id);
    waiting.delete(body.id);
    if (body.ok) {
      one?.resolve(body.value);
    } else {
      one?.reject(new Error(body.error));
    }
  };
  (async () => {
    const decoder = new TextDecoder();
    let pending = "";
    for await (const chunk of child.stdout) {
      pending += decoder.decode(chunk);
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        answered(line);
      }
    }
    const exit = await child.exited;
    for (const one of waiting.values()) {
      one.reject(new Error(`the gate host exited (${exit})`));
    }
    waiting.clear();
  })().catch(() => undefined);
  return {
    call: (verb, args = {}) =>
      new Promise((resolve, reject) => {
        next += 1;
        waiting.set(next, { resolve, reject });
        child.stdin.write(`${JSON.stringify({ id: next, verb, ...args })}\n`);
        child.stdin.flush();
      }),
    end: () => child.kill(),
  };
};

const TAG = "PROBE-GATE";
const MCP_VERSION = "1.11.0";
const PRIVATE = "The person is using the project's browser privately.";
const FORM =
  "data:text/html,<title>Form</title><label>Name <input id=q></label>";
const SHELL_LEGS = ["container", "local"] as const;
type Leg = (typeof SHELL_LEGS)[number];

/** What each leg's shell line dials: the browser's DevTools port and the runtime's socket. */
const shell: Partial<Record<Leg, { devtools: number; socket: string }>> = {};
/** What each delegate printed, by its marker. */
const outputs: Record<string, string> = {};

const marker = (who: string, step: string) => `${TAG}-${who}-${step}-END`;

const shellLine = (who: string, leg: Leg): string => {
  const { devtools, socket } = shell[leg] ?? { devtools: 0, socket: "" };
  return [
    `curl --max-time 3 -s -o /dev/null http://127.0.0.1:${devtools}/json/version; echo "DEVTOOLS-${leg}=$?"`,
    `curl --max-time 3 -s --unix-socket '${socket}' http://localhost/_ping; echo "SOCKET-${leg}=$?"`,
    `echo ${marker(who, leg)}`,
  ].join("; ");
};

/** Each delegate: its workspace named, then one shell line per leg once that leg's browser is live. */
const respond = (request: Seen): Reply => {
  const who = DELEGATE.exec(request.all)?.[1];
  if (!(request.tools && who)) {
    return { everyMs: 5, words: ["ok"] };
  }
  const steps = [
    {
      id: "start",
      command: `echo WS-${who}=$CAWCO_WORKSPACE; echo ${marker(who, "start")}`,
    },
    ...SHELL_LEGS.map((leg) => ({
      id: leg,
      command: shell[leg] ? shellLine(who, leg) : undefined,
    })),
  ];
  for (const step of steps) {
    if (request.all.includes(marker(who, step.id))) {
      outputs[`${who}-${step.id}`] ??= request.all;
      continue;
    }
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: step.command
          ? { command: step.command, description: `Step ${step.id}` }
          : { command: "sleep 3; echo WAITING", description: "Wait" },
      },
    };
  }
  return { everyMs: 5, words: ["done"] };
};

interface McpClient {
  callTool: (call: {
    name: string;
    arguments: object;
  }) => Promise<{ content: { type: string; text?: string }[] }>;
  close: () => Promise<void>;
}

const DELEGATE = /PROBE-GATE-(A|B):/;
const SELECTED = /(\d+):[^\n]*\[selected\]/;
const TEXTBOX = /uid=(\S+) textbox/;

/** chrome-devtools-mcp at the gate as workspace `id`. */
const mcpAs = async (
  port: number,
  id: string,
  token: string,
  realHome: string
): Promise<McpClient> => {
  const sdk =
    "../../../packages/hub/node_modules/@modelcontextprotocol/sdk/dist/esm/client";
  const { Client } = await import(`${sdk}/index.js`);
  const { StdioClientTransport } = await import(`${sdk}/stdio.js`);
  const transport = new StdioClientTransport({
    command: "npx",
    args: [
      "-y",
      `chrome-devtools-mcp@${MCP_VERSION}`,
      `--wsEndpoint=ws://127.0.0.1:${port}/${id}`,
      `--wsHeaders=${JSON.stringify({ Authorization: `Bearer ${token}` })}`,
      "--no-usage-statistics",
    ],
    // npx's cache is the person's, not the fleet's home.
    env: { ...(process.env as Record<string, string>), HOME: realHome },
    // Kept: a server that exits ("Connection closed") says why only here.
    stderr: "pipe",
  });
  let said = "";
  (
    transport as unknown as {
      stderr: NodeJS.ReadableStream | null;
    }
  ).stderr?.on("data", (chunk: Buffer) => {
    said = `${said}${chunk.toString()}`.slice(-4000);
  });
  /** An error with what the server wrote to stderr: the reason it closed. */
  const withStderr = (error: unknown): Error =>
    new Error(
      `chrome-devtools-mcp as ${id}: ${error instanceof Error ? error.message : String(error)}; its stderr: ${said.trim().slice(-1500) || "(nothing)"}`
    );
  const client = new Client({
    name: "browser-gate",
    version: "1",
  }) as McpClient & {
    connect: (transport: unknown) => Promise<void>;
  };
  await client.connect(transport).catch((error: unknown) => {
    throw withStderr(error);
  });
  return {
    callTool: (call) =>
      client.callTool(call).catch((error: unknown) => {
        throw withStderr(error);
      }),
    close: () => client.close(),
  };
};

const called = async (
  client: McpClient,
  name: string,
  args: object = {}
): Promise<{ text: string; image: boolean }> => {
  const result = await client.callTool({ name, arguments: args });
  return {
    text: result.content.map((part) => part.text ?? "").join("\n"),
    image: result.content.some((part) => part.type === "image"),
  };
};

const selected = (list: string): number => Number(SELECTED.exec(list)?.[1]);

interface Raw {
  closed: Promise<{ code: number; reason: string }>;
  send: (
    method: string,
    params?: object,
    sessionId?: string
  ) => Promise<{
    error?: { message: string };
    result?: Record<string, unknown>;
  }>;
  socket: WebSocket;
}

/** A raw CDP connection to the gate as workspace `id`. */
const rawAs = (port: number, id: string, token: string): Promise<Raw> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    } as unknown as string[]);
    let next = 0;
    const waiting = new Map<number, (message: never) => void>();
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      waiting.get(message.id)?.(message as never);
    };
    const closed = new Promise<{ code: number; reason: string }>((done) => {
      socket.onclose = (event) =>
        done({ code: event.code, reason: event.reason });
    });
    socket.onerror = () => reject(new Error(`gate refused ${id}`));
    socket.onopen = () =>
      resolve({
        socket,
        closed,
        send: (method, params, sessionId) =>
          new Promise((answer) => {
            next += 1;
            waiting.set(next, answer);
            socket.send(
              JSON.stringify({
                id: next,
                method,
                params: params ?? {},
                ...(sessionId ? { sessionId } : {}),
              })
            );
          }),
      });
  });

/** What an upgrade to the gate answers before any WebSocket opens. */
const upgradeAnswer = async (port: number, id: string, token: string) => {
  const response = await fetch(`http://127.0.0.1:${port}/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Connection: "Upgrade",
      Upgrade: "websocket",
      "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
    },
  });
  return { status: response.status, text: await response.text() };
};

/** One host's gate checks, A and B through chrome-devtools-mcp and raw CDP. */
const gateChecks = async (
  kit: Kit,
  gateHost: GateHost,
  key: BrowserKey,
  port: number,
  host: string,
  who: Record<"A" | "B", { id: string; token: string }>,
  realHome: string
): Promise<void> => {
  const { check } = kit;
  const words = GATE_WORDS;
  const A = await mcpAs(port, who.A.id, who.A.token, realHome);
  const B = await mcpAs(port, who.B.id, who.B.token, realHome);
  try {
    const opened = await called(A, "new_page", { url: "https://example.com" });
    const pageId = selected(opened.text);
    const snapshot = await called(A, "take_snapshot", { pageId });
    check(
      `${host}: A's new_page https://example.com and take_snapshot work through the gate`,
      snapshot.text.includes("Example Domain"),
      `new_page: ${opened.text.slice(0, 200)}; take_snapshot: ${snapshot.text.slice(0, 300)}`
    );
    const shot = await called(A, "take_screenshot", { pageId });
    const formOpened = await called(A, "new_page", { url: FORM });
    const formId = selected(formOpened.text);
    const formSnapshot = await called(A, "take_snapshot", { pageId: formId });
    const uid = TEXTBOX.exec(formSnapshot.text)?.[1];
    await called(A, "fill", { pageId: formId, uid, value: "gate-filled" });
    const value = await called(A, "evaluate_script", {
      pageId: formId,
      function: "() => document.getElementById('q').value",
    });
    check(
      `${host}: A's take_screenshot answers an image and fill lands (the field reads gate-filled) (C4)`,
      shot.image && value.text.includes("gate-filled"),
      `screenshot image: ${shot.image}; ${value.text.slice(0, 200)}`
    );

    await called(B, "new_page", { url: "about:blank" });
    const bList = await called(B, "list_pages");
    check(
      `${host}: B's list_pages shows B's pages only (A's example.com and form absent)`,
      !(bList.text.includes("example.com") || bList.text.includes("Form")) &&
        bList.text.includes("about:blank"),
      bList.text
    );

    const rawA = await rawAs(port, who.A.id, who.A.token);
    const rawB = await rawAs(port, who.B.id, who.B.token);
    const aTargets = ((await rawA.send("Target.getTargets")).result
      ?.targetInfos ?? []) as { targetId: string; type: string; url: string }[];
    const aPage = aTargets.find((target) => target.url.includes("example.com"));
    const attach = await rawB.send("Target.attachToTarget", {
      targetId: aPage?.targetId,
      flatten: true,
    });
    const activate = await rawB.send("Target.activateTarget", {
      targetId: aPage?.targetId,
    });
    check(
      `${host}: B naming A's page (attachToTarget, activateTarget) answers "${words.others}"`,
      !!aPage &&
        attach.error?.message === words.others &&
        activate.error?.message === words.others,
      JSON.stringify({
        aPage: aPage?.url,
        attach: attach.error,
        activate: activate.error,
      })
    );

    const history = await called(A, "navigate_page", {
      pageId,
      type: "url",
      url: "chrome://history",
    });
    const session = (
      await rawA.send("Target.attachToTarget", {
        targetId: aPage?.targetId,
        flatten: true,
      })
    ).result?.sessionId as string | undefined;
    const navigate = await rawA.send(
      "Page.navigate",
      { url: "chrome://history" },
      session
    );
    const file = await called(A, "new_page", { url: "file:///etc/hostname" });
    check(
      `${host}: A's navigate_page chrome://history is refused, and the gate answers "${words.ownPages}" to Page.navigate chrome://history and new_page file://`,
      !history.text.includes("History") &&
        navigate.error?.message === words.ownPages &&
        file.text.includes(words.ownPages),
      JSON.stringify({
        tool: history.text.slice(0, 200),
        navigate: navigate.error,
        file: file.text.slice(0, 200),
      })
    );

    const cookies = await rawA.send("Network.getAllCookies");
    check(
      `${host}: Network.getAllCookies answers "${words.signIns}"`,
      cookies.error?.message === words.signIns,
      JSON.stringify(cookies)
    );

    await gateHost.call("closeAll", { key, why: PRIVATE });
    const [aClosed, bClosed] = await Promise.all([rawA.closed, rawB.closed]);
    const refused = await upgradeAnswer(port, who.A.id, who.A.token);
    await gateHost.call("open", { key });
    const again = await rawAs(port, who.A.id, who.A.token).then(
      (raw) => {
        raw.socket.close();
        return true;
      },
      () => false
    );
    check(
      `${host}: closeAll drops A and B with 4423, a new connection gets 423 "${PRIVATE}" until open(), then connects`,
      aClosed.code === 4423 &&
        bClosed.code === 4423 &&
        aClosed.reason === PRIVATE &&
        refused.status === 423 &&
        refused.text === PRIVATE &&
        again,
      JSON.stringify({ aClosed, bClosed, refused, again })
    );

    // Tracing records every page of the browser: B connected with its page,
    // A's trace is refused; B's boundary ended, A's trace starts. A page whose
    // trace start failed keeps puppeteer's tracer set, so A traces a new one.
    await called(B, "list_pages");
    const tracedPage = selected(
      (await called(A, "new_page", { url: "about:blank" })).text
    );
    const refusedTrace = await called(A, "performance_start_trace", {
      pageId: tracedPage,
      reload: false,
      autoStop: false,
    });
    await gateHost.call("forget", { key, workspace: who.B.id });
    const freshPage = selected(
      (await called(A, "new_page", { url: "about:blank" })).text
    );
    const trace = await called(A, "performance_start_trace", {
      pageId: freshPage,
      reload: false,
      autoStop: false,
    });
    const stopped = await called(A, "performance_stop_trace", {
      pageId: freshPage,
    });
    check(
      `${host}: with B connected and holding a page, A's performance_start_trace answers "${words.traceShared}"; B gone, A's trace starts and stops`,
      refusedTrace.text.includes(words.traceShared) &&
        trace.text.includes("is being recorded") &&
        stopped.text.includes("has been stopped"),
      JSON.stringify({
        refused: refusedTrace.text.slice(0, 300),
        trace: trace.text.slice(0, 200),
        stopped: stopped.text.slice(0, 200),
      })
    );
  } finally {
    await Promise.allSettled([A.close(), B.close()]);
  }
};

/** Each delegate's shell line of `leg`: DevTools and the runtime's socket refused. */
const shellChecks = async (kit: Kit, leg: Leg): Promise<void> => {
  for (const who of ["A", "B"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one delegate's output, then the other's.
    const out = await until(
      `${who}'s ${leg} shell line`,
      () => outputs[`${who}-${leg}`],
      (text) => text.length > 0,
      300_000
    ).catch(() => "");
    const devtools = Number(
      new RegExp(`DEVTOOLS-${leg}=(\\d+)`).exec(out)?.[1] ?? -1
    );
    const socket = Number(
      new RegExp(`SOCKET-${leg}=(\\d+)`).exec(out)?.[1] ?? -1
    );
    kit.check(
      `${leg}: ${who}'s workspace shell: curl --max-time 3 http://127.0.0.1:${shell[leg]?.devtools}/json/version exit=${devtools} (7, refused), curl --unix-socket ${shell[leg]?.socket} exit=${socket} (≠ 0)`,
      devtools === 7 && socket > 0,
      out.slice(-400)
    );
  }
};

const run = async (kit: Kit): Promise<void> => {
  const realHome = homedir();
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(
    realHome,
    process.platform === "darwin" ? "Library/Caches" : ".cache",
    "ms-playwright"
  );
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const home = fleet.env.HOME as string;
  const repo = join(fleet.sandbox, "code");
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git -c user.name=O -c user.email=o@probe.test add -A && git -c user.name=O -c user.email=o@probe.test commit -qm 'First commit'`
    .cwd(repo)
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Browser gate",
    machineId: "scratch-fleet",
    cwd: repo,
    caw: false,
  });
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  const delegated = async (who: "A" | "B") =>
    fleet.api<{ workspaceId: string }>("/api/work-items", {
      parentInstanceId: parent,
      title: `Gate ${who}`,
      prompt: `${TAG}-${who}: run the steps.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: repo,
    });
  const items = { A: await delegated("A"), B: await delegated("B") };

  // The registry and its gates run in a process of their own started with
  // the fleet's HOME (browser-gate-host.ts: Bun reads HOME once, as a
  // process starts), where the delegates' state dirs are; their browsers
  // live in a data dir of their own.
  const data = await mkdtemp(join(tmpdir(), "cawco-browser-gate-"));
  const key: BrowserKey = `project:${project.id}`;
  // The machine's own agent holds the default gate port: this one is free.
  const probe = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: () => undefined },
  });
  const gatePort = probe.port;
  probe.stop(true);
  // The runtime as this process finds it, with the person's HOME: the
  // fleet's HOME hides a runtime kept under the home dir (Colima's
  // `~/.colima/default/docker.sock` on a Mac), so the gate host is handed its
  // endpoint, as browser-runtime runs it.
  const { findRuntime } =
    await import("../../../packages/agent/src/browser/runtime");
  const runtime = await findRuntime();
  if ("missing" in runtime) {
    kit.check(
      "a container runtime answers on this machine (the container leg needs one)",
      false,
      runtime.missing
    );
    return;
  }
  const gateHost = startGateHost({
    ...(process.env as Record<string, string>),
    HOME: home,
    XDG_DATA_HOME: data,
    CAWCO_BROWSER_GATE_PORT: String(gatePort),
    DOCKER_HOST: `unix://${runtime.endpoint}`,
  });
  try {
    await until(
      "both delegates started",
      () => outputs["A-start"] && outputs["B-start"],
      Boolean,
      300_000
    );
    // Each workspace's state dir in the fleet's home, by its path: this
    // process's own home is the person's.
    const stateFile = (id: string, name: string) =>
      join(home, ".cawco", "workspaces", id, name);
    const tokenOf = async (name: "A" | "B") => {
      const id = items[name].workspaceId;
      const read = (file: string) =>
        readFile(stateFile(id, file), "utf8").then(
          (text) => text.trim(),
          () => ""
        );
      return {
        id,
        token: await read("browser-token"),
        project: await read("project.json"),
      };
    };
    const who = { A: await tokenOf("A"), B: await tokenOf("B") };
    kit.check(
      "each delegate's boundary minted its gate token in its state dir, and keeps the project its gate's key names",
      !!(who.A.token && who.B.token) &&
        who.A.token !== who.B.token &&
        [who.A.project, who.B.project].every(
          (kept) => kept === JSON.stringify(project.id)
        ),
      JSON.stringify({
        A: { id: who.A.id, token: !!who.A.token, project: who.A.project },
        B: { id: who.B.id, token: !!who.B.token, project: who.B.project },
      })
    );
    const socket = runtime.endpoint;
    await gateHost.call("watch");
    // The container leg runs on the container host or not at all: a gate
    // host that finds no runtime fails here, never drifting to the local one.
    const reached = (await gateHost.call("runtime", { hidden: false })) as {
      endpoint?: string;
      missing?: string;
    };
    kit.check(
      `container: the registry reaches the runtime at ${runtime.endpoint}`,
      reached.endpoint === runtime.endpoint,
      JSON.stringify(reached)
    );
    if (reached.endpoint !== runtime.endpoint) {
      return;
    }

    // Reserved, as a session's door reserves it: a record, no ports, and its
    // gate answering on the machine's gate port before the browser starts.
    await gateHost.call("reserve", { key });
    const reserved = (await gateHost.call("record", { key })) as {
      slot?: number;
      state?: string;
    } | null;
    // Routed to this key's gate (a key with none answers 404, GATE_WORDS.none):
    // its shield's sentence comes back, and no browser starts for it.
    await gateHost.call("closeAll", { key, why: PRIVATE });
    const before = await upgradeAnswer(gatePort, who.A.id, who.A.token);
    await gateHost.call("open", { key });
    const still = (await gateHost.call("record", { key })) as {
      slot?: number;
    } | null;
    kit.check(
      `reserved: ${key} has a record and no ports (state ${reserved?.state}), and the gate on 127.0.0.1:${gatePort} routes A to it (${before.status} "${before.text}") before it ever starts`,
      reserved?.slot === undefined &&
        reserved?.state === "asleep" &&
        before.status === 423 &&
        before.text === PRIVATE &&
        still?.slot === undefined,
      JSON.stringify({ reserved, before, still })
    );

    // The container host.
    const live = (await gateHost.call("start", { key })) as BrowserRow;
    const ports = live.ports ?? { devtools: 0 };
    kit.check(
      `container: ${key} live on the ${live.host} host with ports of its own now (DevTools ${ports.devtools}), behind the gate on 127.0.0.1:${gatePort}`,
      live.host === "container" && ports.devtools > 0,
      JSON.stringify(live)
    );
    await gateChecks(kit, gateHost, key, gatePort, "container", who, realHome);
    shell.container = { devtools: ports.devtools, socket };
    await shellChecks(kit, "container");

    // The local host: the runtime gone (its containers stop with it), then
    // hidden. The browser moves; its container and volume are marked to go
    // once the runtime answers again.
    await gateHost.call("stop", { key });
    await gateHost.call("runtime", { hidden: true });
    const local = (await gateHost.call("start", { key })) as BrowserRow;
    const localPorts = local.ports ?? { devtools: 0 };
    const moved = (await gateHost.call("record", { key })) as {
      containerLeft?: boolean;
    } | null;
    kit.check(
      `local (DOCKER_HOST=unix:///nonexistent): ${key} live on the ${local.host} host behind the same gate on 127.0.0.1:${gatePort}, its container marked to be removed`,
      local.host === "local" && moved?.containerLeft === true,
      JSON.stringify({ local, containerLeft: moved?.containerLeft })
    );
    await gateChecks(kit, gateHost, key, gatePort, "local", who, realHome);
    shell.local = { devtools: localPorts.devtools, socket };
    await shellChecks(kit, "local");

    // The runtime back: the container and volume the move left go with the
    // browser's removal (a tick or the next start back in a container
    // removes them the same way).
    await gateHost.call("runtime", { hidden: false });
    await gateHost.call("remove", { key });
    if (!("missing" in runtime)) {
      const name = `cawco-browser-${key.replace(":", "-")}`;
      const containers = await runtime.docker.listContainers({
        all: true,
        filters: { name: [name] },
      });
      const volume = await runtime.docker
        .getVolume(name)
        .inspect()
        .then(
          () => "kept",
          () => "gone"
        );
      kit.check(
        `the runtime back: ${name}'s container and volume are removed with the browser`,
        containers.length === 0 && volume === "gone",
        JSON.stringify({
          containers: containers.map((one) => one.Names),
          volume,
        })
      );
    }
  } finally {
    await gateHost
      .call("runtime", { hidden: false })
      .then(() => gateHost.call("remove", { key }))
      .catch(() => undefined);
    gateHost.end();
    await rm(data, { recursive: true, force: true });
  }
};

const spec: Spec = {
  name: "browser-gate",
  host: "it delegates, so its fleet cuts workspaces whose shells it reads the refusals from",
  run,
};

export default spec;
