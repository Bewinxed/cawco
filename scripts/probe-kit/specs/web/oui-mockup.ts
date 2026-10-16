/**
 * Mockups are OpenUI Lang over a project's own mockup library, which the hub
 * builds from the project's `design/` (hub mockups.ts) and the dashboard
 * draws with its one OpenUI binding (views/openui/mockup). On a scratch
 * fleet's hub, through the dev dashboard's bench
 * `/motion/oui-mockup?project=<id>&src=<path>`, one run each:
 *
 * a. CawCo's own project (`design/manifest.json` says `system: "cawco"`):
 *    three samples, a session's page on a desk, the board's task cards on a
 *    phone, and a dialog's states, each drawn in place with the dashboard's
 *    own components: every component the program names is drawn
 *    (`data-mk`; a column's cards as the board's own TaskCards, one per
 *    call), the real component inside it and inside its box, and nothing is
 *    dropped or fails.
 * b. Its States switch shows the dialog only once "Open" is chosen.
 * c. A component the library does not have is refused by the hub's check
 *    with its name, and the bench draws nothing.
 * d. A project with a design of its own (a palette and a font of its own,
 *    one specimen, one asset) is drawn in a shadow root in its palette and
 *    its font (computed styles; the font loaded under the hub's name for
 *    it), its specimen filled from the call, its asset loaded.
 * e. Nothing leaks either way: the bench's own computed styles are the same
 *    with that mockup drawn as with none; the project's tokens, class and
 *    font name reach nothing outside its shadow root; the dashboard's tokens
 *    reach nothing inside it.
 * f. A project with no `design/` draws the primitives neutral: the system's
 *    face and a grey accent, not CawCo's.
 * g. The shop's binary design files, its font (woff2) and a photo (png),
 *    are written into its folder as base64 (`encoding: "base64"`, the
 *    folder's write as folder_write makes it), never onto the hub's disk by
 *    hand, and the mockup's file route serves each byte-identical. Caw's
 *    own folder_write is specs/folder-bytes.ts.
 *
 *   bun scripts/probe-kit/run.ts web oui-mockup
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one project, one file, one page at a time
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  COMPOSER_FIELD,
  type Kit,
  type KitFleet,
  open,
  type Spec,
  settle,
} from "../../kit";
import { FONT, photo } from "./oui-mockup/bytes";

const HERE = join(import.meta.dir, "oui-mockup");
const SAMPLES = ["session", "board", "dialog"] as const;
const COMPONENT_CALL = /\b([A-Z][A-Za-z0-9]*)\(/g;
const TASK_CARD_CALL = /\bTaskCard\(/g;
/** What each of CawCo's own components draws inside it: the dashboard's real component. */
const INSIDE: Record<string, string> = {
  SessionRow: "[data-rail-row]",
  Composer: COMPOSER_FIELD,
  TaskCard: "[data-task]",
  BoardColumn: "section.column",
  MachineRow: ".tile",
  Alert: "[data-slot='alert']",
};

/** The components a program calls, once each. */
const calls = (source: string): string[] => [
  ...new Set([...source.matchAll(COMPONENT_CALL)].map((match) => match[1])),
];
const fixture = (path: string) => readFile(join(HERE, path), "utf8");

