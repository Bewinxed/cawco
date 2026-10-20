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
 * 2. Prompt draws the hub state its story names through the stage's one
 *    seam (a decorator's context, hub-stand-in `hubAs`), not by hiding
 *    parts of it (Prompt.stories.ts): Connected, Approve and Deny enabled
 *    and no wait line; Reconnecting, both disabled under "Reconnecting —
 *    can't answer yet."
 * 3. No console errors on either canvas.
 *
 * The window is 1920 wide, so each frame stands whole in it: a frame the
 * window cuts gives its floating layers the window's edge to collide with
 * (canvas viewport.ts), which would shift the desk card off the glass.
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
    /** The frame's body on the screen, and the window: a frame the window cuts gives its layers the window's edge to collide with (canvas viewport.ts). */
    frameLeft: Math.round(body?.left ?? 0),
    frameRight: Math.round(body?.right ?? 0),
    window: outerWidth,
  };
};

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

async function hangCard(kit: Kit, page: Page): Promise<void> {
  for (const story of ["Phone", "Desk"] as const) {
    const read = await page
      .waitForFunction(readCard, FRAME(story), { timeout: 60_000 })
      .then((handle) => handle.jsonValue())
      .catch(() => null);
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
    let words = "";
    const hear = (chunk: Buffer) => {
      words += chunk.toString("utf8");
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
      // Every frame whole in the window: a frame the window cuts has its
      // layers collide with the window's edge (canvas viewport.ts), and the
      // 1440 frame stands 24px in from the canvas's edge.
      await page.setViewportSize({ width: 1920, height: 1080 });
      const logged: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          logged.push(message.text());
        }
      });
      page.on("pageerror", (error) => logged.push(error.message));
      await canvas(page, port, HANG);
      await hangCard(kit, page);
      await canvas(page, port, PROMPT);
      await prompt(kit, page);
      kit.check(
        `no console errors${logged.length ? `: ${logged.join(" | ")}` : ""}`,
        logged.length === 0
      );
    } finally {
      stage.kill("SIGTERM");
    }
  },
};

export default spec;
