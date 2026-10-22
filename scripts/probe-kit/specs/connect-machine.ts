/**
 * Add machine (connect/, hub installs.ts), driven on a scratch fleet and read
 * on the engine: every state of the window reached and measured, at the desk
 * (1440×900) and the phone (390×844), light and dark.
 *
 * The machine is the kit's SSH target (ssh-target.ts): an `ssh2` server on
 * loopback whose PATH has no `tar`, so the hub's installer runs on it through
 * the hub's own connection and stops at its first check that fails ("tar is
 * needed"), the forced failure; while `$HOME/.hold` exists its `uname` holds,
 * so an install stands at Fetching the signed build for as long as a leg
 * needs it to. The command route's machine is the fleet's own agent: the
 * leg fetches the installer with the install's code (step one) and asks
 * after the agent's row naming the code, as the join wait does (cli
 * await-joined.ts), so the hub's fetch and join signals tick its steps.
 *
 * Legs, each a PASS or FAIL line:
 * - every state reached on the engine (its `data-step`, its words);
 * - the window is a modal: with no way in chosen it opens straight on its
 *   details, the Over SSH tab chosen, no question first; a press on the
 *   scrim leaves it open with what was typed; × on the draft just closes
 *   it, nothing parked; the machines list's Add machine opens it on Over
 *   SSH with the typing kept; each entry point that names a way (Home's
 *   cards, the list's ways) opens it on that tab;
 * - switching tabs keeps what was typed in each, and a reload opens it on
 *   the tab it stood on with both tabs' details;
 * - the tabs and each tab's details fit at 390, 680 and 1440 in Chromium
 *   and WebKit with nothing past the window's edge or scrolling, and
 *   nothing outside the window moves while it stands; each tab captured,
 *   dark, at 390 and 1440 (captures/add-machine);
 * - no scroll inside the window at any step (the dialog grid's scrollHeight
 *   ≤ its clientHeight, a finger's touch areas included), and the phone's
 *   Reach variants with a field to type in inside the visual viewport with
 *   the keyboard up (844 less a 336 keyboard: 508);
 * - each neighbouring step's height ≥ 36px apart;
 * - no layout shift while Running (each step row's box constant across ticks);
 * - a reload with the window open restores the same step and details, the
 *   password empty and saying why, typed at once before it too;
 * - a press on Port focuses its field in the press's own task: focus moved
 *   on straight after stays there, and what is typed lands where it went;
 * - typed here while another device edits the port, the hub keeps both
 *   edits and the window shows both (the draft travels as edits);
 * - Copy command copies the line and says so on Reach through its hold,
 *   then Running, never Route meanwhile, and the draft it used up is not
 *   made again (the hub's addresses carry its loopback as a network's: a
 *   workspace's machine lists none);
 * - closed while it works it minimizes: its row's step text changes on the
 *   engine, a reload leaves it minimized, a press on the row reopens the
 *   modal on its running step;
 * - the bar's machines item counts the install from the start, under the
 *   modal;
 * - a second Add machine for the same target opens that install;
 * - a forced failure says the Problem's words on the row and in the window,
 *   never as a toast;
 * - the command route's three steps tick from the hub's fetch and join, and
 *   its harnesses step (installs.ts `ready`) ends it joined;
 * - the modal's flight as it minimizes, scrubbed at 0, 0.5 and 1;
 * - on a phone the sheet follows a finger down its grabber and is put away
 *   past 30% of its height;
 * - in WebKit, focusing each Reach field moves nothing inside the sheet;
 * - (1) a press on the scrim leaves a failed install's window open; × and
 *   Esc each close it into its row: it stays on the hub, its row reopens it
 *   with Retry;
 * - (2) a command install whose installer fails a check fails at its own
 *   route's step (Installing on it), never an SSH one;
 * - (3) Stop in the output sheet asks first, the install running meanwhile;
 * - (4) what a failure left is said by how far it got: the key the add
 *   wrote named; a password add refused its forward after planting the
 *   hub's key says the installer never ran and names that key;
 * - (7) focus moves into the output sheet as it opens and stays there past
 *   the window's park; closed, the window comes back where it was, on its
 *   install, focus on its Open output;
 * - (8) on a phone every Reach text field computes 16px or more, in
 *   Chromium and WebKit;
 * - (9) a disabled Add machine says why in words beside it, with no title;
 * - (10) a failed read of the hub's addresses says so with Try again, the
 *   well says no command, Copy command says why it waits, and the window
 *   reads them again on its own until they come;
 * - (12) a failure's push says where it failed and why, the band's line;
 * - (14) the window reads the hub's addresses once per opening, as Reach shows;
 * - Lost and Joined are a ladder's rung apart.
 *
 *   bun scripts/probe-kit/run.ts connect-machine
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Page, Request } from "playwright-core";
import type { AuthContext } from "ssh2";
import type { InstallsRead } from "../../../packages/core/src/install";
import { listedPid, signal } from "../../../packages/core/src/signal";
import { until } from "../../scratch-fleet";
import { Clock } from "../anim";
import {
  handOn,
  type Kit,
  type KitFleet,
  open,
  type Spec,
  type Theme,
} from "../kit";
import {
  HELD,
  keyAccepted,
  machineBin,
  serveTarget,
  WAYS,
} from "../ssh-target";
import { type Phone, standInPhone } from "./turn-push";

const USER = "deploy";
const PASSWORD = `pw-${crypto.randomUUID()}`;
const WINDOW = "[data-connect-window]";
/** The dialog's content grid, the one box that would scroll. */
const BODY = `${WINDOW} [data-slot=grid]`;
/** The dialog's own ×. */
const CLOSE = `${WINDOW} [data-slot=dialog-close]`;
const RELOAD_FORGETS = /reload forgets/;
const FETCHING = /Fetching the signed build/;
const LACKS_TAR = /Failed at Fetching the signed build · it lacks tar/;
const CODE_IN = /code=([A-Z0-9]+)/;
const OPEN_NAVIGATION = /Open navigation/;
const OUTPUT = "[data-connect-output]";
/** What the forced failure left: the installer undid itself; the key the add gave the machine stays. */
const MACHINE_KEY_LEFT =
  "The installer removes what it created when it fails. 127.0.0.1 keeps its CawCo key in ~/.config/cawco/machine-key.";
/** What a password add refused its forward left: the hub's key it planted, and no installer run. */
const HUB_KEY_LEFT =
  "Then Retry. The installer never ran. 127.0.0.1 keeps the hub's SSH key in ~/.ssh/authorized_keys.";
/** The hub's addresses read by the window, and nothing else of `/api/join*`. */
const isJoinRead = (url: string | URL): boolean =>
  new URL(url).pathname === "/api/join";
/** The least two neighbouring steps' heights may differ by (the wireframe's ladder). */
const LADDER_GAP = 36;
/** The phone's visual viewport with the keyboard up: 844 less a 336 keyboard and its bar. */
const KEYBOARD_UP = 508;

/** One step as the engine draws it. */
interface Reading {
  bottom: number;
  height: number;
  /** What holds the window's size as it was read: its inline height, its animations, the grid's heights. */
  held: string;
  /** How far the body's content runs past its box: 0 when nothing scrolls. */
  overflow: number;
  step: string;
  text: string;
  top: number;
}

const read = (page: Page): Promise<Reading | null> =>
  page.evaluate(
    ([win, body]) => {
      const node = document.querySelector<HTMLElement>(win);
      const inner = document.querySelector<HTMLElement>(body);
      if (!(node && inner)) {
        return null;
      }
      const box = node.getBoundingClientRect();
      return {
        step: node.dataset.step ?? "",
        height: Math.round(box.height * 10) / 10,
        top: box.top,
        bottom: box.bottom,
        overflow: inner.scrollHeight - inner.clientHeight,
        held: `height ${node.style.height || "auto"}, max ${node.style.maxHeight || "css"}; animations ${JSON.stringify(
          node
            .getAnimations()
            .map(
              (one) =>
                `${(one as CSSAnimation).animationName ?? "script"} ${one.playState}`
            )
        )}; grid ${inner.clientHeight}/${inner.scrollHeight}`,
        text: node.innerText.replace(/\s+/g, " ").trim(),
      };
    },
    [WINDOW, BODY] as const
  );

/** Waits until the window stands on `step` and has stopped moving, then reads it. */
async function settled(
  page: Page,
  step: string,
  has?: string
): Promise<Reading> {
  let last = "";
  let held = 0;
  const deadline = Date.now() + 30_000;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each read is a frame after the last
    const now = await read(page);
    const key = now ? `${now.step}:${now.height}` : "";
    if (now && now.step === step && (!has || now.text.includes(has))) {
      held = key === last ? held + 1 : 0;
      last = key;
      if (held >= 4) {
        return now;
      }
    }
    if (Date.now() > deadline) {
      throw new Error(
        `the window never stood on ${step}${has ? ` saying "${has}"` : ""}: ${JSON.stringify(now)}`
      );
    }
    await page.waitForTimeout(80);
  }
}

const installs = (fleet: KitFleet) => fleet.api<InstallsRead>("/api/installs");

/** This spec's own place in the hub's order of draft edits (core DraftStamp): another device's. */
let probeSeq = Date.now();

/** An edit of the hub's draft from another device: the fields named, merged over what it holds. */
const editDraft = (
  fleet: KitFleet,
  draft: Partial<{
    route: "ssh" | "command" | null;
    target: string;
    port: string;
    signIn: "key" | "password" | "by-hand";
    address: string | null;
  }>
) => {
  probeSeq += 1;
  return fetch(`${fleet.base}/api/installs/draft`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stamp: { page: "probe-kit", seq: probeSeq },
      draft,
    }),
  });
};

/** The hub's draft, set whole as Reach would leave it. */
const setDraft = (
  fleet: KitFleet,
  draft: {
    route: "ssh" | "command" | null;
    target?: string;
    port?: string;
    signIn?: "key" | "password" | "by-hand";
  }
) =>
  editDraft(fleet, {
    route: draft.route,
    target: draft.target ?? "",
    port: draft.port ?? "",
    signIn: draft.signIn ?? "key",
    address: null,
  });

/** Every install the hub keeps goes, running ones stopped first. */
async function clearInstalls(fleet: KitFleet): Promise<void> {
  // biome-ignore lint/performance/noAwaitInLoops: one install after another, each stopped before it goes
  for (const one of (await installs(fleet)).installs) {
    if (one.state === "running") {
      await fetch(`${fleet.base}/api/installs/${one.id}/stop`, {
        method: "POST",
      });
    }
    await fetch(`${fleet.base}/api/installs/${one.id}`, { method: "DELETE" });
  }
}

