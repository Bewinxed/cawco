/**
 * Two kit components drawn on the dashboard's stage as the app draws them,
 * read from the engine (stage-host/host.ts, bundled and started in
 * apps/dashboard as held-post-row starts it):
 *
 * 1. HangCard takes its form from the `shell` container it stands in, never
 *    the window (hang-card.stories.ts, Caw's card hung open from the glass
 *    in a frame's shell). Phone (390): the card stands `c-bar-phone-edge`
 *    in from the shell's leading side and runs to its trailing edge, square
 *    there (`border-end-end-radius` 0, no trailing edge on its `::after`),
 *    as the app's phone draws it (x 12, w 378 at 390). Desk (1440):
 *    `c-panel-w` wide (380), its trailing corner round and its edge drawn,
 *    flush with the glass's trailing flank.
 * 1b. The session card (HangCard `details`, hung from its folder tab and
 *    portaled into its frame's hang layer) takes its form from that layer
 *    the same way: SessionCardPhone (390) runs margin to margin (x 12,
 *    366 wide) with its height held under the phone's screen (the layer's
 *    `--shell-h` less the bar, its margins and the safe area); SessionCard
 *    (1440) is 416 wide under the desk's height cap.
 * 2. Prompt draws the hub state its story names through the stage's one
 *    seam (a decorator's context, hub-stand-in `hubAs`), not by hiding
 *    parts of it (Prompt.stories.ts): Connected, Approve and Deny enabled
 *    and no wait line; Reconnecting, both disabled under "Reconnecting —
 *    can't answer yet."
 * 3. No console errors on either canvas.
 *
 * At the kit's desk window, 1440 wide, where a 1440 frame runs past the
 * window's edge: its card collides with the frame's own box, not the
 * window's (canvas viewport.ts), so it stands flush with the glass as the
 * app draws it. Each frame is read once the canvas has shown it, as a
 * person picks it (`cawco:canvas-go`): the canvas moves the frame until
 * its open card stands in sight (runtime.ts `revealLayersOf`), its box
 * inside the window.
 *
 *   bun scripts/probe-kit/run.ts stage-shell-hub
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one frame read at a time.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const APP = join(ROOT, "apps/dashboard");
const HANG = "src/lib/components/ui/hang-card/hang-card.stories.ts";
const PROMPT = "src/lib/cawco/transcript/Prompt.stories.ts";
const RECONNECTING = "Reconnecting — can't answer yet.";
/** A line of the stage's that names an error. */
const ERROR_WORD = /error/i;
/** A line of a thrown error's stack, not its message. */
const STACK_FRAME = /^\s+at /;

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

const FRAME = (story: string) =>
  `.cawco-frame[data-cawco-story="${story}"][data-cawco-interaction="rest"]`;

/** One story's hung card, in its shell's own px (the canvas may scale its world). */
const readCard = (frame: string) => {
  const root = document.querySelector(frame);
  const card = root?.querySelector<HTMLElement>("[data-glass-card]");
  const glass = root?.querySelector<HTMLElement>("[data-bar-group]");
  /** The `shell` container the card stands in: its nearest ancestor of that name. */
  let shell = card?.parentElement ?? null;
  while (shell && !getComputedStyle(shell).containerName.includes("shell")) {
    shell = shell.parentElement;
  }
  if (!(shell && card && glass && card.hasAttribute("data-shown"))) {
    return null;
  }
  const at = shell.getBoundingClientRect();
  const body = root
    ?.querySelector(".cawco-frame-body")
    ?.getBoundingClientRect();
  const scale = at.width / shell.offsetWidth;
  const box = card.getBoundingClientRect();
  const g = glass.getBoundingClientRect();
  const style = getComputedStyle(card);
  const px = (name: string) =>
    Number.parseFloat(getComputedStyle(shell).getPropertyValue(name));
  return {
    shell: shell.offsetWidth,
    containerName: getComputedStyle(shell).containerName,
    x: Math.round(((box.left - at.left) / scale) * 2) / 2,
    y: Math.round(((box.top - at.top) / scale) * 2) / 2,
    w: Math.round((box.width / scale) * 2) / 2,
    right: Math.round(((at.right - box.right) / scale) * 2) / 2,
    glassRight: Math.round(((g.right - box.right) / scale) * 2) / 2,
    endEndRadius: style.borderEndEndRadius,
    afterEnd: getComputedStyle(card, "::after").borderRightWidth,
    panelW: px("--c-panel-w"),
    phoneEdge: px("--c-bar-phone-edge"),
    /** The frame's body and the card on the screen, and the window (the canvas answers `innerWidth` at a frame). */
    frameLeft: Math.round(body?.left ?? 0),
    frameRight: Math.round(body?.right ?? 0),
    cardLeft: Math.round(box.left),
    cardRight: Math.round(box.right),
    window: outerWidth,
  };
};

