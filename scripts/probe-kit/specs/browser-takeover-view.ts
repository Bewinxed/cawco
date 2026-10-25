/**
 * A browser take-over opened from `browser_ask` shows the live browser at
 * once (Projects spec §5.11, "The view"): the panel draws the browser's
 * stream, never a page with an artifact overlay, on both hosts, at 1440 and
 * at 390, with a second process holding the port the browser's kept slot
 * wants.
 *
 * On a scratch fleet (real hub, agent and sessiond; the mock model) with the
 * built dashboard, for each host (a container where the runtime answers, a
 * local Chromium with the runtime hidden by `DOCKER_HOST=unix:///nonexistent`)
 * and each view (desk 1440×900, phone 390×844):
 *
 * - the project's browser is started, then stopped (asleep, its slot kept),
 *   and this process listens on 127.0.0.1 at that slot's first port (neko's
 *   HTTP port in a container, Chromium's DevTools port on the local host), as
 *   whatever held 43004 on obelisk after its restart did;
 * - session A calls `browser_ask` through the hub's tool door with its own
 *   credential; the person presses Take over on its card in A's conversation;
 * - the panel stands the browser view: its well draws the stream (a `video`
 *   in a container, a `canvas` of frames on the local host) at a size above
 *   zero, and once the browser's pages are loaded with a page that paints
 *   every frame (a screencast sends a frame only on a paint, so a still page
 *   gives one), its frame count advances over two seconds; the band says "You
 *   have control" with the Private chip; no "This page has no artifact…" and
 *   no failure stands anywhere in the pane, and the page logged no console
 *   error;
 * - the browser went live on another slot than the held one (agent
 *   browsers.ts: a kept slot whose ports another program holds moves);
 * - container: neko's control is held (`/room/control` has_host), given to
 *   the view's own session by the shield;
 * - Hand back in the head answers A's tool with the hand-back's words;
 * - then a plain session (spawned as New session spawns one, no work item)
 *   whose browser tool opens a page through its door: the hub's Files list
 *   holds its browser, Files draws its card, a press opens the browser view
 *   in the panel with Take over in the head, and Take over draws the page's
 *   frames, advancing, with the Private chip and no error.
 *
 * The fleet runs chrome-devtools-mcp, so every session has its door.
 *
 * Run on the host, outside every workspace boundary (a boundary hides the
 * runtime's socket and the browser's ports):
 *
 *   bun scripts/probe-kit/run.ts browser-takeover-view
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one host and one view at a time, each leg waits on the browser it started
import { mkdir } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { readWithin } from "../../../packages/core/src/bounded";
import type { BrowserKey } from "../../../packages/core/src/browser";
import { askWords } from "../../../packages/core/src/words/asks";
import { browserWords } from "../../../packages/core/src/words/browser";
import { toolWords } from "../../lib/tool-call";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import {
  type Kit,
  type KitFleet,
  kitsOwnMessage,
  open,
  type Spec,
} from "../kit";

const ORIGIN = "https://example.com";
const REASON = "Sign in to Example so I can read the page behind it.";
/** The overlay's refusal the owner saw in a take-over's footer (agent preview-overlay artifact.ts `NO_ARTIFACT`). */
const NO_ARTIFACT = "This page has no artifact to keep its state in.";
const HANDED_BACK = "They handed the browser back";
/** The browser tool every session runs, as browser-shield pins it. */
const MCP_VERSION = "1.11.0";

const respond = (_request: Seen): Reply => ({ everyMs: 5, words: ["ok"] });

/** A session's process's own credential (its environment). */
const credentialOf = async (fleet: KitFleet, id: string): Promise<string> =>
  await fleet.sessionCredential(id);

const post = async (fleet: KitFleet, path: string, body: object) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
};

/** This machine's record of `key`: its state, its slot and that slot's ports. */
const recordOf = async (key: BrowserKey) => {
  const { readBrowser, portsOf } =
    await import("../../../packages/agent/src/browser/state");
  const record = await readBrowser(key);
  return {
    state: record?.state,
    slot: record?.slot,
    ports: record?.slot === undefined ? undefined : portsOf(record),
    why: record?.why,
  };
};

