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
 * - no scroll inside the window at any step (the body's scrollHeight ≤ its
 *   clientHeight), and the phone's Reach variants inside the visual viewport
 *   with the keyboard up (844 less a 336 keyboard: 508);
 * - each neighbouring step's height ≥ 36px apart;
 * - no layout shift while Running (each step row's box constant across ticks);
 * - a reload with the window open restores the same step and details, the
 *   password empty and saying why;
 * - Esc parks it, its row's step text changes on the engine, a press on the
 *   row reopens the window at the same step;
 * - the row stands in the band from the start, before any dismiss;
 * - a second Add machine for the same target opens that install;
 * - a forced failure says the Problem's words on the row and in the window,
 *   never as a toast;
 * - the command route's three steps tick from the hub's fetch and join, and
 *   its harnesses step (installs.ts `ready`) ends it joined;
 * - the window's flight into its row, scrubbed at 0, 0.5 and 1;
 * - in WebKit, focusing each Reach field moves nothing inside the drawer;
 * - (1) a press outside, × and Esc each park a failed install: it stays on
 *   the hub, its row reopens it with Retry;
 * - (2) a command install whose installer fails a check fails at its own
 *   route's step (Installing on it), never an SSH one;
 * - (3) Stop in the output sheet asks first, the install running meanwhile;
 * - (4) what a failure left is said by how far it got: the key the add
 *   wrote named; a password add refused its forward after planting the
 *   hub's key says the installer never ran and names that key;
 * - (7) focus moves into the output sheet as it opens and back to where the
 *   window parked as it closes;
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
import type { Page } from "playwright-core";
import type { AuthContext } from "ssh2";
import type { InstallsRead } from "../../../packages/core/src/install";
import { listedPid, signal } from "../../../packages/core/src/signal";
import { until } from "../../scratch-fleet";
import { Clock } from "../anim";
import { type Kit, type KitFleet, open, type Spec, type Theme } from "../kit";
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
const BODY = `${WINDOW} [data-slot=body]`;
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

/** The hub's draft, set as Reach would leave it. */
const setDraft = (
  fleet: KitFleet,
  draft: {
    route: "ssh" | "command" | null;
    target?: string;
    port?: string;
    signIn?: "key" | "password" | "by-hand";
  }
) =>
  fetch(`${fleet.base}/api/installs/draft`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      route: draft.route,
      target: draft.target ?? "",
      port: draft.port ?? "",
      signIn: draft.signIn ?? "key",
      address: null,
    }),
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