/** Opens the dashboard with the window on the draft (`?install=new`) or an install. */
async function openWindow(page: Page, dashboard: string, at: string) {
  await open(page, `${dashboard}/?install=${at}`, WINDOW);
}

/** Types the port: "Port 22 ▾" opens its field first. */
async function fillPort(page: Page, port: number) {
  if (!(await page.locator("#connect-port").count())) {
    await page.locator(`${WINDOW} button[data-slot=port]`).click();
  }
  await page.fill("#connect-port", String(port));
}

/** Picks one of the window's two ways in by its tab ("Over SSH", "By a command"). */
async function pickTab(page: Page, name: string) {
  await page.locator(WINDOW).getByRole("tab", { name }).click();
}

/** The tab chosen in the window, by its name. */
const chosenTab = (page: Page) =>
  page.evaluate(
    (win) =>
      document
        .querySelector(`${win} [role=tab][aria-selected=true]`)
        ?.textContent?.trim() ?? "",
    WINDOW
  );

/** Picks `words` in the window's choice named `label` ("Sign in").*/
async function choose(page: Page, label: string, words: string) {
  await page
    .locator(`${WINDOW} button[aria-label^="${label}:"]`)
    .first()
    .click();
  await page.getByRole("menuitemradio", { name: words }).first().click();
}

/**
 * A press outside the window, on the page under it: a point where nothing
 * that answers a press stands (no control, no row, nothing of the window's).
 * A finger on a phone, the mouse at the desk.
 */
async function pressOutside(page: Page, view: "desk" | "phone") {
  const at = await page.evaluate(() => {
    const live =
      "a, button, input, textarea, select, label, summary, [role], [tabindex], [contenteditable], [data-connect-window], [data-connect-output], [data-install-row], [data-machines]";
    for (let y = 60; y < innerHeight - 8; y += 23) {
      for (let x = 8; x < innerWidth - 8; x += 29) {
        const hit = document.elementFromPoint(x, y);
        if (hit && hit !== document.documentElement && !hit.closest(live)) {
          return { x, y, what: hit.tagName };
        }
      }
    }
    return null;
  });
  if (!at) {
    throw new Error("no point on the page outside the window to press");
  }
  if (view === "phone") {
    await page.touchscreen.tap(at.x, at.y);
  } else {
    await page.mouse.click(at.x, at.y);
  }
}

/** Each text field of Reach's SSH pane and its computed font size, px. */
const fieldSizes = (page: Page) =>
  page.evaluate(() =>
    ["#connect-target", "#connect-port", "#connect-password"].map((sel) => {
      const field = document.querySelector<HTMLElement>(sel);
      return {
        field: sel,
        px: field ? Number.parseFloat(getComputedStyle(field).fontSize) : -1,
      };
    })
  );

/**
 * The machines list's Add machine, as the person reaches it: in the bar's
 * machines card on a desk, in the navigation sheet on a phone.
 */
async function addFromList(page: Page, view: "desk" | "phone") {
  const add = "[data-slot=row][data-add] >> visible=true";
  if (!(await page.locator(add).count())) {
    if (view === "desk") {
      await page.locator("[data-machines]").click();
    } else {
      await page.getByRole("button", { name: OPEN_NAVIGATION }).first().click();
    }
  }
  await page.locator(add).first().click();
}

/** Opens the port's field ("Port 22 ▾" gives way to it), so its size can be read. */
async function openPort(page: Page) {
  if (!(await page.locator("#connect-port").count())) {
    await page.locator(`${WINDOW} button[data-slot=port]`).click();
  }
  await page.waitForSelector("#connect-port");
}

interface Ladder {
  [state: string]: number;
}

async function run(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  const dir = join(fleet.sandbox, "ssh-target");
  const home = join(dir, "home");
  const bin = join(dir, "bin");
  mkdirSync(join(home, ".ssh"), { recursive: true, mode: 0o700 });
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(fleet.home, ".ssh"), { recursive: true, mode: 0o700 });
  const hubKey = join(fleet.home, ".ssh", "id_ed25519");
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -C cawco-probe-hub -f ${hubKey}`.quiet();
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -f ${join(dir, "host_key")}`.quiet();
  writeFileSync(
    join(dir, "ssh_config"),
    `UserKnownHostsFile ${join(dir, "known_hosts")}\nIdentityFile ${hubKey}\nIdentitiesOnly yes\n`
  );
  writeFileSync(
    join(bin, "ssh"),
    `#!/bin/sh\nexec /usr/bin/ssh -F ${join(dir, "ssh_config")} "$@"\n`
  );
  chmodSync(join(bin, "ssh"), 0o755);
  const authorized = join(home, ".ssh", "authorized_keys");
  writeFileSync(authorized, `${readFileSync(`${hubKey}.pub`, "utf8")}`, {
    mode: 0o600,
  });
  const path = machineBin(join(dir, "machine-bin"));
  const authenticate = (ctx: AuthContext): void => {
    if (ctx.username !== USER) {
      ctx.reject(WAYS);
      return;
    }
    if (ctx.method === "password") {
      if (ctx.password === PASSWORD) {
        ctx.accept();
      } else {
        ctx.reject(WAYS);
      }
      return;
    }
    if (ctx.method === "publickey" && keyAccepted(authorized, ctx)) {
      ctx.accept();
      return;
    }
    ctx.reject(WAYS);
  };
  const { port, server } = await serveTarget({
    authenticate,
    home,
    host: "127.0.0.1",
    hostKey: readFileSync(join(dir, "host_key")),
    path,
    port: 0,
  });
  // The same machine behind an sshd that refuses every forward
  // (`AllowTcpForwarding no`): a password add plants the hub's key, then
  // fails before the installer runs.
  const closed = await serveTarget({
    authenticate,
    forwards: false,
    home,
    host: "127.0.0.1",
    hostKey: readFileSync(join(dir, "host_key")),
    path,
    port: 0,
  });
  const target = `${USER}@127.0.0.1`;
  const hold = join(home, ".hold");
  const holdOn = () => writeFileSync(hold, "");
  const holdOff = () => rmSync(hold, { force: true });
  // Pushes go to a stand-in Cawrier, a phone paired with the hub: what a failure's push says.
  const pushes = standInPhone(fleet);

  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub", [], { PATH: `${bin}:${fleet.env.PATH}` });
    await fleet.hubUp();
    await pushes.pair();
    const dashboard = await fleet.dashboard();
    await entryTabs(kit, fleet, dashboard);
    fleet.launch("agent");
    await fleet.agentUp();

    await refusedForward(kit, fleet, dashboard, {
      pushes,
      port: closed.port,
      target,
    });

    /** Starts an SSH install held at its fetch, as Add machine does, and answers its id. */
    const startHeld = async (): Promise<string> => {
      holdOn();
      const started = await fleet.api<{ install: { id: string } }>(
        "/api/installs",
        { route: "ssh", target, port, signIn: "key" }
      );
      await until(
        "the install held at its fetch",
        () => installs(fleet),
        (now) =>
          now.installs.some(
            (one) =>
              one.id === started.install.id &&
              one.steps.at(-1)?.step === "fetch"
          ),
        60_000
      );
      return started.install.id;
    };

    const ladders: Record<string, Ladder> = {};
    for (const view of ["desk", "phone"] as const) {
      for (const theme of ["light", "dark"] as Theme[]) {
        // biome-ignore lint/performance/noAwaitInLoops: one page at a time, each walk on the hub the last one left
        ladders[`${view}-${theme}`] = await walk(kit, fleet, dashboard, {
          view,
          theme,
          hubKey,
          startHeld,
          holdOff,
          pushes,
          target,
          port,
        });
      }
    }

    // The ladder: every neighbouring pair ≥ 36px apart, at the desk and the phone.
    const NEIGHBOURS: [string, string][] = [
      ["reach-key", "reach-password"],
      ["reach-password", "reach-by-hand"],
      ["reach-key", "reach-by-hand"],
      ["reach-key", "reach-no-key"],
      ["reach-key", "reach-command"],
      ["reach-password", "reach-command"],
      ["reach-by-hand", "reach-command"],
      ["reach-key", "running-ssh"],
      ["reach-password", "running-ssh"],
      ["reach-by-hand", "running-ssh"],
      ["reach-command", "running-command"],
      ["running-ssh", "running-stop"],
      ["running-ssh", "problem"],
      ["running-ssh", "stopped"],
      ["running-ssh", "lost"],
      ["running-command", "joined"],
      ["running-command", "stopped-command"],
      ["problem", "running-ssh"],
      // Lost turns into Joined on its own once the fleet lists the machine.
      ["lost", "joined"],
    ];
    for (const view of ["desk", "phone"] as const) {
      const ladder = ladders[`${view}-light`] ?? {};
      kit.note(`${view} ladder: ${JSON.stringify(ladder)}`);
      const close = NEIGHBOURS.filter(
        ([a, b]) =>
          ladder[a] !== undefined &&
          ladder[b] !== undefined &&
          Math.abs(ladder[a] - ladder[b]) < LADDER_GAP
      ).map(([a, b]) => `${a} ${ladder[a]} / ${b} ${ladder[b]}`);
      kit.check(
        `${view}: each neighbouring step's height is ${LADDER_GAP}px or more apart from the next`,
        close.length === 0,
        close.length === 0 ? JSON.stringify(ladder) : close.join("; ")
      );
    }

    await keyboardUp(kit, fleet, dashboard);
    await webkitFocus(kit, fleet, dashboard);
    await tabsFit(kit, fleet, dashboard);
  } finally {
    holdOff();
    // A held install's `uname` became `sleep 3017` on the machine: whatever
    // of it a stop or a restart left goes (this workspace's processes alone).
    for (const entry of readdirSync("/proc")) {
      const pid = Number(entry);
      if (!Number.isInteger(pid)) {
        continue;
      }
      try {
        const argv = readFileSync(`/proc/${pid}/cmdline`, "utf8");
        if (argv === `${HELD.join("\0")}\0`) {
          signal(listedPid(pid), "SIGKILL");
        }
      } catch {
        // Gone already, or not this workspace's to read.
      }
    }
    server.close();
    closed.server.close();
    pushes.stop();
    writeFileSync(
      join(kit.out, "hub.log"),
      await fleet.logs("hub").catch(() => "")
    );
  }
}

