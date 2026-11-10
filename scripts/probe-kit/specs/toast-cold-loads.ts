/**
 * A toast draws with the house's Toast recipe (DESIGN.md, Toast: the
 * floating surface over sonner's own box) on every load of every page, at
 * every width, whatever order the page's stylesheets come in and whatever
 * each of them says first.
 *
 * The update toast went up bare on some loads, more often on the owner's
 * phone: no padding, its words at the card's edge and its acts on its
 * bottom edge. A document places a cascade layer where it is first named,
 * in the order its sheets are linked ("Cascade layers are sorted by the
 * order in which they first are declared",
 * https://drafts.csswg.org/css-cascade-5/#layer-ordering),
 * and every page under `(app)` links the sheet that holds svelte-sonner's
 * (`@layer vendor { … }`) ahead of base.css. 36751f9ea headed every built
 * sheet with the house's order, but after Vite had named each sheet by its
 * content: `app_artifact_project-view.CsqUDdhf.css` was 19470 bytes opening
 * on `@layer vendor{` before that commit and 19543 opening on the order
 * after it, one URL, served `immutable` for a year. A browser that held the
 * older copy named `vendor` before `base`, and Tailwind's preflight took the
 * toast's padding and border. The page itself now states the order, in a
 * `<style>` of app.html's ahead of every sheet it links.
 *
 * Each load is cold (a context of its own, an empty cache) and comes in an
 * order of its own, drawn from a seed so a failing load comes again: the
 * page's `<link rel="stylesheet">` tags shuffled in its HTML, each sheet
 * held back a while, and each sheet served as built or as a copy without a
 * leading `@layer` statement of its own (the copy that browser held). The
 * update toast is raised the way a new build raises it (the dashboard naming
 * another build, `_app/running-version.json`, and the page's hub socket
 * dropped so it asks: update-toast's announcement), with the person here so
 * no idle reload takes the page first, and read once it stands:
 * - its box is sonner's, which the recipe stands over: 16px padding a side,
 *   a 1px border, the recipe's `--radius-lg` corners;
 * - the document's layers stand in the house's order.
 *
 * Every route family a cold load can enter by (the home, a conversation,
 * Configure, usage, a new project), at the desk and on a 390 phone's touch
 * screen, in Chromium and WebKit.
 */
import type { Page } from "playwright-core";
import {
  AWAY_AFTER_DEFAULT_MS,
  AWAY_AFTER_MAX_MS,
} from "../../../packages/core/src/notifications";
import { until } from "../../scratch-fleet";
import { seeded } from "../claude-transcripts";
import { open } from "../kit";
import type { Engine, Kit, Spec, View } from "../spec";
import { announce, wire } from "./update-toast";

/** The routes a cold load enters by, one per family of pages. */
const ROUTES = ["/", "/session", "/config/updates", "/usage", "/project/new"];
const LEGS: [Engine, View][] = [
  ["chromium", "desk"],
  ["chromium", "phone"],
  ["webkit", "desk"],
  ["webkit", "phone"],
];
/** Cold loads per route on each leg, each in an order of its own. */
const LOADS = 3;
/** How long the hub's `person` frame takes to reach the page, at most. */
const FRAME_LANDS_MS = 2000;
/** The longest a sheet is held back. */
const HELD_MS = 300;
const TOAST = '[data-sonner-toast]:not([data-removed="true"])';
const READY = '[data-slot="toast-layer"]';
/** The house's layers, in order (app.html). */
const HOUSE_ORDER = [
  "properties",
  "theme",
  "base",
  "vendor",
  "components",
  "utilities",
  "overrides",
];
const STYLESHEET_LINK = /<link\b[^>]*\brel="stylesheet"[^>]*>/gu;
const LINK_HREF = /href="([^"]+)"/u;
const LEADING_LAYER_STATEMENT = /^@layer [^{;]+;/u;

/** How one load's sheets come: its link order, the sheets served without their own statement, each one's hold. */
interface Order {
  held: Map<string, number>;
  links: string[];
  stale: string[];
}

const fileOf = (url: string): string =>
  new URL(url, "http://probe").pathname.split("/").pop() ?? url;

/** A draw of its own for each sheet of a load, whatever order the sheets are asked for in. */
const drawFor = (seed: number, file: string): (() => number) =>
  seeded(
    [...file].reduce(
      (hash, char) => (hash * 31 + (char.codePointAt(0) ?? 0)) % 2_147_483_647,
      seed
    )
  );

/** `items` in an order `random` draws. */
const shuffled = <T>(items: T[], random: () => number): T[] => {
  const out = [...items];
  for (let at = out.length - 1; at > 0; at -= 1) {
    const other = Math.floor(random() * (at + 1));
    [out[at], out[other]] = [out[other] as T, out[at] as T];
  }
  return out;
};

/** The headers a fulfilled answer keeps: its body is sent decoded, at its own length. */
const plainHeaders = (headers: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => !["content-encoding", "content-length"].includes(name)
    )
  );