/** A listener on 127.0.0.1:`port` held by this process, as another program would hold it. */
const holdPort = (port: number): Promise<Server> =>
  new Promise((resolve, reject) => {
    const server = createServer((socket) => socket.destroy());
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });

/** What the browser view's well and band say now. */
const viewOf = (page: Page) =>
  page.evaluate((noArtifact) => {
    const well = document.querySelector<HTMLElement>(
      '[data-slot="browser-well"]'
    );
    const video = document.querySelector<HTMLVideoElement>(
      '[data-slot="browser-video"]'
    );
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-slot="browser-frames"]'
    );
    const pane = document.querySelector('[data-slot="preview-pane"]');
    return {
      view: !!document.querySelector('[data-slot="browser-view"]'),
      stream: well?.dataset.stream ?? null,
      state: well?.dataset.streamState ?? null,
      frames: Number(well?.dataset.frames ?? 0),
      width: Number(well?.dataset.width ?? 0),
      height: Number(well?.dataset.height ?? 0),
      video: video ? { w: video.videoWidth, h: video.videoHeight } : null,
      canvas: canvas ? { w: canvas.width, h: canvas.height } : null,
      control:
        document
          .querySelector('[data-slot="browser-control"]')
          ?.textContent?.trim() ?? null,
      private: !!document.querySelector('[data-slot="browser-private"]'),
      down:
        document
          .querySelector('[data-slot="browser-down"]')
          ?.textContent?.trim() ?? null,
      overlayError: (pane?.textContent ?? "").includes(noArtifact),
      paneFailure:
        document.querySelector('[data-slot="failure"]')?.textContent?.trim() ??
        null,
    };
  }, NO_ARTIFACT);

/**
 * A page that paints every frame: a screencast sends a frame only when the
 * page paints (CDP `Page.screencastFrame`), so a still page gives one frame
 * and a view whose stream stands still can't be told from one that froze.
 */
const MOVING_PAGE =
  "data:text/html,<title>moving</title><style>@keyframes spin{to{transform:rotate(1turn)}}div{width:240px;height:240px;margin:120px;background:coral;animation:spin 1s linear infinite}</style><div></div>";

/**
 * Every page of `key`'s browser loaded with {@link MOVING_PAGE}, through its
 * own DevTools port on this machine, as an agent's page left open would
 * stand in front: the take-over's page among them. Answers how many.
 */
const movePages = async (key: BrowserKey): Promise<number> => {
  const { readBrowser, portsOf } =
    await import("../../../packages/agent/src/browser/state");
  const { CdpLink } =
    await import("../../../packages/agent/src/browser/cdp-takeover");
  const record = await readBrowser(key);
  if (!record) {
    return 0;
  }
  const link = await CdpLink.open(
    `http://127.0.0.1:${portsOf(record).devtools}`
  );
  try {
    const { targetInfos } = await link.call("Target.getTargets");
    const pages = (
      (Array.isArray(targetInfos) ? targetInfos : []) as {
        targetId: string;
        type: string;
      }[]
    ).filter((info) => info.type === "page");
    for (const one of pages) {
      const session = await link.attach(one.targetId);
      await link.call("Page.navigate", { url: MOVING_PAGE }, session);
    }
    return pages.length;
  } finally {
    link.close();
  }
};

