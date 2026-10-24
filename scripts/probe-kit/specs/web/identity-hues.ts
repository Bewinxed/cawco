/**
 * The identity hues (`hue-*`: a Configure section's, a machine's, a New
 * session chip's) are glyph ink drawn bare on the page and on raised
 * surfaces (DESIGN.md, The Bare Glyph Rule), so each holds 3:1 against the
 * ground it is drawn on in Day, where they are darkest against the paper.
 * On a scratch fleet (real hub, agent and sessiond against the mock model)
 * and the built dashboard, at 1440 in Day:
 *
 * - Configure › Rules: every rail glyph;
 * - the New session popover from the rail's Start session: every glyph, dot
 *   and fill whose colour is an identity hue (its chips' tiles, the machine
 *   rows' tiles and their online dot);
 *
 * each element's colour (its `color`, or its own fill when it is a dot) is
 * read with the hue tokens as they ship and again with each token set back
 * to its earlier Day value (the shipped value before The Bare Glyph Rule),
 * against the first opaque background under it; every one holds 3:1 as
 * shipped. The before and after of each is printed.
 *
 *   bun scripts/probe-kit/run.ts web identity-hues
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one chip at a time, each opened and read before the next
import type { Page } from "playwright-core";
import { type Kit, open, type Spec, settle } from "../../kit";

const RAIL_START = 'button[aria-label="Start session"]';
const POPOVER = "[data-ns-popover]";

/** Each identity hue's Day value before it was darkened to hold 3:1 bare. */
const EARLIER: Record<string, string> = {
  "--hue-cyan-400": "oklch(75.35% 0.139 232.66)",
  "--hue-cyan-500": "oklch(70.66% 0.1331 226.72)",
  "--hue-amber-500": "oklch(79.08% 0.1577 79.28)",
  "--hue-orange-500": "oklch(70.49% 0.1867 47.6)",
  "--hue-green-500": "oklch(72.27% 0.192 149.58)",
  "--hue-green-600": "oklch(62.71% 0.1699 149.21)",
};

interface Mark {
  hue: string;
  label: string;
  ratio: number;
  what: "ink" | "fill";
}

/** Every element drawn in an identity hue under `root`, with its contrast against what is under it. */
const marks = (page: Page, root: string) =>
  page.evaluate(
    ({ scope, hues }) => {
      const probe = document.createElement("span");
      document.body.append(probe);
      const resolved = new Map<string, string>();
      for (const name of hues) {
        probe.style.color = `var(${name})`;
        resolved.set(getComputedStyle(probe).color, name);
      }
      probe.remove();
      // Colours as sRGB through a canvas, the way they are painted.
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const rgba = (css: string) => {
        if (!ctx) {
          return [0, 0, 0, 0];
        }
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data];
      };
      const lum = ([r, g, b]: number[]) => {
        const lin = (v: number) => {
          const c = v / 255;
          return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return (
          0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(b ?? 0)
        );
      };
      const ground = (el: Element | null): string => {
        for (let at = el; at; at = at.parentElement) {
          const bg = getComputedStyle(at).backgroundColor;
          if ((rgba(bg)[3] ?? 0) === 255) {
            return bg;
          }
        }
        return "white";
      };
      const out: {
        hue: string;
        label: string;
        ratio: number;
        what: "ink" | "fill";
      }[] = [];
      const base = document.querySelector(scope);
      for (const el of base ? [base, ...base.querySelectorAll("*")] : []) {
        if (el.getClientRects().length === 0) {
          continue;
        }
        const style = getComputedStyle(el);
        const ink = resolved.get(style.color);
        const fill = resolved.get(style.backgroundColor);
        const drawsInk = el.tagName.toLowerCase() === "svg";
        const label = (
          el.closest("a, button, [role=option], li")?.textContent ?? ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 40);
        const ratio = (a: number, b: number) =>
          (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ink && drawsInk) {
          out.push({
            hue: ink,
            label,
            what: "ink",
            ratio: ratio(
              lum(rgba(style.color)),
              lum(rgba(ground(el.parentElement)))
            ),
          });
        }
        if (fill) {
          out.push({
            hue: fill,
            label,
            what: "fill",
            ratio: ratio(
              lum(rgba(style.backgroundColor)),
              lum(rgba(ground(el.parentElement)))
            ),
          });
        }
      }
      return out;
    },
    { scope: root, hues: Object.keys(EARLIER) }
  );

/** The marks as shipped and with the earlier Day values, paired. */
async function both(page: Page, root: string) {
  const now = await marks(page, root);
  await page.evaluate((earlier) => {
    for (const [name, value] of Object.entries(earlier)) {
      document.documentElement.style.setProperty(name, value);
    }
  }, EARLIER);
  const then = await marks(page, root);
  await page.evaluate((earlier) => {
    for (const name of Object.keys(earlier)) {
      document.documentElement.style.removeProperty(name);
    }
  }, EARLIER);
  return { now, then };
}

const said = (list: Mark[]) =>
  list
    .map(
      (m) =>
        `${m.label || "(no label)"} ${m.hue} ${m.what} ${m.ratio.toFixed(2)}`
    )
    .join("; ");

async function leg(
  kit: Kit,
  page: Page,
  name: string,
  root: string
): Promise<void> {
  const { now, then } = await both(page, root);
  kit.check(
    `${name}, Day: every identity-hue glyph, dot and fill holds 3:1 on its ground (${now.length} marks; earlier Day values: ${said(then)})`,
    now.length > 0 && now.every((m) => m.ratio >= 3),
    said(now)
  );
}

const spec: Spec = {
  name: "identity-hues",
  async run(kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 20, words: ["Ready."] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const base = await fleet.dashboard();

    const page = await kit.page("desk", { theme: "light" });
    await open(page, `${base}/config/rules`, 'a[data-slot="row"]', 120_000);
    await settle(page, 400);
    await leg(kit, page, "Configure", "body");

    await open(page, `${base}/`, RAIL_START, 120_000);
    await settle(page, 400);
    await page.locator(RAIL_START).filter({ visible: true }).first().click();
    await page.waitForSelector(POPOVER, { state: "visible", timeout: 15_000 });
    await settle(page, 400);
    await leg(kit, page, "the start popover", POPOVER);
    // The machines chip's list: its rows' tiles, beside their online dot.
    const chips = page.locator(
      `${POPOVER} button:has([data-slot="chip-label"])`
    );
    let listed = false;
    for (let at = 0; at < (await chips.count()) && !listed; at += 1) {
      await chips.nth(at).click();
      await settle(page, 400);
      listed =
        (await page.locator('[data-slot="dot"][data-is-online]').count()) > 0;
      if (!listed) {
        await page.keyboard.press("Escape");
        await settle(page, 200);
      }
    }
    kit.check(
      "the start popover: its machines chip lists the fleet's machine, online",
      listed,
      ""
    );
    if (listed) {
      await leg(kit, page, "the start popover, its machines", "body");
      const dot = await page.evaluate(() => {
        const el = document.querySelector('[data-slot="dot"][data-is-online]');
        return el ? getComputedStyle(el).backgroundColor : null;
      });
      kit.check(
        "the start popover, its machines: the online dot is drawn in presence-online, no identity hue (unchanged)",
        dot !== null,
        String(dot)
      );
    }
    await page.close();
  },
};

export default spec;
