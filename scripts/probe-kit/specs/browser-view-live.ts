/**
 * The browser view on a real browser (Projects spec §5.11, item 6): a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model) whose fleet runs chrome-devtools-mcp, a project's browser in a real
 * neko container on this host's runtime, and the person's view in a
 * headless Chromium on the built dashboard (the session's panel).
 *
 * - The agent opens example.com through its session's browser door (the
 *   gate), and puts a field on the page, as an agent's page has one.
 * - Take over from the panel's head: the viewer's `getStats()` shows a
 *   selected candidate pair, the band says "You have control", and the
 *   well's edge layer (`browser-edge`) rings `brand-solid` once its
 *   transition has landed.
 * - Typing lands: a press on the stream over the field, then the person's
 *   keys; the field's value is read through the daemon's own DevTools link
 *   to the browser (never the gate, which the shield holds closed).
 * - The page's origin is live: a navigation of the page in front during
 *   the take-over reaches the band within 2 s of `Page.navigate`, read on
 *   each animation frame, and the row's `origin` (`GET /api/browsers`)
 *   names it.
 * - Hand back: the session's next read through its door is the page loaded
 *   again by GET, with no typed text in it.
 * - Remove: a session's credential is refused in its words, a held browser
 *   is refused, and the person's remove takes the container and its volume
 *   (the row gone from `/api/browsers`). Forgetting a project whose browser
 *   runs again takes them the same way, once its session's stop is
 *   confirmed (the hub forgets no project something of still runs).
 * - Not connected, for real: a second viewer whose peer is given only
 *   candidates of neko's at an address that answers nothing (192.0.2.1),
 *   its own kept back, so no pair connects: whichever end gives up first
 *   (the viewer's `iceconnectionstatechange` "failed", or neko's
 *   `signal/close`), the view says "The stream couldn't connect from here"
 *   with Try again and Set up the stream relay at the first failure, not
 *   after neko's client has retried ten times.
 *
 * The local host's view is browser-view-local's, which needs no runtime.
 *
 * Run on the host, outside every workspace boundary (a boundary hides the
 * runtime's socket and the browser's ports):
 *
 *   bun scripts/probe-kit/run.ts browser-view-live
 */
// biome-ignore-all lint/performance/noAwaitInLoops: a page's peers read one at a time, newest first, the first connected one answering
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { ownedBy } from "../../../packages/agent/src/browser/container-host";
import { keptBrowserOwner } from "../../../packages/agent/src/browser/state";
import { Gone, readWithin } from "../../../packages/core/src/bounded";
import type { BrowserKey } from "../../../packages/core/src/browser";
import { type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { COMPOSER, open, ROOT, settle } from "../kit";

const MCP_VERSION = "1.11.0";
const ORIGIN = "https://example.com";
const MOVED = "https://www.iana.org";
const TYPED = "probe-typed-by-the-person";
const CAPTURES = join(ROOT, ".probe", "browser-view-live");
const REMOVE_REFUSED = "Only the person forgets a browser's sign-ins";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

interface Door {
  authorization: string;
  url: string;
}

interface Raw {
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

/** A session's door, as its browser tool reads it (agent door.ts `browser-mcp.json`). */
export const doorOf = async (home: string, id: string): Promise<Door> => {
  const config = (await Bun.file(
    join(home, ".cawco", "workspaces", id, "browser-mcp.json")
  ).json()) as { wsEndpoint: string; wsHeaders: string };
  return {
    url: config.wsEndpoint,
    authorization: (JSON.parse(config.wsHeaders) as { Authorization: string })
      .Authorization,
  };
};

/** How long a CDP call may go unanswered before it is an answer of its own, an error; our call. */
const CALL_MS = 30_000;

type Answer = Awaited<ReturnType<Raw["send"]>>;

/** A socket at `url` once it opens; closed and failed when `signal` aborts first. */
const opened = (
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers } as unknown as string[]);
    signal.addEventListener("abort", () => socket.close(), { once: true });
    socket.onerror = () => reject(new Error(`${url} refused`));
    socket.onclose = () => reject(new Gone(`${url} closed before it opened`));
    socket.onopen = () => resolve(socket);
  });

/**
 * A raw CDP connection at `url`, with `headers` (a door's, or none for the
 * daemon's own port). It opens within {@link CALL_MS} or throws; every call
 * answers: the browser's reply, or an error naming the call once it has gone
 * {@link CALL_MS} unanswered or the socket closed under it.
 */