/** neko's room control, read as its admin (the record's own credentials). */
const nekoControl = async (key: BrowserKey) => {
  const { readBrowser, portsOf } =
    await import("../../../packages/agent/src/browser/state");
  const record = await readBrowser(key);
  if (!record?.container) {
    return null;
  }
  const base = `http://127.0.0.1:${portsOf(record).http}/api`;
  const login = (await (
    await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "cawco",
        password: record.container.adminPassword,
      }),
    })
  ).json()) as { token: string };
  return (await (
    await fetch(`${base}/room/control`, {
      headers: { Authorization: `Bearer ${login.token}` },
    })
  ).json()) as { has_host?: boolean; host_id?: string };
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one view's leg, in the order a person takes it, a check at each step
async function leg(
  kit: Kit,
  fleet: KitFleet,
  base: string,
  host: "container" | "local",
  view: "desk" | "phone",
  key: BrowserKey,
  A: string
): Promise<void> {
  const name = `${host} ${view}`;
  const machineId = "scratch-fleet";
  const keyPath = `/api/browsers/${encodeURIComponent(key)}`;

  // The browser started once, then asleep with its slot kept.
  const started = await post(fleet, `${keyPath}/start`, { machineId });
  const stopped = await post(fleet, `${keyPath}/stop`, { machineId });
  const kept = await recordOf(key);
  const wanted = host === "container" ? kept.ports?.http : kept.ports?.devtools;
  kit.check(
    `${name}: the browser started (${started.status}) and stopped (${stopped.status}), asleep on slot ${kept.slot}, port ${wanted}`,
    started.status === 200 &&
      stopped.status === 200 &&
      kept.state === "asleep" &&
      wanted !== undefined,
    JSON.stringify({ started, stopped, kept })
  );
  if (wanted === undefined) {
    return;
  }
  const holder = await holdPort(wanted);

  const page = await kit.page(view);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  await open(page, `${base}/session/${A}`, '[data-slot="pane"]');

  const credential = await credentialOf(fleet, A);
  const answered = readWithin(10 * 60_000, async () => {
    const said = await toolWords(
      { base: fleet.base, id: A, credential },
      "browser_ask",
      { reason: REASON, origin: ORIGIN },
      { timeoutMs: 11 * 60_000 }
    );
    return said.refused ? `refused: ${said.text}` : said.text;
  });

  // The person's Take over, on the ask's card in A's conversation.
  const take = page
    .getByRole("button", { name: askWords.takeOver, exact: true })
    .first();
  await take.waitFor({ state: "visible", timeout: 60_000 });
  await take.click();

  const first = await until(
    `${name}: the browser view draws frames`,
    () => viewOf(page),
    (now) => now.view && now.frames > 0 && now.width > 0,
    5 * 60_000
  ).catch(() => viewOf(page));
  // The page in front made to paint every frame, once the browser is live
  // and its view drew: frames must then advance. A browser that never went
  // live has no DevTools to reach; the checks below say what the view shows.
  const live = (await recordOf(key)).state === "live" && first.frames > 0;
  const paging = live
    ? await movePages(key).catch((error: unknown) => {
        kit.check(
          `${name}: the browser's pages loaded the moving page`,
          false,
          String(error)
        );
        return 0;
      })
    : 0;
  await page.waitForTimeout(1000);
  const moving = await viewOf(page);
  await page.waitForTimeout(2000);
  const later = await viewOf(page);
  const drawn =
    host === "container"
      ? (later.video?.w ?? 0) > 0 && (later.video?.h ?? 0) > 0
      : (later.canvas?.w ?? 0) > 0 && (later.canvas?.h ?? 0) > 0;
  kit.check(
    `${name}: the panel draws the browser's ${later.stream} at ${later.width}×${later.height} (element ${JSON.stringify(host === "container" ? later.video : later.canvas)}); with ${paging} page(s) moving, frames ${moving.frames} → ${later.frames} over 2 s`,
    later.view &&
      later.stream === (host === "container" ? "video" : "frames") &&
      drawn &&
      paging > 0 &&
      later.frames > moving.frames,
    JSON.stringify({ first, moving, later })
  );
  kit.check(
    `${name}: the band says "${later.control}" with the Private chip`,
    later.control?.startsWith(browserWords.youHaveControl) === true &&
      later.private,
    JSON.stringify(later)
  );
  kit.check(
    `${name}: no overlay error, no failure in the pane, no console error`,
    !(later.overlayError || later.paneFailure || later.down) &&
      errors.length === 0,
    JSON.stringify({ later, errors })
  );

  const moved = await recordOf(key);
  const movedPort =
    host === "container" ? moved.ports?.http : moved.ports?.devtools;
  kit.check(
    `${name}: with ${wanted} held by another process the browser went live on slot ${moved.slot} (port ${movedPort})`,
    moved.state === "live" && movedPort !== wanted,
    JSON.stringify({ kept, moved })
  );

  if (host === "container") {
    // A neko that never started answers nothing: said in the check, and the run goes on.
    const control = await nekoControl(key).catch((error: unknown) => ({
      has_host: false,
      host_id: `neko didn't answer: ${String(error)}`,
    }));
    kit.check(
      `${name}: neko's control is held by the view's session (${control?.host_id})`,
      control?.has_host === true && !!control.host_id,
      JSON.stringify(control)
    );
  }

  // Hand back from the panel's head; with no take-over standing there is none
  // to press, which is said, and the leg ends.
  const pressed = await page
    .getByRole("button", { name: browserWords.handBack, exact: true })
    .first()
    .click({ timeout: 30_000 })
    .then(
      () => null,
      (error: unknown) => String(error)
    );
  if (pressed) {
    kit.check(`${name}: Hand back stands in the head`, false, pressed);
    holder.close();
    await page.close();
    return;
  }
  const said = await answered;
  kit.check(
    `${name}: Hand back answers A's tool ("${said.kind === "answered" ? said.value : said.kind}")`,
    said.kind === "answered" && said.value.startsWith(HANDED_BACK),
    JSON.stringify(said)
  );
  holder.close();
  await page.close();
}