interface WalkOptions {
  holdOff: () => void;
  hubKey: string;
  port: number;
  /** The stand-in phone every push reaches. */
  pushes: Phone;
  startHeld: () => Promise<string>;
  target: string;
  theme: Theme;
  view: "desk" | "phone";
}

/** One page through every state, its heights and its checks; answers the ladder. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the flow in the person's order, each state a step of one walk
async function walk(
  kit: Kit,
  fleet: KitFleet,
  dashboard: string,
  options: WalkOptions
): Promise<Ladder> {
  const { view, theme } = options;
  const leg = `${view} ${theme}`;
  const ladder: Ladder = {};
  const page = await kit.page(view, { theme });
  const scrolls: string[] = [];
  const note = (state: string, at: Reading) => {
    ladder[state] = at.height;
    if (at.overflow > 0.5) {
      scrolls.push(`${state} runs ${at.overflow}px past its box (${at.held})`);
    }
    kit.check(
      `${leg}: ${state} is reached (data-step ${at.step}), ${at.height}px tall`,
      true,
      at.text.slice(0, 160)
    );
  };
  await clearInstalls(fleet);

  // A: no way in chosen yet: the window opens on its details, Over SSH, no
  // question first. The hub with no key: the Sign in line gives way, Add
  // machine waits. Out of the hub's ~/.ssh altogether: any id_*.pub there is
  // a key the hub would use.
  const aside = join(fleet.sandbox, "hub-key-aside");
  renameSync(`${options.hubKey}.pub`, `${aside}.pub`);
  renameSync(options.hubKey, aside);
  await setDraft(fleet, { route: null });
  await openWindow(page, dashboard, "new");
  const noKey = await settled(page, "reach", "The hub has no SSH key yet");
  note("reach-no-key", noKey);
  const opensOn = await chosenTab(page);
  kit.check(
    `${leg}: with no way in chosen the window opens straight on its details, the Over SSH tab chosen, no question first`,
    opensOn === "Over SSH" && !noKey.text.includes("Can the hub"),
    `${opensOn}; ${noKey.text.slice(0, 120)}`
  );
  const waits = await page.evaluate((win) => {
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>(`${win} button`),
    ].find((one) => one.textContent?.trim().startsWith("Add machine"));
    const said = button?.getAttribute("aria-describedby");
    const words = said ? document.getElementById(said) : null;
    const a = button?.getBoundingClientRect();
    const b = words?.getBoundingClientRect();
    return {
      disabled: button?.disabled ?? false,
      title: button?.getAttribute("title") ?? null,
      words: words?.textContent?.trim() ?? "",
      shown: Boolean(b && b.width > 0 && b.height > 0),
      // Beside it: on its line, ending before it starts.
      beside: Boolean(
        a &&
        b &&
        Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) <= 1 &&
        b.right <= a.left
      ),
    };
  }, WINDOW);
  kit.check(
    `${leg}: (9) with no hub key, Add machine is disabled and says why in words beside it, no title`,
    waits.disabled &&
      waits.title === null &&
      waits.words === "Waits for the hub's SSH key" &&
      waits.shown &&
      waits.beside,
    JSON.stringify(waits)
  );
  renameSync(aside, options.hubKey);
  renameSync(`${aside}.pub`, `${options.hubKey}.pub`);
  // It changes on its own once the key exists.
  note("reach-key", await settled(page, "reach", "Sign in"));

  // B: password, then a reload: the field comes back empty and says why.
  // Every draft save the page sends, and how each ended: a failure says
  // what the hub was sent, and what it answered.
  const saves: string[] = [];
  const since = Date.now();
  const saveOf = (request: Request) =>
    request.url().endsWith("/api/installs/draft") &&
    request.method() === "PATCH";
  const sent = (request: Request) => {
    if (saveOf(request)) {
      const edit = JSON.parse(request.postData() ?? "{}") as {
        draft?: unknown;
      };
      saves.push(`+${Date.now() - since}ms sent ${JSON.stringify(edit.draft)}`);
    }
  };
  const ended = async (request: Request) => {
    if (!saveOf(request)) {
      return;
    }
    const at = Date.now() - since;
    const failed = request.failure()?.errorText;
    const response = failed ? null : await request.response();
    saves.push(`+${at}ms ${failed ?? `answered ${response?.status()}`}`);
  };
  page.on("request", sent);
  page.on("requestfinished", ended);
  page.on("requestfailed", ended);
  await choose(page, "Sign in", "with a password, once");
  const password = await settled(page, "reach", "Sign in");
  note("reach-password", password);
  // A press on Port takes its field focus in the press's own task: focus
  // moved straight on stays where it was moved. (A frame later, the port
  // took it back, and what was typed next landed in the port.)
  const portFocus = await page.evaluate(async (win) => {
    document
      .querySelector<HTMLButtonElement>(`${win} button[data-slot=port]`)
      ?.click();
    const pressed = document.activeElement?.id ?? "";
    document.querySelector<HTMLInputElement>("#connect-target")?.focus();
    await new Promise((done) => setTimeout(done, 150));
    return { pressed, after: document.activeElement?.id ?? "" };
  }, WINDOW);
  kit.check(
    `${leg}: a press on Port focuses its field at once, and focus moved on straight after stays where it was moved`,
    portFocus.pressed === "connect-port" &&
      portFocus.after === "connect-target",
    JSON.stringify(portFocus)
  );
  if (view === "phone") {
    await openPort(page);
    const sizes = await fieldSizes(page);
    await page.locator("#connect-target").focus();
    kit.check(
      `${leg}: (8) every Reach text field computes 16px or more on a phone, so iOS never zooms into it`,
      sizes.every((one) => one.px >= 16),
      JSON.stringify(sizes)
    );
  }
  await page.fill("#connect-target", options.target);
  await page.fill("#connect-password", "typed-and-forgotten");
  await page.waitForTimeout(700);
  // What the hub kept of the draft as the page goes, and once it is back: a
  // failure says whether the typing reached the hub or the restore lost it.
  const keptBefore = (await installs(fleet)).draft;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#connect-password", { timeout: 30_000 });
  // A save the reload overtook lands when it lands, and the hub's frame
  // brings it to the window then: the field is waited for, as below.
  await page
    .waitForFunction(
      (value) =>
        (document.querySelector("#connect-target") as HTMLInputElement | null)
          ?.value === value,
      options.target,
      { timeout: 5000 }
    )
    .catch(() => undefined);
  page.off("request", sent);
  page.off("requestfinished", ended);
  page.off("requestfailed", ended);
  const keptAfter = (await installs(fleet)).draft;
  const after = await page.evaluate(() => ({
    target: (document.querySelector("#connect-target") as HTMLInputElement)
      ?.value,
    password: (document.querySelector("#connect-password") as HTMLInputElement)
      ?.value,
    placeholder: (
      document.querySelector("#connect-password") as HTMLInputElement
    )?.placeholder,
    step: document.querySelector<HTMLElement>("[data-connect-window]")?.dataset
      .step,
  }));
  kit.check(
    `${leg}: a reload with the window open restores Reach with its details, the password empty and saying why`,
    after.step === "reach" &&
      after.target === options.target &&
      after.password === "" &&
      RELOAD_FORGETS.test(after.placeholder ?? ""),
    `${JSON.stringify(after)}; the hub's draft as it reloaded ${JSON.stringify(keptBefore)}, after ${JSON.stringify(keptAfter)}; the saves ${JSON.stringify(saves)}`
  );
  // Typed, and reloaded at once, inside the draft save's wait: the save still
  // waiting goes as the page does, and the reload restores what was typed.
  const typed = "fast@127.0.0.1";
  await page.fill("#connect-target", typed);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#connect-target", { timeout: 30_000 });
  const restored = await page
    .waitForFunction(
      (value) =>
        (document.querySelector("#connect-target") as HTMLInputElement | null)
          ?.value === value,
      typed,
      { timeout: 5000 }
    )
    .then(() => true)
    .catch(() => false);
  const keptFast = (await installs(fleet)).draft?.target;
  kit.check(
    `${leg}: typed and reloaded at once, the reload still restores what was typed (the waiting save goes as the page does)`,
    restored && keptFast === typed,
    `field ${await page.inputValue("#connect-target")}; the hub's draft ${keptFast}`
  );
  // Typed here while another device changes the port: each save carries
  // only the fields typed, so the hub keeps both and the window shows both.
  const mine = "merge@127.0.0.1";
  await page.fill("#connect-target", mine);
  await editDraft(fleet, { port: "2222" });
  const merged = await until(
    "the hub keeping both edits",
    () => installs(fleet),
    (now) => now.draft?.target === mine && now.draft?.port === "2222",
    10_000
  ).catch(() => null);
  const shown = await page
    .waitForFunction(
      (want) =>
        (document.querySelector("#connect-target") as HTMLInputElement | null)
          ?.value === want.target &&
        (document.querySelector("#connect-port") as HTMLInputElement | null)
          ?.value === want.port,
      { target: mine, port: "2222" },
      { timeout: 5000 }
    )
    .then(() => true)
    .catch(() => false);
  const draftNow = (await installs(fleet)).draft;
  kit.check(
    `${leg}: typed here while another device edits the port, the hub keeps both and the window shows both`,
    merged !== null && shown,
    `hub ${JSON.stringify(draftNow)}; field ${await page.inputValue("#connect-target")}, port ${await page
      .locator("#connect-port")
      .inputValue()
      .catch(() => "(no field)")}`
  );
  await editDraft(fleet, { port: "" });
  await page.waitForFunction(() => !document.querySelector("#connect-port"), {
    timeout: 10_000,
  });

  // A modal holds while it is open: a press on the scrim leaves it open
  // with what was typed; × just closes it, and on the draft nothing parks
  // (nothing has started). The machines list's Add machine, which names no
  // way in, opens it again on Over SSH, the typing kept (the hub's draft).
  await page.fill("#connect-target", "half@typed");
  await page.waitForTimeout(700);
  await pressOutside(page, view);
  await page.waitForTimeout(400);
  const held = await page.evaluate(
    (win) => ({
      open: document.querySelector<HTMLElement>(win)?.dataset.state === "open",
      target:
        document.querySelector<HTMLInputElement>("#connect-target")?.value ??
        "",
    }),
    WINDOW
  );
  kit.check(
    `${leg}: a press on the scrim leaves the window open with what was typed`,
    held.open && held.target === "half@typed",
    JSON.stringify(held)
  );
  const before = (await installs(fleet)).installs.length;
  await page.locator(CLOSE).click();
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });
  await page.waitForTimeout(400);
  const closedDraft = {
    installs: (await installs(fleet)).installs.length,
    rows: await page.locator("[data-install-row]").count(),
    url: new URL(page.url()).searchParams.get("install"),
  };
  kit.check(
    `${leg}: × on the draft just closes it: nothing parks, no install, no row, the URL names nothing`,
    closedDraft.installs === before &&
      closedDraft.rows === 0 &&
      closedDraft.url === null,
    JSON.stringify({ before, ...closedDraft })
  );
  await editDraft(fleet, { route: "command" });
  await page.waitForTimeout(300);
  await addFromList(page, view);
  await settled(page, "reach", "Sign in");
  const fromList = {
    tab: await chosenTab(page),
    target: await page.inputValue("#connect-target"),
  };
  kit.check(
    `${leg}: the machines list's Add machine, naming no way in, opens on Over SSH with the typing kept`,
    fromList.tab === "Over SSH" && fromList.target === "half@typed",
    JSON.stringify(fromList)
  );

  // Each tab keeps what was typed in it while the other shows, and a reload
  // opens the window on the tab it stood on, both tabs' details kept. The
  // command tab's input is its address: the hub's read carries two here (a
  // workspace's machine lists none), and the second is chosen.
  const local = fleet.base.replace("127.0.0.1", "localhost");
  await page.route(isJoinRead, async (route) => {
    const response = await route.fetch();
    const joinInfo = (await response.json()) as {
      addresses: { label: string; url: string }[];
    };
    await route.fulfill({
      response,
      json: {
        ...joinInfo,
        addresses: [
          ...joinInfo.addresses,
          { label: "probe0", url: fleet.base },
          { label: "On this network", url: local },
        ],
      },
    });
  });
  await page.locator(CLOSE).click();
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });
  await openWindow(page, dashboard, "new");
  await settled(page, "reach", "Sign in");
  await fillPort(page, 2200);
  await pickTab(page, "By a command");
  await settled(page, "reach", "It reaches the hub at");
  await page.waitForSelector(`${WINDOW} [data-address=local] input:enabled`, {
    timeout: 10_000,
  });
  await page.locator(`${WINDOW} [data-address=local] input`).check();
  await pickTab(page, "Over SSH");
  await settled(page, "reach", "Sign in");
  const sshKept = {
    target: await page.inputValue("#connect-target"),
    port: await page.inputValue("#connect-port").catch(() => "(no field)"),
  };
  await pickTab(page, "By a command");
  await settled(page, "reach", "It reaches the hub at");
  const chosenAddress = () =>
    page.evaluate(
      (win) =>
        document
          .querySelector<HTMLElement>(`${win} [data-address] input:checked`)
          ?.closest<HTMLElement>("[data-address]")?.dataset.address ?? "",
      WINDOW
    );
  const commandKept = await chosenAddress();
  await page.waitForTimeout(700);
  await page.reload({ waitUntil: "domcontentloaded" });
  await settled(page, "reach", "It reaches the hub at");
  // The addresses stand once the window's read of them lands.
  await page
    .waitForSelector(`${WINDOW} [data-address] input:checked`, {
      timeout: 10_000,
    })
    .catch(() => undefined);
  const afterReload = {
    tab: await chosenTab(page),
    address: await chosenAddress(),
  };
  await pickTab(page, "Over SSH");
  await settled(page, "reach", "Sign in");
  const sshAfterReload = {
    target: await page.inputValue("#connect-target"),
    port: await page.inputValue("#connect-port").catch(() => "(no field)"),
  };
  kit.check(
    `${leg}: switching tabs keeps what was typed in each (SSH's address and port, the command's chosen address)`,
    sshKept.target === "half@typed" &&
      sshKept.port === "2200" &&
      commandKept === "local",
    JSON.stringify({ sshKept, commandKept })
  );
  kit.check(
    `${leg}: a reload opens the window on the tab it stood on, both tabs' details kept`,
    afterReload.tab === "By a command" &&
      afterReload.address === "local" &&
      sshAfterReload.target === "half@typed" &&
      sshAfterReload.port === "2200",
    JSON.stringify({ afterReload, sshAfterReload })
  );
  await page.unroute(isJoinRead);
  await editDraft(fleet, { port: "", address: null });
  await page.waitForFunction(() => !document.querySelector("#connect-port"), {
    timeout: 10_000,
  });

  // B: the key put there by hand.
  await choose(page, "Sign in", "I'll put the key there myself");
  note("reach-by-hand", await settled(page, "reach", "authorized_keys"));

  // B: by a command.
  await pickTab(page, "By a command");
  note("reach-command", await settled(page, "reach", "It reaches the hub at"));

  // (14) and (10): the window reads the hub's addresses once per opening, as Reach shows;
  // a read that fails says so, and the window reads them again on its own.
  let joinReads = 0;
  /** Whether the hub's answer to the read is a refusal, as the leg turns it. */
  const hub: { refuses: boolean } = { refuses: true };
  const reads = (request: { url: () => string }) => {
    if (isJoinRead(request.url())) {
      joinReads += 1;
    }
  };
  page.on("request", reads);
  await page.route(isJoinRead, (route) =>
    hub.refuses
      ? route.fulfill({
          status: 503,
          contentType: "text/plain",
          body: "The hub is starting",
        })
      : route.continue()
  );
  await page.focus(CLOSE);
  await page.keyboard.press("Escape");
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });
  joinReads = 0;
  await openWindow(page, dashboard, "new");
  const failing = await settled(page, "reach", "couldn't be read");
  const readsOnOpen = joinReads;
  const waiting = await page.evaluate((win) => {
    const node = document.querySelector<HTMLElement>(win);
    const copy = [...(node?.querySelectorAll("button") ?? [])].find((one) =>
      one.textContent?.includes("Copy command")
    );
    const said = copy?.getAttribute("aria-describedby");
    return {
      well:
        node
          ?.querySelector<HTMLElement>("[data-slot=well]")
          ?.innerText.replace(/\s+/g, " ")
          .trim() ?? "",
      copyDisabled: copy?.disabled ?? false,
      copyWaits: said
        ? (document.getElementById(said)?.textContent?.trim() ?? "")
        : "",
      tryAgain: Boolean(
        [...(node?.querySelectorAll("button") ?? [])].find((one) =>
          one.textContent?.includes("Try again")
        )
      ),
    };
  }, WINDOW);
  const beforePress = joinReads;
  await page.locator(WINDOW).getByRole("button", { name: "Try again" }).click();
  await page.waitForTimeout(300);
  const pressed = joinReads - beforePress;
  kit.check(
    `${leg}: (10) the hub's addresses unread: the window says so with Try again, the well says no command, Copy command says why it waits; Try again reads them again`,
    failing.text.includes(
      "The hub's addresses couldn't be read: The hub is starting"
    ) &&
      waiting.tryAgain &&
      waiting.well.includes("No command until the hub's addresses are read") &&
      waiting.copyDisabled &&
      waiting.copyWaits === "Waits for the hub's addresses" &&
      pressed >= 1,
    `${JSON.stringify(waiting)}; Try again read ${pressed}; ${failing.text.slice(0, 200)}`
  );
  // The hub answers again: the window reads its addresses on its own.
  hub.refuses = false;
  const recovered = await page
    .waitForFunction(
      (win) =>
        Boolean(
          document.querySelector(`${win} [role=radiogroup]`) &&
          !document
            .querySelector(win)
            ?.textContent?.includes("couldn't be read")
        ),
      WINDOW,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false);
  kit.check(
    `${leg}: (10) once the hub answers, the window reads its addresses again on its own, no press`,
    recovered,
    `reads ${joinReads}`
  );
  await page.unroute(isJoinRead);
  // One open, one read: closed and opened again on the SSH route.
  await page.focus(CLOSE);
  await page.keyboard.press("Escape");
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });
  await setDraft(fleet, { route: "ssh" });
  joinReads = 0;
  await openWindow(page, dashboard, "new");
  await settled(page, "reach", "Sign in");
  await page.waitForTimeout(1500);
  page.off("request", reads);
  kit.check(
    `${leg}: (14) the window reads the hub's addresses once per opening, as Reach shows`,
    readsOnOpen === 1 && joinReads === 1,
    `failing open read ${readsOnOpen}; SSH open read ${joinReads}`
  );

  // C: Running over SSH, held at its fetch, started from the window.
  await pickTab(page, "Over SSH");
  await choose(page, "Sign in", "with the hub's key");
  await page.fill("#connect-target", options.target);
  await fillPort(page, options.port);
  // The hold is on before Add machine: the install stands at its fetch.
  writeFileSync(join(fleet.sandbox, "ssh-target", "home", ".hold"), "");
  await page
    .locator(WINDOW)
    .getByRole("button", { name: "Add machine" })
    .click();
  await settled(page, "running", "Fetching the signed build");
  const id = new URL(page.url()).searchParams.get("install") ?? "";
  await until(
    "the install at its fetch",
    () => installs(fleet),
    (now) =>
      now.installs.some(
        (one) => one.id === id && one.steps.at(-1)?.step === "fetch"
      ),
    60_000
  );
  note(
    "running-ssh",
    await settled(page, "running", "Fetching the signed build")
  );

  // No layout shift while Running: each step row's box holds across three ticks.
  const boxes = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "[data-connect-window] [data-step]"
        ),
      ].map((step) => {
        const box = step.getBoundingClientRect();
        return `${step.dataset.step}:${box.top.toFixed(1)},${box.left.toFixed(1)},${box.width.toFixed(1)},${box.height.toFixed(1)}`;
      })
    );
  const first = await boxes();
  const ticks: string[][] = [];
  for (let tick = 0; tick < 3; tick += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one tick after another
    await page.waitForTimeout(1100);
    ticks.push(await boxes());
  }
  kit.check(
    `${leg}: no layout shift while Running: every step row's box is the same across three ticks`,
    ticks.every((one) => JSON.stringify(one) === JSON.stringify(first)) &&
      first.length >= 7,
    `first ${JSON.stringify(first)}; ${ticks
      .map((one, at) =>
        JSON.stringify(one) === JSON.stringify(first)
          ? `tick ${at + 1} the same`
          : `tick ${at + 1} ${JSON.stringify(one.filter((box, index) => box !== first[index]))}`
      )
      .join("; ")}`
  );

  // The install counts in the bar's machines item from the start, under the
  // modal's scrim, before any close: its row in the band is read once the
  // window is minimized (nothing under a modal can be opened).
  const barSays = await page
    .locator("[data-machines]")
    .first()
    .getAttribute("aria-label");
  kit.check(
    `${leg}: the bar's machines item counts the install being added from the start, under the modal`,
    (barSays ?? "").includes("1 being added"),
    `${barSays}`
  );

  // A reload with the window open on the running install: the same step and details.
  await page.reload({ waitUntil: "domcontentloaded" });
  const reloaded = await settled(page, "running", "Fetching the signed build");
  kit.check(
    `${leg}: a reload with the window open restores Running on the same install`,
    new URL(page.url()).searchParams.get("install") === id &&
      reloaded.text.includes(options.target),
    reloaded.text.slice(0, 120)
  );

  // Stop asks in the page, under the footer.
  await page
    .locator(WINDOW)
    .getByRole("button", { name: "Stop install" })
    .first()
    .click();
  await page.waitForSelector(
    `${WINDOW} [data-ask="stop-install"] [data-ask-cancel]`
  );
  const asking = await settled(
    page,
    "running",
    "the install may be part-way in"
  );
  note("running-stop", asking);
  await page.locator(`${WINDOW} [data-ask-cancel]`).click();
  await settled(page, "running", "Fetching the signed build");

  // (7) and (3): Open output. Focus goes into the sheet and stays there past
  // the window's park into its row; its Stop asks first, in the same words
  // as the window's, and nothing stops meanwhile; closed, it is
  // back-navigation: the window comes back where it was, on its install,
  // focus on its Open output.
  const where = await page.evaluate((win) => {
    const box = document.querySelector(win)?.getBoundingClientRect();
    return box ? { top: box.top, left: box.left } : null;
  }, WINDOW);
  await page
    .locator(WINDOW)
    .getByRole("button", { name: "Open output" })
    .click();
  await page.waitForSelector(`${OUTPUT}[data-state=open]`);
  // The window's park into its row (--dur-panel) has played by now.
  await page.waitForTimeout(600);
  const focusIn = await page.evaluate(
    (sel) =>
      document.querySelector(sel)?.contains(document.activeElement) ?? false,
    OUTPUT
  );
  await page
    .locator(OUTPUT)
    .getByRole("button", { name: "Stop install" })
    .click();
  await page.waitForSelector(
    `${OUTPUT} [data-ask="stop-output"] [data-ask-cancel]`
  );
  const sheetAsks = await page
    .locator(`${OUTPUT} [data-ask="stop-output"]`)
    .innerText();
  await page.waitForTimeout(600);
  const runsOn =
    (await installs(fleet)).installs.find((one) => one.id === id)?.state ??
    "gone";
  await page.locator(`${OUTPUT} [data-ask-cancel]`).click();
  await page.waitForFunction(
    (sel) => !document.querySelector(`${sel} [data-ask]`),
    OUTPUT
  );
  kit.check(
    `${leg}: (3) Stop in the output sheet asks first, with what stopping leaves, and the install runs on until it is answered`,
    sheetAsks.includes("Stop installing on 127.0.0.1?") &&
      sheetAsks.includes("the install may be part-way in") &&
      runsOn === "running",
    `${sheetAsks.replace(/\s+/g, " ")}; the install ${runsOn}`
  );
  await page
    .locator(OUTPUT)
    .getByRole("button", { name: "Close output" })
    .click();
  await page.waitForFunction((sel) => !document.querySelector(sel), OUTPUT, {
    timeout: 10_000,
  });
  const cameBack = await settled(page, "running", "Fetching the signed build");
  const focusBack = await page.evaluate((win) => {
    const active = document.activeElement as HTMLElement | null;
    const box = document.querySelector(win)?.getBoundingClientRect();
    return {
      opener: Boolean(
        active?.matches("[data-output-opener]") && active.closest(win)
      ),
      what: active
        ? `${active.tagName} ${(active.textContent ?? "").trim().slice(0, 24)}`
        : "none",
      at: box ? { top: box.top, left: box.left } : null,
    };
  }, WINDOW);
  const sameInstall = new URL(page.url()).searchParams.get("install") === id;
  const samePlace = Boolean(
    where &&
    focusBack.at &&
    Math.abs(where.top - focusBack.at.top) <= 1 &&
    Math.abs(where.left - focusBack.at.left) <= 1
  );
  kit.check(
    `${leg}: (7) focus moves into the output sheet and stays past the window's park; closed, the window comes back where it was, on its install, focus on its Open output`,
    focusIn &&
      cameBack.step === "running" &&
      sameInstall &&
      samePlace &&
      focusBack.opener,
    `in ${focusIn}; back on ${focusBack.what}; the window ${cameBack.step} on ${sameInstall ? "its install" : page.url()}, at ${JSON.stringify(focusBack.at)} (was ${JSON.stringify(where)})`
  );

  // A second Add machine for the same target opens that install.
  await setDraft(fleet, {
    route: "ssh",
    target: options.target,
    port: String(options.port),
  });
  await page.focus(CLOSE);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await openWindow(page, dashboard, "new");
  await settled(page, "reach", "Sign in");
  await page.fill("#connect-target", options.target);
  await fillPort(page, options.port);
  await page
    .locator(WINDOW)
    .getByRole("button", { name: "Add machine" })
    .click();
  await settled(page, "running", "Fetching the signed build");
  const second = new URL(page.url()).searchParams.get("install");
  const all = await installs(fleet);
  kit.check(
    `${leg}: a second Add machine for the same target opens that install, never a second one`,
    second === id &&
      all.installs.filter(
        (one) => one.state === "running" && one.route === "ssh"
      ).length === 1,
    `opened ${second}, running ${all.installs
      .filter((one) => one.state === "running")
      .map((one) => one.id)
      .join(", ")}`
  );

  // Esc minimizes it while it works: on the desk into the bar's machines
  // item (no card stands open under a modal). The row is live in the band,
  // a reload leaves it minimized, and a press on the row brings the modal
  // back on its running step; closed again with the band open behind it, it
  // flies into the row (scrubbed at the desk in light).
  await page.focus(CLOSE);
  await page.keyboard.press("Escape");
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });
  const row = `[data-install-row="${id}"] [data-slot=step] >> visible=true`;
  await rowShown(page, view, id);
  const firstSaid = await page.locator(row).first().innerText();
  await page.waitForTimeout(2100);
  const later = await page.locator(row).first().innerText();
  kit.check(
    `${leg}: closed while it works, the install's row is live: its step text changes on the engine`,
    firstSaid !== later && FETCHING.test(later),
    `${firstSaid} → ${later}`
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const stillMinimized = {
    open: await page.locator(WINDOW).count(),
    url: new URL(page.url()).searchParams.get("install"),
    shown: await rowShown(page, view, id),
  };
  kit.check(
    `${leg}: a reload leaves a minimized install minimized: no window, its row in the band`,
    stillMinimized.open === 0 &&
      stillMinimized.url === null &&
      stillMinimized.shown,
    JSON.stringify(stillMinimized)
  );
  await page
    .locator(`[data-install-row="${id}"] >> visible=true`)
    .first()
    .click();
  const back = await settled(page, "running", "Fetching the signed build");
  kit.check(
    `${leg}: a press on the row reopens the modal on its running step, the same install`,
    new URL(page.url()).searchParams.get("install") === id &&
      back.step === "running",
    back.text.slice(0, 100)
  );
  if (view === "desk" && theme === "light") {
    await scrubFlight(kit, page, id);
    await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
      timeout: 10_000,
    });
  }

  // The forced failure. A held install's `uname` has become its `sleep`,
  // which no release ends: it is stopped and goes, and the same machine is
  // added again with no hold, from the window, so the installer runs to its
  // first failing check (no `tar` on the machine).
  await fetch(`${fleet.base}/api/installs/${id}/stop`, { method: "POST" });
  await fetch(`${fleet.base}/api/installs/${id}`, { method: "DELETE" });
  options.holdOff();
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });
  let failedId: string;
  if (view === "desk") {
    await setDraft(fleet, {
      route: "ssh",
      target: options.target,
      port: String(options.port),
    });
    await openWindow(page, dashboard, "new");
    await settled(page, "reach", "Sign in");
    await page
      .locator(WINDOW)
      .getByRole("button", { name: "Add machine" })
      .click();
    failedId = await until(
      "the install that fails",
      async () => new URL(page.url()).searchParams.get("install") ?? undefined,
      (named) => named !== "new",
      30_000
    );
  } else {
    // A phone's band is its navigation sheet: the failure lands, its row
    // says so there, and a press on the row opens the drawer on it.
    const started = await fleet.api<{ install: { id: string } }>(
      "/api/installs",
      {
        route: "ssh",
        target: options.target,
        port: options.port,
        signIn: "key",
      }
    );
    failedId = started.install.id;
    await until(
      "the install failed",
      () => installs(fleet),
      (now) =>
        now.installs.some(
          (one) => one.id === failedId && one.state === "failed"
        ),
      60_000
    );
  }
  let rowWords = "";
  if (view === "phone") {
    await rowShown(page, view, failedId);
    rowWords = await readRow(page, failedId);
    await page
      .locator(`[data-install-row="${failedId}"] >> visible=true`)
      .first()
      .click();
  }
  const problem = await settled(
    page,
    "outcome",
    "Failed at Fetching the signed build"
  );
  note("problem", problem);
  const toasts = await page.evaluate(() =>
    [...document.querySelectorAll("[data-sonner-toast]")].map(
      (one) => one.textContent ?? ""
    )
  );
  if (view === "desk") {
    // Nothing under a modal opens: the window closes into its row, the row
    // is read in the band, and a press on it opens the window again.
    await closeAndRead(
      page,
      view,
      failedId,
      "Failed at Fetching the signed build"
    ).then((words) => {
      rowWords = words;
    });
  }
  kit.check(
    `${leg}: a forced failure says the Problem's words in the window and on the row, never as a toast`,
    problem.text.includes("tar") &&
      LACKS_TAR.test(rowWords) &&
      !toasts.some((one) => one.includes("tar")),
    `window: ${problem.text.slice(0, 200)}; row: ${rowWords}; toasts: ${JSON.stringify(toasts)}`
  );

  // (4) What it left, by how far it got: the installer ran and undid itself;
  // the key the add gave the machine stays there, named.
  const failedNow = (await installs(fleet)).installs.find(
    (one) => one.id === failedId
  );
  kit.check(
    `${leg}: (4) the failure says what it left by how far it got: the installer's undo, and the machine key the add wrote, named`,
    problem.text.includes(MACHINE_KEY_LEFT) &&
      failedNow?.keys.machine === true &&
      !failedNow.keys.hub,
    `keys ${JSON.stringify(failedNow?.keys)}; ${problem.text.slice(problem.text.indexOf("Then Retry"), problem.text.indexOf("Then Retry") + 200)}`
  );

  // (12) Its push says where it failed and why: the row's own line.
  const alerts = await until(
    "the failure's push",
    async () => options.pushes.installAlerts(failedId),
    (seen) => seen.length > 0,
    20_000
  ).catch(() => options.pushes.installAlerts(failedId));
  kit.check(
    `${leg}: (12) the failure's push says where it failed and why, the row's own line`,
    alerts.at(-1)?.body ===
      "Failed at Fetching the signed build · it lacks tar",
    JSON.stringify(alerts)
  );

  // (1) A press on the scrim leaves the outcome open; × and Esc each close
  // it into its row, the install stays on the hub, and the row reopens it
  // with Retry.
  await pressOutside(page, view);
  await page.waitForTimeout(500);
  const scrimHeld = await read(page);
  kit.check(
    `${leg}: (1) a press on the scrim leaves the failed install's window open on its outcome`,
    scrimHeld?.step === "outcome" &&
      (await page.locator(`${WINDOW}[data-state=open]`).count()) === 1,
    `${scrimHeld?.step}`
  );
  const parks: string[] = [];
  let parked = true;
  for (const how of ["×", "Esc"] as const) {
    if (how === "×") {
      // biome-ignore lint/performance/noAwaitInLoops: one way of closing after another, each on the window the last reopened
      await page.locator(CLOSE).click();
    } else {
      await page.focus(CLOSE);
      await page.keyboard.press("Escape");
    }
    await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
      timeout: 10_000,
    });
    await page.waitForTimeout(500);
    const kept =
      (await installs(fleet)).installs.find((one) => one.id === failedId)
        ?.state ?? "gone";
    await rowShown(page, view, failedId);
    await page
      .locator(`[data-install-row="${failedId}"] >> visible=true`)
      .first()
      .click();
    const again = await settled(
      page,
      "outcome",
      "Failed at Fetching the signed build"
    );
    const retry = await page
      .locator(WINDOW)
      .getByRole("button", { name: "Retry" })
      .isVisible();
    parks.push(
      `${how}: ${kept}, its row reopened ${again.step}, Retry ${retry}`
    );
    parked &&= kept === "failed" && retry;
  }
  kit.check(
    `${leg}: (1) × and Esc each close the failed install into its row: it stays, and its row reopens it with Retry`,
    parked,
    parks.join("; ")
  );
  // Remove install: the outcome goes from the band.
  await page
    .locator(WINDOW)
    .getByRole("button", { name: "Remove install" })
    .click();
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });

  // Stopped, before it signed in is not reachable on a held fetch: it signed in.
  const stoppedId = await options.startHeld();
  await openWindow(page, dashboard, stoppedId);
  await settled(page, "running", "Fetching the signed build");
  await page
    .locator(WINDOW)
    .getByRole("button", { name: "Stop install" })
    .first()
    .click();
  await page
    .locator(`${WINDOW} [data-ask="stop-install"] button`, {
      hasText: "Stop install",
    })
    .click();
  note("stopped", await settled(page, "outcome", "Stopped after it signed in"));
  await page
    .locator(WINDOW)
    .getByRole("button", { name: "Remove install" })
    .click();
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });

  // Lost: the hub restarts under a held install.
  const lostId = await options.startHeld();
  await fleet.stop("hub");
  fleet.launch("hub", [], {
    PATH: `${join(fleet.sandbox, "ssh-target", "bin")}:${fleet.env.PATH}`,
  });
  await fleet.hubUp();
  options.holdOff();
  await openWindow(page, dashboard, lostId);
  note(
    "lost",
    await settled(page, "outcome", "The hub restarted during the install")
  );
  await page
    .locator(WINDOW)
    .getByRole("button", { name: "Remove install" })
    .click();
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });
  await fleet.agentUp();

  /**
   * Copy command, pressed as the person presses it. A workspace's machine
   * lists no address but loopback, and Copy command waits for one, so the
   * hub's answer to the window's read of its addresses carries one more:
   * its own loopback, as a network's. The press, the copy, the hold and the
   * start are the real ones. Answers the install, the steps the window
   * stood on from the press to Running, whether "Copied · Listening for it"
   * showed, what the clipboard holds, and the hub's draft after.
   */
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route(isJoinRead, async (route) => {
    const response = await route.fetch();
    const joinInfo = (await response.json()) as {
      addresses: { label: string; url: string }[];
    };
    await route.fulfill({
      response,
      json: {
        ...joinInfo,
        addresses: [
          ...joinInfo.addresses,
          { label: "probe0", url: fleet.base },
        ],
      },
    });
  });
  const copyCommand = async () => {
    await setDraft(fleet, { route: "command" });
    await openWindow(page, dashboard, "new");
    await settled(page, "reach", "It reaches the hub at");
    await page.evaluate((win) => {
      const node = document.querySelector<HTMLElement>(win);
      const steps = [node?.dataset.step ?? ""];
      if (node) {
        new MutationObserver(() => {
          const now = node.dataset.step ?? "";
          if (steps.at(-1) !== now) {
            steps.push(now);
          }
        }).observe(node, { attributes: true, attributeFilter: ["data-step"] });
      }
      (globalThis as { __steps?: string[] }).__steps = steps;
    }, WINDOW);
    await page
      .locator(WINDOW)
      .getByRole("button", { name: "Copy command" })
      .click();
    const copied = await page
      .locator(WINDOW)
      .getByText("Copied · Listening for it")
      .waitFor({ timeout: 1000 })
      .then(() => true)
      .catch(() => false);
    await settled(page, "running", "Waiting for the command to run on it");
    return {
      id: new URL(page.url()).searchParams.get("install") ?? "",
      copied,
      steps: await page.evaluate(
        () => (globalThis as { __steps?: string[] }).__steps ?? []
      ),
      clipboard: await page.evaluate(() => navigator.clipboard.readText()),
      draft: (await installs(fleet)).draft,
    };
  };

  // C by a command: Copy command holds its words on Reach, then Running;
  // the hub's fetch and join tick its three steps.
  const copy = await copyCommand();
  const commandId = copy.id;
  const commandLine =
    (await installs(fleet)).installs.find((one) => one.id === commandId)
      ?.command ?? "";
  kit.check(
    `${leg}: Copy command copies the line and says so on Reach through its hold, then Running; the window never stands on Route meanwhile, and the draft it used is not made again`,
    copy.copied &&
      copy.steps.join(",") === "reach,running" &&
      copy.clipboard === commandLine &&
      copy.draft === null,
    JSON.stringify({ ...copy, commandLine })
  );
  const listening = await settled(
    page,
    "running",
    "Waiting for the command to run on it"
  );
  note("running-command", listening);
  const command =
    (await installs(fleet)).installs.find((one) => one.id === commandId)
      ?.command ?? "";
  const code = CODE_IN.exec(command)?.[1] ?? "";
  const stepsOf = async () =>
    (await installs(fleet)).installs
      .find((one) => one.id === commandId)
      ?.steps.map((one) => `${one.step}${one.endedAt === null ? "…" : "✓"}`) ??
    [];
  const fetched = await fetch(`${fleet.base}/install.sh?code=${code}`).then(
    (r) => r.text()
  );
  const afterFetch = await stepsOf();
  const machines = await fleet.api<{ machineId: string }[]>("/api/agents");
  const machineId = machines[0]?.machineId ?? "";
  await fetch(`${fleet.base}/api/agents/${encodeURIComponent(machineId)}`, {
    headers: { "x-cawco-install-code": code },
  });
  const joined = await settled(page, "outcome", "is in the fleet");
  note("joined", joined);
  const afterJoin = (await installs(fleet)).installs.find(
    (one) => one.id === commandId
  );
  kit.check(
    `${leg}: the command route's steps tick from the hub's fetch and join signals, and its harnesses step ends it joined`,
    fetched.includes(`CODE='${code}'`) &&
      JSON.stringify(afterFetch) === JSON.stringify(["run✓", "install…"]) &&
      afterJoin?.state === "joined" &&
      afterJoin.steps.map((one) => one.step).join(",") ===
        "run,install,listed,harnesses",
    `after the fetch ${JSON.stringify(afterFetch)}; after the join ${afterJoin?.state} ${JSON.stringify(afterJoin?.steps.map((one) => one.step))}`
  );
  await page.focus(CLOSE);
  await page.keyboard.press("Escape");
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });

  // (2) A command install whose installer fails a check: it fails at its
  // own route's step, the one its window and row name, never an SSH one.
  const checkId = (await copyCommand()).id;
  await settled(page, "running", "Waiting for the command to run on it");
  const checkCode =
    CODE_IN.exec(
      (await installs(fleet)).installs.find((one) => one.id === checkId)
        ?.command ?? ""
    )?.[1] ?? "";
  await fetch(`${fleet.base}/install.sh?code=${checkCode}`).then((r) =>
    r.text()
  );
  // What the installer's end says when its check for tar fails (core install-script.ts).
  await fetch(`${fleet.base}/api/installs/code/${checkCode}/ended`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      status: 1,
      said: "tar is needed to unpack the build. Install it with the machine's package manager, then run this again.",
      host: "build-01",
    }),
  });
  const checkFailed = await settled(
    page,
    "outcome",
    "Failed at Installing on it"
  );
  const checkInstall = (await installs(fleet)).installs.find(
    (one) => one.id === checkId
  );
  const checkRow = await closeAndRead(
    page,
    view,
    checkId,
    "Failed at Installing on it"
  );
  kit.check(
    `${leg}: (2) a command install whose installer fails a check fails at its own step, Installing on it, in the window and on its row`,
    checkInstall?.problemStep === "install" &&
      checkFailed.text.includes("Failed at Installing on it") &&
      !checkFailed.text.includes("Fetching the signed build") &&
      checkRow.startsWith("Failed at Installing on it · it lacks tar"),
    `step ${checkInstall?.problemStep}; row ${checkRow}; window ${checkFailed.text.slice(0, 120)}`
  );
  await fetch(`${fleet.base}/api/installs/${checkId}`, { method: "DELETE" });
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });

  // A command install stopped: its code goes void.
  await copyCommand();
  await settled(page, "running", "Waiting for the command to run on it");
  await page
    .locator(WINDOW)
    .getByRole("button", { name: "Stop install" })
    .first()
    .click();
  await page
    .locator(`${WINDOW} [data-ask="stop-install"] button`, {
      hasText: "Stop install",
    })
    .click();
  note(
    "stopped-command",
    await settled(page, "outcome", "The command no longer works")
  );
  await page
    .locator(WINDOW)
    .getByRole("button", { name: "Remove install" })
    .click();
  await page.unroute(isJoinRead);

  kit.check(
    `${leg}: nothing inside the window scrolls at any step`,
    scrolls.length === 0,
    scrolls.join("; ") || `${Object.keys(ladder).length} steps read`
  );
  await page.close();
  return ladder;
}