/** `page`'s sheets in an order drawn from `seed`. */
const comeInOrder = async (
  page: Page,
  base: string,
  seed: number
): Promise<Order> => {
  const order: Order = { links: [], stale: [], held: new Map() };
  await page.route(
    (url) => url.origin === new URL(base).origin,
    async (route) => {
      const request = route.request();
      if (!(
        request.isNavigationRequest() && request.frame() === page.mainFrame()
      )) {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      const html = await response.text();
      const links = html.match(STYLESHEET_LINK) ?? [];
      const moved = shuffled(links, seeded(seed));
      order.links = moved.map((link) =>
        fileOf(LINK_HREF.exec(link)?.[1] ?? link)
      );
      let at = 0;
      const next = (): string => {
        const link = moved[at] ?? "";
        at += 1;
        return link;
      };
      await route.fulfill({
        status: response.status(),
        headers: plainHeaders(response.headers()),
        body: html.replace(STYLESHEET_LINK, next),
      });
    }
  );
  await page.route("**/_app/immutable/assets/*.css", async (route) => {
    const file = fileOf(route.request().url());
    const random = drawFor(seed, file);
    const response = await route.fetch();
    let body = await response.text();
    if (random() < 0.5 && LEADING_LAYER_STATEMENT.test(body)) {
      body = body.replace(LEADING_LAYER_STATEMENT, "");
      order.stale.push(file);
    }
    const held = Math.round(random() * HELD_MS);
    order.held.set(file, held);
    await new Promise((done) => setTimeout(done, held));
    await route.fulfill({
      status: response.status(),
      headers: plainHeaders(response.headers()),
      body,
    });
  });
  return order;
};

/** The document's layers in the order it placed them, and the sheet that named the first. */
const readLayers = (page: Page) =>
  page.evaluate(() => {
    const namesOf = (rule: CSSRule): string[] => {
      if (rule instanceof CSSLayerStatementRule) {
        return [...rule.nameList];
      }
      if (rule instanceof CSSLayerBlockRule) {
        return [rule.name];
      }
      return rule instanceof CSSImportRule && typeof rule.layerName === "string"
        ? [rule.layerName]
        : [];
    };
    const rulesOf = (sheet: CSSStyleSheet): CSSRule[] => {
      try {
        return [...sheet.cssRules];
      } catch {
        return [];
      }
    };
    const layers: string[] = [];
    let firstNamedBy: string | null = null;
    for (const sheet of document.styleSheets) {
      for (const name of rulesOf(sheet).flatMap(namesOf)) {
        if (!layers.includes(name)) {
          layers.push(name);
          firstNamedBy ??=
            sheet.href?.split("/").pop() ??
            `<${sheet.ownerNode?.nodeName.toLowerCase()}>`;
        }
      }
    }
    return { layers, firstNamedBy };
  });

/** The toast's box, and the corners the recipe's `--radius-lg` draws. */
const readBox = (page: Page) =>
  page.evaluate((selector) => {
    const recipe = document.createElement("div");
    recipe.style.borderRadius = "var(--radius-lg)";
    document.body.append(recipe);
    const radius = getComputedStyle(recipe).borderTopLeftRadius;
    recipe.remove();
    const toast = document.querySelector(selector);
    if (!toast) {
      return { toast: null, radius };
    }
    const style = getComputedStyle(toast);
    const sides = (property: string) =>
      ["top", "right", "bottom", "left"].map((side) =>
        style.getPropertyValue(property.replace("*", side))
      );
    return {
      toast: {
        padding: sides("padding-*"),
        border: sides("border-*-width"),
        radius: style.borderTopLeftRadius,
      },
      radius,
    };
  }, TOAST);

const readToast = async (page: Page) => ({
  ...(await readBox(page)),
  ...(await readLayers(page)),
});

type Read = Awaited<ReturnType<typeof readToast>>;

/** Whether `read` is the recipe's toast in the house's layers. */
const drawnWhole = ({ toast, radius, layers }: Read): boolean =>
  toast?.padding.every((side) => side === "16px") === true &&
  toast.border.every((side) => side === "1px") &&
  toast.radius === radius &&
  HOUSE_ORDER.every((layer, at) => layers[at] === layer);

/** A seed of its own for each load. */
const seedOf = (leg: number, route: number, load: number): number =>
  1 + leg * 1000 + route * 10 + load;

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.launch("hub");
  await fleet.hubUp();
  const base = await fleet.dashboard();

  // The update toast reloads a page whose person is away
  // (updates/update-toast.svelte.ts): every load is read in front of them,
  // a key pressed on it and the hub saying them here before the toast goes
  // up, on their away clock at its longest.
  await fleet.api((hub) =>
    hub.api.person["away-clock"].post({ awayAfterMs: AWAY_AFTER_MAX_MS })
  );

  for (const [legAt, [engine, view]] of LEGS.entries()) {
    for (const [routeAt, route] of ROUTES.entries()) {
      const bare: unknown[] = [];
      let whole = 0;
      for (let load = 0; load < LOADS; load += 1) {
        const seed = seedOf(legAt, routeAt, load);
        const page = await kit.page(view, { engine });
        if (engine === "chromium") {
          // The page's HTML is the probe's answer, which Chromium places in
          // no address space of the loopback's, so its socket to the
          // loopback hub is a local network access it asks leave for
          // ("net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS" without it).
          await page.context().grantPermissions(["local-network-access"]);
        }
        const order = await comeInOrder(page, base, seed);
        const update = await wire(page);
        await open(page, `${base}${route}`, READY);
        const loaded = update.loads.length;
        await page.keyboard.press("Shift");
        await until(
          "the person here",
          () => fleet.api((hub) => hub.api.person.get()),
          (person) => person.state === "here",
          30_000
        );
        // The hub's `person` frame saying so reaches the page before the
        // announcement drops its socket.
        await page.waitForTimeout(FRAME_LANDS_MS);
        await announce(update);
        const up = await page
          .locator(TOAST)
          .first()
          .waitFor({ state: "visible", timeout: 20_000 })
          .then(() => true)
          .catch(() => false);
        const read = await readToast(page);
        if (up && drawnWhole(read)) {
          whole += 1;
        } else {
          bare.push({
            seed,
            up,
            reloads: update.loads.length - loaded,
            errors: update.errors,
            read,
            links: order.links,
            stale: order.stale,
            held: Object.fromEntries(order.held),
          });
        }
        await page.close();
      }
      kit.check(
        `${engine} ${view}, entering at ${route}: the update toast draws with the Toast recipe (16px padding a side, a 1px border, --radius-lg corners) and the document's layers stand ${HOUSE_ORDER.join(" < ")}, on each of ${LOADS} cold loads in shuffled sheet orders`,
        bare.length === 0,
        JSON.stringify({ whole, bare })
      );
    }
  }

  await fleet.api((hub) =>
    hub.api.person["away-clock"].post({
      awayAfterMs: AWAY_AFTER_DEFAULT_MS,
    })
  );
};

const spec: Spec = {
  group: "Release checks",
  name: "toast-cold-loads",
  run,
};
export default spec;