export const rawAt = async (
  url: string,
  headers: Record<string, string> = {}
): Promise<Raw> => {
  const opening = await readWithin(CALL_MS, (signal) =>
    opened(url, headers, signal)
  );
  if (opening.kind === "unanswered") {
    throw new Error(
      `${url} didn't open within ${CALL_MS / 1000} s (${opening.reason})`
    );
  }
  const socket = opening.value;
  let next = 0;
  const waiting = new Map<
    number,
    { answer: (message: Answer) => void; gone: (error: Gone) => void }
  >();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as Answer & {
      id?: number;
    };
    if (message.id !== undefined) {
      waiting.get(message.id)?.answer(message);
    }
  };
  socket.onclose = () => {
    for (const call of [...waiting.values()]) {
      call.gone(new Gone(`${url} closed with the call unanswered`));
    }
  };
  const send: Raw["send"] = async (method, params, sessionId) => {
    next += 1;
    const id = next;
    const call = await readWithin(
      CALL_MS,
      (signal) =>
        new Promise<Answer>((answer, gone) => {
          waiting.set(id, { answer, gone });
          signal.addEventListener("abort", () => waiting.delete(id), {
            once: true,
          });
          socket.send(
            JSON.stringify({
              id,
              method,
              params: params ?? {},
              ...(sessionId ? { sessionId } : {}),
            })
          );
        })
    );
    waiting.delete(id);
    return call.kind === "answered"
      ? call.value
      : {
          error: {
            message:
              call.reason === "dead"
                ? `${url} closed with ${method} unanswered`
                : `${method} answered nothing within ${CALL_MS / 1000} s`,
          },
        };
  };
  return { socket, send };
};

export const evaluate = async (raw: Raw, session: string, expression: string) =>
  (
    await raw.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      session
    )
  ).result?.result as { value?: unknown } | undefined;

/** The daemon's own DevTools link to the browser of `key` (agent state.ts), never the gate. */
export const privileged = async (key: BrowserKey): Promise<Raw> => {
  const { readBrowser, portsOf } =
    await import("../../../packages/agent/src/browser/state");
  const record = await readBrowser(key);
  if (!record) {
    throw new Error(`${key} has no record`);
  }
  const devtools = `http://127.0.0.1:${portsOf(record).devtools}`;
  const version = (await (await fetch(`${devtools}/json/version`)).json()) as {
    webSocketDebuggerUrl: string;
  };
  return rawAt(version.webSocketDebuggerUrl);
};

/** The page of `raw` whose URL starts with `prefix`, attached: its target and session. */
export const attachTo = async (raw: Raw, prefix: string) => {
  const { result } = await raw.send("Target.getTargets");
  const target = (
    (result?.targetInfos ?? []) as {
      targetId: string;
      type: string;
      url: string;
    }[]
  ).find((one) => one.type === "page" && one.url.startsWith(prefix));
  if (!target) {
    throw new Error(`no page at ${prefix}`);
  }
  const attached = await raw.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  return {
    targetId: target.targetId,
    session: attached.result?.sessionId as string,
  };
};