/** Where the bench's mockup is, and what it holds: its parts by name, its errors. */
const drawn = (page: Page) =>
  page.evaluate((inside) => {
    const frame = document.querySelector<HTMLElement>("[data-mockup-frame]");
    const host = frame?.querySelector(".mk-host");
    const root: ParentNode | null | undefined = host ? host.shadowRoot : frame;
    const parts = [...(root?.querySelectorAll<HTMLElement>("[data-mk]") ?? [])];
    // A column's cards are the board's own TaskColumn's, each a real
    // TaskCard (`data-task`), not drawn through the TaskCard wrapper.
    const columnCards =
      root?.querySelectorAll("[data-mk='BoardColumn'] [data-task]").length ?? 0;
    const names = [
      ...new Set([
        ...parts.map((part) => part.dataset.mk ?? ""),
        ...(columnCards > 0 ? ["TaskCard"] : []),
      ]),
    ];
    const cards =
      columnCards +
      (root?.querySelectorAll("[data-mk='TaskCard'] [data-task]").length ?? 0);
    const real = (part: HTMLElement) =>
      part.querySelector<HTMLElement>(inside[part.dataset.mk ?? ""] ?? "");
    const ours = parts.filter((part) => (part.dataset.mk ?? "") in inside);
    // The dashboard's own component inside each of CawCo's parts.
    const hollow = ours.filter((part) => real(part) === null);
    // What a part draws stands inside its box (the composer's dock is
    // absolute in its pane: its field must not hang outside it).
    const spilled = ours.filter((part) => {
      const own = part.getBoundingClientRect();
      const box = real(part)?.getBoundingClientRect();
      return (
        box !== undefined &&
        (box.top < own.top - 1 ||
          box.bottom > own.bottom + 1 ||
          box.left < own.left - 1 ||
          box.right > own.right + 1)
      );
    });
    // A part that drew nothing has no box (a specimen's own element is
    // `display: contents`: its template's elements are its box).
    const empty = parts
      .filter((part) => part.dataset.mkSpecimen === undefined)
      .filter((part) => {
        const box = part.getBoundingClientRect();
        return box.width === 0 || box.height === 0;
      });
    const named = (each: HTMLElement[]) => [
      ...new Set(each.map((part) => part.dataset.mk ?? "")),
    ];
    return {
      frame: frame?.dataset.mockupFrame ?? null,
      shadow: Boolean(host?.shadowRoot),
      errors: Number(frame?.dataset.mockupErrors ?? -1),
      alerts: document.querySelectorAll("[data-mockup-error]").length,
      names,
      cards,
      hollow: named(hollow),
      spilled: named(spilled),
      empty: named(empty),
    };
  }, INSIDE);

/** Opens the bench on `src` in `project` and waits until it has drawn or refused. */
async function bench(page: Page, base: string, project: string, src: string) {
  await open(
    page,
    `${base}/motion/oui-mockup?project=${encodeURIComponent(project)}&src=${encodeURIComponent(src)}`,
    "[data-mockup-bench='drawn'], [data-mockup-bench='refused']",
    90_000
  );
  await settle(page);
  return page.evaluate(() => ({
    state: document.querySelector<HTMLElement>("[data-mockup-bench]")?.dataset
      .mockupBench,
    refused:
      document.querySelector<HTMLElement>("[data-mockup-refused]")?.dataset
        .mockupRefused ?? null,
  }));
}

/** The bench's own computed styles, and the dashboard's tokens on its root: what a mockup must leave as it is. */
const pageStyles = (page: Page) =>
  page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) {
        return null;
      }
      const style = getComputedStyle(element);
      return [
        style.fontFamily,
        style.color,
        style.backgroundColor,
        style.fontSize,
      ].join(" | ");
    };
    const root = getComputedStyle(document.documentElement);
    return {
      html: read("html"),
      body: read("body"),
      main: read("main"),
      h1: read("main h1"),
      tokens: [
        "--surface-page",
        "--ink-strong",
        "--font-body",
        "--action-solid",
      ].map((name) => root.getPropertyValue(name).trim()),
    };
  });

