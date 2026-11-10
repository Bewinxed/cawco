/**
 * Esc closes the host's topmost open layer wherever the focus is, inside a
 * page's frame too (graph-stage move-chips, r546: a press into the design
 * graph's stage left the focus in its frame, and Esc left the clip's
 * Curve popover open over the next chip). A script in a frame that
 * focuses one of its own elements (the stage's rig playing a story, a
 * component focusing its field as it mounts) makes the frame the window's
 * focused frame, and from then on every key is the frame's: bits-ui's
 * escape layer listens on the host's document and hears none. The page's
 * overlay hands an Esc it left unhandled to the host (`cawco:key`, overlay
 * page.ts `escapeToHost`), and the pane presses it at the frame
 * (PreviewPane `escapeFromPage`), where the host's own Esc rules answer it.
 *
 * On a scratch fleet, a page artifact holding a button, a field and a
 * field that keeps its own Esc, opened on its own tab at the desk (1440)
 * and the phone (390). For each, with the artifact's title menu (a bits-ui
 * layer of the host) open:
 *
 * 1. The page's script focuses its button: the host's focus is the frame.
 *    Esc closes the menu.
 * 2. The same with the page's field focused.
 * 3. The page's field that handles Esc itself (`preventDefault`): Esc is
 *    the page's, and the menu stays open.
 *
 *   bun scripts/probe-kit/run.ts frame-escape
 */
import type { Frame, Page } from "playwright-core";
import { type Reply, until } from "../../scratch-fleet";
import { open, settle } from "../kit";
import type { Kit, Spec } from "../spec";

const PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Frame escape</title></head><body style="margin:0;font:18px/1.6 system-ui"><main style="padding:24px"><h1>Frame escape</h1><p><button id="control" type="button">Create routine</button></p><p><input id="field" aria-label="Name"></p><p><input id="own" aria-label="Search, its own Esc"></p></main><script>document.getElementById("own").addEventListener("keydown",function(e){if(e.key==="Escape"){e.preventDefault();}});</script></body></html>';
const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const FRAME = `${PANE} iframe[title="Preview"]`;
const TRIGGER = `${PANE} [data-artifact-trigger]`;
/** The title menu's list, open. */
const MENU = '[role="menu"][data-state="open"]';

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The host's focus, and whether the menu stands open. */
const standing = (page: Page) =>
  page.evaluate((menu) => {
    const menus = [...document.querySelectorAll<HTMLElement>(menu)].filter(
      (one) => {
        const box = one.getBoundingClientRect();
        return box.width > 1 && box.height > 1;
      }
    );
    return {
      focus: document.activeElement?.tagName.toLowerCase() ?? "none",
      menu: menus.length > 0,
    };
  }, MENU);

/** One leg: the menu opened, the page's script focusing `target` in the frame, then Esc. */
const leg = async (
  page: Page,
  frame: Frame,
  target: string
): Promise<{
  after: { focus: string; menu: boolean };
  before: { focus: string; menu: boolean };
}> => {
  await page.locator(TRIGGER).click();
  await page.waitForSelector(MENU, { timeout: 5000 }).catch(() => undefined);
  await settle(page);
  // The page's own script takes the focus, as the stage's rig does when it plays a story.
  await frame.evaluate((selector) => {
    document.querySelector<HTMLElement>(selector)?.focus();
  }, target);
  const before = await standing(page);
  await page.keyboard.press("Escape");
  await settle(page);
  const after = await standing(page);
  // The next leg starts with the menu shut and the focus on the host.
  if (after.menu) {
    await page.locator(TRIGGER).focus();
    await page.keyboard.press("Escape");
    await settle(page);
  }
  return { before, after };
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Frame escape", fleet.repo);
  const { id } = await fleet.api((hub) =>
    hub.api.instances({ id: session }).artifacts.post({
      kind: "page",
      does: "judge",
      title: "Frame escape",
      ask: "Judge this page: pin anything that reads wrong",
      name: "frame-escape",
      html: PAGE,
    })
  );
  const base = await fleet.dashboard();
  for (const form of ["desk", "phone"] as const) {
    const at = form === "desk" ? "1440" : "390";
    const page = await kit.page(form);
    await open(page, `${base}/artifact/${id}`, TRIGGER);
    const frame = (await until(
      "the page in the pane",
      async () =>
        (await (await page.locator(FRAME).elementHandle())?.contentFrame()) ??
        null,
      Boolean,
      60_000
    )) as Frame;
    await frame.waitForSelector("#control");
    await until(
      "the overlay joined its doc",
      () =>
        frame.evaluate(
          () =>
            !!(window as unknown as { cawcoArtifact?: { doc?: unknown } })
              .cawcoArtifact?.doc
        ),
      Boolean,
      30_000
    );
    await settle(page, 400);
    for (const [step, target, what] of [
      ["1", "#control", "its button"],
      ["2", "#field", "its field"],
    ] as const) {
      const read = await leg(page, frame, target);
      kit.check(
        `${at} ${step}: with the host's menu open and the page's script focusing ${what}, the focus is the frame's and Esc closes the menu`,
        read.before.menu && read.before.focus === "iframe" && !read.after.menu,
        JSON.stringify(read)
      );
    }
    const own = await leg(page, frame, "#own");
    kit.check(
      `${at} 3: a field in the page that handles Esc itself keeps it: the host's menu stays open`,
      own.before.menu && own.before.focus === "iframe" && own.after.menu,
      JSON.stringify(own)
    );
    await page.close();
  }
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "frame-escape",
  run,
};
export default spec;
