/**
 * DESIGN.md's Caret Rule and One Ring Rule, read from the engine on the
 * surfaces walk's tapes, at 1440 and 390 (`PROBE_ENGINE=webkit` for WebKit):
 *
 *   bun scripts/probe-kit/run.ts web focus-indication
 *   PROBE_ENGINE=webkit bun scripts/probe-kit/run.ts web focus-indication
 *
 * - Every text field, editor and search strip standing in a touched state
 *   (Find's strip, the composer, New session's prompt, model search and
 *   path, Recent's search, a task's fields, a hook's editor, the memory
 *   editor, a comment's composer), focused by a click and again by Tab
 *   (⇧Tab, Tab back onto it): it holds the focus; neither it nor any box
 *   round it draws the focus ring (no outline and no box-shadow in
 *   `focus-ring`); a field with a frame of its own (`field-edge`) steps that
 *   frame's border to `border-control-strong`; a field with none (Find's
 *   strip, the composer's pill) changes nothing round it, its caret alone.
 * - A button (the composer's first): a press gives no outline; Tab gives
 *   the 2px `focus-ring` outline.
 * - The side panel in Comment mode: the well's mark is its 1px `seam`
 *   inside its box, never the ring's colour or its 2px.
 * - Each state's overflow sweep (journeys/scan.ts: nothing spills, nothing
 *   overlaps) at rest and after its fields were focused, and the walk's
 *   console and page errors: none.
 * The canvas's selected frame is canvas-design's 3b.
 */
import type { Page } from "playwright-core";
import { scan } from "../../journeys/scan";
import type { Kit, Spec } from "../../kit";
import { chosen } from "../../surfaces/catalogue";
import { PASSES, pageErrors, walkTapes } from "../../surfaces/walk";

/** The states read, `surface/state`: only these are opened. */
const READ = new Set([
  "jump/open",
  "session/rest",
  "new-session/open",
  "new-session/location",
  "home/recent",
  "task/open",
  "config-hooks/editor",
  "config-memory/editor",
  "artifact/pin-compose",
]);

/** What a text field is, as the base rule names it (design.css). */
const FIELD =
  'input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"], [type="reset"], [type="color"], [type="file"], [type="image"], [type="hidden"]), textarea, [contenteditable]:not([contenteditable="false"])';

/**
 * Marks each text field standing in view (`data-probe-field`), outermost
 * editors only; says how many. Where an open popover holds fields, only
 * the frontmost one's (the last opened): a press behind it would only
 * dismiss it.
 */
const markFields = (page: Page): Promise<number> =>
  page.evaluate((selector) => {
    for (const old of document.querySelectorAll("[data-probe-field]")) {
      old.removeAttribute("data-probe-field");
    }
    const popover = [
      ...document.querySelectorAll(
        "[data-state=open]:is([data-ns-pop], [data-slot=popover-content])"
      ),
    ].findLast((pop) => pop.querySelector(selector));
    let n = 0;
    for (const el of (popover ?? document).querySelectorAll<HTMLElement>(
      selector
    )) {
      const r = el.getBoundingClientRect();
      if (
        r.width < 4 ||
        r.height < 4 ||
        r.bottom < 0 ||
        r.top > innerHeight ||
        !el.checkVisibility({
          opacityProperty: true,
          visibilityProperty: true,
        }) ||
        el.parentElement?.isContentEditable ||
        (el as HTMLInputElement).disabled ||
        (el as HTMLInputElement).readOnly ||
        el.closest("[inert], [aria-hidden='true']")
      ) {
        continue;
      }
      el.setAttribute("data-probe-field", String(n));
      n += 1;
    }
    return n;
  }, FIELD);

interface FieldRead {
  /** It, or what it holds, has the focus. */
  active: boolean;
  /** Each box from the field out four ancestors: its outline, shadow and border. */
  chain: string;
  /** A box on that chain draws the focus ring (an outline or a shadow in `focus-ring`). */
  coral: string | null;
  frame: { border: string; strong: string; invalid: boolean } | null;
  name: string;
}