/** One story's session card, in its shell's own px, and the max height each frame rule would give it. */
const readSession = (frame: string) => {
  const root = document.querySelector(frame);
  const card = root?.querySelector<HTMLElement>(
    "[data-session-details-popover][data-state=open]"
  );
  let shell = card?.parentElement ?? null;
  while (shell && !getComputedStyle(shell).containerName.includes("shell")) {
    shell = shell.parentElement;
  }
  if (!(shell && card)) {
    return null;
  }
  const at = shell.getBoundingClientRect();
  const scale = at.width / shell.offsetWidth;
  const box = card.getBoundingClientRect();
  const style = getComputedStyle(card);
  const px = (name: string) =>
    Number.parseFloat(style.getPropertyValue(name)) || 0;
  return {
    shell: shell.offsetWidth,
    containerName: getComputedStyle(shell).containerName,
    x: Math.round(((box.left - at.left) / scale) * 2) / 2,
    w: Math.round((box.width / scale) * 2) / 2,
    maxHeight: style.maxHeight,
    /** The phone's rule: the layer's height under the bar less its margins and the safe area. */
    phoneMax:
      px("--shell-h") -
      px("--c-top-bar-h") -
      2 * px("--c-screen-margin") -
      px("--safe-bottom"),
    cardLeft: Math.round(box.left),
    cardRight: Math.round(box.right),
    window: outerWidth,
  };
};