/** `color` as this engine computes it: what a role resolved to must equal. */
const computedColor = (page: Page, color: string) =>
  page.evaluate((value) => {
    const probe = document.createElement("div");
    probe.style.color = value;
    document.body.append(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return computed;
  }, color);

/** A file written into a project's folder on the hub, as words or, with `base64`, as bytes. */
const folderPut = (
  fleet: KitFleet,
  projectId: string,
  path: string,
  content: string,
  encoding?: "base64"
) =>
  fetch(`${fleet.base}/api/projects/${projectId}/folder/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, content, encoding }),
  });

/** The three projects on the hub: CawCo's own, the shop with a design, and one with none. */
async function seed(fleet: KitFleet) {
  const project = (name: string) =>
    fleet.api<{ id: string }>("/api/projects", { name, caw: false });
  const put = async (projectId: string, path: string, content: string) => {
    const response = await folderPut(fleet, projectId, path, content);
    if (!response.ok) {
      throw new Error(
        `PUT ${path}: ${response.status} ${await response.text()}`
      );
    }
  };

  // CawCo's own project: drawn as CawCo, three samples and an unknown part.
  const cockpit = await project("Cockpit");
  await put(cockpit.id, "design/manifest.json", '{ "system": "cawco" }\n');
  const sources: Record<string, string> = {};
  for (const name of [...SAMPLES, "unknown"]) {
    sources[name] = await fixture(`${name}.oui`);
    await put(cockpit.id, `design/mockups/${name}.oui`, sources[name]);
  }

  // Harbour, a made-up shop with a design of its own; its binary files are
  // written as base64 (g).
  const harbour = await project("Harbour");
  for (const path of [
    "manifest.json",
    "tokens.css",
    "specimens/price-tag.html",
    "assets/wave.svg",
    "home.oui",
  ]) {
    await put(harbour.id, `design/${path}`, await fixture(`harbour/${path}`));
  }

  // A project with no design at all.
  const plain = await project("Plain");
  await put(plain.id, "mockups/neutral.oui", await fixture("neutral.oui"));
  return { cockpit: cockpit.id, harbour: harbour.id, plain: plain.id, sources };
}

/**
 * g: the shop's font and photo written into its folder as base64, and the
 * mockup's file route serving each byte-identical; a content that is not
 * base64 is refused with the reason.
 */
async function byteWrites(kit: Kit, fleet: KitFleet, project: string) {
  const files = [
    { path: "design/fonts/harbour-round.woff2", bytes: await readFile(FONT) },
    { path: "design/assets/catch.png", bytes: photo() },
  ];
  for (const file of files) {
    const written = await folderPut(
      fleet,
      project,
      file.path,
      file.bytes.toString("base64"),
      "base64"
    );
    const said = await written.text();
    const served = await fetch(
      `${fleet.base}/api/projects/${project}/mockups/file?path=${encodeURIComponent(file.path)}`
    );
    const bytes = Buffer.from(await served.arrayBuffer());
    kit.check(
      `g: ${file.path} is written into the folder from base64, and the mockup's file route serves it byte-identical`,
      written.ok &&
        served.ok &&
        bytes.equals(file.bytes) &&
        served.headers.get("content-type") ===
          (file.path.endsWith(".png") ? "image/png" : "font/woff2"),
      `write ${written.status} “${said.slice(0, 120)}”; served ${served.status} ${served.headers.get("content-type")}, ${bytes.byteLength} of ${file.bytes.byteLength} bytes, equal ${bytes.equals(file.bytes)}`
    );
  }
  const garbled = await folderPut(
    fleet,
    project,
    "design/assets/broken.png",
    "not base64 at all!",
    "base64"
  );
  const reason = await garbled.text();
  kit.check(
    "g: a content that is not base64 is refused with the reason, and nothing is written",
    garbled.status === 400 && reason.includes("not base64"),
    `${garbled.status} “${reason.slice(0, 160)}”`
  );
}

/** b: the dialog sample's switch, Closed then Open; the parts the Open state draws. */
async function dialogStates(kit: Kit, page: Page): Promise<string[]> {
  const before = await page.locator("[data-mk='Dialog']").count();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await settle(page);
  const after = await drawn(page);
  const dialogs = await page
    .locator("[data-mk='Dialog'][role='dialog']")
    .count();
  kit.check(
    "b: the States switch shows the dialog only once Open is chosen, over the screen it opens on",
    before === 0 &&
      dialogs === 1 &&
      after.names.includes("SessionRow") &&
      after.errors === 0,
    `Dialog drawn ${before} before, ${dialogs} after; ${after.names.join(", ")}`
  );
  return after.names;
}

/** a: CawCo's three samples, drawn in place with its own components. */
async function cawcoSamples(
  kit: Kit,
  page: Page,
  base: string,
  project: string,
  sources: Record<string, string>
) {
  for (const name of SAMPLES) {
    const read = await bench(page, base, project, `design/mockups/${name}.oui`);
    const first = await drawn(page);
    const seen = new Set(first.names);
    if (name === "dialog") {
      for (const each of await dialogStates(kit, page)) {
        seen.add(each);
      }
    }
    const source = sources[name] ?? "";
    const wanted = calls(source);
    const missing = wanted.filter((each) => !seen.has(each));
    const cards = source.match(TASK_CARD_CALL)?.length ?? 0;
    kit.check(
      `a: ${name}.oui is drawn as CawCo, every component it names drawn with the dashboard's own inside its box, nothing dropped or failed`,
      read.state === "drawn" &&
        first.frame === "cawco" &&
        missing.length === 0 &&
        first.cards === cards &&
        first.hollow.length === 0 &&
        first.spilled.length === 0 &&
        first.empty.length === 0 &&
        first.errors === 0 &&
        first.alerts === 0,
      `named ${wanted.join(", ")}; missing ${missing.join(", ") || "none"}; task cards ${first.cards} of ${cards}; hollow ${first.hollow.join(", ") || "none"}; spilled ${first.spilled.join(", ") || "none"}; empty ${first.empty.join(", ") || "none"}; errors ${first.errors}, alerts ${first.alerts}`
    );
  }
}