/** Field `i` as it stands: transitions run to their end first. */
const readField = (page: Page, i: number): Promise<FieldRead | null> =>
  page.evaluate((at) => {
    const el = document.querySelector<HTMLElement>(
      `[data-probe-field="${at}"]`
    );
    if (!el) {
      return null;
    }
    for (const run of document.getAnimations()) {
      if (run instanceof CSSTransition) {
        run.finish();
      }
    }
    const token = (name: string, beside: Element) => {
      const probe = document.createElement("span");
      probe.style.setProperty("color", `var(${name})`);
      probe.style.setProperty("position", "absolute");
      beside.append(probe);
      const got = getComputedStyle(probe).color;
      probe.remove();
      return got;
    };
    // Read beside the field and its frame: an input holds no children.
    const ground = (box: Element) => box.parentElement ?? document.body;
    const ring = token("--focus-ring", ground(el));
    /** One box: how it is named, what it draws, and whether that is the ring. */
    const look = (box: Element) => {
      const s = getComputedStyle(box);
      const slot = box.getAttribute("data-slot");
      const where = slot ? `${box.localName}[${slot}]` : box.localName;
      // An outline whose style is none draws nothing, whatever its width.
      const drawn = s.outlineStyle !== "none";
      const outline = drawn
        ? `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`
        : "none";
      const ringed =
        (drawn && s.outlineColor === ring) || s.boxShadow.includes(ring);
      return {
        said: `${where} ${outline} | ${s.boxShadow} | ${s.borderTopColor} ${s.borderBottomColor}`,
        ringed,
      };
    };
    const looks: ReturnType<typeof look>[] = [];
    for (let box: Element | null = el; box && looks.length < 5;) {
      looks.push(look(box));
      box = box.parentElement;
    }
    const frame = el.closest(".field-edge");
    const active = document.activeElement;
    return {
      active: !!active && (active === el || el.contains(active)),
      chain: looks.map((one) => one.said).join(" / "),
      coral: looks.find((one) => one.ringed)?.said ?? null,
      frame: frame
        ? {
            border: getComputedStyle(frame).borderTopColor,
            strong: token("--border-control-strong", ground(frame)),
            invalid:
              frame.matches('[aria-invalid="true"]') ||
              !!frame.querySelector('[aria-invalid="true"]'),
          }
        : null,
      name:
        el.getAttribute("aria-label") ??
        el.getAttribute("placeholder") ??
        el.getAttribute("data-slot") ??
        el.localName,
    };
  }, i);

const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

/** The focus ring's rules on one focused read, said as what fails; null when it holds. */
function wrong(rest: FieldRead, now: FieldRead | null): string | null {
  if (!now?.active) {
    return "it did not take the focus";
  }
  if (now.coral) {
    return `the ring is drawn: ${now.coral}`;
  }
  if (now.frame) {
    if (!now.frame.invalid && now.frame.border !== now.frame.strong) {
      return `its frame's edge is ${now.frame.border}, not border-control-strong ${now.frame.strong}`;
    }
    return null;
  }
  return now.chain === rest.chain
    ? null
    : `what stands round it changed:\n      rest ${rest.chain}\n      now  ${now.chain}`;
}