/**
 * Session `id`'s browser tool, as chrome-devtools-mcp connects through its
 * door (agent door.ts `browser-mcp.json`): a page of its own opened at `url`.
 * The connection stays open, as the tool's does, until `close`.
 */
const openThroughDoor = async (
  home: string,
  id: string,
  url: string
): Promise<{ close: () => void; targetId: string }> => {
  const config = (await Bun.file(
    join(home, ".cawco", "workspaces", id, "browser-mcp.json")
  ).json()) as { wsEndpoint: string; wsHeaders: string };
  const { Authorization } = JSON.parse(config.wsHeaders) as {
    Authorization: string;
  };
  const socket = new WebSocket(config.wsEndpoint, {
    headers: { Authorization },
  } as unknown as string[]);
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () =>
      reject(new Error(`the gate refused ${config.wsEndpoint}`));
  });
  const made = await new Promise<{
    error?: { message: string };
    result?: { targetId?: string };
  }>((resolve) => {
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        error?: { message: string };
        result?: { targetId?: string };
      };
      if (message.id === 1) {
        resolve(message);
      }
    };
    socket.send(
      JSON.stringify({ id: 1, method: "Target.createTarget", params: { url } })
    );
  });
  if (!made.result?.targetId) {
    socket.close();
    throw new Error(
      `the gate opened no page: ${made.error?.message ?? JSON.stringify(made)}`
    );
  }
  return { targetId: made.result.targetId, close: () => socket.close() };
};

/**
 * A plain session (started as New session starts one, no work item) whose
 * browser tool opened a page: Files lists its browser, a press on it opens
 * the browser in the panel, and the head's Take over draws its frames.
 */
