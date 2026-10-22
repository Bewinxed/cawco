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
 *   its Claude Code step (installs.ts `ready`) ends it joined;
 * - the window's flight into its row, scrubbed at 0, 0.5 and 1;
 * - in WebKit, focusing each Reach field moves nothing inside the drawer.
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

const USER = "deploy";
const PASSWORD = `pw-${crypto.randomUUID()}`;
const WINDOW = "[data-connect-window]";
const BODY = `${WINDOW} [data-slot=body]`;
const RELOAD_FORGETS = /reload forgets/;
const FETCHING = /Fetching the signed build/;
const LACKS_TAR = /Failed at Fetching the signed build · it lacks tar/;
const CODE_IN = /code=([A-Z0-9]+)/;
const OPEN_NAVIGATION = /Open navigation/;
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
  const target = `${USER}@127.0.0.1`;
  const hold = join(home, ".hold");
  const holdOn = () => writeFileSync(hold, "");
  const holdOff = () => rmSync(hold, { force: true });

  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub", [], { PATH: `${bin}:${fleet.env.PATH}` });
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();
    const dashboard = await fleet.dashboard();

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
  kit.check(
    `${leg}: with no hub key, Add machine is disabled`,
    await page
      .locator(WINDOW)
      .getByRole("button", { name: "Add machine" })
      .isDisabled()
  );
  renameSync(aside, options.hubKey);
  renameSync(`${aside}.pub`, `${options.hubKey}.pub`);
  // It changes on its own once the key exists.
  note("reach-key", await settled(page, "reach", "Sign in"));

  // B: password, then a reload: the field comes back empty and says why.
  await choose(page, "Sign in", "with a password, once");
  const password = await settled(page, "reach", "Sign in");
  note("reach-password", password);
  await page.fill("#connect-target", options.target);
  await page.fill("#connect-password", "typed-and-forgotten");
  await page.waitForTimeout(700);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#connect-password", { timeout: 30_000 });
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
    JSON.stringify(after)
  );

  // B: the key put there by hand.
  await choose(page, "Sign in", "with a key I put there myself");
  note("reach-by-hand", await settled(page, "reach", "authorized_keys"));

  // B: by a command.
  await choose(page, "Bring it in", "by a command");
  note("reach-command", await settled(page, "reach", "It reaches the hub at"));

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
    `${leg}: the command route's three steps tick from the hub's fetch and join signals`,
    fetched.includes(`CODE='${code}'`) &&
      JSON.stringify(afterFetch) === JSON.stringify(["run✓", "install…"]) &&
      afterJoin?.state === "joined" &&
      afterJoin.steps.map((one) => one.step).join(",") ===
        "run,install,listed,claude",
    `after the fetch ${JSON.stringify(afterFetch)}; after the join ${afterJoin?.state} ${JSON.stringify(afterJoin?.steps.map((one) => one.step))}`
  );
  await page.focus(`${WINDOW} [data-slot=close]`);
  await page.keyboard.press("Escape");
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
  await page.close();
  if (existsSync(join(kit.out, "unused"))) {
    rmSync(join(kit.out, "unused"));
  }
}

export default { name: "connect-machine", run } satisfies Spec;
