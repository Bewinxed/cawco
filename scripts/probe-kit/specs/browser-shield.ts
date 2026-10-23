/**
 * The shield (Projects spec §5.11, build item 3) on both hosts: a container
 * where the runtime answers, a local Chromium with the runtime hidden
 * (`DOCKER_HOST=unix:///nonexistent`).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) whose fleet runs chrome-devtools-mcp, two sessions A and B of
 * one project each have their browser door (agent door.ts); this spec drives
 * the gate with raw CDP through those doors, as their browser tools would.
 * A's `browser_ask` is called through the hub's tool door with A's own
 * credential. The hub is pointed at a Cawrier stand-in with one paired
 * device, so the ask's push is read as it leaves. On each host:
 *
 * - the ask parks: `/api/pending` lists it as a browser ask for A, and its
 *   push goes as `CAWCO_BROWSER`;
 * - `/takeover` with A's session credential answers 403 "Only the person
 *   takes over";
 * - `/takeover` from the dashboard: A's gate connection is cut with 4423, a
 *   new connection as B is refused 423 with the shield's sentence, and B's
 *   conversation hears the notice line;
 * - container host: a viewer's neko session given control (`host_id`);
 *   local host: the daemon's CDP take-over transport sends frames of the
 *   page and a tap lands on it (check C11), driven here through the same
 *   module the daemon runs, on the browser's own DevTools port;
 * - `/handback`: control reset and the clipboard empty (container), the
 *   page loaded again by GET (a mark A left on it is gone, its navigation a
 *   `navigate`), the gate open to A again; A's tool answers in the words
 *   the hub's presenter gives a hand-back on https://example.com
 *   (browser-tools.ts `browserAnsweredWords`), and nothing else;
 * - the agent restarted mid-take-over: its gate's first answer, as soon as
 *   it listens again, is 423 with the shield's sentence (browsers.ts
 *   `gateFor` makes it closed from the record's `takeover`), and the
 *   take-over still hands back as below;
 * - a second ask taken over with no view for two minutes is handed back by
 *   the daemon, and A's tool answers the same words;
 * - on the local leg (the agent's runtime hidden), the container leg's
 *   browser is still a container browser: not live, its why naming the
 *   runtime that isn't answering, its volume kept; with the runtime back it
 *   is live again on the container host by itself, the same volume.
 *
 * Run on the host, outside every workspace boundary (a boundary hides the
 * runtime's socket and the browser's ports):
 *
 *   bun scripts/probe-kit/run.ts browser-shield
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one host at a time, the agent relaunched between them
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import {
  type BrowserKey,
  SHIELD_WORDS,
} from "../../../packages/core/src/browser";
import { browserAnsweredWords } from "../../../packages/hub/src/browser-tools";
import { toolWords } from "../../lib/tool-call";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const MCP_VERSION = "1.11.0";
const ORIGIN = "https://example.com";
const REASON = "Sign in to Example so I can read the page behind it.";
const SHIELD = SHIELD_WORDS;
const ONLY_THE_PERSON = "Only the person takes over";
/** What A reads once the person hands the browser back on {@link ORIGIN}. */
const HANDED_BACK = browserAnsweredWords({
  outcome: "handed_back",
  origin: ORIGIN,
});
const TAP_PAGE =
  "data:text/html,<title>untapped</title><button style='position:fixed;inset:0' onclick=\"document.title='tapped'\">tap</button>";
/** The daemon hands back after two minutes with no view, counted every 5 s. */
const UNWATCHED_MS = 2 * 60_000 + 30_000;

/** Whether a conversation heard the take-over's notice. */
const heard = { notice: false };

const respond = (request: Seen): Reply => {
  if (request.all.includes(SHIELD)) {
    heard.notice = true;
  }
  return { everyMs: 5, words: ["ok"] };
};

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

interface Door {
  authorization: string;
  url: string;
}