async function sessionCard(kit: Kit, page: Page): Promise<void> {
  for (const story of ["SessionCardPhone", "SessionCard"] as const) {
    const shown = await page
      .waitForFunction(readSession, FRAME(story), { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    if (shown) {
      await showFrame(page, story);
    }
    const read = shown ? await page.evaluate(readSession, FRAME(story)) : null;
    if (!read) {
      const holds = await page.evaluate((frame) => {
        const root = document.querySelector(frame);
        const card = root?.querySelector("[data-session-details-popover]");
        const anywhere = [
          ...document.querySelectorAll("[data-session-details-popover]"),
        ];
        return {
          frame: root !== null,
          layers: [...document.querySelectorAll("[data-hang-layer]")].map(
            (one) => one.getAttribute("data-hang-layer")
          ),
          cards: anywhere.map(
            (one) =>
              `${one.getAttribute("data-state")} in ${
                one.closest(".cawco-frame")?.getAttribute("data-cawco-story") ??
                one.parentElement?.tagName
              }`
          ),
          tabs: root?.querySelectorAll("[data-session-tab]").length ?? 0,
          card: card ? (card.getAttribute("data-state") ?? "no state") : null,
          error: root?.getAttribute("data-cawco-error") ?? null,
        };
      }, FRAME(story));
      kit.check(
        `${story}: the card hangs open from its tab (${JSON.stringify(holds)})`,
        false
      );
      continue;
    }
    kit.note(`${story}: ${JSON.stringify(read)}`);
    const max = Number.parseFloat(read.maxHeight);
    kit.check(
      `${story}: it stands in a shell container ${read.shell}px wide (${read.containerName}), in sight (${read.cardLeft}–${read.cardRight} in a ${read.window} window)`,
      read.containerName === "shell" &&
        read.shell === (story === "SessionCard" ? 1440 : 390) &&
        read.cardLeft >= 0 &&
        read.cardRight <= read.window
    );
    if (story === "SessionCardPhone") {
      kit.check(
        `SessionCardPhone: margin to margin (x ${read.x}, ${read.w}px wide in 390), held under the phone's screen (max-height ${read.maxHeight}, the rule's ${read.phoneMax}px)`,
        read.x === 12 &&
          read.w === 390 - 24 &&
          Math.abs(max - read.phoneMax) < 0.5
      );
    } else {
      kit.check(
        `SessionCard: 416px wide (${read.w}), the desk's height cap (max-height ${read.maxHeight}, not the phone's ${read.phoneMax}px)`,
        read.w === 416 && Math.abs(max - read.phoneMax) >= 0.5
      );
    }
  }
}

/** One story's ask: its answer buttons and its wait line. */
const readAsk = (frame: string) => {
  const root = document.querySelector(frame);
  const grant = root?.querySelector<HTMLButtonElement>("[data-prompt-grant]");
  const refuse = root?.querySelector<HTMLButtonElement>("[data-prompt-refuse]");
  if (!(grant && refuse)) {
    return null;
  }
  return {
    grant: grant.disabled,
    refuse: refuse.disabled,
    grantOpacity: getComputedStyle(grant).opacity,
    wait:
      root?.querySelector('[data-slot="wait"]')?.textContent?.trim() ?? null,
  };
};

async function canvas(page: Page, port: number, file: string): Promise<void> {
  await page.goto(
    `http://127.0.0.1:${port}/@cawco/canvas?file=${encodeURIComponent(file)}`,
    { waitUntil: "load" }
  );
}

/**
 * Shows a story's frame as a person picks it (the canvas's `go`): the view
 * moves to it, and once it lands the frame's open layers are brought into
 * sight (runtime.ts `revealLayersOf`), a frame later.
 */
async function showFrame(page: Page, story: string): Promise<void> {
  await page.evaluate((frame) => {
    const key = document.querySelector<HTMLElement>(frame)?.dataset.cawcoKey;
    dispatchEvent(new CustomEvent("cawco:canvas-go", { detail: { key } }));
  }, FRAME(story));
  await page.waitForFunction(
    () =>
      (document.querySelector(".cawco-world")?.getAnimations() ?? []).length ===
      0
  );
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
      )
  );
}