/** c: an unknown component, refused by name at the hub and on the bench. */
async function refusal(
  kit: Kit,
  page: Page,
  fleet: KitFleet,
  base: string,
  project: string,
  source: string
) {
  const checked = await fetch(
    `${fleet.base}/api/projects/${project}/mockups/check`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source }),
    }
  );
  const reason = await checked.text();
  const refused = await bench(
    page,
    base,
    project,
    "design/mockups/unknown.oui"
  );
  kit.check(
    "c: a component the library does not have is refused by the hub's check with its name, and nothing is drawn",
    checked.status === 422 &&
      reason.includes("Sparkline") &&
      refused.state === "refused" &&
      (refused.refused ?? "").includes("Sparkline") &&
      (await page.locator("[data-mockup-frame]").count()) === 0,
    `check ${checked.status} “${reason.slice(0, 160)}”; bench ${refused.state}`
  );
}

/** The shop's mockup as drawn: its roles, font, specimen and images, read inside its shadow root. */
const shopLook = (page: Page, family: string) =>
  page.evaluate((own) => {
    const root = document.querySelector(".mk-host")?.shadowRoot;
    const part = (selector: string) =>
      root?.querySelector<HTMLElement>(selector) ?? null;
    const style = (selector: string) => {
      const element = part(selector);
      return element ? getComputedStyle(element) : null;
    };
    const loaded = (selector: string) => {
      const image = part(selector) as HTMLImageElement | null;
      return image ? image.complete && image.naturalWidth > 0 : false;
    };
    const face = [...document.fonts].find((each) => each.family === own);
    return {
      button: style("[data-mk='Button']")?.backgroundColor,
      canvas: style(".mk-root")?.backgroundColor,
      font: style("[data-mk='Text']")?.fontFamily ?? "",
      faceStatus: face?.status ?? "none",
      fontUsable: document.fonts.check(`16px "${own}"`),
      tag: part("[data-mk='PriceTag'] .price-tag")?.dataset.tone ?? null,
      tagColor: style(".price-tag")?.color,
      amount: part(".price-tag__amount")?.textContent?.trim() ?? "",
      note: part(".price-tag__note")?.innerText.trim() ?? "",
      wave: loaded("[data-asset='wave']"),
      photo: loaded("[data-asset='catch']"),
      tagWave: loaded(".price-tag__wave"),
      tagWaveSrc: part(".price-tag__wave")?.getAttribute("src") ?? "",
    };
  }, family);

/** What reaches across the shop's shadow root, either way. */
const crossings = (page: Page, family: string, name: string) =>
  page.evaluate(
    ({ own, raw }) => {
      const main = document.querySelector("main") as HTMLElement;
      const stray = document.createElement("div");
      stray.className = "price-tag";
      stray.textContent = "outside";
      main.append(stray);
      const strayStyle = getComputedStyle(stray);
      const mainStyle = getComputedStyle(main);
      const inside =
        document
          .querySelector(".mk-host")
          ?.shadowRoot?.querySelector(".mk-root") ?? main;
      const result = {
        classOutside:
          strayStyle.color === mainStyle.color &&
          strayStyle.fontFamily === mainStyle.fontFamily &&
          strayStyle.display === "block",
        tokenOutside: getComputedStyle(document.documentElement)
          .getPropertyValue("--harbour-sea")
          .trim(),
        ownNameOutside: [...document.fonts].some(
          (each) => each.family === raw || each.family === `"${raw}"`
        ),
        nsFaceCount: [...document.fonts].filter((each) => each.family === own)
          .length,
        dashboardInside: getComputedStyle(inside)
          .getPropertyValue("--surface-page")
          .trim(),
      };
      stray.remove();
      return result;
    },
    { own: family, raw: name }
  );