/** A session's door, as its browser tool reads it (agent door.ts `browser-mcp.json`). */
const doorOf = async (home: string, id: string): Promise<Door> => {
  const config = (await Bun.file(
    join(home, ".cawco", "workspaces", id, "browser-mcp.json")
  ).json()) as { wsEndpoint: string; wsHeaders: string };
  return {
    url: config.wsEndpoint,
    authorization: (JSON.parse(config.wsHeaders) as { Authorization: string })
      .Authorization,
  };
};

/** A raw CDP connection through a door. */
const rawAt = (door: Door): Promise<Raw> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(door.url, {
      headers: { Authorization: door.authorization },
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
    socket.onerror = () => reject(new Error(`the gate refused ${door.url}`));
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

/** What an upgrade through a door answers before any WebSocket opens. */
const upgradeAnswer = async (door: Door) => {
  const response = await fetch(door.url.replace("ws://", "http://"), {
    headers: {
      Authorization: door.authorization,
      Connection: "Upgrade",
      Upgrade: "websocket",
      "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
    },
  });
  return { status: response.status, text: await response.text() };
};

/** A page of `raw`'s opened at `url`, attached; its session. */
const pageAt = async (raw: Raw, url: string) => {
  const made = await raw.send("Target.createTarget", { url });
  const targetId = made.result?.targetId as string;
  const attached = await raw.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const session = attached.result?.sessionId as string;
  await raw.send("Page.enable", {}, session);
  await Bun.sleep(2000);
  return { targetId, session };
};

const evaluate = async (raw: Raw, session: string, expression: string) =>
  (
    await raw.send(
      "Runtime.evaluate",
      { expression, returnByValue: true },
      session
    )
  ).result?.result as { value?: unknown } | undefined;

/** Whether the volume a container record names (its sign-ins) is on the runtime, read from the runtime itself. */
const volumeOf = async (
  volume: string | undefined
): Promise<"kept" | "gone"> => {
  const { findRuntime } =
    await import("../../../packages/agent/src/browser/runtime");
  const found = await findRuntime();
  if ("missing" in found || !volume) {
    return "gone";
  }
  return found.docker
    .getVolume(volume)
    .inspect()
    .then(
      () => "kept" as const,
      () => "gone" as const
    );
};

/** What a page holds now, or undefined while it answers nothing (it is loading). */
const readPage = async (raw: Raw, session: string) => {
  const read = await readWithin(5000, () =>
    evaluate(
      raw,
      session,
      "JSON.stringify({ href: location.href, title: document.title, mark: window.__probeMark ?? null, navigation: performance.getEntriesByType('navigation')[0]?.type ?? null })"
    )
  );
  return read.kind === "answered" && typeof read.value?.value === "string"
    ? (JSON.parse(read.value.value) as {
        href: string;
        mark: string | null;
        navigation: string | null;
        title: string;
      })
    : undefined;
};

/** A session's process's own credential (its environment). */
const credentialOf = async (fleet: KitFleet, id: string): Promise<string> =>
  (await Bun.file(`/proc/${await fleet.sessionPid(id)}/environ`).text())
    .split("\0")
    .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
    ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";

/** `browser_ask` called through the hub's tool door as session `id`: the words its agent reads, or the refusal's marked as one. */
const ask = (fleet: KitFleet, id: string, credential: string) =>
  readWithin(10 * 60_000, async () => {
    // The client's own bound past this read's: the read answers first.
    const said = await toolWords(
      { base: fleet.base, id, credential },
      "browser_ask",
      { reason: REASON, origin: ORIGIN },
      { timeoutMs: 11 * 60_000 }
    );
    return said.refused ? `refused: ${said.text}` : said.text;
  });

/** The browser ask parked for session `id`, as `/api/pending` lists it. */
const parkedFor = (fleet: KitFleet, id: string) =>
  until(
    `${id}'s browser ask parked`,
    async () =>
      (
        (await (await fetch(`${fleet.base}/api/pending`)).json()) as {
          instanceId?: string;
          requestId?: string;
          payload?: { toolName?: string; browserAsk?: { key: string } };
        }[]
      ).find(
        (one) =>
          one.instanceId === id &&
          one.payload?.toolName === "mcp__cawco__browser_ask"
      ),
    (one) => !!one,
    60_000
  );

const post = async (
  fleet: KitFleet,
  path: string,
  body: object,
  authorization?: string
) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
};

/** The pushes the Cawrier stand-in took, by their APNs category. */
const pushed: string[] = [];

const cawrier = () =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const body = (await request.json().catch(() => ({}))) as {
        payload?: { aps?: { category?: string } };
      };
      if (body.payload?.aps?.category) {
        pushed.push(body.payload.aps.category);
      }
      return Response.json({ ok: true });
    },
  });

