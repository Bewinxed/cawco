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
 * - the shield's `closeAll` drops A and B with 4423 and its short close
 *   sentence whole, a new connection gets
 *   423 with its sentence until `open()`, then connects;
 * - with B connected and holding a page, A's `performance_start_trace` is
 *   refused with the gate's sentence (a trace records every page); B's
 *   boundary ended (`forget`), A's trace starts and stops;
 * - from each delegate's workspace shell, `curl --max-time 3` to the
 *   browser's DevTools port and to the runtime's socket are both refused.
 *
 * Between the legs the browser stops and the runtime is hidden, as a
 * runtime going away leaves it: the browser stays on the container host,
 * refused with the runtime's name, its container and volume kept. With the
 * runtime answering again it is removed (container and volume gone), and
 * made afresh with the runtime hidden it is made on the local host. After
 * the local leg, an httpOnly cookie and a localStorage item are set on the
 * local host over its DevTools; the runtime answers again, the browser moves
 * into a container at rest, and both are read back from the container's
 * Chromium over its own DevTools (never the gate), the local profile gone.
 *
 * Run on the host, outside every workspace boundary (it starts two, and a
 * boundary hides the runtime's socket):
 *
 *   bun scripts/probe-kit/run.ts browser-gate
 */
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { CdpLink } from "../../../packages/agent/src/browser/cdp-takeover";
import {
  BROWSER_LABEL,
  OWNER_LABEL,
  ownedBy,
} from "../../../packages/agent/src/browser/container-host";
import { GATE_WORDS } from "../../../packages/agent/src/browser/gate";
import { keptBrowserOwner } from "../../../packages/agent/src/browser/state";
import {
  type BrowserKey,
  type BrowserRow,
  browserSlug,
  SHIELD_CLOSE_WORDS,
  SHIELD_WORDS,
} from "../../../packages/core/src/browser";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import {
  type BrowserTool,
  browserTool,
  called,
  type SessionEntry,
  selected,
} from "../browser-tool";
import type { Kit, Spec } from "../kit";

/**
 * A page of `link`'s Chromium loaded at `url`, `expression` evaluated there
 * once the page stands at it (`Page.navigate` answers as the navigation
 * commits, before the document's context is the one evaluated in), and its
 * value. A navigation that fails says why.
 */
const evaluateAt = async (
  link: CdpLink,
  url: string,
  expression: string
): Promise<unknown> => {
  const { targetId } = await link.call("Target.createTarget", {
    url: "about:blank",
  });
  const session = await link.attach(String(targetId));
  try {
    const { errorText } = await link.call("Page.navigate", { url }, session);
    if (errorText) {
      throw new Error(`${url} did not load: ${String(errorText)}`);
    }
    await until(
      `the page at ${url}`,
      async () =>
        (
          (await link.call(
            "Runtime.evaluate",
            { expression: "location.href", returnByValue: true },
            session
          )) as { result?: { value?: unknown } }
        ).result?.value,
      (href) => href === url,
      15_000
    );
    const { result } = await link.call(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      session
    );
    return (result as { value?: unknown } | undefined)?.value;
  } finally {
    await link.call("Target.closeTarget", { targetId });
  }
};

/** The Firebase Auth record the move carries, as its SDK keeps a signed-in user (`firebaseLocalStorageDb`). */
const FIREBASE_KEY = "firebase:authUser:probe:[DEFAULT]";
const FIREBASE_AT = 1_700_000_000_123;

/** A page script making Firebase's database, its one record holding a nested object with a Date and an ArrayBuffer. */
const firebaseSeed = (token: string): string => `(async () => {
  const request = indexedDB.open("firebaseLocalStorageDb", 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
  };
  const db = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const tx = db.transaction("firebaseLocalStorage", "readwrite");
  tx.objectStore("firebaseLocalStorage").put({
    fbase_key: ${JSON.stringify(FIREBASE_KEY)},
    value: {
      uid: "probe-user",
      stsTokenManager: { refreshToken: ${JSON.stringify(token)}, expirationTime: ${FIREBASE_AT} },
      createdAt: new Date(${FIREBASE_AT}),
      raw: new Uint8Array([1, 2, 3, 250]).buffer,
    },
  });
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return "seeded";
})()`;

/** A page script answering Firebase's database as it stands: its schema, and its record with each value's type checked. */
const FIREBASE_READ = `(async () => {
  const request = indexedDB.open("firebaseLocalStorageDb");
  const db = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const store = db.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage");
  const record = await new Promise((resolve, reject) => {
    const got = store.get(${JSON.stringify(FIREBASE_KEY)});
    got.onsuccess = () => resolve(got.result);
    got.onerror = () => reject(got.error);
  });
  const value = record && record.value;
  const read = JSON.stringify({
    version: db.version,
    stores: Array.from(db.objectStoreNames),
    keyPath: store.keyPath,
    autoIncrement: store.autoIncrement,
    key: record && record.fbase_key,
    uid: value && value.uid,
    stsTokenManager: value && value.stsTokenManager,
    createdAt: value && value.createdAt instanceof Date ? value.createdAt.getTime() : "not a Date",
    raw: value && value.raw instanceof ArrayBuffer ? Array.from(new Uint8Array(value.raw)) : "not an ArrayBuffer",
  });
  db.close();
  return read;
})()`;

/** What {@link FIREBASE_READ} answers for the record {@link firebaseSeed} made. */
const firebaseExpected = (token: string): string =>
  JSON.stringify({
    version: 1,
    stores: ["firebaseLocalStorage"],
    keyPath: "fbase_key",
    autoIncrement: false,
    key: FIREBASE_KEY,
    uid: "probe-user",
    stsTokenManager: { refreshToken: token, expirationTime: FIREBASE_AT },
    createdAt: FIREBASE_AT,
    raw: [1, 2, 3, 250],
  });

/** How the gate host prefixes its answers. */
const HOST_LINE = "GATE-HOST ";

/**
 * The machine side (browser-gate-host.ts): the registry and its gates in a
 * process started with the fleet's HOME, driven one command at a time.
 */
interface GateHost {
  call: (verb: string, args?: object) => Promise<unknown>;
  /** SIGTERM, as the agent is stopped: it stops the registry first (browser-gate-host.ts). */
  end: () => void;
  /** Its exit code, once it has exited. */
  exited: Promise<number>;
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
    exited: child.exited,
  };
};

