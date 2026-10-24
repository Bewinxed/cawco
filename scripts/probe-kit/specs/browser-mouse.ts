/**
 * The fleet browser is a desktop browser with a mouse (agent
 * browser/xorg.conf on the container host, local-host.ts's Blink pointer
 * settings on the local host): what a page reads is the owner's desktop, and
 * a phone check gets its touch device from emulation alone.
 *
 * It drives the agent's registry in this process, as `cawco browser` does,
 * with a data dir of its own and keys no project has (browser-runtime's
 * way), so the machine's own browsers are untouched; it removes what it
 * made. On each host (a container where the runtime answers, then the local
 * host with the runtime hidden by `DOCKER_HOST=unix:///nonexistent`), on
 * Chromium's own DevTools:
 *
 * - container: the X server's log names `dummy_mouse` a MOUSE and no
 *   touchscreen;
 * - a new page at 1440×900 reads (pointer: fine), (any-pointer: fine),
 *   (hover: hover), not coarse, `navigator.maxTouchPoints` 0 and no
 *   `ontouchstart`;
 * - the same page at 390×844 with touch emulation on
 *   (`Emulation.setTouchEmulationEnabled`, what chrome-devtools-mcp's
 *   `emulate` sends) reads (pointer: coarse), (hover: none) and touch points;
 * - a page opened after it reads the desktop again: emulation stays on its
 *   page;
 * - a take-over's press lands on the page as a mouse's: on the local host
 *   the take-over's own pointer and tap (cdp-takeover.ts), on the container
 *   host a button press through neko's control (its admin, as the shield's
 *   view holds control), each a pointerdown, pointerup and click whose
 *   pointerType is "mouse".
 *
 * Run on the host, outside every workspace boundary (a boundary hides the
 * runtime's socket, and the local host's Chromium needs its sandbox's
 * namespaces):
 *
 *   bun scripts/probe-kit/run.ts browser-mouse
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one host at a time, each leg waits on the browser it started
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserRecord } from "../../../packages/agent/src/browser/state";
import { readWithin } from "../../../packages/core/src/bounded";
import type { BrowserKey } from "../../../packages/core/src/browser";
import type { Kit, Spec } from "../kit";

type Browsers = typeof import("../../../packages/agent/src/browser/browsers");
type Takeover =
  typeof import("../../../packages/agent/src/browser/cdp-takeover");
type Link = Awaited<ReturnType<Takeover["CdpLink"]["open"]>>;

const CONTAINER_KEY: BrowserKey = "project:probe-mouse";
const LOCAL_KEY: BrowserKey = "project:probe-mouse-local";

/** What a page reads of its pointer, hover and touch. */
interface Reading {
  anyFine: boolean;
  coarse: boolean;
  fine: boolean;
  hover: boolean;
  touch: number;
  touchEvents: boolean;
  w: number;
}

const READ = `JSON.stringify({
  fine: matchMedia("(pointer: fine)").matches,
  coarse: matchMedia("(pointer: coarse)").matches,
  anyFine: matchMedia("(any-pointer: fine)").matches,
  hover: matchMedia("(hover: hover)").matches,
  touch: navigator.maxTouchPoints,
  touchEvents: "ontouchstart" in window,
  w: innerWidth,
})`;

/** Every pointerdown, pointerup and click the page hears, kept on the page. */
const LISTEN = `window.__presses = [];
for (const type of ["pointerdown", "pointerup", "click"]) {
  addEventListener(type, (event) => {
    window.__presses.push({ type, pointerType: event.pointerType ?? "" });
  }, true);
}
"listening"`;

interface Press {
  pointerType: string;
  type: string;
}

/** One expression on the page of `session`, its value as JSON gave it. */
const evaluate = async (
  link: Link,
  session: string,
  expression: string
): Promise<unknown> => {
  const answer = await link.call(
    "Runtime.evaluate",
    { expression, returnByValue: true },
    session
  );
  if (answer.exceptionDetails) {
    throw new Error(
      `${expression} threw ${JSON.stringify(answer.exceptionDetails)}`
    );
  }
  return (answer.result as { value?: unknown }).value;
};

const reading = async (link: Link, session: string): Promise<Reading> =>
  JSON.parse(String(await evaluate(link, session, READ))) as Reading;

/** A new page, as a session's browser tool opens one through the gate (a window of its own), and a session on it. */
const newPage = async (
  link: Link
): Promise<{ session: string; targetId: string }> => {
  const { targetId } = await link.call("Target.createTarget", {
    url: "about:blank",
    newWindow: true,
  });
  if (typeof targetId !== "string") {
    throw new Error("Target.createTarget answered no targetId.");
  }
  return { session: await link.attach(targetId), targetId };
};

/** The part of an X server's log line before the device it adds. */
const ADDED = /^.*Adding extended input device /;

const DESK = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };

/** A desktop's reading: a fine pointer that hovers, no touch. */
const isDesk = (read: Reading): boolean =>
  read.fine &&
  read.anyFine &&
  read.hover &&
  !read.coarse &&
  read.touch === 0 &&
  !read.touchEvents &&
  read.w === DESK.width;