/**
 * (4) and (12) before the installer: a password add whose machine's sshd
 * refuses every forward. Its one sign-in planted the hub's key, then the
 * hub's own connection was refused, so the installer never ran: the window
 * says so in its own sentence's case and names the key it left; the push
 * says where it failed and why.
 */
async function refusedForward(
  kit: Kit,
  fleet: KitFleet,
  dashboard: string,
  options: { port: number; pushes: Phone; target: string }
): Promise<void> {
  await clearInstalls(fleet);
  const started = await fleet.api<{ install: { id: string } }>(
    "/api/installs",
    {
      route: "ssh",
      target: options.target,
      port: options.port,
      signIn: "password",
      password: PASSWORD,
    }
  );
  const { id } = started.install;
  const ended = await until(
    "the password add refused its forward",
    () => installs(fleet),
    (now) =>
      now.installs.some((one) => one.id === id && one.state !== "running"),
    60_000
  );
  const install = ended.installs.find((one) => one.id === id);
  const page = await kit.page("desk", { theme: "light" });
  await openWindow(page, dashboard, id);
  const at = await settled(page, "outcome", "Then Retry");
  const alerts = await until(
    "its push",
    async () => options.pushes.installAlerts(id),
    (all) => all.length > 0,
    20_000
  ).catch(() => options.pushes.installAlerts(id));
  const said = at.text.slice(at.text.indexOf("Then Retry"));
  kit.check(
    "desk light: (4) a password add whose forward is refused after its sign-in planted the hub's key says the installer never ran and names the key it left, its sentence's case kept",
    install?.state === "failed" &&
      install.problem?.kind === "forwarding" &&
      install.keys.hub &&
      !install.keys.machine &&
      said.startsWith(HUB_KEY_LEFT) &&
      !at.text.includes("removes what it created"),
    `${install?.state} ${JSON.stringify(install?.problem)} at ${install?.problemStep}, keys ${JSON.stringify(install?.keys)}; ${said.slice(0, 200)}`
  );
  kit.check(
    "desk light: (12) its push says where it failed and why, the row's own line",
    alerts.at(-1)?.body ===
      "Failed at Opening its path to the hub · its SSH server won't forward",
    JSON.stringify(alerts)
  );
  await fetch(`${fleet.base}/api/installs/${id}`, { method: "DELETE" });
  await page.close();
}