async function fieldsOf(
  kit: Kit,
  page: Page,
  at: string
): Promise<{ count: number; framed: number }> {
  const count = await markFields(page);
  let framed = 0;
  for (let i = 0; i < count; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one field focused at a time
    await blur(page);
    const rest = await readField(page, i);
    if (!rest) {
      continue;
    }
    if (rest.frame) {
      framed += 1;
    }
    // A person's press at its middle, once it is scrolled into view; a
    // field another layer stands over (an open popover's ground) is not
    // the person's to press, and is said and left.
    const field = page.locator(`[data-probe-field="${i}"]`);
    await field.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => null);
    const point = await field.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + Math.min(r.height / 2, 12);
      const hit = document.elementFromPoint(x, y);
      let up: Element | null = hit;
      let steps = 0;
      while (up && up !== el && steps < 4) {
        up = up.parentElement;
        steps += 1;
      }
      const ours = !!hit && (el.contains(hit) || up === el || hit.contains(el));
      return ours ? { x, y } : null;
    });
    if (!point) {
      kit.note(`${at}: "${rest.name}" stands under another layer: not read`);
      continue;
    }
    await page.mouse.click(point.x, point.y);
    const byClick = await readField(page, i);
    const clickWrong = wrong(rest, byClick);
    kit.check(
      `${at}: "${rest.name}" focused by a click: ${rest.frame ? "its frame steps to border-control-strong" : "its caret alone"}, no ring`,
      clickWrong === null,
      clickWrong ?? ""
    );
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const byTab = await readField(page, i);
    const tabWrong = wrong(rest, byTab);
    kit.check(
      `${at}: "${rest.name}" focused by Tab: ${rest.frame ? "its frame steps to border-control-strong" : "its caret alone"}, no ring`,
      tabWrong === null,
      tabWrong ?? ""
    );
  }
  await blur(page);
  return { count, framed };
}

/**
 * A control: Tab onto it gives the 2px focus-ring, a press none. The
 * composer's own: from its field, Tab until a button of its holds the
 * focus (each engine's own tab order), then that button pressed.
 */
async function button(kit: Kit, page: Page, at: string): Promise<void> {
  const field = page.locator('form[data-slot="cin"] [contenteditable="true"]');
  const box = await field.first().boundingBox();
  if (!box) {
    kit.check(`${at}: the composer stands a field to Tab from`, false);
    return;
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const read = () =>
    page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.setProperty("color", "var(--focus-ring)");
      document.body.append(probe);
      const ring = getComputedStyle(probe).color;
      probe.remove();
      const el = document.activeElement as HTMLElement | null;
      const s = el ? getComputedStyle(el) : null;
      return {
        name:
          el?.getAttribute("aria-label") ??
          el?.textContent?.trim() ??
          el?.localName ??
          "",
        button:
          !!el &&
          el.localName === "button" &&
          !!el.closest("form[data-slot=cin]"),
        style: s?.outlineStyle ?? "",
        width: s?.outlineWidth ?? "",
        coral: s?.outlineColor === ring,
      };
    });
  let tabbed = await read();
  for (let step = 0; step < 6 && !tabbed.button; step += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one key at a time, read after each
    await page.keyboard.press("Tab");
    tabbed = await read();
  }
  kit.check(
    `${at}: Tab onto the composer's button "${tabbed.name}" draws the 2px focus-ring outline`,
    tabbed.button &&
      tabbed.style === "solid" &&
      tabbed.width === "2px" &&
      tabbed.coral,
    JSON.stringify(tabbed)
  );
  if (!tabbed.button) {
    return;
  }
  await page.evaluate(() =>
    document.activeElement?.setAttribute("data-probe-control", "")
  );
  const control = page.locator("[data-probe-control]");
  await blur(page);
  const at2 = await control.boundingBox();
  if (!at2) {
    return;
  }
  // Pressed and let go off it: the focus a press gives, and no click.
  await page.mouse.move(at2.x + at2.width / 2, at2.y + at2.height / 2);
  await page.mouse.down();
  const pressed = await read();
  await page.mouse.move(at2.x + at2.width / 2, at2.y - 200);
  await page.mouse.up();
  kit.check(
    `${at}: a press on that button draws no outline`,
    pressed.style === "none",
    JSON.stringify(pressed)
  );
  await control.evaluate((el) => el.removeAttribute("data-probe-control"));
  await blur(page);
}