/** The page's presses, once it heard `count` of them, or what it heard in 5 s. */
const presses = async (
  link: Link,
  session: string,
  count: number
): Promise<Press[]> => {
  const until = Date.now() + 5000;
  for (;;) {
    const heard = (await evaluate(
      link,
      session,
      "window.__presses"
    )) as Press[];
    if (heard.length >= count || Date.now() > until) {
      return heard;
    }
    await Bun.sleep(100);
  }
};

/** `heard` is `rounds` presses of a mouse: pointerdown, pointerup, click each, every one "mouse". */
const mousePresses = (heard: Press[], rounds: number): boolean =>
  heard.length === rounds * 3 &&
  heard.every(
    (press, index) =>
      press.pointerType === "mouse" &&
      press.type === ["pointerdown", "pointerup", "click"][index % 3]
  );

/** The readings every host owes: the desk, the emulated phone, and a new page after it. */
const readings = async (kit: Kit, host: string, link: Link): Promise<void> => {
  const page = await newPage(link);
  await link.call("Emulation.setDeviceMetricsOverride", DESK, page.session);
  const desk = await reading(link, page.session);
  kit.check(
    `${host}: a new page at 1440×900 reads pointer fine, any-pointer fine, hover, not coarse, maxTouchPoints 0, no ontouchstart`,
    isDesk(desk),
    JSON.stringify(desk)
  );

  await link.call("Emulation.setDeviceMetricsOverride", PHONE, page.session);
  await link.call(
    "Emulation.setTouchEmulationEnabled",
    { enabled: true, maxTouchPoints: 5 },
    page.session
  );
  const phone = await reading(link, page.session);
  kit.check(
    `${host}: the page at 390×844 with touch emulation on reads pointer coarse, hover none, maxTouchPoints ${phone.touch}`,
    // Its width is the mobile layout viewport's (980 on about:blank, which
    // names no viewport), so it is not read here.
    phone.coarse && !phone.fine && !phone.hover && phone.touch > 0,
    JSON.stringify(phone)
  );

  const after = await newPage(link);
  await link.call("Emulation.setDeviceMetricsOverride", DESK, after.session);
  const again = await reading(link, after.session);
  kit.check(
    `${host}: a page opened after the emulated one reads the desktop again`,
    isDesk(again),
    JSON.stringify(again)
  );
  await link.call("Target.closeTarget", { targetId: page.targetId });
  await link.call("Target.closeTarget", { targetId: after.targetId });
};

/** The local take-over's pointer (a press and a tap) on a page of the local browser. */
const localPress = async (
  kit: Kit,
  devtools: string,
  link: Link
): Promise<void> => {
  const { CdpTakeover } =
    (await import("../../../packages/agent/src/browser/cdp-takeover")) as Takeover;
  const page = await newPage(link);
  await evaluate(link, page.session, LISTEN);
  const takeover = await CdpTakeover.start(devtools, page.targetId);
  try {
    await takeover.input({ t: "down", x: 300, y: 200, button: "left" });
    await takeover.input({ t: "up", x: 300, y: 200, button: "left" });
    await takeover.input({ t: "tap", x: 320, y: 220 });
  } finally {
    await takeover.stop();
  }
  const heard = await presses(link, page.session, 6);
  kit.check(
    "local: the take-over's press and tap land as a mouse's (pointerdown, pointerup, click, pointerType mouse, twice)",
    mousePresses(heard, 2),
    JSON.stringify(heard)
  );
  await link.call("Target.closeTarget", { targetId: page.targetId });
};

/** Waits for neko's socket to say `wanted`, or throws after 10 s. */
const nekoEvent = async (socket: WebSocket, wanted: string): Promise<void> => {
  const read = await readWithin(
    10_000,
    (signal) =>
      new Promise<void>((resolve) => {
        const heard = (message: MessageEvent) => {
          const { event } = JSON.parse(String(message.data)) as {
            event?: string;
          };
          if (event === wanted) {
            socket.removeEventListener("message", heard);
            resolve();
          }
        };
        socket.addEventListener("message", heard);
        signal.addEventListener("abort", () =>
          socket.removeEventListener("message", heard)
        );
      })
  );
  if (read.kind === "unanswered") {
    throw new Error(`neko did not say ${wanted} within 10 s.`);
  }
};