const TAG = "PROBE-GATE";
const MCP_VERSION = "1.11.0";
const PRIVATE = SHIELD_WORDS;
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

const DELEGATE = /PROBE-GATE-(A|B):/;
const TEXTBOX = /uid=(\S+) textbox/;

/** chrome-devtools-mcp at the gate as workspace `id`, launched as `entry` says, with the gate's own arguments. */
const mcpAs = (
  port: number,
  id: string,
  token: string,
  entry: SessionEntry
): Promise<BrowserTool> =>
  browserTool(
    entry,
    [
      `--wsEndpoint=ws://127.0.0.1:${port}/${id}`,
      `--wsHeaders=${JSON.stringify({ Authorization: `Bearer ${token}` })}`,
    ],
    id
  );

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

/**
 * The container leg's container is its agent's alone on the runtime: named
 * for the agent's owner (kept in its browsers dir under `data`) and its key,
 * and labelled with both, so another agent of the machine (another fleet,
 * the live one) never finds or removes it.
 */
const ownerCheck = async (
  kit: Kit,
  gateHost: GateHost,
  docker: import("../../../packages/agent/src/browser/runtime").Runtime["docker"],
  data: string,
  key: BrowserKey
): Promise<void> => {
  const owner = await keptBrowserOwner(join(data, "cawco", "browsers"));
  const id = (
    (await gateHost.call("record", { key })) as {
      container?: { id?: string };
    } | null
  )?.container?.id;
  const made = id ? await docker.getContainer(id).inspect() : undefined;
  kit.check(
    `container: ${key}'s container is named for its agent's owner ${owner} and its key, and labelled with both`,
    !!owner &&
      made?.Name === `/cawco-browser-${owner}-${browserSlug(key)}` &&
      made.Config.Labels[BROWSER_LABEL] === key &&
      made.Config.Labels[OWNER_LABEL] === owner,
    JSON.stringify({ owner, name: made?.Name, labels: made?.Config.Labels })
  );
};