/** The second line of the install's row, where it is drawn. */
const readRow = (page: Page, id: string): Promise<string> =>
  page
    .locator(`[data-install-row="${id}"] [data-slot=step] >> visible=true`)
    .first()
    .innerText()
    .catch(() => "");

/**
 * The install's row as the band says it, read with the window closed into
 * it (nothing under a modal opens), then the window opened again from the
 * row onto the outcome saying `has`.
 */
async function closeAndRead(
  page: Page,
  view: "desk" | "phone",
  id: string,
  has: string
): Promise<string> {
  await page.locator(CLOSE).click();
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });
  await rowShown(page, view, id);
  const words = await readRow(page, id);
  await page
    .locator(`[data-install-row="${id}"] >> visible=true`)
    .first()
    .click();
  await settled(page, "outcome", has);
  return words;
}

/** Whether the install's row is on screen in the band: the machines card on the desk, the sidebar on the phone. */
async function rowShown(
  page: Page,
  view: "desk" | "phone",
  id: string
): Promise<boolean> {
  const row = `[data-install-row="${id}"]`;
  const visible = () =>
    page.evaluate(
      (sel) =>
        [...document.querySelectorAll<HTMLElement>(sel)].some((one) => {
          const box = one.getBoundingClientRect();
          return box.width > 0 && box.top < innerHeight && box.bottom > 0;
        }),
      row
    );
  if (!(await visible())) {
    if (view === "desk") {
      await page.locator("[data-machines]").click();
    } else {
      await page.getByRole("button", { name: OPEN_NAVIGATION }).first().click();
    }
    await page
      .waitForSelector(row, { state: "visible", timeout: 10_000 })
      .catch(() => undefined);
  }
  // The pointer leaves what it pressed, so no tooltip stands over the band.
  await page.mouse.move(4, 600);
  await page.waitForTimeout(300);
  return visible();
}