/** neko's REST as the browser's admin or its viewer, from the browser's record. */
const nekoAs = async (key: BrowserKey, as: "admin" | "viewer") => {
  const { readBrowser, portsOf } =
    await import("../../../packages/agent/src/browser/state");
  const record = await readBrowser(key);
  if (!record?.container) {
    throw new Error(`${key} runs on no container`);
  }
  const base = `http://127.0.0.1:${portsOf(record).http}/api`;
  const login = (await (
    await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: as === "admin" ? "cawco" : "viewer",
        password:
          as === "admin"
            ? record.container.adminPassword
            : record.container.userPassword,
      }),
    })
  ).json()) as { id: string; token: string };
  const get = async (path: string) =>
    (await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${login.token}` },
    }).then((response) => response.json())) as Record<string, unknown>;
  const send = async (path: string, body?: object) => {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${login.token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, text: await response.text() };
  };
  return { id: login.id, get, post: send };
};

/** The local host's take-over transport on page `targetId`: frames read and a tap sent (check C11). */
const cdpTransport = async (key: BrowserKey, targetId: string) => {
  const { readBrowser, portsOf } =
    await import("../../../packages/agent/src/browser/state");
  const { CdpTakeover } =
    await import("../../../packages/agent/src/browser/cdp-takeover");
  const record = await readBrowser(key);
  const takeover = await CdpTakeover.start(
    `http://127.0.0.1:${record ? portsOf(record).devtools : 0}`,
    targetId
  );
  const frames: { width: number; height: number; bytes: number }[] = [];
  const leave = await takeover.attach({
    send: (frame) => {
      const header = new DataView(frame.buffer, frame.byteOffset, 4);
      frames.push({
        width: header.getUint16(0),
        height: header.getUint16(2),
        bytes: frame.length - 4,
      });
    },
    close: () => undefined,
  });
  await Bun.sleep(2000);
  await takeover.input({ t: "tap", x: 200, y: 200 });
  await Bun.sleep(1000);
  leave();
  await takeover.stop();
  return frames;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one host's leg of the spec, in the order a person takes it, a check at each step