/** Picks `words` in the window's choice named `label` ("Sign in", "Bring it in"). */
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
    fleet.launch("agent");
    await fleet.agentUp();
    const dashboard = await fleet.dashboard();

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
      ["route", "reach-key"],
      ["route", "reach-command"],
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
      scrolls.push(`${state} runs ${at.overflow}px past its box`);
    }
    kit.check(
      `${leg}: ${state} is reached (data-step ${at.step}), ${at.height}px tall`,
      true,
      at.text.slice(0, 160)
    );
  };
  await clearInstalls(fleet);

  // A: Route.
  await setDraft(fleet, { route: null });
  await openWindow(page, dashboard, "new");
  note(
    "route",
    await settled(page, "route", "Can the hub sign in to it over SSH?")
  );

  // B: Reach over SSH, the hub with no key: the Sign in line gives way, Add machine waits.
  // Out of the hub's ~/.ssh altogether: any id_*.pub there is a key the hub would use.
  const aside = join(fleet.sandbox, "hub-key-aside");
  renameSync(`${options.hubKey}.pub`, `${aside}.pub`);
  renameSync(options.hubKey, aside);
  await page.locator(`${WINDOW} button[data-route=ssh]`).click();
  const noKey = await settled(page, "reach", "The hub has no SSH key yet");
  note("reach-no-key", noKey);
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
  await choose(page, "Sign in", "with a password, once");
  const password = await settled(page, "reach", "Sign in");
  note("reach-password", password);
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
    `${JSON.stringify(after)}; the hub's draft as it reloaded ${JSON.stringify(keptBefore)}, after ${JSON.stringify(keptAfter)}`
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

  // B: the key put there by hand.
  await choose(page, "Sign in", "I'll put the key there myself");
  note("reach-by-hand", await settled(page, "reach", "authorized_keys"));

  // B: by a command.
  await choose(page, "Bring it in", "by a command");
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
  await page.focus(`${WINDOW} [data-slot=close]`);
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
  await page.focus(`${WINDOW} [data-slot=close]`);
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
  await choose(page, "Bring it in", "over SSH");
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

  // The row stands in the band from the start: the machines card on the desk,
  // opened under the window. A phone's band is in its navigation sheet,
  // which the drawer stands over; it is read there once the window is parked.
  if (view === "desk") {
    kit.check(
      `${leg}: the install's row is in the band from the start, before any dismiss`,
      await rowShown(page, view, id),
      `row ${id}`
    );
  }

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

  // (7) and (3): Open output. Focus goes into the sheet; its Stop asks
  // first, in the same words as the window's, and nothing stops meanwhile;
  // closed, focus goes back to where the window parked.
  await page
    .locator(WINDOW)
    .getByRole("button", { name: "Open output" })
    .click();
  await page.waitForSelector(`${OUTPUT}[data-state=open]`);
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
  // Where it parked: its row when drawn, else what opens the band (the
  // bar's machines item at the desk, the navigation's button on a phone).
  const focusBack = await page.evaluate((install) => {
    const active = document.activeElement as HTMLElement | null;
    return {
      parked: Boolean(
        active?.matches(
          `[data-install-row="${install}"], [data-machines], [data-slot=burger]`
        ) && active.checkVisibility()
      ),
      what: active
        ? `${active.tagName} ${active.dataset.installRow ? "row" : (active.getAttribute("aria-label") ?? "")}`
        : "none",
    };
  }, id);
  kit.check(
    `${leg}: (7) focus moves into the output sheet as it opens, and back to where its window parked (its row, else what opens the band) as it closes`,
    focusIn && focusBack.parked,
    `in ${focusIn}; back on ${focusBack.what}`
  );
  await openWindow(page, dashboard, id);
  await settled(page, "running", "Fetching the signed build");

  // A second Add machine for the same target opens that install.
  await setDraft(fleet, {
    route: "ssh",
    target: options.target,
    port: String(options.port),
  });
  await page.focus(`${WINDOW} [data-slot=close]`);
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

  // Esc parks it into its row (scrubbed at the desk in light); the row is live; a press brings it back.
  // On the desk the band is the machines card, opened under the window; a
  // phone's is its navigation sheet, opened once the drawer has gone (a
  // press there is a press outside the drawer, which dismisses it).
  if (view === "desk") {
    await rowShown(page, view, id);
  }
  if (view === "desk" && theme === "light") {
    await scrubFlight(kit, page, id);
  } else {
    await page.focus(`${WINDOW} [data-slot=close]`);
    await page.keyboard.press("Escape");
  }
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });
  const row = `[data-install-row="${id}"] [data-slot=step] >> visible=true`;
  await rowShown(page, view, id);
  const before = await page.locator(row).first().innerText();
  await page.waitForTimeout(2100);
  const later = await page.locator(row).first().innerText();
  kit.check(
    `${leg}: after Esc the install's row is live: its step text changes on the engine`,
    before !== later && FETCHING.test(later),
    `${before} → ${later}`
  );
  await page
    .locator(`[data-install-row="${id}"] >> visible=true`)
    .first()
    .click();
  const back = await settled(page, "running", "Fetching the signed build");
  kit.check(
    `${leg}: a press on the row reopens the window at the same step`,
    new URL(page.url()).searchParams.get("install") === id &&
      back.step === "running",
    back.text.slice(0, 100)
  );

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
    await rowShown(page, view, failedId);
    rowWords = await readRow(page, failedId);
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

  // (1) Dismissing parks the outcome: a press outside, × and Esc each close
  // the window, the install stays on the hub, and its row reopens it with Retry.
  const parks: string[] = [];
  let parked = true;
  for (const how of ["a press outside", "×", "Esc"] as const) {
    if (how === "a press outside") {
      // biome-ignore lint/performance/noAwaitInLoops: one way of closing after another, each on the window the last reopened
      await pressOutside(page, view);
    } else if (how === "×") {
      await page.locator(`${WINDOW} [data-slot=close]`).click();
    } else {
      await page.focus(`${WINDOW} [data-slot=close]`);
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
    `${leg}: (1) a press outside, × and Esc each park the failed install: it stays, and its row reopens it with Retry`,
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
   * Copy command starts a command install, where the hub lists an address
   * for the line; a workspace's machine has loopback alone, so there the
   * install starts at the hub's own loopback through the same route, and the
   * run says so.
   */
  const copyCommand = async (): Promise<string> => {
    await setDraft(fleet, { route: "command" });
    await openWindow(page, dashboard, "new");
    await settled(page, "reach", "It reaches the hub at");
    const copy = page
      .locator(WINDOW)
      .getByRole("button", { name: "Copy command" });
    if (await copy.isEnabled()) {
      await copy.click();
      await settled(page, "running", "Waiting for the command to run on it");
      return new URL(page.url()).searchParams.get("install") ?? "";
    }
    kit.note(
      `${leg}: the hub lists no address here (loopback alone), so Copy command is disabled and says each kind is missing; the command install starts at the hub's loopback through POST /api/installs`
    );
    const started = await fleet.api<{ install: { id: string } }>(
      "/api/installs",
      {
        route: "command",
        address: fleet.base,
      }
    );
    await openWindow(page, dashboard, started.install.id);
    return started.install.id;
  };

  // C by a command: the hub's fetch and join tick its three steps.
  const commandId = await copyCommand();
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
  await page.focus(`${WINDOW} [data-slot=close]`);
  await page.keyboard.press("Escape");
  await page.waitForFunction((sel) => !document.querySelector(sel), WINDOW, {
    timeout: 10_000,
  });

  // (2) A command install whose installer fails a check: it fails at its
  // own route's step, the one its window and row name, never an SSH one.
  const checkId = await copyCommand();
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
  await rowShown(page, view, checkId);
  const checkRow = await readRow(page, checkId);
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
 * The window's flight into its row, on the clock: caught as Esc starts it,
 * read at 0, 0.5 and 1. At 0 it stands where it stood; at 1 its drawn box is
 * the row's; at 0.5 between the two; the row is hidden while it flies.
 */
async function scrubFlight(kit: Kit, page: Page, id: string): Promise<void> {
  const clock = await Clock.on(page);
  const start = await page.locator(WINDOW).boundingBox();
  await page.focus(`${WINDOW} [data-slot=close]`);
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
        const goal = parked?.getBoundingClientRect();
        return {
          window: box ? [box.left, box.top, box.width, box.height] : null,
          row: goal ? [goal.left, goal.top, goal.width, goal.height] : null,
          rowHidden: parked
            ? getComputedStyle(parked).visibility === "hidden"
            : null,
          opacity: document.querySelector<HTMLElement>(win)
            ? Number(
                getComputedStyle(
                  document.querySelector<HTMLElement>(win) as HTMLElement
                ).opacity
              )
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
    "desk light: the window's flight into its row, scrubbed: at 0 where it stood, at 0.5 between, at 1 the row's box, the row hidden while it flies",
    runs.length > 0 &&
      near(zero.window, startBox) &&
      between(half.window, startBox, one.row) &&
      near(one.window, one.row, 3) &&
      zero.rowHidden === true,
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
    [
      "command",
      () => setDraft(fleet, { route: "command" }).then(() => undefined),
      "It reaches the hub at",
    ],
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
  // The drawer follows a finger down its grabber, and let go past 30% of its height it is dismissed.
  const dragged = await page.evaluate(async (win) => {
    const grabber = document.querySelector<HTMLElement>(
      `${win} [data-slot=grabber]`
    );
    const drawer = document.querySelector<HTMLElement>(win);
    if (!(grabber && drawer)) {
      return { followed: null, gone: false };
    }
    const box = grabber.getBoundingClientRect();
    const height = drawer.offsetHeight;
    const at = (y: number, type: string) =>
      grabber.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 7,
          pointerType: "touch",
          clientX: box.left + box.width / 2,
          clientY: y,
        })
      );
    at(box.top, "pointerdown");
    at(box.top + height * 0.2, "pointermove");
    const followed = drawer.style.translate;
    at(box.top + height * 0.5, "pointermove");
    at(box.top + height * 0.5, "pointerup");
    await new Promise((done) => setTimeout(done, 600));
    return { followed, gone: !document.querySelector(win) };
  }, WINDOW);
  kit.check(
    "phone: the drawer follows a finger down its grabber and, let go past 30% of its height, is dismissed",
    Boolean(dragged.followed) && dragged.gone,
    JSON.stringify(dragged)
  );
  kit.check(
    `phone, keyboard up (visual viewport ${KEYBOARD_UP}): every Reach variant stands inside the visual viewport with nothing scrolling`,
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

export default { name: "connect-machine", run } satisfies Spec;