async function plainLeg(
  kit: Kit,
  fleet: KitFleet,
  base: string,
  host: "container" | "local",
  repo: string,
  projectId: string,
  key: BrowserKey
): Promise<void> {
  const name = `${host} plain session`;
  const S = await fleet.spawn("claude", `Plain ${host}`, repo, { projectId });
  const tool = await openThroughDoor(
    fleet.env.HOME as string,
    S,
    MOVING_PAGE
  ).catch((error: unknown) => String(error));
  if (typeof tool === "string") {
    kit.check(`${name}: its browser tool opened a page`, false, tool);
    return;
  }
  const listed = await until(
    `${name}: Files lists its browser`,
    () =>
      fleet.api<{ id: string; kind: string }[]>(
        `/api/instances/${S}/artifacts/files`
      ),
    (rows) => rows.some((row) => row.kind === "browser"),
    60_000
  ).catch(() =>
    fleet.api<{ id: string; kind: string }[]>(
      `/api/instances/${S}/artifacts/files`
    )
  );
  const browser = listed.find((row) => row.kind === "browser");
  kit.check(
    `${name}: with a page open, the hub's Files list holds its browser (${browser?.id})`,
    !!browser,
    JSON.stringify(listed)
  );
  if (!browser) {
    tool.close();
    return;
  }

  const page = await kit.page("desk");
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  await open(page, `${base}/session/${S}`, '[data-slot="pane"]');
  // Files, then the browser's card: the panel opens on it.
  await page.locator("[data-files-control]").first().click();
  const card = page.locator(`[data-files-card][data-artifact="${browser.id}"]`);
  const carded = await card.waitFor({ state: "visible", timeout: 30_000 }).then(
    () => true,
    () => false
  );
  kit.check(`${name}: Files draws the browser's card`, carded);
  if (!carded) {
    tool.close();
    await page.close();
    return;
  }
  await card.click();
  const take = page
    .getByRole("button", { name: browserWords.takeOver, exact: true })
    .first();
  const shown = await take.waitFor({ state: "visible", timeout: 60_000 }).then(
    () => true,
    () => false
  );
  const before = await viewOf(page);
  kit.check(
    `${name}: the panel shows the browser view with Take over in its head (view ${before.view}, ${before.control})`,
    shown && before.view,
    JSON.stringify(before)
  );
  if (!shown) {
    tool.close();
    await page.close();
    return;
  }
  await take.click();
  const first = await until(
    `${name}: the take-over draws frames`,
    () => viewOf(page),
    (now) =>
      now.frames > 0 &&
      now.control?.startsWith(browserWords.youHaveControl) === true,
    5 * 60_000
  ).catch(() => viewOf(page));
  await page.waitForTimeout(2000);
  const later = await viewOf(page);
  kit.check(
    `${name}: Take over draws the session's moving page, frames ${first.frames} → ${later.frames} over 2 s, the band "${later.control}"`,
    (await recordOf(key)).state === "live" &&
      later.frames > first.frames &&
      later.private &&
      !(later.overlayError || later.paneFailure || later.down) &&
      errors.length === 0,
    JSON.stringify({ first, later, errors })
  );
  await page
    .getByRole("button", { name: browserWords.handBack, exact: true })
    .first()
    .click({ timeout: 30_000 })
    .catch(() => undefined);
  tool.close();
  await page.close();
}

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  const browsersPath =
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    join(
      homedir(),
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
  process.env.XDG_DATA_HOME = fleet.env.XDG_DATA_HOME as string;
  // Every session's browser tool, through its door (agent door.ts): the
  // plain session's leg opens its page there.
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
  const base = await fleet.dashboard();

  for (const host of ["container", "local"] as const) {
    if (host === "local") {
      await fleet.stop("agent");
      await agentOn("unix:///nonexistent");
    }
    const repo = join(fleet.sandbox, `view-${host}`);
    await mkdir(repo, { recursive: true });
    await Bun.$`git init -q -b main && echo code > README.md && git -c user.name=O -c user.email=o@probe.test add -A && git -c user.name=O -c user.email=o@probe.test commit -qm 'First commit'`
      .cwd(repo)
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: `View ${host}`,
      machineId: "scratch-fleet",
      cwd: repo,
      caw: false,
    });
    const key: BrowserKey = `project:${project.id}`;
    for (const view of ["desk", "phone"] as const) {
      const A = await fleet.spawn("claude", `View ${host} ${view}`, repo, {
        projectId: project.id,
      });
      await leg(kit, fleet, base, host, view, key, A);
    }
    await plainLeg(kit, fleet, base, host, repo, project.id, key);
    await post(fleet, `/api/browsers/${encodeURIComponent(key)}/remove`, {
      machineId: "scratch-fleet",
    });
  }
};

const spec: Spec = {
  name: "browser-takeover-view",
  host: "it runs the project's browser, whose runtime socket and ports no workspace boundary reaches",
  run,
};

export default spec;