/** One host's gate checks, A and B through chrome-devtools-mcp and raw CDP. */
const gateChecks = async (
  kit: Kit,
  gateHost: GateHost,
  key: BrowserKey,
  port: number,
  host: string,
  who: Record<"A" | "B", { id: string; token: string }>,
  entry: SessionEntry
): Promise<void> => {
  const { check } = kit;
  const words = GATE_WORDS;
  const A = await mcpAs(port, who.A.id, who.A.token, entry);
  const B = await mcpAs(port, who.B.id, who.B.token, entry);
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

    await gateHost.call("closeAll", { key });
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
      `${host}: closeAll drops A and B with 4423 and "${SHIELD_CLOSE_WORDS}" whole, a new connection gets 423 with the owner's words whole, "${PRIVATE}", until open(), then connects`,
      aClosed.code === 4423 &&
        bClosed.code === 4423 &&
        aClosed.reason === SHIELD_CLOSE_WORDS &&
        bClosed.reason === SHIELD_CLOSE_WORDS &&
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
  // The runtime as this process finds it, with the person's HOME: the
  // fleet's HOME hides a runtime kept under the home dir (Colima's
  // `~/.colima/default/docker.sock` on a Mac). The fleet's agent and the
  // gate host are both handed its endpoint, as a machine's one agent finds
  // it for both: the boundaries the agent builds deny the socket the
  // registry really dials (boundary.ts `containerSockets`).
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
  const dockerHost = `unix://${runtime.endpoint}`;
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent", [], { DOCKER_HOST: dockerHost });
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const home = fleet.env.HOME as string;
  // The fleet's chrome-devtools as a person adds it; the spec launches the
  // entry the machine's sync set for its sessions (the agent's fleet set),
  // as every session does.
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
  kit.check("the fleet runs chrome-devtools-mcp", put.ok, String(put.status));
  const entry = await until(
    "the machine's sync set the fleet's chrome-devtools for its sessions",
    async () =>
      (
        JSON.parse(
          await readFile(
            join(home, ".local", "share", "cawco", "fleet-mcp-set.json"),
            "utf8"
          ).catch(() => "{}")
        ) as { servers?: Record<string, SessionEntry> }
      ).servers?.["chrome-devtools"],
    (found) => found?.command !== undefined,
    180_000
  );
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
  const gateEnv = {
    ...(process.env as Record<string, string>),
    HOME: home,
    XDG_DATA_HOME: data,
    CAWCO_BROWSER_GATE_PORT: String(gatePort),
    DOCKER_HOST: dockerHost,
  };
  // The machine side, started again in the move's leg as an agent is.
  let gateHost = startGateHost(gateEnv);
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
    await gateHost.call("closeAll", { key });
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
    await ownerCheck(kit, gateHost, runtime.docker, data, key);
    await gateChecks(kit, gateHost, key, gatePort, "container", who, entry);
    shell.container = { devtools: ports.devtools, socket };
    await shellChecks(kit, "container");

    // The runtime gone (its containers stop with it), then hidden: the
    // container browser stays a container browser, refused with the
    // runtime's name, its container and volume kept.
    // What the gate host's agent holds on the runtime for `key`, by its
    // owner label (container-host.ts `ownedBy`), never by a name.
    const owned = async () => {
      const owner = await keptBrowserOwner(join(data, "cawco", "browsers"));
      const held = owner
        ? await ownedBy(runtime.docker, owner, key)
        : { containers: [], volumes: [] };
      return {
        owner,
        containers: held.containers.length,
        volumes: held.volumes.length,
      };
    };
    await gateHost.call("stop", { key });
    await gateHost.call("runtime", { hidden: true });
    const refused = await gateHost.call("start", { key }).then(
      (row) => `started: ${JSON.stringify(row)}`,
      (error: Error) => error.message
    );
    const away = (await gateHost.call("record", { key })) as {
      host?: string;
      runtimeAway?: boolean;
      state?: string;
    } | null;
    const awayKept = await owned();
    kit.check(
      `runtime hidden: ${key} stays on the container host, not live, refused with "isn't answering", its container and volume kept`,
      refused.includes("isn't answering") &&
        away?.host === "container" &&
        away.runtimeAway === true &&
        away.state !== "live" &&
        awayKept.containers === 1 &&
        awayKept.volumes === 1,
      JSON.stringify({ refused, away, ...awayKept })
    );

    // Removed while the runtime answers: the container and volume go with it.
    await gateHost.call("runtime", { hidden: false });
    await gateHost.call("remove", { key });
    const removed = await owned();
    kit.check(
      `removed with the runtime answering: ${key}'s container and volume (owner ${removed.owner}) are gone`,
      removed.containers === 0 && removed.volumes === 0,
      JSON.stringify(removed)
    );

    // The local host: a browser made for the first time with the runtime
    // hidden is made on the host that answers then.
    await gateHost.call("runtime", { hidden: true });
    const local = (await gateHost.call("start", { key })) as BrowserRow;
    const localPorts = local.ports ?? { devtools: 0 };
    kit.check(
      `local (DOCKER_HOST=unix:///nonexistent): ${key}, made afresh, live on the ${local.host} host behind the same gate on 127.0.0.1:${gatePort}`,
      local.host === "local" && localPorts.devtools > 0,
      JSON.stringify(local)
    );
    await gateChecks(kit, gateHost, key, gatePort, "local", who, entry);
    shell.local = { devtools: localPorts.devtools, socket };
    await shellChecks(kit, "local");

    // The runtime installed: the local browser moves into a container, its
    // sign-ins carried. A cookie, a localStorage item and a Firebase-shaped
    // IndexedDB are set on the local host over its own DevTools (the
    // daemon's way in, never the gate), and read back the same way from the
    // container's Chromium.
    const carried = `carried-${Date.now()}`;
    const signedIn = await CdpLink.open(
      `http://127.0.0.1:${localPorts.devtools}`
    );
    try {
      await signedIn.call("Storage.setCookies", {
        cookies: [
          {
            name: "cawco-carried",
            value: carried,
            url: "https://example.com/",
            secure: true,
            httpOnly: true,
            expires: Math.floor(Date.now() / 1000) + 86_400,
          },
        ],
      });
      await evaluateAt(
        signedIn,
        "https://example.com/",
        `localStorage.setItem("cawco-carried", ${JSON.stringify(carried)})`
      );
      await evaluateAt(signedIn, "https://example.com/", firebaseSeed(carried));
    } finally {
      signedIn.close();
    }

    // A move cut short: the runtime back, and the agent stopped once the
    // move's container stands and before the record's one write. Its stop
    // aborts the move, whose failure path removes what it made.
    await gateHost.call("runtime", { hidden: false });
    const cut = await until(
      `the move's container for ${key}, before its record is written`,
      async () => {
        const record = (await gateHost.call("record", { key })) as {
          host?: string;
        } | null;
        if (record?.host !== "local") {
          return "written";
        }
        return (await owned()).containers > 0 ? "standing" : undefined;
      },
      Boolean,
      300_000
    ).catch(() => "never");
    gateHost.end();
    const exit = await gateHost.exited;
    const afterStop = await owned();
    const stillLocal = (
      (await readFile(
        join(data, "cawco", "browsers", browserSlug(key), "record.json"),
        "utf8"
      ).then(
        (text) => JSON.parse(text) as { host?: string },
        () => ({})
      )) as { host?: string }
    ).host;
    kit.check(
      `the agent stopped mid-move (its container standing, the record unwritten): its stop removes the move's container and volume, and the record stays on the local host`,
      cut === "standing" &&
        afterStop.containers === 0 &&
        afterStop.volumes === 0 &&
        stillLocal === "local",
      JSON.stringify({ cut, exit, afterStop, host: stillLocal })
    );

    // The agent started again: the move runs whole.
    gateHost = startGateHost(gateEnv);
    await gateHost.call("watch");
    await gateHost.call("runtime", { hidden: false });
    const moved = await until(
      `${key} live on the container host`,
      async () =>
        (await gateHost.call("record", { key })) as {
          container?: { ports?: { devtools?: number } };
          host?: string;
          state?: string;
        } | null,
      (record) => record?.host === "container" && record.state === "live",
      300_000
    ).catch(() => null);
    const at = moved?.container?.ports?.devtools;
    let read: { cookie?: unknown; database?: unknown; item?: unknown } = {};
    if (at) {
      const container = await CdpLink.open(`http://127.0.0.1:${at}`);
      try {
        const { cookies } = await container.call("Storage.getCookies");
        const cookie = (
          (cookies ?? []) as {
            name: string;
            value: string;
            httpOnly: boolean;
          }[]
        ).find((one) => one.name === "cawco-carried");
        read = {
          cookie,
          item: await evaluateAt(
            container,
            "https://example.com/",
            `localStorage.getItem("cawco-carried")`
          ),
          database: await evaluateAt(
            container,
            "https://example.com/",
            FIREBASE_READ
          ),
        };
      } finally {
        container.close();
      }
    }
    const profile = join(
      data,
      "cawco",
      "browsers",
      browserSlug(key),
      "profile"
    );
    const profileGone = await stat(profile).then(
      () => false,
      () => true
    );
    const afterMove = await owned();
    const cookie = read.cookie as
      { httpOnly?: boolean; value?: string } | undefined;
    kit.check(
      `the runtime back: ${key} moves into a container at rest (one container), its httpOnly cookie, localStorage item and firebaseLocalStorageDb read back from the container's Chromium over its own DevTools (127.0.0.1:${at}), the database exactly, and its local profile (${profile}) gone`,
      moved?.host === "container" &&
        afterMove.containers === 1 &&
        cookie?.value === carried &&
        cookie.httpOnly === true &&
        read.item === carried &&
        read.database === firebaseExpected(carried) &&
        profileGone,
      JSON.stringify({
        host: moved?.host,
        state: moved?.state,
        afterMove,
        cookie,
        item: read.item,
        database: read.database,
        profileGone,
      })
    );
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