async function hangCard(kit: Kit, page: Page): Promise<void> {
  for (const story of ["Phone", "Desk"] as const) {
    const shown = await page
      .waitForFunction(readCard, FRAME(story), { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    if (shown) {
      await showFrame(page, story);
    }
    const read = shown ? await page.evaluate(readCard, FRAME(story)) : null;
    if (!read) {
      kit.check(`${story}: the card hangs open`, false);
      continue;
    }
    kit.note(`${story}: ${JSON.stringify(read)}`);
    kit.check(
      `${story}: its frame is a shell container ${read.shell}px wide (${read.containerName})`,
      read.containerName === "shell" &&
        read.shell === (story === "Phone" ? 390 : 1440)
    );
    kit.check(
      `${story}: the card stands in sight (${read.cardLeft}–${read.cardRight} in a ${read.window} window; frame ${read.frameLeft}–${read.frameRight})`,
      read.cardLeft >= 0 && read.cardRight <= read.window
    );
    if (story === "Phone") {
      kit.check(
        `Phone: the card stands ${read.x}px in (c-bar-phone-edge ${read.phoneEdge}), ${read.w}px wide, ${read.right}px from the shell's trailing edge`,
        read.x === read.phoneEdge &&
          read.w === Math.min(read.panelW, 390 - read.phoneEdge) &&
          read.right === 0
      );
      kit.check(
        `Phone: square on the trailing edge (end-end radius ${read.endEndRadius}, ::after end ${read.afterEnd})`,
        read.endEndRadius === "0px" && read.afterEnd === "0px"
      );
    } else {
      kit.check(
        `Desk: the card is ${read.w}px wide (c-panel-w ${read.panelW}), flush with the glass's trailing flank (${read.glassRight}px)`,
        read.w === read.panelW && read.glassRight === 0
      );
      kit.check(
        `Desk: its trailing corner round (end-end radius ${read.endEndRadius}) and its edge drawn (::after end ${read.afterEnd})`,
        read.endEndRadius !== "0px" && read.afterEnd === "1px"
      );
    }
  }
}

async function prompt(kit: Kit, page: Page): Promise<void> {
  const reads = {
    Connected: { disabled: false, wait: null },
    Reconnecting: { disabled: true, wait: RECONNECTING },
  } as const;
  for (const [story, want] of Object.entries(reads)) {
    const read = await page
      .waitForFunction(readAsk, FRAME(story), { timeout: 60_000 })
      .then((handle) => handle.jsonValue())
      .catch(() => null);
    if (!read) {
      kit.check(`${story}: the ask is drawn`, false);
      continue;
    }
    kit.note(`${story}: ${JSON.stringify(read)}`);
    kit.check(
      `${story}: Approve disabled ${read.grant}, Deny disabled ${read.refuse}, wait line ${JSON.stringify(read.wait)}`,
      read.grant === want.disabled &&
        read.refuse === want.disabled &&
        read.wait === want.wait
    );
  }
}

const spec: Spec = {
  name: "stage-shell-hub",
  run: async (kit: Kit) => {
    const host = join(APP, ".cawco/stage/host.mjs");
    mkdirSync(join(APP, ".cawco/stage"), { recursive: true });
    writeFileSync(host, await buildStageHost());
    const port = await freePort();
    const stage = spawn("bun", [host], {
      cwd: APP,
      env: {
        ...process.env,
        CAWCO_STAGE: "1",
        CAWCO_STAGE_PORT: String(port),
        CAWCO_STAGE_FRAMEWORK: "svelte",
        CAWCO_STAGE_KIT: "1",
        CAWCO_STAGE_TOOLCHAIN: "vite",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    /** The stage's last words, at most 64 kB of them, and how much it said in all. */
    let words = "";
    let said = 0;
    const hear = (chunk: Buffer) => {
      said += chunk.length;
      words = (words + chunk.toString("utf8")).slice(-65_536);
    };
    stage.stdout.on("data", hear);
    stage.stderr.on("data", hear);
    try {
      await until(
        "the stage's ready",
        () => words,
        (text) => text.includes('"cawco":"ready"'),
        60_000
      );
      const page = await kit.page("desk");
      const logged: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          logged.push(message.text());
        }
      });
      page.on("pageerror", (error) => logged.push(error.message));
      page.on("response", (response) => {
        if (response.status() >= 500) {
          logged.push(`${response.status()} ${response.url()}`);
        }
      });
      await canvas(page, port, HANG);
      await hangCard(kit, page);
      await sessionCard(kit, page);
      await canvas(page, port, PROMPT);
      await prompt(kit, page);
      kit.check(
        `no console errors${logged.length ? `: ${logged.join(" | ")}` : ""}`,
        logged.length === 0
      );
      // What the stage said about a page error: its compile or load failure.
      if (logged.length > 0) {
        for (const line of words
          .split("\n")
          .filter((one) => ERROR_WORD.test(one))
          .slice(-8)) {
          kit.note(`the stage: ${line.slice(0, 400)}`);
        }
      }
    } finally {
      stage.kill("SIGTERM");
      // A stage that says the same thing over and over is a loop: what it repeats.
      // A thrown error's message, not its stack's frames.
      const lines = words
        .split("\n")
        .filter((line) => line.trim() !== "" && !STACK_FRAME.test(line));
      const [most] = [...Map.groupBy(lines, (line) => line)].sort(
        (a, b) => b[1].length - a[1].length
      );
      kit.check(
        `the stage stays quiet (${said} bytes said${most ? `; most often, ${most[1].length}× in its last 64 kB: ${most[0].slice(0, 300)}` : ""})`,
        said < 1_000_000
      );
    }
  },
};

export default spec;