/**
 * The window's flight as it minimizes, on the clock: caught as Esc starts
 * it, read at 0, 0.5 and 1. Its goal is the install's row where the band
 * stands open behind the modal, else the bar's machines item. At 0 it
 * stands where it stood; at 1 its drawn box is the goal's; at 0.5 between
 * the two; a row it flies into is hidden while it flies.
 */
async function scrubFlight(kit: Kit, page: Page, id: string): Promise<void> {
  const clock = await Clock.on(page);
  const start = await page.locator(WINDOW).boundingBox();
  await page.focus(CLOSE);
  const runs = await clock.catchRuns(
    () => page.keyboard.press("Escape"),
    WINDOW
  );
  const at = async (fraction: number) => {
    await clock.seek(fraction);
    return page.evaluate(
      ([win, row]) => {
        const box = document
          .querySelector<HTMLElement>(win)
          ?.getBoundingClientRect();
        const parked = [...document.querySelectorAll<HTMLElement>(row)].find(
          (each) => each.getBoundingClientRect().width > 0
        );
        const goal = (
          parked ?? document.querySelector<HTMLElement>("[data-machines]")
        )?.getBoundingClientRect();
        return {
          window: box ? [box.left, box.top, box.width, box.height] : null,
          goal: goal ? [goal.left, goal.top, goal.width, goal.height] : null,
          into: parked ? "row" : "bar",
          rowHidden: parked
            ? getComputedStyle(parked).visibility === "hidden"
            : null,
        };
      },
      [WINDOW, `[data-install-row="${id}"]`] as const
    );
  };
  const zero = await at(0);
  const half = await at(0.5);
  const one = await at(1);
  await clock.release();
  const near = (a: number[] | null, b: number[] | null, tolerance = 2) =>
    Boolean(
      a &&
      b &&
      a.every((value, index) => Math.abs(value - (b[index] ?? 0)) <= tolerance)
    );
  const between = (
    a: number[] | null,
    lo: number[] | null,
    hi: number[] | null
  ) =>
    Boolean(
      a &&
      lo &&
      hi &&
      a.every((value, index) => {
        const min = Math.min(lo[index] ?? 0, hi[index] ?? 0) - 1;
        const max = Math.max(lo[index] ?? 0, hi[index] ?? 0) + 1;
        return value >= min && value <= max;
      }) &&
      !near(a, lo) &&
      !near(a, hi)
    );
  const startBox = start ? [start.x, start.y, start.width, start.height] : null;
  kit.check(
    "desk light: the modal's flight as it minimizes, scrubbed: at 0 where it stood, at 0.5 between, at 1 its goal's box (the install's row, the row hidden while it flies, or the bar's machines item)",
    runs.length > 0 &&
      near(zero.window, startBox) &&
      between(half.window, startBox, one.goal) &&
      near(one.window, one.goal, 3) &&
      (zero.into === "bar" || zero.rowHidden === true),
    JSON.stringify({ runs: runs.length, start: startBox, zero, half, one })
  );
}