/** The side panel's well in Comment mode: its 1px seam, not the ring. */
async function commentWell(kit: Kit, page: Page, at: string): Promise<void> {
  const read = await page.evaluate(() => {
    const well = [
      ...document.querySelectorAll<HTMLElement>("[data-side-well]"),
    ].find((el) => el.getBoundingClientRect().width > 0);
    if (!well) {
      return null;
    }
    const token = (name: string) => {
      const probe = document.createElement("span");
      probe.style.setProperty("color", `var(${name})`);
      well.append(probe);
      const got = getComputedStyle(probe).color;
      probe.remove();
      return got;
    };
    const s = getComputedStyle(well);
    return {
      mode: well.dataset.mode ?? null,
      style: s.outlineStyle,
      width: s.outlineWidth,
      offset: s.outlineOffset,
      color: s.outlineColor,
      seam: token("--seam"),
      ring: token("--focus-ring"),
      shadow: s.boxShadow,
    };
  });
  kit.check(
    `${at}: the side panel in Comment mode marks its well with the 1px seam inside its box, never the ring`,
    !!read &&
      read.mode === "comment" &&
      read.style === "solid" &&
      read.width === "1px" &&
      read.offset === "-1px" &&
      read.color === read.seam &&
      read.color !== read.ring &&
      !read.shadow.includes(read.ring),
    JSON.stringify(read)
  );
}

async function sweep(kit: Kit, page: Page, at: string, when: string) {
  const found = await page.evaluate(scan);
  kit.check(
    `${at}: overflow sweep ${when}: nothing spills or overlaps`,
    found.length === 0,
    found.join("\n    ")
  );
}

const spec: Spec = {
  name: "focus-indication",
  async run(kit) {
    const names = [...new Set([...READ].map((at) => at.split("/")[0]))];
    const surfaces = chosen(names.join(",")).map((surface) => ({
      ...surface,
      states: surface.states.filter((state) =>
        READ.has(`${surface.name}/${state.name}`)
      ),
    }));
    const passes = PASSES.filter(
      (pass) =>
        !pass.reduced &&
        pass.theme === "light" &&
        (pass.width === "desk" || pass.width === "phone")
    );
    let fields = 0;
    let framed = 0;
    const heard = new WeakSet<Page>();
    const consoleErrors: { said: string; url: string }[] = [];
    const walked = await walkTapes(
      kit,
      surfaces,
      passes,
      async ({ page, pass, state, surface }) => {
        const at = `${surface.name}/${state.name} · ${pass.name}`;
        if (!heard.has(page)) {
          heard.add(page);
          page.on("console", (message) => {
            if (message.type() === "error") {
              consoleErrors.push({
                said: `${pass.name}: ${message.text()}`,
                url: message.location().url,
              });
            }
          });
        }
        await sweep(kit, page, at, "at rest");
        if (`${surface.name}/${state.name}` === "artifact/pin-compose") {
          await commentWell(kit, page, at);
        }
        const read = await fieldsOf(kit, page, at);
        fields += read.count;
        framed += read.framed;
        kit.check(`${at}: a text field stands to read`, read.count > 0);
        if (`${surface.name}/${state.name}` === "session/rest") {
          await button(kit, page, at);
        }
        await sweep(kit, page, at, "after its fields were focused");
      }
    );
    kit.note(`${fields} fields read, ${framed} of them framed (field-edge)`);
    // A request the tape never recorded is answered 404 "not on the tape"
    // (hub-tape.ts): the tape's miss, said, not the dashboard's error.
    const missed = (error: { said: string; url: string }) =>
      error.said.includes("Not on the tape") ||
      (error.said.includes("404") &&
        walked.misses.some((miss) =>
          miss.includes(new URL(error.url, "http://x").pathname)
        ));
    const tapes = consoleErrors.filter(missed);
    const own = consoleErrors.filter((error) => !missed(error));
    kit.note(
      `the tape's own misses: ${walked.misses.join(", ") || "none"}; ${tapes.length} console lines were their 404s`
    );
    kit.check(
      "no page error and no console error across the walk (the tape's misses aside)",
      pageErrors.length === 0 && own.length === 0,
      JSON.stringify({ pageErrors, own })
    );
  },
};
export default spec;