/** A button press through neko's control, at the middle of a page of the container's browser, raised to the front. */
const containerPress = async (
  kit: Kit,
  record: BrowserRecord,
  link: Link
): Promise<void> => {
  const { nekoSession } =
    await import("../../../packages/agent/src/browser/container-host");
  const { portsOf } = await import("../../../packages/agent/src/browser/state");
  const page = await newPage(link);
  await link.call("Target.activateTarget", { targetId: page.targetId });
  await evaluate(link, page.session, LISTEN);
  // The page's middle on neko's screen: its window's place, and the
  // browser's own UI above the page.
  const at = JSON.parse(
    String(
      await evaluate(
        link,
        page.session,
        `JSON.stringify({
          x: Math.round(screenX + (outerWidth - innerWidth) / 2 + innerWidth / 2),
          y: Math.round(screenY + (outerHeight - innerHeight) + innerHeight / 2),
        })`
      )
    )
  ) as { x: number; y: number };
  const { token } = await nekoSession(record, "admin");
  const socket = new WebSocket(
    `ws://127.0.0.1:${portsOf(record).http}/api/ws?token=${encodeURIComponent(token)}`
  );
  try {
    await nekoEvent(socket, "system/init");
    socket.send(
      JSON.stringify({
        event: "control/buttonpress",
        payload: { x: at.x, y: at.y, code: 1 },
      })
    );
    const heard = await presses(link, page.session, 3);
    kit.check(
      `container: neko's button press at (${at.x}, ${at.y}) lands as a mouse's (pointerdown, pointerup, click, pointerType mouse)`,
      mousePresses(heard, 1),
      JSON.stringify(heard)
    );
    socket.send(JSON.stringify({ event: "control/release" }));
  } finally {
    socket.close();
  }
  await link.call("Target.closeTarget", { targetId: page.targetId });
};

/** What the container's X server says of its input devices, in its log. */
const xorgDevices = async (kit: Kit, record: BrowserRecord): Promise<void> => {
  const { findRuntime } =
    await import("../../../packages/agent/src/browser/runtime");
  const runtime = await findRuntime();
  if ("missing" in runtime || !record.container) {
    kit.check("container: the runtime and the record's container", false);
    return;
  }
  const exec = await runtime.docker.getContainer(record.container.id).exec({
    // Its log file, and its output as supervisord keeps it.
    Cmd: [
      "sh",
      "-c",
      "cat /home/neko/.local/share/xorg/Xorg.*.log /var/log/neko/xorg.log 2>&1",
    ],
    User: "neko",
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });
  const log = await new Promise<string>((resolve, reject) => {
    let text = "";
    stream.on("data", (chunk: Buffer) => {
      text += chunk.toString();
    });
    stream.on("end", () => resolve(text));
    stream.on("error", reject);
  });
  const devices = log
    .split("\n")
    .filter((line) => line.includes("Adding extended input device"))
    .map((line) => line.replace(ADDED, ""));
  kit.check(
    `container: the X server adds "dummy_mouse" as a MOUSE and no touchscreen (${devices.join("; ") || "no device lines"})`,
    devices.some((line) => line.startsWith('"dummy_mouse" (type: MOUSE')) &&
      !devices.some((line) => line.includes("TOUCHSCREEN")),
    log.slice(-2000)
  );
};

/** One host's leg: its browser started, read, pressed, removed. */
const hostLeg = async (
  kit: Kit,
  browsers: Browsers,
  key: BrowserKey,
  host: "container" | "local"
): Promise<void> => {
  const { CdpLink } =
    (await import("../../../packages/agent/src/browser/cdp-takeover")) as Takeover;
  const { portsOf, readBrowser } =
    await import("../../../packages/agent/src/browser/state");
  await browsers.removeBrowser(key);
  const row = await browsers.startBrowser({ key });
  const record = await readBrowser(key);
  kit.check(
    `${host}: ${key} live on the ${host} host`,
    row.state === "live" && row.host === host && !!record,
    `${row.state} on ${row.host}`
  );
  if (!(record && row.state === "live")) {
    return;
  }
  const devtools = `http://127.0.0.1:${portsOf(record).devtools}`;
  const link = await CdpLink.open(devtools);
  try {
    if (host === "container") {
      await xorgDevices(kit, record);
    }
    await readings(kit, host, link);
    if (host === "container") {
      await containerPress(kit, record, link);
    } else {
      await localPress(kit, devtools, link);
    }
  } finally {
    link.close();
    await browsers.removeBrowser(key);
  }
};

const run = async (kit: Kit): Promise<void> => {
  const data = await mkdtemp(join(tmpdir(), "cawco-browser-mouse-"));
  process.env.XDG_DATA_HOME = data;
  const hidden = process.env.DOCKER_HOST;
  const browsers = await import("../../../packages/agent/src/browser/browsers");
  try {
    const runtime = await browsers.browserRuntime(true);
    if ("missing" in runtime) {
      kit.note(
        `container: no runtime answers here (${runtime.missing}); the local host alone`
      );
    } else {
      await hostLeg(kit, browsers, CONTAINER_KEY, "container");
    }
    process.env.DOCKER_HOST = "unix:///nonexistent";
    await browsers.browserRuntime(true);
    await hostLeg(kit, browsers, LOCAL_KEY, "local");
  } finally {
    if (hidden === undefined) {
      delete process.env.DOCKER_HOST;
    } else {
      process.env.DOCKER_HOST = hidden;
    }
    await browsers.browserRuntime(true);
    await Promise.allSettled([
      browsers.removeBrowser(CONTAINER_KEY),
      browsers.removeBrowser(LOCAL_KEY),
    ]);
    await rm(data, { recursive: true, force: true });
  }
};

const spec: Spec = {
  name: "browser-mouse",
  host: "the container host needs the machine's runtime, which a boundary hides, and the local host's Chromium needs its sandbox's namespaces, which no workspace can make",
  run,
};

export default spec;