/** The phone's Reach variants with the keyboard up: each fits the visual viewport, nothing scrolling. */
async function keyboardUp(
  kit: Kit,
  fleet: KitFleet,
  dashboard: string
): Promise<void> {
  await clearInstalls(fleet);
  const page = await kit.page("phone", { theme: "light" });
  await page.setViewportSize({ width: 390, height: KEYBOARD_UP });
  const variants: [string, () => Promise<void>, string][] = [
    [
      "key",
      () =>
        setDraft(fleet, { route: "ssh", signIn: "key" }).then(() => undefined),
      "Sign in",
    ],
    [
      "password",
      () =>
        setDraft(fleet, { route: "ssh", signIn: "password" }).then(
          () => undefined
        ),
      "Sign in",
    ],
    [
      "by-hand",
      () =>
        setDraft(fleet, { route: "ssh", signIn: "by-hand" }).then(
          () => undefined
        ),
      "authorized_keys",
    ],
    // By a command has no field to type in, so no keyboard stands over it.
  ];
  const said: string[] = [];
  let fits = true;
  for (const [name, set, has] of variants) {
    // biome-ignore lint/performance/noAwaitInLoops: one variant at a time
    await set();
    await openWindow(page, dashboard, "new");
    const at = await settled(page, "reach", has);
    const room = await page.evaluate(
      () => window.visualViewport?.height ?? innerHeight
    );
    const inside =
      at.top >= -0.5 &&
      at.bottom <= room + 0.5 &&
      at.height <= room &&
      at.overflow <= 0.5;
    fits &&= inside;
    said.push(
      `${name} ${at.height} in ${room} (top ${at.top.toFixed(1)}, overflow ${at.overflow})`
    );
  }
  // The sheet follows a finger down its grabber and, let go past 30% of its
  // height, is put away as its × puts it (the kit sheet's own drag).
  const hand = await handOn(page);
  const grab = await page
    .locator(`${WINDOW} [data-slot=dialog-grabber]`)
    .boundingBox();
  const tall = (await page.locator(WINDOW).boundingBox())?.height ?? 0;
  let followed = "";
  if (grab) {
    const x = grab.x + grab.width / 2;
    const y = grab.y + grab.height / 2;
    await hand.down(x, y);
    await hand.move(x, y + tall * 0.1);
    await hand.move(x, y + tall * 0.2);
    followed = await page.evaluate(
      (win) => document.querySelector<HTMLElement>(win)?.style.transform ?? "",
      WINDOW
    );
    await hand.move(x, y + tall * 0.5);
    await hand.up();
  }
  await hand.done();
  const gone = await page
    .waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
      timeout: 8000,
    })
    .then(() => true)
    .catch(() => false);
  kit.check(
    "phone: the sheet follows a finger down its grabber and, let go past 30% of its height, is put away",
    Boolean(grab) && followed !== "" && gone,
    JSON.stringify({ grabber: Boolean(grab), followed, gone })
  );
  kit.check(
    `phone, keyboard up (visual viewport ${KEYBOARD_UP}): every Reach variant with a field to type in (Over SSH, each sign-in) stands inside the visual viewport with nothing scrolling`,
    fits,
    said.join("; ")
  );
  await page.close();
}

