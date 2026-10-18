/**
 * A project's browser behind its DevTools gate (Projects spec §5.11, build
 * item 2), on both hosts: a container where the runtime answers, a local
 * Chromium with the runtime hidden (`DOCKER_HOST=unix:///nonexistent`).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), two delegates A and B of one project start their boundaries,
 * which mint each workspace's gate token in its state dir. This process
 * drives the agent's registry with a data dir of its own, as `cawco browser`
 * and the daemon do: it starts the project's browser and serves its gate,
 * reading the delegates' tokens from the fleet's home. chrome-devtools-mcp
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
 * - from each delegate's workspace shell, `curl --max-time 3` to the
 *   browser's DevTools port and to the runtime's socket are both refused.
 *
 * Run on the host, outside every workspace boundary (it starts two, and a
 * boundary hides the runtime's socket):
 *
 *   bun scripts/probe-kit/run.ts browser-gate
 */
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserKey } from "../../../packages/core/src/browser";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

type Browsers = typeof import("../../../packages/agent/src/browser/browsers");
type Gate = typeof import("../../../packages/agent/src/browser/gate");

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
    stderr: "ignore",
  });
  const client = new Client({ name: "browser-gate", version: "1" });
  await client.connect(transport);
  return client as McpClient;
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
  gates: Gate,
  key: BrowserKey,
  port: number,
  host: string,
  who: Record<"A" | "B", { id: string; token: string }>,
  realHome: string
): Promise<void> => {
  const { check } = kit;
  const words = gates.GATE_WORDS;
  const A = await mcpAs(port, who.A.id, who.A.token, realHome);
  const B = await mcpAs(port, who.B.id, who.B.token, realHome);
  try {
    const opened = await called(A, "new_page", { url: "https://example.com" });
    const pageId = selected(opened.text);
    const snapshot = await called(A, "take_snapshot", { pageId });
    check(
      `${host}: A's new_page https://example.com and take_snapshot work through the gate`,
      snapshot.text.includes("Example Domain"),
      snapshot.text.slice(0, 300)
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

    const gate = gates.gateOf(key);
    gate?.closeAll(PRIVATE);
    const [aClosed, bClosed] = await Promise.all([rawA.closed, rawB.closed]);
    const refused = await upgradeAnswer(port, who.A.id, who.A.token);
    gate?.open();
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

  // The registry and gate in this process read the delegates' state dirs in
  // the fleet's home, and keep browsers in a data dir of their own.
  const data = await mkdtemp(join(tmpdir(), "cawco-browser-gate-"));
  const hidden = process.env.DOCKER_HOST;
  process.env.HOME = home;
  process.env.XDG_DATA_HOME = data;
  const key: BrowserKey = `project:${project.id}`;
  const browsers: Browsers =
    await import("../../../packages/agent/src/browser/browsers");
  const gates: Gate = await import("../../../packages/agent/src/browser/gate");
  const { findRuntime } =
    await import("../../../packages/agent/src/browser/runtime");
  try {
    await until(
      "both delegates started",
      () => outputs["A-start"] && outputs["B-start"],
      Boolean,
      300_000
    );
    const tokenOf = async (name: "A" | "B") => {
      const id = items[name].workspaceId;
      const token = (
        await readFile(gates.gateTokenFile(id), "utf8").catch(() => "")
      ).trim();
      return { id, token };
    };
    const who = { A: await tokenOf("A"), B: await tokenOf("B") };
    kit.check(
      "each delegate's boundary minted its gate token in its state dir",
      !!(who.A.token && who.B.token) && who.A.token !== who.B.token,
      `${who.A.id}, ${who.B.id}`
    );
    const runtime = await findRuntime();
    const socket =
      "missing" in runtime ? "/var/run/docker.sock" : runtime.endpoint;
    await browsers.watchBrowsers();

    // The container host.
    const live = await browsers.startBrowser({ key });
    const ports = live.ports ?? { devtools: 0, gate: 0 };
    kit.check(
      `container: ${key} live on the ${live.host} host, gate on 127.0.0.1:${ports.gate}, DevTools ${ports.devtools}`,
      live.host === "container" && !!gates.gateOf(key),
      JSON.stringify(live)
    );
    await gateChecks(kit, gates, key, ports.gate, "container", who, realHome);
    shell.container = { devtools: ports.devtools, socket };
    await shellChecks(kit, "container");

    // The local host: the runtime hidden, the container and its volume gone
    // first (a browser that moves host leaves them).
    await browsers.removeBrowser(key);
    process.env.DOCKER_HOST = "unix:///nonexistent";
    await browsers.browserRuntime(true);
    const local = await browsers.startBrowser({ key });
    const localPorts = local.ports ?? { devtools: 0, gate: 0 };
    kit.check(
      `local (DOCKER_HOST=unix:///nonexistent): ${key} live on the ${local.host} host, gate on 127.0.0.1:${localPorts.gate}`,
      local.host === "local",
      JSON.stringify(local)
    );
    await gateChecks(kit, gates, key, localPorts.gate, "local", who, realHome);
    shell.local = { devtools: localPorts.devtools, socket };
    await shellChecks(kit, "local");
  } finally {
    if (hidden === undefined) {
      delete process.env.DOCKER_HOST;
    } else {
      process.env.DOCKER_HOST = hidden;
    }
    await browsers.browserRuntime(true);
    await browsers.removeBrowser(key).catch(() => undefined);
    process.env.HOME = realHome;
    await rm(data, { recursive: true, force: true });
  }
};

const spec: Spec = {
  name: "browser-gate",
  host: "it delegates, so its fleet cuts workspaces whose shells it reads the refusals from",
  run,
};

export default spec;