async function leg(
  kit: Kit,
  fleet: KitFleet,
  host: "container" | "local",
  key: BrowserKey,
  A: string,
  B: string,
  /** The agent stopped and started again, on the same runtime. */
  restart: () => Promise<void>,
  /** The container leg's browser, on the local leg: it must stay where it ran. */
  earlier?: BrowserKey
): Promise<void> {
  const home = fleet.env.HOME as string;
  const doorA = await doorOf(home, A);
  const doorB = await doorOf(home, B);
  const credentialA = await credentialOf(fleet, A);
  let rawA = await rawAt(doorA);
  const rawB = await rawAt(doorB);
  const page = await pageAt(rawA, ORIGIN);
  // The page really loaded from the site: a hand-back's GET goes to it
  // again, and a browser that cannot reach it says so here, not later.
  const loaded = await until(
    `${host}: A's page loaded ${ORIGIN}`,
    () => readPage(rawA, page.session),
    (read) => read?.title === "Example Domain",
    30_000
  ).catch(() => undefined);
  kit.check(
    `${host}: A's page loaded ${ORIGIN} (title "${loaded?.title}")`,
    loaded?.title === "Example Domain",
    JSON.stringify(loaded)
  );
  await evaluate(rawA, page.session, "window.__probeMark = 'typed'");
  await pageAt(rawB, "about:blank");
  const tap = host === "local" ? await pageAt(rawA, TAP_PAGE) : undefined;

  // The ask parks, lands on every screen and goes to the phone.
  const answered = ask(fleet, A, credentialA);
  const parked = await parkedFor(fleet, A);
  const requestId = parked?.requestId ?? "";
  const push = await until(
    "the ask's push",
    () => pushed.includes("CAWCO_BROWSER"),
    Boolean,
    30_000
  ).catch(() => false);
  kit.check(
    `${host}: ask parked requestId=${requestId}, Needs you lists it, push category CAWCO_BROWSER queued`,
    !!parked && parked.payload?.browserAsk?.key === key && push,
    JSON.stringify({ parked: parked?.payload?.browserAsk, pushed })
  );

  const asSession = await post(
    fleet,
    `/api/browsers/${encodeURIComponent(key)}/takeover`,
    { requestId },
    `Bearer ${credentialA}`
  );
  kit.check(
    `${host}: POST /takeover with a session credential → ${asSession.status} ${asSession.text}`,
    asSession.status === 403 && asSession.text === ONLY_THE_PERSON,
    JSON.stringify(asSession)
  );

  const taken = await post(
    fleet,
    `/api/browsers/${encodeURIComponent(key)}/takeover`,
    { requestId, machineId: "scratch-fleet" }
  );
  const cut = await readWithin(30_000, () => rawA.closed);
  const refused = await upgradeAnswer(doorB);
  const notice = await until(
    "B heard the notice",
    () => heard.notice,
    Boolean,
    60_000
  ).catch(() => false);
  kit.check(
    `${host}: POST /takeover (dashboard) → A's gate closed 4423; B's connection answers the refusal sentence; B's transcript holds the notice line`,
    taken.status === 200 &&
      cut.kind === "answered" &&
      cut.value.code === 4423 &&
      refused.status === 423 &&
      refused.text === SHIELD &&
      notice,
    JSON.stringify({ taken, cut, refused, notice })
  );

  // The person's neko session: control is given to it, and what it copies is
  // its own (neko judges each call by the session it comes as).
  let viewer: Awaited<ReturnType<typeof nekoAs>> | undefined;
  if (host === "container") {
    viewer = await nekoAs(key, "viewer");
    await post(fleet, `/api/browsers/${encodeURIComponent(key)}/takeover`, {
      requestId,
      machineId: "scratch-fleet",
      viewer: viewer.id,
    });
    const admin = await nekoAs(key, "admin");
    const control = await admin.get("/room/control");
    kit.check(
      `${host}: neko control host_id = viewer session (${viewer.id})`,
      control.host_id === viewer.id,
      JSON.stringify(control)
    );
  } else if (tap) {
    const frames = await cdpTransport(key, tap.targetId);
    kit.check(
      `${host}: the CDP take-over sends frames of the page (${frames.length}, ${frames[0]?.width}x${frames[0]?.height}) and a tap lands (C11)`,
      frames.length > 0 &&
        (frames[0]?.width ?? 0) > 0 &&
        (frames[0]?.bytes ?? 0) > 0,
      JSON.stringify(frames.slice(0, 3))
    );
  }

  // The daemon restarted mid-take-over: the gate it makes again is closed
  // from its very first answer, before the hub sends the shield again.
  await restart();
  const reopened = await until(
    "the gate answers again",
    // Refused while the agent is still starting: no answer yet.
    async () =>
      (await Promise.allSettled([upgradeAnswer(doorB)]))
        .map((one) => (one.status === "fulfilled" ? one.value : undefined))
        .at(0),
    (answer) => answer !== undefined,
    120_000
  ).catch(() => undefined);
  kit.check(
    `${host}: the agent restarted mid-take-over: its gate's first answer is ${reopened?.status} "${reopened?.text}"`,
    reopened?.status === 423 && reopened.text === SHIELD,
    JSON.stringify(reopened)
  );

  // The container leg's browser, still held if its hand-back failed, or
  // asleep if it went: either way never moved to this host under the person.
  if (earlier) {
    const { readBrowser } =
      await import("../../../packages/agent/src/browser/state");
    const kept = await readBrowser(earlier);
    const volume = await volumeOf(kept?.container?.volume);
    kit.check(
      `${host}: with the runtime hidden, the container leg's browser ${earlier} is still a container browser, ${kept?.state} and not live ("${kept?.why}"), its volume ${volume}`,
      kept?.host === "container" &&
        kept.state !== "live" &&
        kept.runtimeAway === true &&
        !!kept.why?.includes("isn't answering") &&
        volume === "kept",
      JSON.stringify({ host: kept?.host, state: kept?.state, why: kept?.why })
    );
  }

  // What the person copied while they held it: the hand-back empties it.
  const copied =
    viewer === undefined
      ? undefined
      : await viewer.post("/room/clipboard", { text: "probe-secret" });
  const back = await post(
    fleet,
    `/api/browsers/${encodeURIComponent(key)}/handback`,
    { machineId: "scratch-fleet" }
  );
  // Admitted the moment /handback answered: no wait between the two.
  const admitted = await rawAt(doorA).then(
    (raw) => ({ raw, refused: null }),
    (error: unknown) => ({ raw: undefined, refused: String(error) })
  );
  kit.check(
    `${host}: POST /handback answers ${back.status} and A's gate admits at once`,
    back.status === 200 && !!admitted.raw,
    JSON.stringify({ back, refused: admitted.refused, copied })
  );
  if (!admitted.raw) {
    return;
  }
  rawA = admitted.raw;
  const attached = await rawA.send("Target.attachToTarget", {
    targetId: page.targetId,
    flatten: true,
  });
  const session = attached.result?.sessionId as string;
  // Cleared at once, then loading from the site again: read once it settles
  // (a page still loading answers nothing).
  const after = await until(
    `${host}: A's page loaded again after the hand-back`,
    () => readPage(rawA, session),
    (read) => !!read && read.href !== "about:blank",
    90_000
  ).catch(() => undefined);
  let reset = true;
  let clipboard: unknown = "";
  if (host === "container") {
    const admin = await nekoAs(key, "admin");
    reset = (await admin.get("/room/control")).has_host !== true;
    // neko serves the clipboard to its host alone: read as the admin hosting
    // for a moment, then left with no host again.
    await admin.post("/room/control/take");
    // neko leaves an empty clipboard's text out (room/clipboard.go,
    // `Text string \`json:"text,omitempty"\``): absent is empty.
    clipboard = (await admin.get("/room/clipboard")).text ?? "";
    await admin.post("/room/control/reset");
  }
  kit.check(
    `${host}: POST /handback → control reset, clipboard "", page loaded again by GET, gate open`,
    back.status === 200 &&
      reset &&
      clipboard === "" &&
      after?.mark === null &&
      after.href.startsWith(ORIGIN) &&
      after.navigation === "navigate",
    JSON.stringify({ back, reset, clipboard, after })
  );
  if (tap) {
    const tapAttached = await rawA.send("Target.attachToTarget", {
      targetId: tap.targetId,
      flatten: true,
    });
    const title = await evaluate(
      rawA,
      tapAttached.result?.sessionId as string,
      "document.title"
    );
    kit.check(
      `${host}: the tap landed on the page (its title reads "${String(title?.value)}")`,
      title?.value === "tapped",
      JSON.stringify(title)
    );
  }
  const said = await answered;
  kit.check(
    `${host}: A's tool answered "${HANDED_BACK}"`,
    said.kind === "answered" && said.value === HANDED_BACK,
    JSON.stringify(said)
  );

  // No view for two minutes: the daemon hands back itself.
  const again = ask(fleet, A, credentialA);
  const second = await parkedFor(fleet, A);
  await post(fleet, `/api/browsers/${encodeURIComponent(key)}/takeover`, {
    requestId: second?.requestId,
    machineId: "scratch-fleet",
  });
  const started = Date.now();
  const auto = await readWithin(UNWATCHED_MS + 60_000, () => again);
  kit.check(
    `${host}: viewers 0 for 2 min → handed back by the daemon in ${Math.round((Date.now() - started) / 1000)} s, the same words`,
    auto.kind === "answered" &&
      auto.value.kind === "answered" &&
      auto.value.value === HANDED_BACK,
    JSON.stringify(auto)
  );
  rawA.socket.close();
  rawB.socket.close();
}

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
  const stand = cawrier();
  const agentOn = async (dockerHost: string) => {
    fleet.launch("agent", [], {
      DOCKER_HOST: dockerHost,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    });
    await fleet.agentUp();
  };
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub", [], {
    CAWCO_CAWRIER_ORIGIN: `http://127.0.0.1:${stand.port}`,
  });
  await fleet.hubUp();
  fleet.fileAccount();
  await agentOn(`unix://${runtime.endpoint}`);
  await fleet.accountSignedIn();
  process.env.XDG_DATA_HOME = fleet.env.XDG_DATA_HOME as string;

  const registered = await post(fleet, "/api/push/register", {
    pairingId: crypto.randomUUID(),
    secret: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
      "base64url"
    ),
    key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
      "base64"
    ),
    name: "Probe phone",
    platform: "ios",
  });
  kit.check(
    "a paired device stands for the phone (Cawrier stand-in)",
    registered.status === 200,
    JSON.stringify(registered)
  );

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
  await until(
    "the machine applied the fleet's chrome-devtools",
    () =>
      fleet
        .query<{ fleet: string | null }>("SELECT fleet FROM agents")
        .map((row) => row.fleet ?? "")
        .find((text) => text.includes("chrome-devtools")),
    (text) =>
      (JSON.parse(text) as { mcp?: Record<string, { state?: string }> }).mcp?.[
        "chrome-devtools"
      ]?.state === "applied",
    180_000
  );

  let containerKey: BrowserKey | undefined;
  for (const host of ["container", "local"] as const) {
    const dockerHost =
      host === "local" ? "unix:///nonexistent" : `unix://${runtime.endpoint}`;
    if (host === "local") {
      // The runtime hidden: the agent again, its browsers local from here.
      await fleet.stop("agent");
      await agentOn(dockerHost);
    }
    const repo = join(fleet.sandbox, `shield-${host}`);
    await mkdir(repo, { recursive: true });
    await Bun.$`git init -q -b main && echo code > README.md && git -c user.name=O -c user.email=o@probe.test add -A && git -c user.name=O -c user.email=o@probe.test commit -qm 'First commit'`
      .cwd(repo)
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: `Shield ${host}`,
      machineId: "scratch-fleet",
      cwd: repo,
      caw: false,
    });
    const A = await fleet.spawn("claude", `Shield A ${host}`, repo, {
      projectId: project.id,
    });
    const B = await fleet.spawn("claude", `Shield B ${host}`, repo, {
      projectId: project.id,
    });
    heard.notice = false;
    const key: BrowserKey = `project:${project.id}`;
    await leg(
      kit,
      fleet,
      host,
      key,
      A,
      B,
      async () => {
        await fleet.stop("agent");
        await agentOn(dockerHost);
      },
      host === "local" ? containerKey : undefined
    );
    containerKey ??= key;
  }
  // The runtime back: the container browser starts again by itself, on the
  // container host, its volume (its sign-ins) the one it had.
  if (containerKey) {
    const back = containerKey;
    await fleet.stop("agent");
    await agentOn(`unix://${runtime.endpoint}`);
    const { readBrowser } =
      await import("../../../packages/agent/src/browser/state");
    const kept = await until(
      `${back} live again on the container host`,
      () => readBrowser(back),
      (record) => record?.state === "live" && record.host === "container",
      180_000
    ).catch(() => undefined);
    const volume = await volumeOf(kept?.container?.volume);
    kit.check(
      `the runtime back: ${back} is live again on the ${kept?.host} host by itself, its volume ${volume}`,
      kept?.state === "live" &&
        kept.host === "container" &&
        !kept.runtimeAway &&
        volume === "kept",
      JSON.stringify({ host: kept?.host, state: kept?.state, why: kept?.why })
    );
  }
  stand.stop(true);
};

const spec: Spec = {
  name: "browser-shield",
  host: "it runs the project's browser, whose runtime socket and ports no workspace boundary reaches",
  run,
};

export default spec;