export const post = async (
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

/** The browser's row as `GET /api/browsers` lists it. */
const rowOf = async (fleet: KitFleet, key: BrowserKey) =>
  (
    (await (await fetch(`${fleet.base}/api/browsers`)).json()) as {
      key: string;
      origin?: string;
      state: string;
      takeover: unknown;
    }[]
  ).find((row) => row.key === key);

/** A session's process's own credential (its environment). */
const credentialOf = async (fleet: KitFleet, id: string): Promise<string> =>
  (await Bun.file(`/proc/${await fleet.sessionPid(id)}/environ`).text())
    .split("\0")
    .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
    ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";

/** Every peer the page makes, kept for its stats: installed before the page's own scripts. */
function keepPeers(): void {
  const Made = window.RTCPeerConnection;
  const kept: RTCPeerConnection[] = [];
  (window as unknown as { __peers: RTCPeerConnection[] }).__peers = kept;
  window.RTCPeerConnection = class extends Made {
    constructor(config?: RTCConfiguration) {
      super(config);
      kept.push(this);
    }
  } as typeof RTCPeerConnection;
}

/**
 * The viewer's peers given only candidates of neko's at 192.0.2.1
 * (TEST-NET-1, which answers nothing), their own kept from neko (none
 * trickled, none in the answer), so no pair can connect and their ICE fails
 * as it does on a network that reaches neither neko nor a relay. Each ICE
 * state is kept on the page.
 */
function unreachableIce(): void {
  const Made = window.RTCPeerConnection;
  const { prototype } = Made;
  const away = (line: string) =>
    line.replace(
      /^((?:a=)?candidate:\S+ \d+ \S+ \d+ )\S+( \d+ typ)/gm,
      "$1192.0.2.1$2"
    );
  const setRemote = prototype.setRemoteDescription as (
    description: RTCSessionDescriptionInit
  ) => Promise<void>;
  const addCandidate = prototype.addIceCandidate as (
    candidate?: RTCIceCandidateInit | null
  ) => Promise<void>;
  const local = Object.getOwnPropertyDescriptor(prototype, "localDescription");
  Object.defineProperty(prototype, "setRemoteDescription", {
    value(this: RTCPeerConnection, description: RTCSessionDescriptionInit) {
      return setRemote.call(
        this,
        description.sdp
          ? { type: description.type, sdp: away(description.sdp) }
          : description
      );
    },
  });
  Object.defineProperty(prototype, "addIceCandidate", {
    value(this: RTCPeerConnection, candidate?: RTCIceCandidateInit | null) {
      return addCandidate.call(
        this,
        candidate?.candidate
          ? { ...candidate, candidate: away(candidate.candidate) }
          : candidate
      );
    },
  });
  // Its own candidates kept from neko: none in the answer, none trickled.
  Object.defineProperty(prototype, "localDescription", {
    get(this: RTCPeerConnection) {
      const own = local?.get?.call(this) as RTCSessionDescription | null;
      return own
        ? { type: own.type, sdp: own.sdp.replace(/^a=candidate:.*\r?\n/gm, "") }
        : null;
    },
  });
  Object.defineProperty(prototype, "onicecandidate", {
    get: () => null,
    set: () => undefined,
  });
  const states: string[] = [];
  (window as unknown as { __iceStates: string[] }).__iceStates = states;
  window.RTCPeerConnection = class extends Made {
    constructor(config?: RTCConfiguration) {
      super(config);
      this.addEventListener("iceconnectionstatechange", () =>
        states.push(this.iceConnectionState)
      );
    }
  };
}

/** The selected candidate pair of the view's live peer: its local and remote candidate types. */
const selectedPair = (page: Page) =>
  page.evaluate(async () => {
    const peers = (window as unknown as { __peers: RTCPeerConnection[] })
      .__peers;
    for (const peer of [...peers].reverse()) {
      if (peer.connectionState !== "connected") {
        continue;
      }
      const stats = await peer.getStats();
      for (const entry of stats.values()) {
        if (entry.type === "transport" && entry.selectedCandidatePairId) {
          const pair = stats.get(entry.selectedCandidatePairId);
          const local = stats.get(pair?.localCandidateId);
          const remote = stats.get(pair?.remoteCandidateId);
          return {
            local: local?.candidateType as string,
            remote: remote?.candidateType as string,
            relayProtocol: local?.relayProtocol as string | undefined,
          };
        }
      }
    }
    return null;
  });

/** The docker objects the browser of `key` holds: its container and its volume (agent container-host.ts names). */
/**
 * What the fleet's agent holds on the runtime for `key`: its containers and
 * volumes by the agent's owner label and the key's (container-host.ts
 * `ownedBy`), never by a name.
 */
const dockerOf = async (fleet: KitFleet, key: BrowserKey) => {
  const { findRuntime } =
    await import("../../../packages/agent/src/browser/runtime");
  const runtime = await findRuntime();
  if ("missing" in runtime) {
    return { containers: -1, volumes: -1 };
  }
  const owner = await keptBrowserOwner(
    join(fleet.env.XDG_DATA_HOME as string, "cawco", "browsers")
  );
  if (!owner) {
    return { containers: 0, volumes: 0 };
  }
  const held = await ownedBy(runtime.docker, owner, key);
  return { containers: held.containers.length, volumes: held.volumes.length };
};

const run = async (kit: Kit): Promise<void> => {
  const realHome = homedir();
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
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent", [], { DOCKER_HOST: `unix://${runtime.endpoint}` });
  await fleet.agentUp();
  await fleet.accountSignedIn();
  process.env.XDG_DATA_HOME = fleet.env.XDG_DATA_HOME as string;
  const base = await fleet.dashboard();

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
  kit.check("the fleet runs chrome-devtools-mcp", put.ok, String(put.status));
  await until(
    "the machine applied the fleet's chrome-devtools",
    () =>
      fleet
        .query<{ fleet: string | null }>("SELECT fleet FROM agents")
        .map((agentRow) => agentRow.fleet ?? "")
        .find((text) => text.includes("chrome-devtools")),
    (text) =>
      (JSON.parse(text) as { mcp?: Record<string, { state?: string }> }).mcp?.[
        "chrome-devtools"
      ]?.state === "applied",
    180_000
  );

  const repo = join(fleet.sandbox, "view-live");
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git -c user.name=O -c user.email=o@probe.test add -A && git -c user.name=O -c user.email=o@probe.test commit -qm 'First commit'`
    .cwd(repo)
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "View live",
    machineId: "scratch-fleet",
    cwd: repo,
    caw: false,
  });
  const A = await fleet.spawn("claude", "View live A", repo, {
    projectId: project.id,
  });
  const key: BrowserKey = `project:${project.id}`;
  const home = fleet.env.HOME as string;

  // The agent's page: example.com through its door, a field put on it.
  const door = await doorOf(home, A);
  const agent = await rawAt(door.url, { Authorization: door.authorization });
  const made = await agent.send("Target.createTarget", { url: ORIGIN });
  const agentTarget = made.result?.targetId as string;
  const attached = await agent.send("Target.attachToTarget", {
    targetId: agentTarget,
    flatten: true,
  });
  const agentSession = attached.result?.sessionId as string;
  await until(
    "A's page loaded example.com",
    () => evaluate(agent, agentSession, "document.title"),
    (read) => read?.value === "Example Domain",
    60_000
  );
  await evaluate(
    agent,
    agentSession,
    "(() => { const f = document.createElement('input'); f.id = 'probe-field'; f.style.cssText = 'position:fixed;inset:0;inline-size:100%;block-size:100%;font-size:48px'; document.body.append(f); return true; })()"
  );

  // The session's panel on its browser artifact, in the viewer.
  const listed = await fleet.api<{ id: string; kind: string }[]>(
    `/api/instances/${A}/artifacts`
  );
  const artifact = listed.find((one) => one.kind === "browser");
  kit.check(
    `the session lists its browser artifact (${artifact?.id})`,
    !!artifact,
    JSON.stringify(listed)
  );
  if (!artifact) {
    return;
  }
  await post(fleet, `/api/instances/${A}/artifacts/${artifact.id}/show`, {});
  const page = await kit.page("desk", { init: [keepPeers] });
  page.setDefaultTimeout(120_000);
  await open(page, `${base}/session/${A}`, COMPOSER, 120_000);
  await page
    .locator('[data-slot="browser-view"][data-browser-stream="live"]')
    .waitFor();

  // Take over.
  await page.locator('[data-slot="take-over"]').click();
  await page.locator('[data-slot="browser-view"][data-held]').waitFor();
  await page.locator('[data-slot="hand-back"]').waitFor();
  const pair = await until(
    "the viewer's selected candidate pair",
    () => selectedPair(page),
    (read) => !!read,
    60_000
  ).catch(() => null);
  kit.check(
    `take over: the viewer's getStats() shows a selected pair ${pair?.local}/${pair?.remote}${pair?.relayProtocol ? ` (relay ${pair.relayProtocol})` : ""}`,
    !!pair?.local && !!pair.remote,
    JSON.stringify(pair)
  );
  // The edge layer's ring, read once its transition has landed.
  await settle(page);
  const edge = await page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>(
      '[data-slot="browser-edge"]'
    );
    const probe = document.createElement("span");
    probe.style.color = "var(--brand-solid)";
    document.body.append(probe);
    const brand = getComputedStyle(probe).color;
    probe.remove();
    return {
      shadow: layer ? getComputedStyle(layer).boxShadow : "",
      running: document
        .getAnimations()
        .filter((animation) => animation.playState === "running").length,
      brand,
    };
  });
  kit.check(
    `take over: the well's edge layer rings brand-solid once settled (${edge.shadow})`,
    edge.shadow.includes(edge.brand) && edge.shadow.includes("inset"),
    JSON.stringify(edge)
  );
  await mkdir(CAPTURES, { recursive: true });
  await page.screenshot({ path: join(CAPTURES, "held.png") });

  // Typing lands: a press on the stream over the field, then the keys.
  const daemon = await privileged(key);
  const front = await attachTo(daemon, ORIGIN);
  const overlay = page.locator('[data-slot="browser-stage"] canvas').first();
  const box = await overlay.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
  }
  await page.keyboard.type(TYPED, { delay: 30 });
  const typed = await until(
    "the typed words in the page's field",
    () =>
      evaluate(
        daemon,
        front.session,
        "document.querySelector('#probe-field')?.value ?? null"
      ),
    (read) => read?.value === TYPED,
    30_000
  ).catch(() => undefined);
  kit.check(
    `typing lands: the field holds "${typed?.value}" (read through the daemon's own DevTools link)`,
    typed?.value === TYPED,
    JSON.stringify(typed)
  );

  // Hand back: the session's next read is the page loaded again, nothing typed in it.
  await page.locator('[data-slot="hand-back"]').click();
  await page.locator('[data-slot="take-over"]').waitFor();
  const again = await rawAt(door.url, { Authorization: door.authorization });
  const reread = await attachTo(again, ORIGIN);
  const after = await until(
    "A's read of the page after the hand-back",
    () =>
      evaluate(
        again,
        reread.session,
        "JSON.stringify({ title: document.title, field: document.querySelector('#probe-field')?.value ?? '', navigation: performance.getEntriesByType('navigation')[0]?.type ?? null, typed: document.body.innerText.includes('" +
          TYPED +
          "') })"
      ),
    (read) => typeof read?.value === "string",
    30_000
  ).catch(() => undefined);
  const page2 = after?.value
    ? (JSON.parse(after.value as string) as {
        field: string;
        navigation: string | null;
        title: string;
        typed: boolean;
      })
    : undefined;
  kit.check(
    `hand back: the gate's next read shows the page loaded again by GET (${page2?.navigation}), the field empty ("${page2?.field}")`,
    page2?.title === "Example Domain" &&
      page2.field === "" &&
      !page2.typed &&
      page2.navigation === "navigate",
    JSON.stringify(page2)
  );

  // The page's origin is live during a take-over.
  await page.locator('[data-slot="take-over"]').click();
  await page.locator('[data-slot="hand-back"]').waitFor();
  const moved = await attachTo(daemon, ORIGIN);
  // Timed on the person's screen: the band, which follows the hub's
  // `browser_list` frames, read on each animation frame, never on a poll.
  const navigatedAt = Date.now();
  const navigated = await daemon.send(
    "Page.navigate",
    { url: `${MOVED}/` },
    moved.session
  );
  const committed = Date.now() - navigatedAt;
  const named = await page
    .waitForFunction(
      (want) =>
        document.querySelector<HTMLElement>(
          '[data-slot="browser-view"] [data-slot="browser-origin"]'
        )?.innerText === want,
      MOVED,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false);
  const took = Date.now() - navigatedAt;
  const movedRow = await rowOf(fleet, key);
  kit.check(
    `a navigation during the take-over reaches the band in ${took} ms (≤ 2000; the navigation itself committed in ${committed} ms), and the row's origin is ${movedRow?.origin}`,
    named && took <= 2000 && movedRow?.origin === MOVED,
    JSON.stringify({
      named,
      took,
      committed,
      origin: movedRow?.origin,
      navigated,
    })
  );

  // Not connected, for real: a viewer whose ICE can't reach neko. Its
  // last read is kept, so a view that never got there says where it stood.
  const cut = await kit.page("desk", { init: [unreachableIce] });
  cut.setDefaultTimeout(120_000);
  await open(cut, `${base}/session/${A}`, COMPOSER, 120_000);
  let lastCut: unknown;
  const unreached = await until(
    "the cut viewer's stream couldn't connect",
    async () => {
      lastCut = await cut.evaluate(() => ({
        stream:
          document.querySelector<HTMLElement>('[data-slot="browser-view"]')
            ?.dataset.browserStream ?? "",
        ice:
          (window as unknown as { __iceStates?: string[] }).__iceStates ?? [],
        text: (
          document.querySelector<HTMLElement>('[data-slot="browser-view"]')
            ?.innerText ?? ""
        ).replace(/\s+/g, " "),
      }));
      return lastCut as { ice: string[]; stream: string; text: string };
    },
    (read) => read.stream === "unreached",
    120_000
  ).catch(() => undefined);
  kit.check(
    `not connected for real: the view reads unreached (ICE ${unreached?.ice.join("→") || "never failed here: neko's end failed first"}) and says "The stream couldn't connect from here" with Try again and Set up the stream relay`,
    !!unreached &&
      unreached.text.includes("The stream couldn't connect from here") &&
      unreached.text.includes("Try again") &&
      unreached.text.includes("Set up the stream relay"),
    JSON.stringify(unreached ?? { timedOut: lastCut })
  );
  await cut.screenshot({ path: join(CAPTURES, "unreached.png") });
  await cut.close();

  // Remove: refused to a session, refused while held, then the person's.
  const credential = await credentialOf(fleet, A);
  const asSession = await post(
    fleet,
    `/api/browsers/${encodeURIComponent(key)}/remove`,
    {},
    `Bearer ${credential}`
  );
  kit.check(
    `remove with a session credential → ${asSession.status} ${asSession.text}`,
    asSession.status === 403 && asSession.text === REMOVE_REFUSED,
    JSON.stringify(asSession)
  );
  const whileHeld = await post(
    fleet,
    `/api/browsers/${encodeURIComponent(key)}/remove`,
    { machineId: "scratch-fleet" }
  );
  kit.check(
    `remove while the person holds it → ${whileHeld.status} ${whileHeld.text}`,
    whileHeld.status === 409,
    JSON.stringify(whileHeld)
  );
  await page.locator('[data-slot="hand-back"]').click();
  await page.locator('[data-slot="take-over"]').waitFor();
  await page.close();
  daemon.socket.close();
  agent.socket.close();
  again.socket.close();
  const before = await dockerOf(fleet, key);
  const removed = await readWithin(5 * 60_000, () =>
    post(fleet, `/api/browsers/${encodeURIComponent(key)}/remove`, {
      machineId: "scratch-fleet",
    })
  );
  const gone = await dockerOf(fleet, key);
  const row = await rowOf(fleet, key);
  kit.check(
    `remove → ${removed.kind === "answered" ? removed.value.status : "no answer"}: container ${before.containers}→${gone.containers}, volume ${before.volumes}→${gone.volumes}, row ${row ? "still listed" : "gone"}`,
    removed.kind === "answered" &&
      removed.value.status === 200 &&
      before.containers === 1 &&
      before.volumes === 1 &&
      gone.containers === 0 &&
      gone.volumes === 0 &&
      !row,
    JSON.stringify({ removed, before, gone, row })
  );

  // Forgetting the project takes its browser the same way.
  const started = await readWithin(10 * 60_000, () =>
    post(fleet, `/api/browsers/${encodeURIComponent(key)}/start`, {
      machineId: "scratch-fleet",
    })
  );
  const runs = await dockerOf(fleet, key);
  const stopped = await post(fleet, `/api/projects/${project.id}/stop`, {
    instanceIds: [A],
  });
  kit.check(
    `the project's stop is taken (${stopped.status})`,
    stopped.status === 200,
    stopped.text
  );
  // Read stopped as the hub's forget reads it (project-stops.ts `mayRun`):
  // its stop asked and its machine's confirmation recorded.
  const ended = await until(
    "A's stop confirmed by its machine",
    () =>
      fleet.query<{
        end_confirmed_at: number | null;
        end_intent: string | null;
      }>(
        `SELECT end_intent, end_confirmed_at FROM instances WHERE id = '${A}'`
      )[0],
    (instance) => !!instance.end_intent && instance.end_confirmed_at !== null,
    180_000
  ).catch(() => undefined);
  kit.check(
    `A reads stopped before the forget (${JSON.stringify(ended)})`,
    !!ended,
    JSON.stringify(ended)
  );
  const forgot = await readWithin(5 * 60_000, async () => {
    const response = await fetch(`${fleet.base}/api/projects/${project.id}`, {
      method: "DELETE",
    });
    return { status: response.status, text: await response.text() };
  });
  const after2 = await dockerOf(fleet, key);
  kit.check(
    `forget the project → ${forgot.kind === "answered" ? forgot.value.status : "no answer"}: its browser (started ${started.kind === "answered" ? started.value.status : "?"}, container ${runs.containers}) gone, container ${after2.containers}, volume ${after2.volumes}`,
    forgot.kind === "answered" &&
      forgot.value.status === 200 &&
      runs.containers === 1 &&
      after2.containers === 0 &&
      after2.volumes === 0,
    JSON.stringify({ forgot, runs, after2 })
  );
};

const spec: Spec = {
  name: "browser-view-live",
  host: "it runs the project's browser, whose runtime socket and ports no workspace boundary reaches",
  run,
};

export default spec;
