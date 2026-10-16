/**
 * Caw's settings popover in the project's head stands in the glass card's
 * frame: the panel's width (`--c-panel-w`, capped at the viewport less 24px,
 * less 12px under 900px) with its rows 7px in, as home/CawPanel draws the
 * glass's Caw panel. It took that frame through the shared `.caw-pop` name
 * until 5a493be53 gave it its own (`.caw-seat-pop`), and must look as it did.
 * His seat opens his panel over the page (CawFloat); his on/off is the
 * project's, under the head's `⋯` (Caw settings…), in the same frame
 * (`.caw-settings-pop`).
 *
 * On a scratch fleet (real hub, agent and sessiond), the built dashboard, a
 * project with Caw off (no lead session needed), at 1440×900 and 800×900
 * with a mouse: `⋯` › Caw settings…, and the popover holding his panel read
 * from the engine: its computed width and padding and its box, against the
 * frame's rule (±0.5px).
 *
 *   bun scripts/probe-kit/run.ts web caw-seat-pop
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one viewport, one step at a time.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE } from "../../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../../kit";

/** The popover holding Caw's panel, whatever its own class. */
export const CAW_SEAT_POP = ".kit-pop:has(.caw-panel)";
const SIZES = [
  { width: 1440, height: 900 },
  { width: 800, height: 900 },
] as const;

/** Opens Caw's settings from the project head's `⋯`, as the person does. */
export async function openCawSettings(page: Page): Promise<void> {
  await page.click('.project-head [aria-label^="More for"]');
  await page.getByRole("menuitem", { name: "Caw settings…" }).click();
  await page.waitForSelector(".caw-panel [role='switch']", {
    timeout: 15_000,
  });
}

/**
 * With Caw's panel open in its popover: its computed width, padding and box
 * held against the glass card's frame (min(--c-panel-w, the viewport less
 * 24px, less 12px under 900px); 7px each side), ±0.5px. Two checks, named
 * `name: …`.
 */
export async function checkCawSeatPop(kit: Kit, page: Page, name: string) {
  await page.waitForSelector(CAW_SEAT_POP, { timeout: 15_000 });
  const read = await page.evaluate((sel) => {
    const pop = document.querySelector(sel) as HTMLElement;
    const style = getComputedStyle(pop);
    // The token as a length: a probe sized by it.
    const probe = document.createElement("div");
    probe.style.width = "var(--c-panel-w)";
    probe.style.position = "absolute";
    document.body.append(probe);
    const panel = probe.getBoundingClientRect().width;
    probe.remove();
    const r = pop.getBoundingClientRect();
    return {
      className: pop.className,
      width: Number.parseFloat(style.width),
      padding: [
        style.paddingTop,
        style.paddingRight,
        style.paddingBottom,
        style.paddingLeft,
      ].map((one) => Number.parseFloat(one)),
      box: { left: r.left, top: r.top, width: r.width, height: r.height },
      panel,
      vw: document.documentElement.clientWidth,
    };
  }, CAW_SEAT_POP);
  const inset = read.vw < 900 ? 12 : 24;
  const expected = Math.min(read.panel, read.vw - inset);
  kit.note(`${name}: ${JSON.stringify(read)}`);
  kit.check(
    `${name}: Caw's popover is the panel's width, min(--c-panel-w, viewport less ${inset}px) (±0.5px)`,
    Math.abs(read.width - expected) <= 0.5 &&
      Math.abs(read.box.width - expected) <= 0.5,
    `width ${read.width}, box ${read.box.width}, expected ${expected} (--c-panel-w ${read.panel}, viewport ${read.vw})`
  );
  kit.check(
    `${name}: its rows stand 7px in (padding 7px each side)`,
    read.padding.every((one) => Math.abs(one - 7) <= 0.5),
    read.padding.join(" ")
  );
}

const spec: Spec = {
  name: "caw-seat-pop",
  async run(kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["Ready."] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    const home = fleet.env.HOME as string;
    const src = join(fleet.sandbox, "src");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`git init -q -b main && echo caw > README.md && git add -A && git commit -qm 'First commit'`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Caw seat",
      machineId: MACHINE,
      cwd: src,
      caw: false,
    });
    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    page.setDefaultTimeout(60_000);
    for (const at of SIZES) {
      const name = `${at.width}×${at.height}`;
      await page.setViewportSize(at);
      await open(page, `${base}/project/${project.id}`, "button.caw-seat");
      await settle(page, 400);
      const shown = await openCawSettings(page)
        .then(() => true)
        .catch(() => false);
      if (!kit.check(`${name}: ⋯ › Caw settings… opens his panel`, shown)) {
        continue;
      }
      await settle(page, 400);
      await checkCawSeatPop(kit, page, name);
      await page.keyboard.press("Escape");
      await settle(page, 300);
    }
  },
};
export default spec;