/** In WebKit, focusing each Reach field moves nothing inside the drawer: its scroll stays at 0 and it stands still. */
async function webkitFocus(
  kit: Kit,
  fleet: KitFleet,
  dashboard: string
): Promise<void> {
  await setDraft(fleet, { route: "ssh", signIn: "password" });
  const page = await kit.page("phone", { engine: "webkit", theme: "light" });
  await openWindow(page, dashboard, "new");
  await settled(page, "reach", "Sign in");
  const moved: string[] = [];
  for (const field of [
    "#connect-target",
    "#connect-port",
    "#connect-password",
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: one field at a time
    if (field === "#connect-port" && !(await page.locator(field).count())) {
      await page.locator(`${WINDOW} button[data-slot=port]`).click();
    }
    const before = await read(page);
    await page.focus(field);
    await page.waitForTimeout(300);
    const after = await read(page);
    const scrolled = await page.evaluate((body) => {
      const node = document.querySelector<HTMLElement>(body);
      return node ? node.scrollTop : -1;
    }, BODY);
    if (
      scrolled !== 0 ||
      Math.abs((after?.top ?? 0) - (before?.top ?? 0)) > 0.5
    ) {
      moved.push(
        `${field}: scrollTop ${scrolled}, top ${before?.top} → ${after?.top}`
      );
    }
  }
  kit.check(
    "phone WebKit: focusing each Reach field moves nothing inside the drawer (scrollTop stays 0)",
    moved.length === 0,
    moved.join("; ") || "target, port, password"
  );
  await openPort(page);
  const sizes = await fieldSizes(page);
  kit.check(
    "phone WebKit: (8) every Reach text field computes 16px or more, so iOS never zooms into it",
    sizes.every((one) => one.px >= 16),
    JSON.stringify(sizes)
  );
  await page.close();
  if (existsSync(join(kit.out, "unused"))) {
    rmSync(join(kit.out, "unused"));
  }
}

/**
 * Each entry point that names a way in opens the window on that tab: the
 * empty fleet's two cards on Home, and its machines list's two ways (in the
 * bar's machines card on a desk, the navigation sheet on a phone). Run
 * before the fleet has a machine, while both offer their ways. × closes
 * each, on the draft, with nothing parked.
 */
async function entryTabs(
  kit: Kit,
  fleet: KitFleet,
  dashboard: string
): Promise<void> {
  await clearInstalls(fleet);
  for (const view of ["desk", "phone"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const page = await kit.page(view, { theme: "light" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text().slice(0, 600));
      }
    });
    const opened: string[] = [];
    let right = true;
    for (const where of ["home", "list"] as const) {
      for (const way of ["By a command", "Over SSH"]) {
        // biome-ignore lint/performance/noAwaitInLoops: one entry point after another, on one page
        await open(page, `${dashboard}/`, "body");
        if (where === "home") {
          await page
            .locator("[data-slot=icon-card] >> visible=true", { hasText: way })
            .first()
            .click();
        } else {
          if (view === "desk") {
            await page.locator("[data-machines]").click();
          } else {
            await page
              .getByRole("button", { name: OPEN_NAVIGATION })
              .first()
              .click();
          }
          await page
            .locator("button[data-slot=row] >> visible=true", { hasText: way })
            .first()
            .click();
        }
        await settled(
          page,
          "reach",
          way === "Over SSH" ? "Reach it at" : "It reaches the hub at"
        ).catch(async (error: Error) => {
          const seen = await page.evaluate(() => ({
            url: location.href,
            dialogs: document.querySelectorAll("[role=dialog]").length,
            window: Boolean(document.querySelector("[data-connect-window]")),
            cards: [
              ...document.querySelectorAll<HTMLElement>(
                "[data-slot=icon-card]"
              ),
            ].map((one) => one.innerText.replace(/\s+/g, " ").slice(0, 40)),
            text: document.body.innerText.replace(/\s+/g, " ").slice(0, 300),
          }));
          throw new Error(
            `${error.message}; ${where} "${way}" on ${view}: ${JSON.stringify(seen)}; page errors ${JSON.stringify(errors)}`
          );
        });
        const tab = await chosenTab(page);
        opened.push(`${where} "${way}" → ${tab}`);
        right &&= tab === way;
        await page.locator(CLOSE).click();
        await page.waitForFunction(
          (sel) => !document.querySelector(sel),
          WINDOW,
          { timeout: 10_000 }
        );
      }
    }
    kit.check(
      `${view}: each entry point that names a way in opens the window on its tab (Home's cards, the machines list's ways)`,
      right && opened.length === 4,
      opened.join("; ")
    );
    await page.close();
  }
}

/** Where a review's captures of the window are kept (the repo's captures/). */
const CAPTURES = join(import.meta.dir, "../../../captures/add-machine");

/**
 * The tabs and each tab's details fit the window at 390, 680 and 1440, in
 * Chromium and WebKit: the tab list and every tab's name inside the
 * window, nothing past its edge or scrolling inside it, the window inside
 * the viewport; and nothing outside the window moves while it stands, on
 * either tab, against the same page with it closed. The hub's addresses
 * read as a tailnet hub's would (a workspace's machine lists none), so the
 * command tab holds its longest rows. Dark in Chromium at 390 and 1440,
 * each tab is captured for review (captures/add-machine).
 */
async function tabsFit(
  kit: Kit,
  fleet: KitFleet,
  dashboard: string
): Promise<void> {
  await clearInstalls(fleet);
  mkdirSync(CAPTURES, { recursive: true });
  const saved: string[] = [];
  const said: string[] = [];
  let fits = true;
  let still = true;
  const landmarks = (page: Page) =>
    page.evaluate(
      (win) =>
        [
          ...document.querySelectorAll<HTMLElement>(
            "header, main, nav, aside, [data-machines]"
          ),
        ]
          .filter((one) => !one.closest(win) && one.checkVisibility())
          .map((one) => {
            const box = one.getBoundingClientRect();
            return `${one.tagName}:${box.left.toFixed(1)},${box.top.toFixed(1)},${box.width.toFixed(1)},${box.height.toFixed(1)}`;
          })
          .join("|"),
      WINDOW
    );
  const measure = (page: Page) =>
    page.evaluate(
      ([win, body]) => {
        const node = document.querySelector<HTMLElement>(win);
        const grid = document.querySelector<HTMLElement>(body);
        const list = node?.querySelector<HTMLElement>("[role=tablist]");
        if (!(node && grid && list)) {
          return null;
        }
        const box = node.getBoundingClientRect();
        const strip = list.getBoundingClientRect();
        const tabs = [...list.querySelectorAll<HTMLElement>("[role=tab]")];
        return {
          inView:
            box.left >= -0.5 &&
            box.top >= -0.5 &&
            box.right <= innerWidth + 0.5 &&
            box.bottom <= innerHeight + 0.5,
          stripInside:
            strip.left >= box.left - 0.5 && strip.right <= box.right + 0.5,
          namesWhole: tabs.every(
            (tab) => tab.scrollWidth <= tab.clientWidth + 1
          ),
          across: grid.scrollWidth - grid.clientWidth,
          down: grid.scrollHeight - grid.clientHeight,
          size: `${box.width.toFixed(0)}×${box.height.toFixed(0)}`,
        };
      },
      [WINDOW, BODY] as const
    );
  for (const engine of ["chromium", "webkit"] as const) {
    for (const view of ["phone", "narrowDesk", "desk"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time
      const page = await kit.page(view, { engine, theme: "dark" });
      await page.route(isJoinRead, async (route) => {
        const response = await route.fetch();
        const joinInfo = (await response.json()) as Record<string, unknown>;
        await route.fulfill({
          response,
          json: {
            ...joinInfo,
            addresses: [
              { label: "Tailscale", url: "http://100.101.102.103:7777" },
              {
                label: "Tailscale DNS",
                url: "http://build-hub.example-tailnet.ts.net:7777",
              },
              { label: "eth0", url: "http://192.168.1.20:7777" },
              { label: "On this network", url: "http://build-hub.local:7777" },
            ],
          },
        });
      });
      await setDraft(fleet, {
        route: "ssh",
        target: "deploy@build-01.example.net",
      });
      await openWindow(page, dashboard, "new");
      const shown: string[] = [];
      for (const [tab, has, file] of [
        ["Over SSH", "Reach it at", "ssh"],
        ["By a command", "It reaches the hub at", "command"],
      ] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: one tab after the other, each measured where it stands
        if ((await chosenTab(page)) !== tab) {
          await pickTab(page, tab);
        }
        await settled(page, "reach", has);
        await page.mouse.move(2, 2);
        const at = await measure(page);
        shown.push(await landmarks(page));
        const ok = Boolean(
          at?.inView &&
          at.stripInside &&
          at.namesWhole &&
          at.across <= 0.5 &&
          at.down <= 0.5
        );
        fits &&= ok;
        said.push(`${engine} ${view} ${tab}: ${JSON.stringify(at)}`);
        if (engine === "chromium" && view !== "narrowDesk") {
          const name = `${view}-dark-${file}.png`;
          await page.screenshot({ path: join(CAPTURES, name) });
          saved.push(`captures/add-machine/${name}`);
        }
      }
      await page.locator(CLOSE).click();
      await page.waitForFunction(
        (sel) => !document.querySelector(sel),
        WINDOW,
        {
          timeout: 10_000,
        }
      );
      await page.waitForTimeout(400);
      const closed = await landmarks(page);
      const moved = shown.some((one) => one !== closed);
      still &&= !moved;
      if (moved) {
        said.push(
          `${engine} ${view} moved: open ${JSON.stringify(shown)} closed ${closed}`
        );
      }
      await page.close();
    }
  }
  kit.check(
    "the tabs and each tab's details fit the window at 390, 680 and 1440 in Chromium and WebKit: inside the viewport, nothing past the window's edge, no tab name cut, nothing scrolling",
    fits,
    said.join("; ")
  );
  kit.check(
    "nothing outside the window moves while it stands, on either tab, at 390, 680 and 1440 in Chromium and WebKit",
    still,
    said.filter((line) => line.includes("moved")).join("; ") || "still"
  );
  kit.note(`captures for review: ${saved.join(", ")}`);
}

export default { name: "connect-machine", run } satisfies Spec;