/** d and e: the shop drawn in its own design, and nothing crossing its shadow root. */
async function shop(
  kit: Kit,
  page: Page,
  fleet: KitFleet,
  base: string,
  ids: { harbour: string; cockpit: string }
) {
  // The bench's own styles with no mockup drawn: a mockup that is not there.
  await bench(page, base, ids.cockpit, "design/mockups/none.oui");
  const without = await pageStyles(page);

  const library = await fleet.api<{
    fonts: { family: string; name: string }[];
  }>(`/api/projects/${ids.harbour}/mockups/library`);
  const family = library.fonts[0]?.family ?? "";
  const read = await bench(page, base, ids.harbour, "design/home.oui");
  await page.evaluate(() => document.fonts.ready);
  const parts = await drawn(page);
  const sea = await computedColor(page, "oklch(52% 0.14 200)");
  const sand = await computedColor(page, "oklch(96% 0.035 85)");
  const coral = await computedColor(page, "oklch(62% 0.17 35)");
  const look = await shopLook(page, family);
  kit.check(
    "d: the shop's mockup is drawn in a shadow root in its own palette: its accent, its canvas, its specimen's colour",
    read.state === "drawn" &&
      parts.frame === "project" &&
      parts.shadow &&
      look.button === sea &&
      look.canvas === sand &&
      look.tagColor === coral &&
      parts.errors === 0,
    `button ${look.button} (sea ${sea}); canvas ${look.canvas} (sand ${sand}); price tag ${look.tagColor} (coral ${coral}); errors ${parts.errors}`
  );
  kit.check(
    "d: in its own font, loaded from its design under the hub's name for it",
    family.startsWith("mk-") &&
      look.font.includes(family) &&
      look.faceStatus === "loaded" &&
      look.fontUsable,
    `family ${family}; Text's font-family ${look.font}; face ${look.faceStatus}; usable ${look.fontUsable}`
  );
  kit.check(
    "d: its specimen is filled from the call (props and children) and its assets are loaded, by name, from the design's files (the photo written as bytes among them)",
    ["Stack", "Device", "Image", "Text", "PriceTag", "Button"].every((each) =>
      parts.names.includes(each)
    ) &&
      look.tag === "sale" &&
      look.amount === "$12.00" &&
      look.note.includes("per kilo") &&
      look.wave &&
      look.photo &&
      look.tagWave &&
      look.tagWaveSrc.includes("/mockups/file?path=design%2Fassets%2Fwave.svg"),
    `drawn ${parts.names.join(", ")}; tone ${look.tag}, amount ${look.amount}, note “${look.note}”; images wave ${look.wave}, photo ${look.photo}, specimen's ${look.tagWave}`
  );

  const withShop = await pageStyles(page);
  const leaks = await crossings(page, family, library.fonts[0]?.name ?? "");
  kit.check(
    "e: the bench's own styles are the same with the shop's mockup drawn as with none",
    JSON.stringify(without) === JSON.stringify(withShop),
    `${JSON.stringify(without)} → ${JSON.stringify(withShop)}`
  );
  kit.check(
    "e: the project's class, tokens and font name reach nothing outside its shadow root, and the dashboard's tokens nothing inside",
    leaks.classOutside &&
      leaks.tokenOutside === "" &&
      !leaks.ownNameOutside &&
      leaks.nsFaceCount === 1 &&
      leaks.dashboardInside === "",
    JSON.stringify(leaks)
  );
}

/** f: no design, the primitives neutral. */
async function neutral(kit: Kit, page: Page, base: string, project: string) {
  const read = await bench(page, base, project, "mockups/neutral.oui");
  const grey = await computedColor(page, "oklch(30% 0 0)");
  const look = await page.evaluate(() => {
    const root = document.querySelector(".mk-host")?.shadowRoot;
    const style = (selector: string) => {
      const element = root?.querySelector(selector);
      return element ? getComputedStyle(element) : null;
    };
    return {
      font: style("[data-mk='Text']")?.fontFamily ?? "",
      button: style("[data-mk='Button']")?.backgroundColor ?? "",
      cawcoAction: getComputedStyle(document.documentElement)
        .getPropertyValue("--action-solid")
        .trim(),
    };
  });
  const parts = await drawn(page);
  kit.check(
    "f: a project with no design draws the primitives neutral: the system's face, a grey accent, never CawCo's",
    read.state === "drawn" &&
      parts.frame === "project" &&
      look.font === "system-ui, sans-serif" &&
      look.button === grey &&
      ["Stack", "Card", "Text", "Input", "Button"].every((each) =>
        parts.names.includes(each)
      ),
    `font ${look.font}; button ${look.button} (grey ${grey}; CawCo's action ${look.cawcoAction}); drawn ${parts.names.join(", ")}`
  );
}

const spec: Spec = {
  name: "oui-mockup",
  run: async (kit) => {
    // The hub alone: no session runs here.
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("hub");
    await fleet.hubUp();
    const ids = await seed(fleet);
    // The shop's font and photo, written as bytes before it is drawn.
    await byteWrites(kit, fleet, ids.harbour);
    const base = await fleet.devDashboard();
    const page = await kit.page("desk");
    page.setDefaultTimeout(60_000);
    await cawcoSamples(kit, page, base, ids.cockpit, ids.sources);
    await refusal(kit, page, fleet, base, ids.cockpit, ids.sources.unknown);
    await shop(kit, page, fleet, base, ids);
    await neutral(kit, page, base, ids.plain);
  },
};
export default spec;
