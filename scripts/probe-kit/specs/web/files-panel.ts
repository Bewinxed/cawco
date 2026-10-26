/**
 * Files: every artifact and attachment of a conversation in one place
 * (owner: "there's currently no way to view all the previous artifacts or
 * files for a session easily"), its pins held to the built dashboard.
 *
 *   bun scripts/probe-kit/run.ts web files-panel
 *
 * A scratch fleet; three sessions: one with nothing, one with one page (its
 * picture 305×656, taller than a card's 3:4), and one with 42 pages (one with
 * a 63-character name, one whose words hold "pricing tiers", one whose kept
 * picture won't decode, two never pictured, one picture 305×656 and one
 * 1600×320, and two decision pages never pictured, one titled in 40 words)
 * and nine attachments (texts and pictures, over three sends). Seeded
 * through the hub's own routes, as the dashboard and the pane write them.
 * At 1440 (desk), 680 and 390, light and dark:
 *
 *  1. desk: the Files control stands inside the bar's glass group, and its
 *     count's box is no wider or taller than the folder's (pin 1, 9);
 *  2. desk: Files floats (a fixed box, the page's height unchanged);
 *  3. desk: each region scrolls on its own (scrollHeight > clientHeight on
 *     the region's scroller, the page not growing) (pin 2);
 *  4. desk: the rule between the regions is the vermillion token,
 *     `brand-solid`, whole (pin 4, review-4 item 1);
 *  5. desk: an overflowing region says how many more, the count of its
 *     items standing past its foot (review-4 item 3);
 *  6. desk: search finds by title and by the words on a page, marks the
 *     hit, and says when nothing matches (pin 4);
 *  7. desk: a picked artifact opens in the session's panel beside the
 *     conversation, and Files goes;
 *  8. a picture that won't load, and a page never pictured, stand as their
 *     kind's glyph in the well;
 *  9. phone and 680: Files is the vaul drawer from the sidebar's row, with
 *     Artifacts | Attachments tabs (pins 3, 11);
 * 10. none, one, the list unreadable (offline): each says so in place;
 * 11. the overflow sweep (journeys/scan.ts) over every state totals zero;
 * 12. no console error;
 * 33. at 390, 680 and 1440, in Chromium and WebKit, with one card and with
 *     many: every card, and everything its thumbnail paints, lies inside the
 *     card's slot in the masonry, every card inside Files' region, and an
 *     overflow scan of Files totals zero.
 * 34. Thumbnails | List (owner: "i want to be able to toggle this to list or
 *     thumbnails"): at 390, 680 and 1440, in Chromium and WebKit, with one
 *     artifact and with many (a 63-character name, a 40-word title), the
 *     switch stands in the Artifacts head inside Files; in the list the rows
 *     never overlap and nothing they draw stands past their row or Files'
 *     edge, the "N more" sign counts the rows below the fold, and back in
 *     thumbnails the cards keep their slots (33's read);
 * 35. the choice survives a reload, and holds where Files opens next (the
 *     bar's card, then the phone's drawer);
 * 36. a row opens its artifact as its card does (in the session's panel,
 *     Files gone; opened again, the row the one on show);
 * 37. the switch's motion on the clock: every row slides on one clock (one
 *     start, length and curve) from its card's place to its row's; with
 *     less motion nothing travels.
 * 38. the owner's report ("if i open an artifact from the folder tab, it
 *     doesn't dismiss the panel and still thinks i'm still hovering it …
 *     dismissing that closes it too"): in Chromium and WebKit, at 1440 and
 *     390, the real pointer rests on a card, then presses it: Files goes
 *     and the session's panel shows that artifact; with the pointer moved
 *     off, for 2 s no Files surface or floating copy opens and the panel
 *     stays; at 1440, Escape and a press outside leave the panel as it is.
 *     From the keyboard (Tab to the card, Enter) the same, and the focus
 *     lands on the panel's name.
 * 39. the cards are one Tab stop with arrows inside (owner: "Arrow keys
 *     inside, one Tab stop: Tab lands on the list once. Up and Down move
 *     through the list view, and all four arrows move through thumbnails.
 *     Enter opens."): in Chromium and WebKit, at 1440 and 390, in the list
 *     and in thumbnails: Tab enters the list on the first card (none on
 *     show) and a second Tab leaves it; each arrow, Home and End lands
 *     where it should and stops at the ends, the card scrolled into view;
 *     in thumbnails Down lands on the card directly below; Enter opens it,
 *     the focus on the panel's name; Files opened again, Tab enters on the
 *     card on show.
 * 40. the drawer at 390 (Chromium and WebKit): Tab from the Artifacts
 *     segment goes to the view switch and then the first card, never to
 *     the segment's panel (it holds the cards, so it takes no Tab stop).
 */
import type { Page } from "playwright-core";
import { commonWords } from "../../../../packages/core/src/words/common";
import { filesWords } from "../../../../packages/core/src/words/files";
import { MACHINE, type Reply, until } from "../../../scratch-fleet";
import { tokenColour } from "../../geom";
import { scan } from "../../journeys/scan";
import {
  COMPOSER,
  type Engine,
  type Kit,
  kitsOwnMessage,
  type MotionRun,
  open,
  readMotion,
  type Spec,
  stillWithin,
  THEMES,
  type Theme,
  type View,
} from "../../kit";

const MANY = 42;
const LONG_NAME =
  "a-page-whose-name-runs-on-and-on-to-the-very-end-of-what-it-may";
const PRICING = "pricing-notes";
const BROKEN = "broken-picture";
const UNPICTURED = ["never-pictured", "also-unpictured"];
const ATTACHMENT_SENDS = 3;
/** A picture taller than the cards' 3:4: the owner's "What routines become", 305×656. */
const TALL = "tall-decision-picture";
/** A picture five times wider than tall. */
const WIDE = "wide-picture";
/** Each seeded picture's own size, where it is not the 320-wide default. */
const SHAPES: Record<string, [number, number]> = {
  [TALL]: [305, 656],
  [WIDE]: [1600, 320],
  "the-only-page": [305, 656],
};
/** A decision page's title of 40 words. */
const FORTY_WORDS = Array.from(
  { length: 40 },
  (_, i) =>
    [
      "what",
      "routines",
      "become",
      "once",
      "a",
      "saved",
      "program",
      "runs",
      "real",
      "delegates",
    ][i % 10]
).join(" ");
/** Decision pages no pane has drawn: Files draws them unseen, through the overlay's own picture. */
const DECISIONS = [
  {
    name: "what-routines-become",
    program: `root = Decisions("${FORTY_WORDS}", [shape])
shape = Decision("shape", "A saved program that runs real delegates", [saved, adhoc], "Today a routine is a brief in the session.")
saved = Option("saved", "A saved program", "Runs again from the project, with its own name.", true, [], "One more thing to keep.")
adhoc = Option("adhoc", "As it is", "Nothing new to learn.", false, [], "Nothing to run again.")`,
  },
  {
    name: "resize-handle-pick",
    program: `root = Decisions("Which resize handle?", [handle])
handle = Decision("handle", "Which handle does the panel's edge wear?", [bead, light], "Today the edge has none.")
bead = Option("bead", "A bead", "A dot at the edge's middle.", true, [], "It covers a line of the page.")
light = Option("light", "A light", "The edge lights under the pointer.", false, [], "Nothing shows until the pointer comes.")`,
  },
];

/** Files' read of the session's artifacts (those that reached the person), which the offline leg refuses. */
const ARTIFACT_LIST = /\/api\/instances\/[^/]+\/artifacts\/files$/u;
/** Files' search of a session's artifacts. */
const SEARCH_READ = /\/artifacts\/search\?/u;
/** The session's attachments read. */
const ATTACHMENT_LIST = /\/api\/instances\/[^/]+\/attachments$/u;
/**
 * The session's two list reads, held until the leg releases them, so the
 * skeleton stands past the grace however long the page took to open: they
 * start once the conversation is on screen (files.svelte.ts `followFiles`,
 * for the bar's count), not when Files opens.
 */
const heldReads = () => {
  let release: () => void = () => undefined;
  const released = new Promise<void>((done) => {
    release = () => done();
  });
  const hold = async (page: Page) => {
    for (const read of [ARTIFACT_LIST, ATTACHMENT_LIST]) {
      await page.route(read, async (route) => {
        await released;
        await route.continue();
      });
    }
  };
  return { hold, release: () => release() };
};
/** The sidebar row's name once its count stands. */
const FILES_COUNTED = /Files, \d+/u;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** Every console error and page error, by page. */
const errors = new Map<Page, string[]>();
const watch = (page: Page) => {
  const seen: string[] = [];
  errors.set(page, seen);
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      // A resource's refusal names no address in its text: the address said.
      const { url } = message.location();
      seen.push(url ? `${message.text()} (${url})` : message.text());
    }
  });
  page.on("pageerror", (error) => seen.push(String(error)));
};

/** What Files is drawn in: the drawer, the bar's card, each region and its "N more" sign. */
const FILES_PARTS =
  "[data-files-sheet], [data-glass-card-frame='files-pop'], [data-files-region], [data-files-more]";

/** The session's panel's name, beside the conversation (the split) or in its sheet on the composer: `data-artifact` is the one it shows. */
const PANE_NAME =
  "[data-side-pane] [data-artifact-trigger], [data-preview-sheet][data-state='open'] [data-artifact-trigger]";

/** Files open: the bar's card, or the drawer. */
const FILES_OPEN =
  "[data-glass-card-frame='files-pop'][data-state='open'], [data-files-sheet]";

/** The artifact the session's panel shows, or null with none. */
const paneShows = (page: Page) =>
  page.evaluate(
    (name) =>
      document.querySelector<HTMLElement>(name)?.dataset.artifact ?? null,
    PANE_NAME
  );

/**
 * Waits until the pick has landed: Files gone and the session's panel
 * showing `artifact`. Answers what stood when it did, or when it gave up.
 */
const pickLanded = async (page: Page, artifact: string) => {
  await page
    .waitForFunction(
      ([files, name, id]) =>
        !document.querySelector(files) &&
        document.querySelector<HTMLElement>(name)?.dataset.artifact === id,
      [FILES_OPEN, PANE_NAME, artifact] as const,
      { timeout: 30_000 }
    )
    .catch(() => undefined);
  return page.evaluate(
    ([files, name]) => ({
      filesOpen: !!document.querySelector(files),
      pane: document.querySelector<HTMLElement>(name)?.dataset.artifact ?? null,
      float: !!document.querySelector("[data-files-float]"),
    }),
    [FILES_OPEN, PANE_NAME] as const
  );
};

/**
 * After a keyboard pick: waits until the focus is on the session panel's
 * name for `artifact`, then reads it again once the page stands still, so
 * a later hand-back (Files' close giving the focus to its control) is
 * caught. Answers whether it is there, whether it draws its ring
 * (`:focus-visible`), and what has the focus.
 */
const panelFocus = async (page: Page, artifact: string) => {
  const onName = ([name, id]: readonly [string, string]) => {
    const el = document.activeElement as HTMLElement | null;
    return !!el?.matches(name) && el.dataset.artifact === id;
  };
  await page
    .waitForFunction(onName, [PANE_NAME, artifact] as const, {
      timeout: 15_000,
    })
    .catch(() => undefined);
  await stillWithin(page, "body", { ms: 5000 });
  return page.evaluate(
    ([name, id]) => {
      const el = document.activeElement as HTMLElement | null;
      return {
        onName: !!el?.matches(name) && el.dataset.artifact === id,
        visible: !!el?.matches(":focus-visible"),
        has: el
          ? `${el.tagName.toLowerCase()}${el.hasAttribute("data-artifact-trigger") ? "[data-artifact-trigger]" : ""}${el.closest("[data-files-control]") ? " (Files' control)" : ""}`
          : null,
      };
    },
    [PANE_NAME, artifact] as const
  );
};

/**
 * Waits until Files stands as the person comes to see it: nothing on the
 * page running (kit `stillWithin`), no words mid-morph (MorphText draws its
 * letters only while it swaps them), and Files' boxes and counts the same
 * for three frames. WebKit told the drawer's rise to its stop as finished
 * while its box still stood 15–40px under it (680: transform 264.6 →
 * 246.9, landing at 225), and an "N more" sign's count rolled from 37 to
 * 41 as the sweep read it: the sweep named both a spill. Answers why it
 * never stood still, or null.
 */
const filesAtRest = async (page: Page): Promise<string | null> => {
  const moving = await stillWithin(page, "body", { ms: 5000 });
  if (moving.length > 0) {
    return `the page still moves: ${moving.slice(0, 4).join(", ")}`;
  }
  return page.evaluate(async (parts) => {
    const read = () =>
      [...document.querySelectorAll(parts)]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${r.x},${r.y},${r.width},${r.height} ${el.getAttribute("data-files-more") ?? ""}`;
        })
        .join(" | ");
    const morphing = () =>
      document.querySelector(
        '[data-slot="morph-text"] [data-slot="letters"]'
      ) !== null;
    const deadline = performance.now() + 5000;
    let last = read();
    for (let same = 0; same < 3;) {
      if (performance.now() > deadline) {
        return `Files never stood still for three frames${morphing() ? " (words still morphing)" : ""}: ${last}`;
      }
      await new Promise((done) => requestAnimationFrame(done));
      const now = read();
      same = now === last && !morphing() ? same + 1 : 0;
      last = now;
    }
    return null;
  }, FILES_PARTS);
};

/** Files at rest before a read of it, or the run stops on why it never stood still. */
const atRest = async (page: Page): Promise<void> => {
  const restless = await filesAtRest(page);
  if (restless) {
    throw new Error(restless);
  }
};

/** Waits until `holds` reads true in the page; false when it never does within `ms`, for the check to say. */
const comes = (
  page: Page,
  holds: () => boolean,
  ms = 15_000
): Promise<boolean> =>
  page.waitForFunction(holds, null, { timeout: ms }).then(
    () => true,
    () => false
  );

/** The overflow sweep's findings, summed over every state: each read once Files stands still. */
const sweeps: { state: string; findings: string[] }[] = [];
const sweep = async (page: Page, state: string) => {
  const restless = await filesAtRest(page);
  sweeps.push({
    state,
    findings: restless ? [restless] : await page.evaluate(scan),
  });
};

/** The page's own scroll height against its viewport: Files never grows the page. */
const pageGrows = (page: Page) =>
  page.evaluate(
    () =>
      (document.scrollingElement?.scrollHeight ?? 0) > window.innerHeight + 1
  );

/** Opens a session's conversation with the workspace holding it alone. */
const openSession = async (
  kit: Kit,
  base: string,
  view: View,
  theme: Theme,
  id: string,
  before?: (page: Page) => Promise<void>,
  engine?: Engine
): Promise<Page> => {
  const page = await kit.page(view, { theme, engine });
  watch(page);
  await page.addInitScript(
    ([tab]) => {
      localStorage.setItem(
        "cawco-workspace",
        JSON.stringify({
          v: 1,
          root: { t: "l", id: "pone", tabs: [tab], active: tab, opened: null },
          focusedLeaf: "pone",
        })
      );
    },
    [id] as const
  );
  await before?.(page);
  await open(page, `${base}/session/${id}`, '[data-slot="pane"]');
  return page;
};

/**
 * Seeds a session's artifacts through the dashboard's origin (the hub's
 * routes, as the dashboard and the pane call them): pages, and for each
 * the thumbnail a pane would keep, drawn on a canvas at its own shape.
 */
const seed = (page: Page, id: string, names: string[]) =>
  page.evaluate(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, every seed in it
    async ({ instanceId, names: all, pricing, broken, unpictured, shapes }) => {
      const made: string[] = [];
      for (const [i, name] of all.entries()) {
        const words =
          name === pricing
            ? "The pricing tiers for the hub, and what each plan carries."
            : `Page ${i} of the session's work.`;
        const response = await fetch(
          `/api/instances/${encodeURIComponent(instanceId)}/artifacts`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              kind: "page",
              name,
              does: "judge",
              ask: `Judge ${name}: pin anything that reads wrong`,
              html: `<!doctype html><html><body><h1>${name}</h1><p>${words}</p></body></html>`,
            }),
          }
        );
        if (!response.ok) {
          throw new Error(
            `create ${name}: ${response.status} ${await response.text()}`
          );
        }
        const { id: artifactId } = (await response.json()) as { id: string };
        made.push(artifactId);
        if (unpictured.includes(name)) {
          continue;
        }
        let light: string;
        if (name === broken) {
          // A PNG's signature and header, and nothing a decoder can draw.
          const bytes = new Uint8Array(64);
          bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
          bytes.set(
            [0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0, 0, 0, 0, 160],
            8
          );
          light = btoa(String.fromCharCode(...bytes));
        } else {
          const canvas = document.createElement("canvas");
          const [w, h] = shapes[name] ?? [
            320,
            [200, 240, 427, 180][i % 4] ?? 200,
          ];
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = `oklch(0.94 0.03 ${(i * 37) % 360})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#222";
            ctx.font = "bold 22px sans-serif";
            ctx.fillText(name.slice(0, 22), 16, 40);
            ctx.fillStyle = "#888";
            for (let row = 0; row < 6; row += 1) {
              ctx.fillRect(16, 64 + row * 18, 240 - row * 20, 8);
            }
          }
          light = canvas.toDataURL("image/png").split(",")[1] ?? "";
        }
        const kept = await fetch(
          `/api/instances/${encodeURIComponent(instanceId)}/artifacts/${encodeURIComponent(artifactId)}/thumbnail`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ light, dark: null, single: true }),
          }
        );
        if (!kept.ok) {
          throw new Error(
            `thumbnail ${name}: ${kept.status} ${await kept.text()}`
          );
        }
      }
      return made;
    },
    {
      instanceId: id,
      names,
      pricing: PRICING,
      broken: BROKEN,
      unpictured: UNPICTURED,
      shapes: SHAPES,
    }
  );

/** Seeds the decision pages, unpictured, as a session's agent makes them (OpenUI programs). */
const seedDecisions = (page: Page, id: string) =>
  page.evaluate(
    async ({ instanceId, pages }) => {
      for (const { name, program } of pages) {
        const response = await fetch(
          `/api/instances/${encodeURIComponent(instanceId)}/artifacts`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              kind: "page",
              name,
              does: "pick",
              ask: "Pick one option on each card",
              program,
            }),
          }
        );
        if (!response.ok) {
          throw new Error(
            `create ${name}: ${response.status} ${await response.text()}`
          );
        }
      }
    },
    { instanceId: id, pages: DECISIONS }
  );

/** A small PNG, base64, a picture an attachment carries. */
const PICTURE =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHElEQVR4nGP8z8Dwn4GBgYGJgYGBgYmBgYEBAD8+Ag7Q2s8bAAAAAElFTkSuQmCC";

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
  const base = await fleet.dashboard();

  const many = await fleet.spawn("claude", "files many", fleet.repo);
  const one = await fleet.spawn("claude", "files one", fleet.repo);
  const none = await fleet.spawn("claude", "files none", fleet.repo);
  const noneOpenCode = await fleet.spawn(
    "opencode",
    "files none opencode",
    fleet.repo
  );

  // The seeds, through the dashboard's origin.
  const seeder = await openSession(kit, base, "desk", "light", many);
  const names = [
    ...Array.from(
      { length: MANY - 6 - UNPICTURED.length - DECISIONS.length },
      (_, i) => `page-${i + 1}`
    ),
    LONG_NAME,
    PRICING,
    BROKEN,
    "tall-board",
    ...UNPICTURED,
    WIDE,
    TALL,
  ];
  await seed(seeder, many, names);
  // The newest: decision pages, at the top of the masonry as the owner's were.
  await seedDecisions(seeder, many);
  await seed(seeder, one, ["the-only-page"]);
  await seeder.close();
  // Three sends, each carrying two texts and a picture.
  for (let i = 0; i < ATTACHMENT_SENDS; i += 1) {
    await fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "send",
      machineId: MACHINE,
      sessionId: many,
      payload: {
        instanceId: many,
        attachments: [
          {
            kind: "text",
            name: `brief-${i + 1}.md`,
            content: `# Brief ${i + 1}\n\nWhat the panel should hold.`,
          },
          {
            kind: "text",
            name: `notes-${i + 1}.txt`,
            content: `Notes ${i + 1}`,
          },
        ],
        images: [{ mediaType: "image/png", data: PICTURE }],
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: { role: "user", content: `Files, send ${i + 1}` },
          parent_tool_use_id: null,
          origin: { kind: "human" },
        },
      },
    });
  }

  await reviewLegs(kit, base, { many, one });
  await askLegs(kit, base, none, noneOpenCode);
  await roundThree(kit, base, fleet, { many, one, none });
  await slotLegs(kit, base, { many, one });
  await viewLegs(kit, base, { many, one });
  for (const theme of THEMES) {
    await desk(kit, base, theme, { many, one, none });
    for (const view of ["phone", "narrowDesk"] as const) {
      await narrowLeg(kit, base, view, theme, many);
    }
  }

  const total = sweeps.reduce((sum, swept) => sum + swept.findings.length, 0);
  kit.check(
    "11: the overflow sweep over every state totals zero",
    total === 0,
    sweeps
      .filter((swept) => swept.findings.length > 0)
      .map((swept) => `${swept.state}: ${swept.findings.join(" | ")}`)
      .join("; ") || `${sweeps.length} states swept`
  );
  const logged = [...errors.values()].flat();
  kit.check(
    "12: no console error on any page",
    logged.length === 0,
    logged.slice(0, 6).join(" | ")
  );
};

/** The desk legs, at 1440, in one theme. */
const desk = async (
  kit: Kit,
  base: string,
  theme: Theme,
  ids: { many: string; one: string; none: string }
) => {
  const page = await openSession(kit, base, "desk", theme, ids.many);
  const control = page.locator("[data-files-control]");
  await control.waitFor();
  await until(
    "the Files count",
    () => page.locator("[data-files-count]").count(),
    (n) => n > 0,
    60_000
  );
  // 1. The control in the group, and its count no larger than its folder.
  const bar = await page.evaluate(() => {
    const item = document.querySelector("[data-files-control]");
    const glyph = document.querySelector("[data-files-glyph]");
    const count = document.querySelector("[data-files-count]");
    const rect = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    };
    return {
      inGroup: !!item?.closest("[data-bar-group]"),
      glyph: rect(glyph),
      count: rect(count),
      overlap:
        glyph && count
          ? Math.max(
              0,
              Math.min(
                glyph.getBoundingClientRect().right,
                count.getBoundingClientRect().right
              ) -
                Math.max(
                  glyph.getBoundingClientRect().left,
                  count.getBoundingClientRect().left
                )
            )
          : -1,
      said: count?.textContent,
    };
  });
  kit.check(
    `1 (${theme}): Files stands in the bar's glass group, its count's box no wider or taller than the folder's and clear of its ink`,
    bar.inGroup &&
      !!bar.glyph &&
      !!bar.count &&
      bar.count.w <= bar.glyph.w &&
      bar.count.h <= bar.glyph.h &&
      bar.overlap === 0,
    JSON.stringify(bar)
  );
  await sweep(page, `closed 1440 ${theme}`);

  const heightBefore = await page.evaluate(
    () => document.scrollingElement?.scrollHeight ?? 0
  );
  await control.click();
  const panel = page.locator("[data-glass-card-frame='files-pop']");
  await panel.waitFor();
  await page.locator("[data-files-card]").first().waitFor();
  await atRest(page);

  // 2. It floats.
  const floats = await page.evaluate(() => {
    const pop = document.querySelector<HTMLElement>(
      "[data-glass-card-frame='files-pop']"
    );
    let positioned = "";
    for (let at: HTMLElement | null = pop; at; at = at.parentElement) {
      const { position } = getComputedStyle(at);
      if (position === "fixed" || position === "absolute") {
        positioned = position;
        break;
      }
    }
    return { positioned, height: document.scrollingElement?.scrollHeight ?? 0 };
  });
  kit.check(
    `2 (${theme}): Files floats: a fixed or absolute box, the page's height unchanged`,
    floats.positioned !== "" &&
      floats.height === heightBefore &&
      !(await pageGrows(page)),
    `${JSON.stringify(floats)}, before ${heightBefore}`
  );

  // 3. Each region scrolls on its own.
  const regions = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "[data-glass-card-frame='files-pop'] [data-files-region]"
      ),
    ].map((region) => {
      const scroller = region.querySelector<HTMLElement>("[data-files-scroll]");
      return {
        region: region.dataset.filesRegion,
        scrollHeight: scroller?.scrollHeight ?? 0,
        clientHeight: scroller?.clientHeight ?? 0,
        overflowY: scroller ? getComputedStyle(scroller).overflowY : "",
      };
    })
  );
  kit.check(
    `3 (${theme}): each region scrolls on its own (scrollHeight > clientHeight on both, overflow-y auto), the page not growing`,
    regions.length === 2 &&
      regions.every(
        (one) => one.scrollHeight > one.clientHeight && one.overflowY === "auto"
      ) &&
      !(await pageGrows(page)),
    JSON.stringify(regions)
  );

  // 4. The vermillion rule.
  const rule = await page.evaluate(() => {
    const second = document.querySelector<HTMLElement>(
      "[data-glass-card-frame='files-pop'] [data-files-rule]"
    );
    const style = second ? getComputedStyle(second) : null;
    return style
      ? {
          color: style.borderTopColor,
          width: style.borderTopWidth,
          styleName: style.borderTopStyle,
        }
      : null;
  });
  const vermillion = await tokenColour(
    page,
    "--brand-solid",
    "[data-glass-card-frame='files-pop']"
  );
  kit.check(
    `4 (${theme}): the rule between the regions is the vermillion token, brand-solid, whole`,
    rule?.color === vermillion &&
      rule.width === "1px" &&
      rule.styleName === "solid",
    `rule ${JSON.stringify(rule)}, brand-solid ${vermillion}`
  );

  // 5. The more sign, by region, against the items standing past its foot.
  const more = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "[data-glass-card-frame='files-pop'] [data-files-region]"
      ),
    ].map((region) => {
      const scroller = region.querySelector<HTMLElement>("[data-files-scroll]");
      const foot = scroller?.getBoundingClientRect().bottom ?? 0;
      const items = [
        ...(scroller?.querySelectorAll("[data-files-card], [data-files-row]") ??
          []),
      ];
      return {
        region: region.dataset.filesRegion,
        past: items.filter(
          (item) => item.getBoundingClientRect().bottom > foot + 1
        ).length,
        sign:
          region.querySelector<HTMLElement>("[data-files-more]")?.dataset
            .filesMore ?? null,
        words:
          region.querySelector("[data-files-more]")?.textContent?.trim() ??
          null,
      };
    })
  );
  kit.check(
    `5 (${theme}): an overflowing region says how many more, the count of its items past its foot`,
    more.length === 2 &&
      more.every(
        (one) =>
          one.past > 0 &&
          one.sign === String(one.past) &&
          one.words === `${one.past} more`
      ),
    JSON.stringify(more)
  );

  // 8. Pictures that don't load, and pages never pictured, stand as glyphs.
  // A card's picture is asked for once it nears the region's view (lazy), so
  // the broken one is scrolled to, as a person would, and the region back.
  await page
    .locator(`[data-files-card][title="${BROKEN}"]`)
    .scrollIntoViewIfNeeded();
  await until(
    "the broken picture's glyph",
    () =>
      page
        .locator(
          `[data-files-card][title="${BROKEN}"] [data-files-thumb="glyph"]`
        )
        .count(),
    (n) => n > 0,
    10_000
  ).catch(() => 0);
  const glyphs = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-files-card]")]
      .filter((card) => card.querySelector('[data-files-thumb="glyph"]'))
      .map((card) => card.title)
  );
  await page.evaluate(() => {
    const scroller = document.querySelector(
      '[data-files-region="artifacts"] [data-files-scroll]'
    );
    scroller?.scrollTo({ top: 0 });
  });
  kit.check(
    `8 (${theme}): a picture that won't decode stands as its kind's glyph in the well`,
    glyphs.includes(BROKEN),
    JSON.stringify(glyphs)
  );
  // The long name gives way with an ellipsis, inside its card.
  const long = await page.evaluate((name) => {
    const card = [
      ...document.querySelectorAll<HTMLElement>("[data-files-card]"),
    ].find((one) => one.title === name);
    const words = card?.querySelector<HTMLElement>('[data-slot="name"]');
    return words
      ? {
          cut: words.scrollWidth > words.clientWidth,
          inside:
            words.getBoundingClientRect().right <=
            (card?.getBoundingClientRect().right ?? 0) + 0.5,
        }
      : null;
  }, LONG_NAME);
  kit.check(
    `long name (${theme}): a 63-character name gives way inside its card`,
    !!long?.cut && long.inside,
    JSON.stringify(long)
  );
  await sweep(page, `open many 1440 ${theme}`);

  // 6. Search: by title, by the words on a page, and nothing.
  const field = page.locator("[data-files-search] input");
  // "tiers" is only on the page; "pricing" is in its name too, and the
  // engine scores a word by its best field (the title's).
  await field.fill("tiers");
  await until(
    "the search's hits",
    () => page.locator("[data-files-within]").count(),
    (n) => n > 0,
    15_000
  ).catch(() => 0);
  const byContent = await page.evaluate(() => ({
    cards: [...document.querySelectorAll<HTMLElement>("[data-files-card]")].map(
      (card) => card.title
    ),
    marked: [...document.querySelectorAll("[data-files-within] mark")].map(
      (mark) => mark.textContent
    ),
  }));
  await sweep(page, `search content 1440 ${theme}`);
  await field.fill("tall board");
  await until(
    "the title's hit",
    () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("[data-files-card]")].map(
          (card) => card.title
        )
      ),
    // Until the hub answers, the cards stand unfiltered: wait for its answer.
    (titles) => titles.length === 1 && titles[0] === "tall-board",
    15_000
  ).catch(() => 0);
  const byTitle = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-files-card]")].map(
      (card) => card.title
    )
  );
  await field.fill("invoice");
  await until(
    "nothing matching",
    () => page.locator("[data-files-none]").count(),
    (n) => n >= 2,
    15_000
  ).catch(() => 0);
  const nothing = await page.locator("[data-files-none]").allTextContents();
  await sweep(page, `search none 1440 ${theme}`);
  kit.check(
    `6 (${theme}): search finds by the words on a page (marked), by title, and says when nothing matches`,
    byContent.cards[0] === PRICING &&
      byContent.marked.some((word) =>
        word?.toLowerCase().startsWith("tiers")
      ) &&
      byTitle.length === 1 &&
      byTitle[0] === "tall-board" &&
      nothing.some(
        (line) => line.trim() === filesWords.noArtifactsMatch("invoice")
      ) &&
      nothing.some(
        (line) => line.trim() === filesWords.noAttachmentsMatch("invoice")
      ),
    `content ${JSON.stringify(byContent)}; title ${JSON.stringify(byTitle)}; none ${JSON.stringify(nothing)}`
  );
  await field.fill("");

  // 7. A picked artifact opens in the session's panel, and Files goes.
  const pricingCard = page.locator(`[data-files-card][title="${PRICING}"]`);
  const pricingId = (await pricingCard.getAttribute("data-artifact")) ?? "";
  await pricingCard.click();
  const picked = await pickLanded(page, pricingId);
  await filesAtRest(page);
  kit.check(
    `7 (${theme}): a picked artifact opens in the session's panel beside the conversation, and Files goes`,
    !(picked.filesOpen || picked.float) &&
      picked.pane === pricingId &&
      !(await pageGrows(page)),
    `${JSON.stringify(picked)} (picked ${pricingId})`
  );
  await sweep(page, `picked 1440 ${theme}`);
  await page.close();

  // 10. None, one, and the list unreadable.
  for (const [state, id] of [
    ["none", ids.none],
    ["one", ids.one],
  ] as const) {
    const each = await openSession(kit, base, "desk", theme, id);
    await each.locator("[data-files-control]").click();
    await each.locator("[data-glass-card-frame='files-pop']").waitFor();
    // The read answered: its empty state, or its card.
    await each
      .locator("[data-files-empty], [data-files-card]")
      .first()
      .waitFor({ timeout: 30_000 });
    await atRest(each);
    const said = await each.evaluate(() => ({
      empty: !!document.querySelector("[data-files-empty]"),
      cards: document.querySelectorAll("[data-files-card]").length,
    }));
    kit.check(
      `10 ${state} (${theme}): ${state === "none" ? "a session with nothing says so" : "a session with one page shows its one card"}`,
      state === "none"
        ? said.empty && said.cards === 0
        : !said.empty && said.cards === 1,
      JSON.stringify(said)
    );
    await sweep(each, `${state} 1440 ${theme}`);
    await each.close();
  }
  const offline = await openSession(kit, base, "desk", theme, ids.many, (p) =>
    p
      .route(ARTIFACT_LIST, (route) => route.abort("internetdisconnected"))
      .then(() => undefined)
  );
  // The aborted read is the state proven, not an error of the page's.
  errors.set(offline, []);
  await offline.locator("[data-files-control]").click();
  await offline.locator("[data-files-failed]").waitFor({ timeout: 30_000 });
  const failedSaid = await offline.locator("[data-files-failed]").textContent();
  kit.check(
    `10 offline (${theme}): the list unread says so in Artifacts' place, with Try again, the attachments still listed`,
    !!failedSaid?.includes(filesWords.cantReadArtifacts) &&
      (await offline
        .locator('[data-files-region="attachments"] [data-files-row]')
        .count()) > 0,
    failedSaid ?? ""
  );
  await sweep(offline, `offline 1440 ${theme}`);
  errors.delete(offline);
  await offline.close();
};

/** The active element, said for a check: its tag, its data and its name. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el
      ? {
          tag: el.tagName,
          card: el.dataset.artifact ?? null,
          slot: el.dataset.slot ?? null,
        }
      : null;
  });

/**
 * The review's legs (one theme, light): the hub reads' states and the
 * skeleton's timing; the masonry's DOM order; the rings; the earned counts;
 * the focus moves; the edge strips; 320px, a short window and 200% zoom;
 * the lightbox.
 */
const reviewLegs = async (
  kit: Kit,
  base: string,
  ids: { many: string; one: string }
) => {
  // 13. Both reads held back past the grace: nothing, then the skeleton, then the read.
  const slowReads = heldReads();
  const slow = await openSession(
    kit,
    base,
    "desk",
    "light",
    ids.many,
    slowReads.hold
  );
  await slow.locator("[data-files-control]").click();
  await slow.locator("[data-glass-card-frame='files-pop']").waitFor();
  const opened = Date.now();
  const atOpen = await slow.evaluate(() => ({
    waits: document.querySelectorAll("[data-files-wait]").length,
    counts: document.querySelectorAll(
      "[data-glass-card-frame='files-pop'] [data-files-head-count]"
    ).length,
    none: document.querySelectorAll(
      "[data-glass-card-frame='files-pop'] [data-files-none]"
    ).length,
  }));
  await slow.waitForTimeout(Math.max(0, 1500 - (Date.now() - opened)));
  const pastGrace = await slow.evaluate(() => ({
    artifactsWait: !!document.querySelector('[data-files-wait="artifacts"]'),
    ghostCards: document.querySelectorAll("[data-files-ghost]").length,
    attachmentsWait: !!document.querySelector(
      '[data-files-wait="attachments"]'
    ),
    counts: document.querySelectorAll(
      "[data-glass-card-frame='files-pop'] [data-files-head-count]"
    ).length,
  }));
  // The read's arrival, as the kit reads motion: each run's length.
  const arriving = await readMotion(
    slow,
    async () => {
      slowReads.release();
      await slow
        .locator("[data-files-card]")
        .first()
        .waitFor({ timeout: 15_000 });
    },
    '[data-files-region="artifacts"] [data-files-scroll]',
    { ms: 15_000 }
  );
  const arrival = lengths(arriving.runs);
  const crossMs = await durationOf(slow, "--dur-skeleton-reveal");
  kit.check(
    "13: until the hub answers, Files claims nothing (no count, no nothing-line, no skeleton inside the grace); past the grace the skeleton cards stand in the masonry and the attachment rows; the read takes the skeleton's place in the skeleton's reveal over --dur-skeleton-reveal (reveal)",
    atOpen.waits === 0 &&
      atOpen.counts === 0 &&
      atOpen.none === 0 &&
      pastGrace.artifactsWait &&
      pastGrace.ghostCards > 0 &&
      pastGrace.attachmentsWait &&
      pastGrace.counts === 0 &&
      arrival.includes(crossMs),
    `at open ${JSON.stringify(atOpen)}; past the grace ${JSON.stringify(pastGrace)}; arrival animations ${JSON.stringify(arrival)}, read by ${arriving.by} (--dur-skeleton-reveal ${crossMs}): ${JSON.stringify(arriving.runs)}`
  );
  await slow.close();

  // 14. The attachments read refused: its region says so, the artifacts stand.
  const refused = await openSession(kit, base, "desk", "light", ids.many, (p) =>
    p
      .route(ATTACHMENT_LIST, (route) => route.abort("internetdisconnected"))
      .then(() => undefined)
  );
  errors.set(refused, []);
  await refused.locator("[data-files-control]").click();
  await refused
    .locator('[data-files-region="attachments"] [data-files-failed]')
    .waitFor({ timeout: 30_000 });
  const refusedSaid = await refused.evaluate(() => ({
    fault: document
      .querySelector('[data-files-region="attachments"] [data-files-failed]')
      ?.textContent?.replace(/\s+/gu, " ")
      .trim(),
    cards: document.querySelectorAll("[data-files-card]").length,
    count: document.querySelector("[data-files-count]")?.textContent ?? null,
  }));
  // Its Try again by its accessible name: a kit Button's text holds its pending words too.
  const refusedRetry = await refused
    .locator('[data-files-region="attachments"] [data-files-failed]')
    .getByRole("button", { name: commonWords.tryAgain, exact: true })
    .count();
  kit.check(
    "14: the attachments read refused says so in its region (RowFault, Try again), the artifacts still listed, and the bar claims no count",
    !!refusedSaid.fault?.includes(filesWords.cantReadAttachments) &&
      refusedRetry > 0 &&
      refusedSaid.cards > 0 &&
      refusedSaid.count === null,
    JSON.stringify(refusedSaid)
  );
  errors.delete(refused);
  await refused.close();

  // 15. The masonry in list order; 16. the rings; 17. the focus moves.
  const page = await openSession(kit, base, "desk", "light", ids.many);
  // Opened from the keyboard at once, while the glass's card may still be
  // rehearsing its open (GlassCard): the focus still goes into Files.
  await page.locator("[data-files-control]").focus();
  await page.keyboard.press("Enter");
  await page.locator("[data-files-card]").first().waitFor();
  await atRest(page);
  const order = await page.evaluate(async (id) => {
    const listed = (await (
      await fetch(`/api/instances/${encodeURIComponent(id)}/artifacts/files`)
    ).json()) as { id: string }[];
    const cards = [
      ...document.querySelectorAll<HTMLElement>("[data-files-card]"),
    ];
    const lanes = cards.map((item) => getComputedStyle(item).gridColumnStart);
    const columns = Number(
      getComputedStyle(
        document.querySelector("[data-files-cards]") as Element
      ).gridTemplateColumns.split(" ").length
    );
    return {
      same:
        cards.map((item) => item.dataset.artifact).join() ===
        listed.map((one) => one.id).join(),
      oneGrid: new Set(cards.map((item) => item.parentElement)).size === 1,
      topRow: new Set(lanes.slice(0, columns)).size === columns,
      columns,
    };
  }, ids.many);
  kit.check(
    "15: the cards are drawn once, in one grid, in the hub's order (newest first), the first row across every column",
    order.same && order.oneGrid && order.topRow,
    JSON.stringify(order)
  );
  const ring = await page.evaluate(() => {
    const field = document.querySelector<HTMLElement>(
      "[data-glass-card-frame='files-pop'] [data-slot='finder-field']"
    );
    const swatch = document.createElement("span");
    swatch.style.color = "var(--focus-ring)";
    document.body.append(swatch);
    const want = getComputedStyle(swatch).color;
    swatch.remove();
    const style = field ? getComputedStyle(field) : null;
    const input = field?.querySelector("input");
    const own = input ? getComputedStyle(input) : null;
    return {
      inputFocused:
        document.activeElement?.closest("[data-files-search]") !== null,
      outline: style ? `${style.outlineStyle} ${style.outlineWidth}` : null,
      inputOutline: own?.outlineStyle ?? null,
      shadowRing: !!style?.boxShadow.includes(want),
      want,
    };
  });
  await page.keyboard.press("Tab");
  let card = await focused(page);
  for (let i = 0; i < 6 && !card?.card; i += 1) {
    await page.keyboard.press("Tab");
    card = await focused(page);
  }
  const cardRing = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? getComputedStyle(el).outlineOffset : null;
  });
  kit.check(
    "16: the search field's focus is its caret (The Caret Rule): with its input focused, neither the strip nor the input draws an outline or the ring; and a card's ring stands inside its own edge (outline-offset = --focus-ring-inset)",
    ring.inputFocused &&
      !!ring.outline?.startsWith("none") &&
      ring.inputOutline === "none" &&
      !ring.shadowRing &&
      !!card?.card &&
      cardRing === "-2px",
    `field ${JSON.stringify(ring)}; card ${JSON.stringify(card)} offset ${cardRing}`
  );
  // A keyboard pick: the artifact in the session's panel, Files gone, and
  // the focus on the panel's name once it stands, its ring drawn.
  const pickedId = card?.card ?? "";
  await page.keyboard.press("Enter");
  const keyPicked = await pickLanded(page, pickedId);
  const afterPick = await panelFocus(page, pickedId);
  kit.check(
    "17: a keyboard pick (Enter on a card) opens it in the session's panel and Files goes, and the focus lands on the panel's name ([data-artifact-trigger], :focus-visible) and stays there",
    !(keyPicked.filesOpen || keyPicked.float) &&
      keyPicked.pane === pickedId &&
      afterPick.onName &&
      afterPick.visible,
    `${JSON.stringify(keyPicked)} (picked ${pickedId}); focus ${JSON.stringify(afterPick)}`
  );
  // Files again, for the lightbox.
  await page.locator("[data-files-control]").click();
  await page.locator("[data-files-row]").first().waitFor({ timeout: 30_000 });
  await atRest(page);
  // 18. A press inside a picture's lightbox is not outside Files.
  await page
    .locator('[data-files-region="attachments"] button[data-menu-item]')
    .first()
    .click();
  const lightboxOpen = await comes(
    page,
    () => !!document.querySelector(".pswp, [role='dialog'] img")
  );
  await page.mouse.click(720, 450);
  await page.keyboard.press("Escape");
  // The lightbox put away, and whatever that started landed.
  await comes(
    page,
    () => !document.querySelector(".pswp, [role='dialog'] img")
  );
  await atRest(page);
  const stillOpen = await page.evaluate(
    () =>
      !!document.querySelector(
        "[data-glass-card-frame='files-pop'][data-state='open']"
      )
  );
  kit.check(
    "18: a picture opened from Files shows in the lightbox, and pressing in it and putting it away leaves Files open",
    lightboxOpen && stillOpen,
    `lightbox ${lightboxOpen}, Files still open ${stillOpen}`
  );
  // 19. A short window: both heads in sight, nothing spills.
  await page.setViewportSize({ width: 1440, height: 520 });
  // Files reflowed to the short window: its card inside it, at rest.
  await comes(
    page,
    () =>
      (document
        .querySelector("[data-glass-card-frame='files-pop']")
        ?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY) <=
      window.innerHeight
  );
  await atRest(page);
  const short = await page.evaluate(() => {
    const pop = document
      .querySelector("[data-glass-card-frame='files-pop']")
      ?.getBoundingClientRect();
    const heads = [
      ...document.querySelectorAll(
        "[data-glass-card-frame='files-pop'] [data-files-region] > [data-files-head]"
      ),
    ].map((head) => head.getBoundingClientRect());
    return {
      pop: pop ? { top: pop.top, bottom: pop.bottom } : null,
      heads: heads.map((head) => ({ top: head.top, bottom: head.bottom })),
      inside:
        !!pop &&
        heads.length === 2 &&
        heads.every((head) => head.top >= pop.top && head.bottom <= pop.bottom),
    };
  });
  await sweep(page, "short window 1440x520");
  kit.check(
    "19: on a 1440×520 window Files keeps both heads in sight inside its card",
    short.inside && !(await pageGrows(page)),
    JSON.stringify(short)
  );
  await page.close();

  // 20. 200% zoom of a 1440×900 desk: a 720×450 window, the drawer.
  const zoomed = await openSession(kit, base, "narrowDesk", "light", ids.many);
  await zoomed.setViewportSize({ width: 720, height: 450 });
  await zoomed.locator('[data-slot="burger"]').click();
  await zoomed.locator("[data-sidebar-files]").click();
  await zoomed
    .locator("[data-files-card]")
    .first()
    .waitFor({ timeout: 30_000 });
  await atRest(zoomed);
  const zoomSaid = await zoomed.evaluate(() => {
    const list = document.querySelector(
      '[data-files-region="artifacts"] [data-files-scroll]'
    );
    return {
      segments: document.querySelectorAll("[data-files-segment]").length,
      scrolls: list ? list.scrollHeight > list.clientHeight : false,
      listHeight: list?.clientHeight ?? 0,
    };
  });
  await sweep(zoomed, "200% zoom 720x450 drawer");
  kit.check(
    "20: at 200% zoom (720×450) Files is the drawer, its list scrolling within it, the page not growing",
    zoomSaid.segments === 2 &&
      zoomSaid.scrolls &&
      zoomSaid.listHeight > 0 &&
      !(await pageGrows(zoomed)),
    JSON.stringify(zoomSaid)
  );
  await zoomed.close();

  // 21. The phone: earned counts, the burger's focus, the strips, Send, 320px.
  const phone = await openSession(kit, base, "phone", "light", ids.one);
  // Both strips stand once the conversation on screen is known, and Send with its composer.
  await phone
    .locator('[data-slot="edge-pull"]')
    .nth(1)
    .waitFor({ state: "attached" });
  await phone.locator('[aria-label="Send message"]').first().waitFor();
  const strips = await phone.evaluate(() => {
    const send = document
      .querySelector<HTMLElement>('[aria-label="Send message"]')
      ?.getBoundingClientRect();
    return {
      strips: [
        ...document.querySelectorAll<HTMLElement>('[data-slot="edge-pull"]'),
      ].map((strip) => {
        const box = strip.getBoundingClientRect();
        return {
          side: strip.dataset.side,
          touchAction: getComputedStyle(strip).touchAction,
          coversSend:
            !!send &&
            box.left < send.right &&
            box.right > send.left &&
            box.top < send.bottom &&
            box.bottom > send.top,
        };
      }),
      send: send ? { left: send.left, right: send.right, top: send.top } : null,
    };
  });
  kit.check(
    "21a: both edge strips let a finger going down scroll (touch-action pan-y), and neither covers the composer's Send",
    strips.strips.length === 2 &&
      strips.strips.every(
        (strip) => strip.touchAction === "pan-y" && !strip.coversSend
      ),
    JSON.stringify(strips)
  );
  await phone.locator('[data-slot="burger"]').click();
  await phone.locator("[data-sidebar-files]").click();
  await phone.locator("[data-files-sheet]").waitFor();
  await phone.locator("[data-files-card]").first().waitFor({ timeout: 30_000 });
  const segmentCounts = await phone.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-files-segment]")].map(
      (segment) => ({
        segment: segment.dataset.filesSegment,
        count:
          segment.querySelector("[data-files-head-count]")?.textContent ?? null,
      })
    )
  );
  kit.check(
    "21b: a segment counts only above 0 (one page, no attachments)",
    segmentCounts.length === 2 &&
      segmentCounts[0]?.count === "1" &&
      segmentCounts[1]?.count === null,
    JSON.stringify(segmentCounts)
  );
  await phone.keyboard.press("Escape");
  await phone
    .locator("[data-files-sheet]")
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => null);
  // The focus handed back, which the check reads.
  await comes(
    phone,
    () =>
      (document.activeElement as HTMLElement | null)?.dataset.slot === "burger"
  );
  const burgerFocus = await focused(phone);
  kit.check(
    "21c: Files opened from the sidebar's row gives the focus back to the burger when it closes",
    burgerFocus?.slot === "burger",
    JSON.stringify(burgerFocus)
  );
  await phone.close();
  const narrow = await openSession(kit, base, "phone", "light", ids.many);
  await narrow.setViewportSize({ width: 320, height: 640 });
  await narrow.locator('[data-slot="burger"]').click();
  await narrow.locator("[data-sidebar-files]").click();
  await narrow
    .locator("[data-files-card]")
    .first()
    .waitFor({ timeout: 30_000 });
  await narrow.locator("[data-files-search] input").fill("brief");
  // The search answered: a segment counts its hits ("3 of 9"), at rest.
  await comes(narrow, () =>
    [...document.querySelectorAll("[data-files-segment]")].some((segment) =>
      segment.textContent?.includes(" of ")
    )
  );
  await atRest(narrow);
  // Each run of words inside its segment's padding box, and whole (not
  // clipped). The segment's own scrollWidth also counts its touch area, the
  // `::after` that stands half a pixel past its box on a coarse pointer
  // (DESIGN.md, The 44 Touch Rule; ab92c1929: "every touch area sits where
  // the browser actually hit-tests it"), so it reads 1px over at any width.
  const fit = await narrow.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-files-segment]")].map(
      (segment) => {
        const box = segment.getBoundingClientRect();
        const style = getComputedStyle(segment);
        const start = box.left + Number.parseFloat(style.paddingLeft) - 0.5;
        const end = box.right - Number.parseFloat(style.paddingRight) + 0.5;
        const runs = [...segment.children].map((words) => {
          const at = words.getBoundingClientRect();
          return {
            inside: at.left >= start && at.right <= end,
            whole: words.scrollWidth <= words.clientWidth,
          };
        });
        return {
          text: segment.textContent?.replace(/\s+/gu, " ").trim(),
          fits: runs.length > 0 && runs.every((one) => one.inside && one.whole),
        };
      }
    )
  );
  await sweep(narrow, "320 drawer searching");
  kit.check(
    "22: at 320px the segments' words and counts (\"Attachments 3 of 9\") fit their segments (each run whole inside the segment's padding)",
    fit.length === 2 &&
      fit.every((one) => one.fits) &&
      fit.some((one) => one.text?.includes(" of ")),
    JSON.stringify(fit)
  );
  await narrow.close();
};

/** The composer's words, whether it has the focus, and whether the caret stands after the last of them. */
const composerSaid = (page: Page) =>
  page.evaluate((selector) => {
    const field = document.querySelector<HTMLElement>(selector);
    const selection = getSelection();
    let caretAtEnd = false;
    if (
      field &&
      selection &&
      selection.rangeCount > 0 &&
      selection.isCollapsed
    ) {
      const rest = document.createRange();
      rest.selectNodeContents(field);
      const at = selection.getRangeAt(0);
      rest.setStart(at.endContainer, at.endOffset);
      caretAtEnd = rest.toString() === "";
    }
    return {
      text: field?.textContent ?? null,
      focused:
        !!field &&
        (field === document.activeElement ||
          field.contains(document.activeElement)),
      caretAtEnd,
    };
  }, COMPOSER);

/** Whether the ask's words stand anywhere on the page outside the composer: a send would put them in the transcript. */
const sentAnywhere = (page: Page, words: string) =>
  page.evaluate(
    ([selector, text]) =>
      [...document.querySelectorAll<HTMLElement>('[data-slot="pane"]')].some(
        (pane) => {
          const copy = pane.cloneNode(true) as HTMLElement;
          for (const field of copy.querySelectorAll(selector)) {
            field.closest("form")?.remove();
          }
          return copy.textContent?.includes(text) ?? false;
        }
      ),
    [COMPOSER, words] as const
  );

/** Waits until the composer holds `words`, the ask put there (the check reads whether it did). */
const composerHolds = (page: Page, words: string) =>
  page
    .waitForFunction(
      ([selector, text]) =>
        document.querySelector(selector)?.textContent === text,
      [COMPOSER, words] as const,
      { timeout: 15_000 }
    )
    .catch(() => undefined);

/**
 * How long nothing being sent is watched for: a send the press made would
 * stand in the transcript by then. A wait on what does not happen has no
 * state to wait on, so it is a window.
 */
const SEND_WINDOW_MS = 1500;

/** The ask's words (files.svelte.ts ASK_FOR_A_PAGE). */
const ASK_WORDS = "Make a page that shows what we've done so far";

/**
 * 23. The Empty Starts Work Rule, a session's own case: Files with nothing
 * in it offers "Ask Claude Code for a page", shown only once the read has
 * answered empty; pressed, the words stand in the session's composer with
 * the caret after them and nothing is sent. On the phone, its touch area
 * is 44px.
 */
const askLegs = async (
  kit: Kit,
  base: string,
  none: string,
  noneOpenCode: string
) => {
  // The label names the session's own agent: an OpenCode session's.
  const other = await openSession(kit, base, "desk", "light", noneOpenCode);
  await other.locator("[data-files-control]").click();
  await other.locator("[data-files-ask]").waitFor({ timeout: 15_000 });
  const otherLabel = (
    await other.locator("[data-files-ask]").textContent()
  )?.trim();
  kit.check(
    '23a (OpenCode): an OpenCode session\'s empty Files asks its own agent by name: "Ask OpenCode for a page"',
    otherLabel === "Ask OpenCode for a page",
    JSON.stringify(otherLabel)
  );
  await other.close();

  const onDesk = await openSession(kit, base, "desk", "light", none);
  await onDesk.locator("[data-files-control]").click();
  await onDesk.locator("[data-glass-card-frame='files-pop']").waitFor();
  const before = await onDesk.evaluate(() => ({
    ask:
      document.querySelector("[data-files-ask]")?.textContent?.trim() ?? null,
    empty: !!document.querySelector("[data-files-empty]"),
  }));
  await onDesk.locator("[data-files-ask]").waitFor({ timeout: 15_000 });
  const label = (
    await onDesk.locator("[data-files-ask]").textContent()
  )?.trim();
  await onDesk.locator("[data-files-ask]").click();
  await onDesk
    .locator("[data-glass-card-frame='files-pop'][data-state='open']")
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => null);
  await composerHolds(onDesk, ASK_WORDS);
  const deskSaid = await composerSaid(onDesk);
  await onDesk.waitForTimeout(SEND_WINDOW_MS);
  const deskSent = await sentAnywhere(onDesk, ASK_WORDS);
  kit.check(
    '23a (desk): Files with nothing in it offers "Ask Claude Code for a page" once the read answered; pressed, Files goes, the words stand in the session\'s composer with the focus and the caret after them, and nothing is sent',
    label === "Ask Claude Code for a page" &&
      deskSaid.text === ASK_WORDS &&
      deskSaid.focused &&
      deskSaid.caretAtEnd &&
      !deskSent,
    `before the read ${JSON.stringify(before)}; label ${JSON.stringify(label)}; composer ${JSON.stringify(deskSaid)}; sent ${deskSent}`
  );
  await onDesk.close();

  const phone = await openSession(kit, base, "phone", "light", none);
  await phone.locator('[data-slot="burger"]').click();
  await phone.locator("[data-sidebar-files]").click();
  const ask = phone.locator("[data-files-sheet] [data-files-ask]");
  await ask.waitFor({ timeout: 15_000 });
  await atRest(phone);
  const hit = await ask.evaluate((el) => {
    const after = getComputedStyle(el, "::after");
    const box = el.getBoundingClientRect();
    const left = Number.parseFloat(after.left);
    const right = Number.parseFloat(after.right);
    const top = Number.parseFloat(after.top);
    const bottom = Number.parseFloat(after.bottom);
    return {
      width: box.width - left - right,
      height: box.height - top - bottom,
    };
  });
  await ask.click();
  await phone
    .locator("[data-files-sheet]")
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => null);
  await composerHolds(phone, ASK_WORDS);
  const phoneSaid = await composerSaid(phone);
  await phone.waitForTimeout(SEND_WINDOW_MS);
  const phoneSent = await sentAnywhere(phone, ASK_WORDS);
  kit.check(
    "23b (phone): the ask's touch area is at least 44×44, and pressed, the drawer goes and the words stand in the composer with the focus and the caret after them, nothing sent",
    hit.width >= 44 &&
      hit.height >= 44 &&
      phoneSaid.text === ASK_WORDS &&
      phoneSaid.focused &&
      phoneSaid.caretAtEnd &&
      !phoneSent,
    `touch area ${JSON.stringify(hit)}; composer ${JSON.stringify(phoneSaid)}; sent ${phoneSent}`
  );
  await phone.close();
};

/** A duration token in ms, as it is written ("120ms" or "0.12s"). */
const durationOf = async (page: Page, token: string): Promise<number> => {
  const said = await page.evaluate(
    (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    token
  );
  return said.endsWith("ms")
    ? Number.parseFloat(said)
    : Number.parseFloat(said) * 1000;
};

/** Each ended run's length, ms, as a token reads (`durationOf`): whole. */
const lengths = (runs: readonly MotionRun[]) =>
  runs.filter((one) => one.ended).map((one) => Math.round(one.end));

/**
 * The third review round's legs (light):
 *  24. D: each region's scrollbar and Show's touch area stand inside the
 *      region, with a mouse and under a finger;
 *  25. B: a keystroke never flashes the whole grid back while the hub's
 *      answer is held;
 *  26. C: a streamed reply with no attachment reads no attachments again;
 *  27. A: a new attachment keeps the focus on the row it was on;
 *  28. Attach a file opens the composer's own picker, and Files goes;
 *  30. Jump's field: its caret alone, no ring (The Caret Rule);
 *  31. the skeleton gives its place to the empty state in its reveal.
 */
const roundThree = async (
  kit: Kit,
  base: string,
  fleet: Awaited<ReturnType<Kit["fleet"]>>,
  ids: { many: string; one: string; none: string }
) => {
  // 24. D, with a mouse (desk) and under a finger (an iPad's regular width).
  for (const view of ["desk", "ipadWide"] as const) {
    const page = await openSession(kit, base, view, "light", ids.many);
    await page.locator("[data-files-control]").click();
    await page.locator("[data-files-row]").first().waitFor({ timeout: 30_000 });
    await atRest(page);
    const read = await page.evaluate(() => {
      /** Where a control's touch area ends: its ::after's trailing edge, or its own. */
      const touchRight = (el: HTMLElement | null) => {
        if (!el) {
          return null;
        }
        const after = getComputedStyle(el, "::after");
        const r = el.getBoundingClientRect();
        const inset = Number.parseFloat(after.right);
        return after.content === "none" || Number.isNaN(inset)
          ? r.right
          : r.right - inset;
      };
      /** The nearest ancestor that clips: its computed overflow is not `visible`. */
      const clipperOf = (el: HTMLElement) => {
        for (let at = el.parentElement; at; at = at.parentElement) {
          const style = getComputedStyle(at);
          if (style.overflowX !== "visible" || style.overflowY !== "visible") {
            const box = at.getBoundingClientRect();
            return {
              name: `${at.tagName.toLowerCase()}.${[...at.classList].filter((one) => !one.startsWith("svelte-")).join(".")}`,
              overflow: `${style.overflowX} ${style.overflowY}`,
              paddingEnd: style.paddingInlineEnd,
              // Its padding box's trailing edge: what it clips at.
              right: box.right - Number.parseFloat(style.borderRightWidth),
            };
          }
        }
        return null;
      };
      return [
        ...document.querySelectorAll<HTMLElement>(
          "[data-glass-card-frame='files-pop'] [data-files-region]"
        ),
      ].map((region) => {
        const head = region
          .querySelector<HTMLElement>(":scope > [data-files-head]")
          ?.getBoundingClientRect();
        const scroller = region.querySelector<HTMLElement>(
          "[data-files-scroll]"
        );
        const cards = [
          ...region.querySelectorAll<HTMLElement>("[data-files-card]"),
        ].map((card) => card.getBoundingClientRect());
        const top = Math.min(...cards.map((card) => card.top));
        const topRow = cards.filter((card) => Math.abs(card.top - top) < 1);
        const row = region
          .querySelector<HTMLElement>("[data-files-row]")
          ?.getBoundingClientRect();
        const showRight = touchRight(
          region.querySelector<HTMLElement>("[data-files-show]")
        );
        return {
          region: region.dataset.filesRegion,
          headRight: head?.right ?? null,
          lastCardRight:
            topRow.length > 0
              ? Math.max(...topRow.map((card) => card.right))
              : null,
          rowRight: row?.right ?? null,
          scrollerRight: scroller?.getBoundingClientRect().right ?? null,
          showRight,
          clipper: scroller ? clipperOf(scroller) : null,
        };
      });
    });
    const flush = read.every((one) => {
      const end = one.region === "artifacts" ? one.lastCardRight : one.rowRight;
      return (
        one.headRight !== null &&
        end !== null &&
        Math.abs(end - one.headRight) <= 0.5
      );
    });
    // No ancestor that clips: nothing can cut the scroller or Show's area.
    // And none of it stands past Files' card, the surface it is drawn on.
    const unclipped = read.every(
      (one) =>
        one.scrollerRight !== null &&
        (one.clipper === null ||
          (one.scrollerRight <= one.clipper.right + 0.5 &&
            (one.showRight === null ||
              one.showRight <= one.clipper.right + 0.5)))
    );
    // Files' card, drawn round the regions: its trailing edge and its inline-end padding.
    const filesCard: {
      right: number;
      paddingEnd: string;
      overflow: string;
    } | null = await page.evaluate(() => {
      const pop = document.querySelector<HTMLElement>(
        "[data-glass-card-frame='files-pop']"
      );
      if (!pop) {
        return null;
      }
      const style = getComputedStyle(pop);
      return {
        right: pop.getBoundingClientRect().right,
        paddingEnd: style.paddingInlineEnd,
        overflow: `${style.overflowX} ${style.overflowY}`,
      };
    });
    kit.check(
      `24a (${view}): the top row's last card and an attachment row end on their region head's trailing edge (±0.5)`,
      flush,
      JSON.stringify(read.map(({ clipper: _clipper, ...rest }) => rest))
    );
    const onCard =
      !!filesCard &&
      read.every(
        (one) =>
          one.scrollerRight !== null &&
          one.scrollerRight <= filesCard.right + 0.5 &&
          (one.showRight === null || one.showRight <= filesCard.right + 0.5)
      );
    kit.check(
      `24b (${view}): the scroller's trailing edge and Show's touch area lie inside the nearest ancestor that clips (named), and none of it past Files' card`,
      unclipped && onCard,
      `${JSON.stringify(
        read.map((one) => ({
          region: one.region,
          scrollerRight: one.scrollerRight,
          showRight: one.showRight,
          clipper: one.clipper ?? "none: every ancestor's overflow is visible",
        }))
      )}; Files' card ${JSON.stringify(filesCard)}`
    );
    await page.close();
  }

  // 25. B: the answer to the second keystroke held; the grid never returns whole.
  const search = await openSession(kit, base, "desk", "light", ids.many);
  /** Holds the search's answers once the first is in. */
  const holding = new Set<"answers">();
  await search.route(SEARCH_READ, async (route) => {
    if (holding.has("answers")) {
      await new Promise((done) => setTimeout(done, 2000));
    }
    await route.continue();
  });
  await search.locator("[data-files-control]").click();
  await search.locator("[data-files-card]").first().waitFor();
  const field = search.locator("[data-files-search] input");
  await field.type("pr");
  await until(
    "the first answer",
    () => search.locator("[data-files-card]").count(),
    (n) => n < 42,
    15_000
  ).catch(() => 0);
  holding.add("answers");
  await field.type("i");
  const counts: number[] = [];
  let busy = false;
  for (let i = 0; i < 15; i += 1) {
    counts.push(await search.locator("[data-files-card]").count());
    busy ||= await search.evaluate(
      () =>
        document
          .querySelector('[data-files-region="artifacts"] [data-files-scroll]')
          ?.getAttribute("aria-busy") === "true"
    );
    await search.waitForTimeout(100);
  }
  kit.check(
    "25: while the hub's answer to the next keystroke is held, the last answer's cards stand (never the whole grid back) and the scroller says it is busy",
    counts.every((n) => n < 42) && busy,
    `counts ${JSON.stringify(counts)}, busy ${busy}`
  );
  await search.close();

  // 26. C: a streamed reply with no attachment reads no attachments again.
  const quiet = await openSession(kit, base, "desk", "light", ids.many);
  let reads = 0;
  quiet.on("request", (request) => {
    if (ATTACHMENT_LIST.test(new URL(request.url()).pathname)) {
      reads += 1;
    }
  });
  // The page's own reads answered: the bar counts once both lists are in.
  await quiet.locator("[data-files-count]").waitFor({ timeout: 60_000 });
  await atRest(quiet);
  const before = reads;
  const sent = await fleet.send(ids.many, "A word with nothing attached");
  // The send read and its turn answered on the hub, its reply on the page.
  await until(
    "the word read",
    () => fleet.sendRow(sent),
    (one) => one?.state === "read",
    60_000
  );
  await until(
    "its turn answered",
    () =>
      fleet.query<{ turn_open_at: number | null }>(
        "SELECT turn_open_at FROM instances WHERE id = ?",
        ids.many
      )[0],
    (one) => one?.turn_open_at === null,
    60_000
  );
  await atRest(quiet);
  kit.check(
    "26: a message and its streamed reply that carry no attachment read the session's attachments 0 times",
    reads - before === 0,
    `attachments reads before ${before}, after ${reads}`
  );
  await quiet.close();

  // 27. A: focus on a row, a new attachment arrives above it, the focus stays.
  const steady = await openSession(kit, base, "desk", "light", ids.many);
  await steady.locator("[data-files-control]").click();
  await steady.locator("[data-files-row]").first().waitFor({ timeout: 30_000 });
  const rowsBefore = await steady.locator("[data-files-row]").count();
  const held = steady.locator("[data-files-row] > [data-menu-item]").first();
  const heldName = await held.getAttribute("title");
  await held.focus();
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "send",
    machineId: MACHINE,
    sessionId: ids.many,
    payload: {
      instanceId: ids.many,
      attachments: [
        { kind: "text", name: "arrived-later.md", content: "Later." },
      ],
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: "One more file" },
        parent_tool_use_id: null,
        origin: { kind: "human" },
      },
    },
  });
  await until(
    "the new attachment listed",
    () => steady.locator("[data-files-row]").count(),
    (n) => n > rowsBefore,
    30_000
  ).catch(() => 0);
  const stillOn = await steady.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.closest("[data-files-row]") ? el.getAttribute("title") : null;
  });
  kit.check(
    "27: a new attachment listed above the focused row keeps the focus on that row (rows keyed by the hub's own ids)",
    (await steady.locator("[data-files-row]").count()) > rowsBefore &&
      stillOn === heldName,
    `focused ${JSON.stringify(stillOn)}, was ${JSON.stringify(heldName)}`
  );
  await steady.close();

  // 28. Attach a file: the composer's own picker, and Files goes.
  const attach = await openSession(kit, base, "desk", "light", ids.one);
  await attach.locator("[data-files-control]").click();
  const attachButton = attach.locator("[data-files-attach]");
  await attachButton.waitFor({ timeout: 30_000 });
  const [chooser] = await Promise.all([
    attach.waitForEvent("filechooser", { timeout: 10_000 }).catch(() => null),
    attachButton.click(),
  ]);
  // Files going, which the check reads.
  await comes(
    attach,
    () =>
      !document.querySelector(
        "[data-glass-card-frame='files-pop'][data-state='open']"
      )
  );
  const attachSaid = await attach.evaluate(() => ({
    filesOpen: !!document.querySelector(
      "[data-glass-card-frame='files-pop'][data-state='open']"
    ),
    composerInput: !!document.querySelector(
      'form[data-slot="cin"] input[type="file"]'
    ),
  }));
  kit.check(
    "28: an empty Attachments offers Attach a file; pressed, the session composer's own file picker opens and Files goes",
    !!chooser &&
      !!(await chooser
        .element()
        .evaluate(
          (input) => !!(input as Element).closest('form[data-slot="cin"]')
        )) &&
      !attachSaid.filesOpen,
    `chooser ${!!chooser}; ${JSON.stringify(attachSaid)}`
  );
  await attach.close();

  // 30. Jump's field: its caret alone (The Caret Rule).
  const jump = await openSession(kit, base, "desk", "light", ids.many);
  // The page stands hydrated once open (kit `pageReady`), so the shortcut is
  // its own; the ring is read once the focus is in Jump's field.
  await jump.keyboard.press("Control+KeyK");
  await jump
    .locator(
      "[data-glass-card-frame='jump-pop'] [data-slot='finder-field'] input"
    )
    .waitFor({ timeout: 10_000 });
  await comes(
    jump,
    () => !!document.activeElement?.closest("[data-slot='finder-field']")
  );
  await atRest(jump);
  const jumpRing = await jump.evaluate(() => {
    const ringed = document.querySelector<HTMLElement>(
      "[data-glass-card-frame='jump-pop'] [data-slot='finder-field']"
    );
    const style = ringed ? getComputedStyle(ringed) : null;
    const swatch = document.createElement("span");
    swatch.style.color = "var(--focus-ring)";
    document.body.append(swatch);
    const want = getComputedStyle(swatch).color;
    swatch.remove();
    const input = ringed?.querySelector("input");
    return {
      outline: style ? `${style.outlineStyle} ${style.outlineWidth}` : null,
      inputOutline: input ? getComputedStyle(input).outlineStyle : null,
      shadowRing: !!style?.boxShadow.includes(want),
      focused: !!document.activeElement?.closest("[data-slot='finder-field']"),
    };
  });
  kit.check(
    "30: Jump's field's focus is its caret (The Caret Rule): with its input focused, neither the strip nor the input draws an outline or the ring",
    jumpRing.focused &&
      !!jumpRing.outline?.startsWith("none") &&
      jumpRing.inputOutline === "none" &&
      !jumpRing.shadowRing,
    JSON.stringify(jumpRing)
  );
  await jump.close();

  // 32. The pages no pane had a picture of are drawn unseen by Files, and
  // kept by the hub; neither is shown in the session's panel for it.
  const drawn = await openSession(kit, base, "desk", "light", ids.many);
  // What each unseen page's frame says to Files (page-thumbs.ts), so a
  // picture that never comes is read where it stopped.
  await drawn.evaluate(() => {
    const w = window as unknown as { probeSaid: string[] };
    w.probeSaid = [];
    window.addEventListener("message", (event) => {
      const data = event.data as { error?: unknown; type?: unknown } | null;
      if (typeof data?.type === "string" && data.type.startsWith("cawco:")) {
        w.probeSaid.push(
          `+${Math.round(performance.now())} ${data.type}${data.error ? ` (${String(data.error)})` : ""}`
        );
      }
    });
  });
  await drawn.locator("[data-files-control]").click();
  await drawn.locator("[data-files-card]").first().waitFor({ timeout: 30_000 });
  const pictured = await until(
    "the never-pictured pages drawn",
    () =>
      drawn.evaluate(
        (names) =>
          names.map(
            (name) =>
              document
                .querySelector(
                  `[data-files-card][title="${name}"] [data-files-thumb]`
                )
                ?.getAttribute("data-files-thumb") ?? null
          ),
        UNPICTURED
      ),
    (thumbs) => thumbs.every((one) => one === "picture"),
    60_000
  ).catch(() => null);
  const kept = await drawn.evaluate(
    async ({ id, names }) => {
      const listed = (await (
        await fetch(`/api/instances/${encodeURIComponent(id)}/artifacts`)
      ).json()) as { id: string; name: string; thumbnail: unknown }[];
      return Promise.all(
        listed
          .filter((one) => names.includes(one.name))
          .map(async (one) => {
            const found = (await (
              await fetch(`/api/artifacts/${encodeURIComponent(one.id)}`)
            ).json()) as { shown: boolean };
            return {
              name: one.name,
              thumbnail: one.thumbnail !== null,
              shown: found.shown,
            };
          })
      );
    },
    { id: ids.many, names: UNPICTURED }
  );
  kit.check(
    "32: a page no pane had a picture of is drawn unseen by Files and kept by the hub, its card taking the picture, and it is never shown in the session's panel for it",
    pictured !== null &&
      kept.length === UNPICTURED.length &&
      kept.every((one) => one.thumbnail && !one.shown),
    `cards ${JSON.stringify(pictured)}; hub ${JSON.stringify(kept)}; the frames said ${(
      await drawn.evaluate(
        () => (window as unknown as { probeSaid: string[] }).probeSaid
      )
    ).join(", ")}`
  );
  await drawn.close();

  // 31. The skeleton gives its place to the empty state in its reveal.
  const emptiedReads = heldReads();
  const emptied = await openSession(
    kit,
    base,
    "desk",
    "light",
    ids.none,
    emptiedReads.hold
  );
  await emptied.locator("[data-files-control]").click();
  await emptied
    .locator("[data-files-wait]")
    .first()
    .waitFor({ timeout: 10_000 });
  const emptying = await readMotion(
    emptied,
    async () => {
      emptiedReads.release();
      await emptied.locator("[data-files-empty]").waitFor({ timeout: 15_000 });
    },
    "[data-files-empty]",
    { ms: 15_000 }
  );
  const emptyIntro = lengths(emptying.runs);
  const emptyCross = await durationOf(emptied, "--dur-skeleton-reveal");
  kit.check(
    "31: the skeleton gives its place to the empty state in its reveal over --dur-skeleton-reveal",
    emptyIntro.includes(emptyCross),
    `intros ${JSON.stringify(emptyIntro)}, read by ${emptying.by} (--dur-skeleton-reveal ${emptyCross}): ${JSON.stringify(emptying.runs)}`
  );
  await emptied.close();
};

/**
 * Each card's slot in the masonry against what it draws, read in the page:
 * the slot's columns from the grid's resolved tracks and its column gap at
 * the card's lane, its rows from the card's top down its row span (1px rows,
 * no row gap: a card's span is its height and the gap under it). Every box
 * the card draws (itself, its thumbnail's well and everything in it, its
 * words) must lie inside its slot; every card inside Files' region. Then the
 * overflow scan of Files: every element whose box reaches past Files' own
 * box sideways, and every scroller in it that scrolls sideways.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, every read in it
const slotsOf = () => {
  const SLACK = 0.5;
  const files =
    document.querySelector<HTMLElement>("[data-files-sheet]") ??
    document.querySelector<HTMLElement>("[data-glass-card-frame='files-pop']");
  const grid = files?.querySelector<HTMLElement>("[data-files-cards]");
  const region = grid?.closest<HTMLElement>("[data-files-region]");
  if (!(files && grid && region)) {
    return null;
  }
  const said = (r: DOMRect) =>
    `${r.left.toFixed(1)}..${r.right.toFixed(1)}×${r.top.toFixed(1)}..${r.bottom.toFixed(1)}`;
  const style = getComputedStyle(grid);
  const tracks = style.gridTemplateColumns.split(" ").map(Number.parseFloat);
  const gap = Number.parseFloat(style.columnGap) || 0;
  const start =
    grid.getBoundingClientRect().left +
    grid.clientLeft +
    Number.parseFloat(style.paddingLeft);
  const regionBox = region.getBoundingClientRect();
  const misses: string[] = [];
  const cards = [...grid.querySelectorAll<HTMLElement>("[data-files-card]")];
  const thumbs = { picture: 0, tall: 0 };
  for (const card of cards) {
    const own = getComputedStyle(card);
    const lane = Number.parseInt(own.gridColumnStart, 10);
    const span = Number.parseInt(own.gridRowEnd.replace("span", ""), 10);
    const left =
      start +
      tracks.slice(0, lane - 1).reduce((sum, w) => sum + w, 0) +
      gap * (lane - 1);
    const box = card.getBoundingClientRect();
    const slot = {
      left,
      right: left + (tracks[lane - 1] ?? 0),
      top: box.top,
      bottom: box.top + span,
    };
    const inSlot = (r: DOMRect) =>
      r.left >= slot.left - SLACK &&
      r.right <= slot.right + SLACK &&
      r.top >= slot.top - SLACK &&
      r.bottom <= slot.bottom + SLACK;
    const thumb = card.querySelector<HTMLElement>("[data-files-thumb]");
    const img = thumb?.querySelector("img");
    if (img?.complete && img.naturalWidth > 0) {
      thumbs.picture += 1;
      if (img.naturalHeight / img.naturalWidth > 4 / 3) {
        thumbs.tall += 1;
      }
    }
    const drawn = [card, ...card.querySelectorAll<HTMLElement>("*")].filter(
      (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }
    );
    for (const el of drawn) {
      const r = el.getBoundingClientRect();
      if (!inSlot(r)) {
        misses.push(
          `${card.title}: ${el === card ? "the card" : `${el.tagName.toLowerCase()}${el === thumb ? " (its well)" : ""}`} ${said(r)} past its slot ${slot.left.toFixed(1)}..${slot.right.toFixed(1)}×${slot.top.toFixed(1)}..${slot.bottom.toFixed(1)}`
        );
      }
    }
    if (
      box.left < regionBox.left - SLACK ||
      box.right > regionBox.right + SLACK
    ) {
      misses.push(
        `${card.title}: the card ${said(box)} past Files' region ${said(regionBox)}`
      );
    }
  }
  const filesBox = files.getBoundingClientRect();
  const overflow: string[] = [];
  for (const el of files.querySelectorAll<HTMLElement>("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      continue;
    }
    const s = getComputedStyle(el);
    if (r.left < filesBox.left - SLACK || r.right > filesBox.right + SLACK) {
      overflow.push(
        `${el.tagName.toLowerCase()} ${said(r)} past Files ${said(filesBox)}`
      );
    } else if (
      ["auto", "scroll"].includes(s.overflowX) &&
      el.scrollWidth > el.clientWidth + 1
    ) {
      overflow.push(
        `${el.tagName.toLowerCase()} scrolls sideways: ${el.scrollWidth}px in ${el.clientWidth}px`
      );
    }
  }
  return {
    cards: cards.length,
    columns: tracks.length,
    thumbs,
    misses,
    overflow,
  };
};

/**
 * 33. The cards' slots (the owner: "why is one of the artifacts spilling out
 * from the files panel?"): at 390 and 680 (the drawer) and 1440 (the bar's
 * card), in Chromium and WebKit, with one card (its picture taller than
 * 3:4) and with many (a decision page titled in 40 words, pictures taller
 * than 3:4 and five times wider than tall).
 */
const slotLegs = async (
  kit: Kit,
  base: string,
  ids: { many: string; one: string }
) => {
  for (const engine of ["chromium", "webkit"] as const) {
    for (const view of ["phone", "narrowDesk", "desk"] as const) {
      await slotLeg(kit, base, engine, view, "one", ids.one);
      await slotLeg(kit, base, engine, view, "many", ids.many);
    }
  }
};

const SLOT_WIDTHS = { phone: 390, narrowDesk: 680, desk: 1440 } as const;

/** One of 33's legs: an engine, a width, one card or many. */
const slotLeg = async (
  kit: Kit,
  base: string,
  engine: Engine,
  view: keyof typeof SLOT_WIDTHS,
  count: "one" | "many",
  id: string
) => {
  const leg = `${engine} ${SLOT_WIDTHS[view]} ${count}`;
  const page = await openSession(
    kit,
    base,
    view,
    "light",
    id,
    undefined,
    engine
  );
  if (view === "desk") {
    await page.locator("[data-files-control]").click();
  } else {
    await page.locator('[data-slot="burger"]').click();
    await page.locator("[data-sidebar-files]").click();
  }
  await page.locator("[data-files-card]").first().waitFor({ timeout: 30_000 });
  // The pictures on show, the decision pages' among them, loaded and drawn.
  await until(
    `${leg}: the pictures on show`,
    () =>
      page.evaluate(
        picturesShown,
        DECISIONS.map((one) => one.name)
      ),
    (ready) => ready,
    30_000
  ).catch(() => false);
  // Read once Files stands still; the sweep after it says so if it never does.
  await filesAtRest(page);
  const read = await page.evaluate(slotsOf);
  kit.check(
    `33 (${leg}): every card and everything its thumbnail draws lie inside the card's slot, every card inside Files' region`,
    !!read &&
      read.cards === (count === "one" ? 1 : MANY) &&
      read.thumbs.tall > 0 &&
      read.misses.length === 0,
    read
      ? `${read.cards} cards in ${read.columns} columns, ${read.thumbs.picture} pictures drawn (${read.thumbs.tall} taller than 3:4); ${read.misses.slice(0, 4).join(" | ") || "none past its slot"}`
      : "Files' cards not found"
  );
  kit.check(
    `33 (${leg}): an overflow scan of Files totals zero`,
    !!read && read.overflow.length === 0,
    read
      ? `${read.overflow.length} found${read.overflow.length ? `: ${read.overflow.slice(0, 4).join(" | ")}` : ""}`
      : "Files not found"
  );
  await sweep(page, `slots ${leg}`);
  await page.close();
};

/** The first cards' pictures loaded, and the decision pages pictured. */
const picturesShown = (names: string[]) => {
  const shown = [
    ...document.querySelectorAll<HTMLElement>("[data-files-card]"),
  ].slice(0, 6);
  const ready = shown.every((card) => {
    const img = card.querySelector("img");
    return !img || (img.complete && img.naturalWidth > 0);
  });
  return (
    ready &&
    names.every((name) => {
      const card = document.querySelector(`[data-files-card][title="${name}"]`);
      return !card || !!card.querySelector("img");
    })
  );
};

/** The drawer's legs at 390 and 680, in one theme. */
const narrowLeg = async (
  kit: Kit,
  base: string,
  view: "phone" | "narrowDesk",
  theme: Theme,
  id: string
) => {
  const width = view === "phone" ? 390 : 680;
  const page = await openSession(kit, base, view, theme, id);
  await page.locator('[data-slot="burger"]').click();
  const row = page.locator("[data-sidebar-files]");
  await row.waitFor();
  await until(
    "the sidebar's Files count",
    () => row.getAttribute("aria-label"),
    (label) => !!label && FILES_COUNTED.test(label),
    60_000
  ).catch(() => null);
  await row.click();
  const sheet = page.locator("[data-files-sheet]");
  await sheet.waitFor();
  await page.locator("[data-files-card]").first().waitFor({ timeout: 30_000 });
  await atRest(page);
  const drawer = await page.evaluate(() => ({
    // The kit's drawer content is vaul's (components/ui/drawer).
    vaul: !!document.querySelector(
      '[data-files-sheet][data-slot="drawer-content"]'
    ),
    segments: [
      ...document.querySelectorAll<HTMLElement>("[data-files-segment]"),
    ].map((one) => one.textContent?.replace(/\s+/gu, " ").trim()),
    regions: document.querySelectorAll("[data-glass-card-frame='files-pop']")
      .length,
  }));
  kit.check(
    `9 (${width} ${theme}): Files is the vaul drawer, Artifacts | Attachments tabs`,
    drawer.vaul &&
      drawer.segments.length === 2 &&
      !!drawer.segments[0]?.startsWith("Artifacts") &&
      !!drawer.segments[1]?.startsWith("Attachments") &&
      drawer.regions === 0 &&
      !(await pageGrows(page)),
    JSON.stringify(drawer)
  );
  await sweep(page, `drawer artifacts ${width} ${theme}`);
  await page.locator('[data-files-segment="attachments"]').click();
  await page.locator("[data-files-row]").first().waitFor();
  await sweep(page, `drawer attachments ${width} ${theme}`);
  await page.locator("[data-files-search] input").fill("invoice");
  await page.locator("[data-files-none]").first().waitFor({ timeout: 15_000 });
  await sweep(page, `drawer search none ${width} ${theme}`);
  await page.close();
};

/** Files' artifacts head's switch, by its way (motion/Rail's radios). */
const VIEW_PICK = (way: "thumbnails" | "list") =>
  `[data-files-region="artifacts"] [data-files-head] [data-rail-item="${way}"]`;

/** Opens Files where the width puts it: the bar's card on a desk, the drawer from the sidebar's row else. */
const openFiles = async (page: Page, view: keyof typeof SLOT_WIDTHS) => {
  if (view === "desk") {
    await page.locator("[data-files-control]").click();
  } else {
    await page.locator('[data-slot="burger"]').click();
    await page.locator("[data-sidebar-files]").click();
  }
  await page.locator("[data-files-card]").first().waitFor({ timeout: 30_000 });
};

/** The list read in the page: its rows against each other, the region, Files, the switch and the "N more" sign. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, every read in it
const listOf = () => {
  const SLACK = 0.5;
  const files =
    document.querySelector<HTMLElement>("[data-files-sheet]") ??
    document.querySelector<HTMLElement>("[data-glass-card-frame='files-pop']");
  const grid = files?.querySelector<HTMLElement>("[data-files-cards]");
  const region = grid?.closest<HTMLElement>("[data-files-region]");
  const scroller = grid?.closest<HTMLElement>("[data-files-scroll]");
  if (!(files && grid && region && scroller)) {
    return null;
  }
  const said = (r: DOMRect) =>
    `${r.left.toFixed(1)}..${r.right.toFixed(1)}×${r.top.toFixed(1)}..${r.bottom.toFixed(1)}`;
  const filesBox = files.getBoundingClientRect();
  const regionBox = region.getBoundingClientRect();
  const misses: string[] = [];
  const rows = [...grid.querySelectorAll<HTMLElement>("[data-files-card]")];
  let last: DOMRect | null = null;
  for (const row of rows) {
    const box = row.getBoundingClientRect();
    if (last && box.top < last.bottom - SLACK) {
      misses.push(
        `${row.title}: ${said(box)} over the row above ${said(last)}`
      );
    }
    last = box;
    if (
      box.left < regionBox.left - SLACK ||
      box.right > regionBox.right + SLACK
    ) {
      misses.push(
        `${row.title}: ${said(box)} past the region ${said(regionBox)}`
      );
    }
    for (const el of row.querySelectorAll<HTMLElement>("*")) {
      const r = el.getBoundingClientRect();
      if (
        r.width > 0 &&
        r.height > 0 &&
        (r.left < box.left - SLACK || r.right > box.right + SLACK)
      ) {
        misses.push(
          `${row.title}: its ${el.tagName.toLowerCase()} ${said(r)} past the row ${said(box)}`
        );
      }
    }
  }
  const rail = region.querySelector<HTMLElement>(
    '[data-files-head] [data-slot="rail"]'
  );
  const head = rail?.closest<HTMLElement>("[data-files-head]");
  const railBox = rail?.getBoundingClientRect();
  const headBox = head?.getBoundingClientRect();
  const switchInside =
    !!railBox &&
    !!headBox &&
    railBox.left >= headBox.left - SLACK &&
    railBox.right <= headBox.right + SLACK &&
    railBox.top >= headBox.top - SLACK &&
    railBox.bottom <= headBox.bottom + SLACK &&
    railBox.right <= filesBox.right + SLACK;
  const foot = scroller.getBoundingClientRect().bottom;
  const past = rows.filter(
    (row) => row.getBoundingClientRect().bottom > foot + 1
  ).length;
  const sign =
    region.querySelector<HTMLElement>("[data-files-more]")?.dataset.filesMore ??
    "0";
  const overflow: string[] = [];
  for (const el of files.querySelectorAll<HTMLElement>("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      continue;
    }
    const style = getComputedStyle(el);
    if (r.left < filesBox.left - SLACK || r.right > filesBox.right + SLACK) {
      overflow.push(
        `${el.tagName.toLowerCase()}${el.dataset.slot ? `[${el.dataset.slot}]` : ""} ${said(r)} past Files ${said(filesBox)}`
      );
    } else if (
      ["auto", "scroll"].includes(style.overflowX) &&
      el.scrollWidth > el.clientWidth + 1
    ) {
      overflow.push(
        `${el.tagName.toLowerCase()} scrolls sideways: ${el.scrollWidth}px in ${el.clientWidth}px`
      );
    }
  }
  return {
    view: grid.dataset.filesView ?? null,
    rows: rows.length,
    tallest: Math.max(...rows.map((row) => row.getBoundingClientRect().height)),
    misses,
    switchInside,
    checked:
      region
        .querySelector('[data-rail-item][aria-checked="true"]')
        ?.getAttribute("data-rail-item") ?? null,
    past,
    sign,
    overflow,
  };
};

/**
 * 34–37: Thumbnails | List, at 390, 680 and 1440 in Chromium and WebKit with
 * one artifact and many; the choice kept through a reload and from the
 * bar's card to the drawer; a row's press; the switch's motion.
 */
const viewLegs = async (
  kit: Kit,
  base: string,
  ids: { many: string; one: string }
) => {
  for (const engine of ["chromium", "webkit"] as const) {
    for (const view of ["phone", "narrowDesk", "desk"] as const) {
      for (const count of ["one", "many"] as const) {
        await viewLeg(kit, base, engine, view, count, ids[count]);
      }
    }
  }
  await keptLeg(kit, base, ids.many);
  await rowOpensLeg(kit, base, ids.many);
  await pickLegs(kit, base, ids.many);
  await keysLegs(kit, base, ids.many);
  for (const engine of ["chromium", "webkit"] as const) {
    await panelStopLeg(kit, base, engine, ids.many);
  }
  await switchMotionLeg(kit, base, ids.many);
};

/** The card with the focus, by its artifact; null when the focus is on no card. */
const activeCard = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.matches("[data-files-cards] [data-files-card]")
      ? (el.dataset.artifact ?? null)
      : null;
  });

/**
 * Where the arrows should land, read off the cards as drawn: their ids in
 * order, and from `from`, the card directly below (the nearest top among
 * those under it whose centre stands within its width) and directly above.
 * Answers too whether `from` lies inside its scroller's view.
 */
const cardsRead = (page: Page, from: string | null) =>
  page.evaluate((id) => {
    const cards = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-files-cards] [data-files-card]"
      ),
    ];
    const at = cards.find((card) => card.dataset.artifact === id);
    const box = at?.getBoundingClientRect();
    const column = (other: DOMRect) => {
      const centre = other.left + other.width / 2;
      return !!box && centre > box.left && centre < box.right;
    };
    const nearest = (
      pick: (r: DOMRect) => boolean,
      score: (r: DOMRect) => number
    ) =>
      cards
        .filter((card) => card !== at && pick(card.getBoundingClientRect()))
        .sort(
          (a, b) =>
            score(a.getBoundingClientRect()) - score(b.getBoundingClientRect())
        )[0]?.dataset.artifact ?? null;
    const scroller = at?.closest<HTMLElement>("[data-files-scroll]");
    const view = scroller?.getBoundingClientRect();
    return {
      ids: cards.map((card) => card.dataset.artifact ?? ""),
      below: box
        ? nearest(
            (r) => column(r) && r.top >= box.bottom - 1,
            (r) => r.top
          )
        : null,
      above: box
        ? nearest(
            (r) => column(r) && r.bottom <= box.top + 1,
            (r) => -r.bottom
          )
        : null,
      inView:
        !!box &&
        !!view &&
        box.top >= view.top - 1 &&
        box.bottom <= view.bottom + 1,
      tabStops: cards.filter((card) => card.tabIndex === 0).length,
      role: document.querySelector("[data-files-cards]")?.getAttribute("role"),
      optionRoles: cards.every(
        (card) => card.getAttribute("role") === "option"
      ),
    };
  }, from);

/** Tabs from Files' search field until the focus enters the cards (at most 10); answers the card it entered on. */
const tabIntoCards = async (page: Page) => {
  await page.locator("[data-files-search] input").focus();
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press("Tab");
    const card = await activeCard(page);
    if (card) {
      return card;
    }
  }
  return null;
};

/** 39, one leg: an engine, a width, a view. The session's panel shut first, so no card is on show. */
const keysLeg = async (
  kit: Kit,
  base: string,
  engine: Engine,
  view: "desk" | "phone",
  way: "list" | "thumbnails",
  id: string
) => {
  const leg = `${engine} ${SLOT_WIDTHS[view]} ${way}`;
  const page = await openSession(
    kit,
    base,
    view,
    "light",
    id,
    undefined,
    engine
  );
  await page.evaluate(
    (session) =>
      fetch(`/api/instances/${encodeURIComponent(session)}/preview`, {
        method: "DELETE",
      }),
    id
  );
  await page
    .waitForFunction((name) => !document.querySelector(name), PANE_NAME, {
      timeout: 15_000,
    })
    .catch(() => undefined);
  await openFiles(page, view);
  await page.locator(VIEW_PICK(way)).click();
  await page
    .locator(`[data-files-cards][data-files-view="${way}"]`)
    .waitFor({ timeout: 10_000 });
  await atRest(page);

  // One Tab stop: in on the first card, out on the next Tab.
  const first = await cardsRead(page, null);
  const entered = await tabIntoCards(page);
  await page.keyboard.press("Tab");
  const leftTo = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      inCards: !!el?.closest("[data-files-cards]"),
      has: el
        ? `${el.tagName.toLowerCase()}${el.dataset.slot ? `[${el.dataset.slot}]` : ""}`
        : null,
    };
  });
  kit.check(
    `39 (${leg}): the cards are one Tab stop (a listbox of options, one tabindex 0): Tab enters on the first card with none on show, and a second Tab leaves the list`,
    first.role === "listbox" &&
      first.optionRoles &&
      first.tabStops === 1 &&
      entered === first.ids[0] &&
      !leftTo.inCards,
    `role ${first.role}, options ${first.optionRoles}, tab stops ${first.tabStops}; entered on ${entered} (first ${first.ids[0]}); the next Tab to ${JSON.stringify(leftTo)}`
  );

  // The arrows, Home and End, from the first card.
  await page.keyboard.press("Shift+Tab");
  const { ids } = first;
  const steps: { key: string; want: string | null; got: string | null }[] = [];
  const press = async (key: string, want: string | null) => {
    await page.keyboard.press(key);
    steps.push({ key, want, got: await activeCard(page) });
  };
  const [next, back] =
    way === "list" ? ["ArrowDown", "ArrowUp"] : ["ArrowRight", "ArrowLeft"];
  await press(next, ids[1] ?? ids[0] ?? null);
  await press(back, ids[0] ?? null);
  await press(back, ids[0] ?? null);
  if (way === "thumbnails") {
    const fromFirst = await cardsRead(page, ids[0] ?? null);
    await press("ArrowDown", fromFirst.below);
    const fromBelow = await cardsRead(page, fromFirst.below);
    await press("ArrowUp", fromBelow.above);
  }
  await press("End", ids.at(-1) ?? null);
  const atEnd = await cardsRead(page, ids.at(-1) ?? null);
  await press(way === "list" ? "ArrowDown" : "ArrowRight", ids.at(-1) ?? null);
  await press("Home", ids[0] ?? null);
  const missed = steps.filter((step) => step.got !== step.want);
  kit.check(
    `39 (${leg}): ${way === "list" ? "Down and Up move one card" : "Left and Right move one card, Down to the card directly below and Up back above it"}, Home and End to the first and last, stopping at the ends, End's card scrolled into view`,
    missed.length === 0 && steps.length > 0 && atEnd.inView,
    `${missed.length ? `missed ${JSON.stringify(missed)}` : `${steps.length} steps landed`}; End's card in view ${atEnd.inView}`
  );

  // Enter opens the first card; the focus on the panel's name.
  const opened = ids[0] ?? "";
  await page.keyboard.press("Enter");
  const landed = await pickLanded(page, opened);
  const focus = await panelFocus(page, opened);
  kit.check(
    `39 (${leg}): Enter opens the focused card in the session's panel, Files gone, the focus on the panel's name`,
    !landed.filesOpen &&
      landed.pane === opened &&
      focus.onName &&
      focus.visible,
    `${JSON.stringify(landed)} (opened ${opened}); focus ${JSON.stringify(focus)}`
  );

  // Files again: Tab enters on the card on show.
  await openFiles(page, view);
  await atRest(page);
  const again = await tabIntoCards(page);
  kit.check(
    `39 (${leg}): Files opened again, Tab enters the list on the card on show`,
    again === opened,
    `entered on ${again}, on show ${opened}`
  );
  await sweep(page, `keys ${leg}`);
  await page.close();
};

/**
 * 40: the drawer at 390 (Chromium and WebKit): from the Artifacts segment,
 * Tab goes to the view switch and then the first card, never to the
 * segment's panel, which holds them and so takes no Tab stop of its own
 * (W3C APG, Tabs Pattern, note 4).
 */
const panelStopLeg = async (
  kit: Kit,
  base: string,
  engine: Engine,
  id: string
) => {
  const page = await openSession(
    kit,
    base,
    "phone",
    "light",
    id,
    undefined,
    engine
  );
  await openFiles(page, "phone");
  await atRest(page);
  await page.locator('[data-files-segment="artifacts"]').focus();
  const where = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) {
        return "none";
      }
      if (el.getAttribute("role") === "tabpanel") {
        return "tabpanel";
      }
      if (el.matches("[data-files-cards] [data-files-card]")) {
        return `card ${el.dataset.artifact ?? ""}`;
      }
      if (el.hasAttribute("data-rail-item")) {
        return `switch ${el.getAttribute("data-rail-item")}`;
      }
      if (el.hasAttribute("data-files-segment")) {
        return `segment ${el.getAttribute("data-files-segment")}`;
      }
      return el.localName;
    });
  const path = [await where()];
  for (let i = 0; i < 4 && !path.at(-1)?.startsWith("card"); i += 1) {
    await page.keyboard.press("Tab");
    path.push(await where());
  }
  const read = await page.evaluate(() => ({
    first:
      document.querySelector<HTMLElement>(
        "[data-files-cards] [data-files-card]"
      )?.dataset.artifact ?? null,
    panel: document
      .querySelector('[data-files-region="artifacts"][role="tabpanel"]')
      ?.getAttribute("tabindex"),
  }));
  kit.check(
    `40 (${engine} 390): in the drawer, Tab from the Artifacts segment goes to the view switch, then the first card, never stopping on the segment's panel (its tabindex -1)`,
    path[0] === "segment artifacts" &&
      path[1]?.startsWith("switch") === true &&
      path[2] === `card ${read.first}` &&
      !path.includes("tabpanel") &&
      read.panel === "-1",
    `path ${JSON.stringify(path)}; first card ${read.first}; panel tabindex ${read.panel}`
  );
  await sweep(page, `panel stop ${engine} 390`);
  await page.close();
};

/** 39: Chromium and WebKit, 1440 and 390, the list and thumbnails. */
const keysLegs = async (kit: Kit, base: string, id: string) => {
  for (const engine of ["chromium", "webkit"] as const) {
    for (const view of ["desk", "phone"] as const) {
      for (const way of ["list", "thumbnails"] as const) {
        await keysLeg(kit, base, engine, view, way, id);
      }
    }
  }
};

/** One of 34's legs: an engine, a width, one artifact or many. */
const viewLeg = async (
  kit: Kit,
  base: string,
  engine: Engine,
  view: keyof typeof SLOT_WIDTHS,
  count: "one" | "many",
  id: string
) => {
  const leg = `${engine} ${SLOT_WIDTHS[view]} ${count}`;
  const page = await openSession(
    kit,
    base,
    view,
    "light",
    id,
    undefined,
    engine
  );
  await openFiles(page, view);
  await page.locator(VIEW_PICK("list")).click();
  await page
    .locator('[data-files-cards][data-files-view="list"]')
    .waitFor({ timeout: 10_000 });
  // The slide played out, and the sign's count read after it.
  await filesAtRest(page);
  const list = await page.evaluate(listOf);
  kit.check(
    `34 (${leg}): in the list, one row each (${count === "one" ? 1 : MANY}), no row over another, nothing a row draws past its row or the region, the switch inside the Artifacts head and Files, its List checked`,
    !!list &&
      list.view === "list" &&
      list.rows === (count === "one" ? 1 : MANY) &&
      list.misses.length === 0 &&
      list.switchInside &&
      list.checked === "list",
    list
      ? `${list.rows} rows, the tallest ${list.tallest.toFixed(1)}px, switch inside ${list.switchInside}, checked ${list.checked}; ${list.misses.slice(0, 4).join(" | ") || "none past"}`
      : "Files' list not found"
  );
  kit.check(
    `34 (${leg}): the list's "N more" sign counts the rows below the fold, and an overflow scan of Files totals zero`,
    !!list &&
      list.sign === String(list.past) &&
      (count === "one" || list.past > 0) &&
      list.overflow.length === 0,
    list
      ? `${list.past} rows past the foot, the sign says ${list.sign}; ${list.overflow.length} past Files${list.overflow.length ? `: ${list.overflow.slice(0, 4).join(" | ")}` : ""}`
      : "Files not found"
  );
  await sweep(page, `list ${leg}`);
  await page.locator(VIEW_PICK("thumbnails")).click();
  await page
    .locator('[data-files-cards][data-files-view="thumbnails"]')
    .waitFor({ timeout: 10_000 });
  await filesAtRest(page);
  const back = await page.evaluate(slotsOf);
  kit.check(
    `34 (${leg}): back in thumbnails every card lies inside its slot again, and an overflow scan of Files totals zero`,
    !!back &&
      back.cards === (count === "one" ? 1 : MANY) &&
      back.misses.length === 0 &&
      back.overflow.length === 0,
    back
      ? `${back.cards} cards in ${back.columns} columns; ${[...back.misses, ...back.overflow].slice(0, 4).join(" | ") || "none past"}`
      : "Files' cards not found"
  );
  await page.close();
};

/** 35: the list picked on the bar's card, the page reloaded, then at a phone's width. */
const keptLeg = async (kit: Kit, base: string, id: string) => {
  const page = await openSession(kit, base, "desk", "light", id);
  await openFiles(page, "desk");
  await page.locator(VIEW_PICK("list")).click();
  await page
    .locator('[data-files-cards][data-files-view="list"]')
    .waitFor({ timeout: 10_000 });
  await page.reload();
  await page.locator('[data-slot="pane"]').first().waitFor({ timeout: 60_000 });
  await openFiles(page, "desk");
  const onDesk = await page.evaluate(() => ({
    view:
      document.querySelector<HTMLElement>("[data-files-cards]")?.dataset
        .filesView ?? null,
    checked:
      document
        .querySelector(
          '[data-files-head] [data-rail-item][aria-checked="true"]'
        )
        ?.getAttribute("data-rail-item") ?? null,
  }));
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('[data-slot="pane"]').first().waitFor({ timeout: 60_000 });
  await openFiles(page, "phone");
  const inDrawer = await page.evaluate(() => ({
    drawer: !!document.querySelector("[data-files-sheet]"),
    view:
      document.querySelector<HTMLElement>(
        "[data-files-sheet] [data-files-cards]"
      )?.dataset.filesView ?? null,
  }));
  kit.check(
    "35: List picked on the bar's card survives a reload (the card opens on it, List checked) and holds in the phone's drawer",
    onDesk.view === "list" &&
      onDesk.checked === "list" &&
      inDrawer.drawer &&
      inDrawer.view === "list",
    `desk after reload ${JSON.stringify(onDesk)}; drawer ${JSON.stringify(inDrawer)}`
  );
  await page.close();
};

/** 36: in the list, a row's press opens its artifact as a card's does (7); Files opened again marks it the one on show. */
const rowOpensLeg = async (kit: Kit, base: string, id: string) => {
  const page = await openSession(kit, base, "desk", "light", id);
  await openFiles(page, "desk");
  await page.locator(VIEW_PICK("list")).click();
  const row = page.locator(
    `[data-files-cards][data-files-view="list"] [data-files-card][title="${PRICING}"]`
  );
  const rowId = (await row.getAttribute("data-artifact")) ?? "";
  await row.click();
  const landed = await pickLanded(page, rowId);
  await openFiles(page, "desk");
  await atRest(page);
  const opened = await page.evaluate(() => ({
    current:
      document.querySelector<HTMLElement>(
        '[data-files-card][aria-selected="true"]'
      )?.title ?? null,
    view:
      document.querySelector<HTMLElement>("[data-files-cards]")?.dataset
        .filesView ?? null,
  }));
  kit.check(
    "36: a row's press opens its artifact as its card's does (the session's panel shows it, Files goes); Files opened again is still the list, the row the one on show",
    !(landed.filesOpen || landed.float) &&
      landed.pane === rowId &&
      opened.current === PRICING &&
      opened.view === "list",
    `${JSON.stringify(landed)} (picked ${rowId}); again ${JSON.stringify(opened)}`
  );
  await page.close();
};

/**
 * Every surface that could stand over the page after a pick, as a
 * MutationObserver and each frame see it: Files (its card or its drawer),
 * a floating copy of the artifact, and any kit floating surface open
 * (popover, hover card, menu, tooltip). Started in the page; read back by
 * `surfacesSeen`, each with the time it first showed.
 */
const watchSurfaces = (page: Page) =>
  page.evaluate(() => {
    const SURFACES =
      "[data-glass-card-frame='files-pop'][data-state='open'], [data-files-sheet], [data-files-float], [data-state='open'][data-slot$='-content']:not([data-preview-sheet] *):not([data-preview-sheet])";
    const w = window as unknown as {
      probeSurfaces: string[];
      probeStop: () => void;
    };
    const seen = new Set<string>();
    w.probeSurfaces = [];
    const t0 = performance.now();
    const look = () => {
      for (const el of document.querySelectorAll<HTMLElement>(SURFACES)) {
        const name = `${el.tagName.toLowerCase()}[${el.dataset.slot ?? ""}${el.dataset.glassCardFrame ?? ""}${el.hasAttribute("data-files-sheet") ? "files-sheet" : ""}${el.hasAttribute("data-files-float") ? "files-float" : ""}]`;
        if (!seen.has(name)) {
          seen.add(name);
          w.probeSurfaces.push(
            `${name} at +${Math.round(performance.now() - t0)}ms`
          );
        }
      }
    };
    const observer = new MutationObserver(look);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    let frame = requestAnimationFrame(function each() {
      look();
      frame = requestAnimationFrame(each);
    });
    look();
    w.probeStop = () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });

const surfacesSeen = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      probeSurfaces: string[];
      probeStop: () => void;
    };
    w.probeStop();
    return w.probeSurfaces;
  });

/** How long the page is watched for a surface the pick should never bring: the owner's "keeps hovering" came within it. */
const AFTER_PICK_MS = 2000;

/**
 * 38, one leg: an engine, a width, the pointer or the keyboard. The
 * session's panel shut first, so the pick is what opens it.
 */
const pickLeg = async (
  kit: Kit,
  base: string,
  engine: Engine,
  view: "desk" | "phone",
  by: "pointer" | "keyboard",
  id: string
) => {
  const leg = `${engine} ${SLOT_WIDTHS[view]} ${by}`;
  const page = await openSession(
    kit,
    base,
    view,
    "light",
    id,
    undefined,
    engine
  );
  await page.evaluate(
    (session) =>
      fetch(`/api/instances/${encodeURIComponent(session)}/preview`, {
        method: "DELETE",
      }),
    id
  );
  await page
    .waitForFunction((name) => !document.querySelector(name), PANE_NAME, {
      timeout: 15_000,
    })
    .catch(() => undefined);
  if (by === "keyboard" && view === "desk") {
    await page.locator("[data-files-control]").focus();
    await page.keyboard.press("Enter");
    await page
      .locator("[data-files-card]")
      .first()
      .waitFor({ timeout: 30_000 });
  } else {
    await openFiles(page, view);
  }
  await atRest(page);
  const card = page.locator(`[data-files-card][title="${PRICING}"]`);
  const wanted = (await card.getAttribute("data-artifact")) ?? "";
  if (by === "pointer") {
    // The real pointer rests on the card, as the owner's did, then presses it.
    await card.scrollIntoViewIfNeeded();
    await atRest(page);
    const box = await card.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
        steps: 4,
      });
    }
    await page.waitForTimeout(600);
    await page.mouse.down();
    await page.mouse.up();
  } else {
    // The focus on the card (a Tab stop; Files' cards take no arrows), then Enter.
    await card.focus();
    await page.keyboard.press("Enter");
  }
  const landed = await pickLanded(page, wanted);
  if (by === "keyboard") {
    const focus = await panelFocus(page, wanted);
    kit.check(
      `38 (${leg}): after the Enter pick the focus lands on the panel's name ([data-artifact-trigger] for ${PRICING}, :focus-visible) and stays there`,
      focus.onName && focus.visible,
      JSON.stringify(focus)
    );
  }
  // The pointer off Files' place, onto the transcript; then the page
  // watched for what the pick should never bring back.
  await watchSurfaces(page);
  if (by === "pointer") {
    const size = page.viewportSize() ?? { width: 390, height: 844 };
    await page.mouse.move(size.width * 0.25, size.height * 0.5, { steps: 6 });
  }
  await page.waitForTimeout(AFTER_PICK_MS);
  const surfaced = await surfacesSeen(page);
  const paneAfter = await paneShows(page);
  kit.check(
    `38 (${leg}): the pick shows ${PRICING} in the session's panel and Files goes; for ${AFTER_PICK_MS} ms after, the pointer ${by === "pointer" ? "moved off" : "untouched"}, no Files surface, floating copy or hover surface opens, and the panel still shows it`,
    !(landed.filesOpen || landed.float) &&
      landed.pane === wanted &&
      surfaced.length === 0 &&
      paneAfter === wanted,
    `landed ${JSON.stringify(landed)} (picked ${wanted}); surfaces ${JSON.stringify(surfaced)}; panel after ${paneAfter}`
  );
  if (view === "desk") {
    // Escape, then a press outside (on the transcript): nothing of the
    // pick's to dismiss, and the panel stays.
    await watchSurfaces(page);
    await page.keyboard.press("Escape");
    const size = page.viewportSize() ?? { width: 1440, height: 900 };
    await page.mouse.click(size.width * 0.25, size.height * 0.5);
    await page.waitForTimeout(SEND_WINDOW_MS);
    const dismissed = await surfacesSeen(page);
    const paneKept = await paneShows(page);
    kit.check(
      `38 (${leg}): Escape and a press outside leave the session's panel showing ${PRICING}, and open nothing`,
      paneKept === wanted && dismissed.length === 0,
      `panel ${paneKept}; surfaces ${JSON.stringify(dismissed)}`
    );
  }
  await sweep(page, `pick ${leg}`);
  await page.close();
};

/** 38: the owner's report, in Chromium and WebKit, at 1440 and 390, by the pointer and the keyboard. */
const pickLegs = async (kit: Kit, base: string, id: string) => {
  for (const engine of ["chromium", "webkit"] as const) {
    for (const view of ["desk", "phone"] as const) {
      for (const by of ["pointer", "keyboard"] as const) {
        await pickLeg(kit, base, engine, view, by, id);
      }
    }
  }
};

/** The first rows' boxes, read for 37. */
const firstBoxes = () =>
  [...document.querySelectorAll<HTMLElement>("[data-files-card]")]
    .slice(0, 6)
    .map((one) => {
      const r = one.getBoundingClientRect();
      return { id: one.dataset.artifact ?? "", x: r.left, y: r.top };
    });

/** 37: the switch's motion on the clock (Chromium's Animation domain), then with less motion. */
const switchMotionLeg = async (kit: Kit, base: string, id: string) => {
  const page = await openSession(kit, base, "desk", "light", id);
  await openFiles(page, "desk");
  await page.waitForTimeout(900);
  const before = await page.evaluate(firstBoxes);
  const sliding = await readMotion(
    page,
    () => page.locator(VIEW_PICK("list")).click(),
    "[data-files-cards]",
    { fractions: [0, 0.5, 1], read: () => page.evaluate(firstBoxes) }
  );
  await page.waitForTimeout(300);
  const after = await page.evaluate(firstBoxes);
  const slides = sliding.runs.filter((one) =>
    one.target.includes("data-files-card")
  );
  const clocks = new Set(
    slides.map((one) => `${one.start} ${Math.round(one.end)} ${one.easing}`)
  );
  const near = (
    read: { id: string; x: number; y: number }[] | undefined,
    want: { id: string; x: number; y: number }[]
  ) =>
    !!read &&
    want.every((one, i) => {
      const at = read[i];
      return (
        at?.id === one.id &&
        Math.abs(at.x - one.x) <= 1.5 &&
        Math.abs(at.y - one.y) <= 1.5
      );
    });
  const start = sliding.at.find((one) => one.fraction === 0)?.value;
  const end = sliding.at.find((one) => one.fraction === 1)?.value;
  const moved = before.some(
    (one, i) =>
      Math.abs(one.x - (after[i]?.x ?? one.x)) > 4 ||
      Math.abs(one.y - (after[i]?.y ?? one.y)) > 4
  );
  kit.check(
    "37a: Thumbnails to List: every row slides on one clock (one start, length and curve), from its card's place at 0 to its row's at 1",
    sliding.by === "clock" &&
      slides.length >= before.length &&
      clocks.size === 1 &&
      moved &&
      near(start, before) &&
      near(end, after),
    `${slides.length} slides on ${clocks.size} clock(s) ${JSON.stringify([...clocks])}; before ${JSON.stringify(before.slice(0, 2))}, at 0 ${JSON.stringify(start?.slice(0, 2))}, at 1 ${JSON.stringify(end?.slice(0, 2))}, after ${JSON.stringify(after.slice(0, 2))}`
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const still = await readMotion(
    page,
    () => page.locator(VIEW_PICK("thumbnails")).click(),
    "[data-files-cards]",
    { ms: 2000 }
  );
  const travels = still.runs.filter(
    (one) =>
      one.target.includes("data-files-card") && one.name.includes("translate")
  );
  kit.check(
    "37b: with less motion, List to Thumbnails moves nothing: no row travels",
    travels.length === 0,
    `${still.runs.length} runs, ${travels.length} travelling: ${JSON.stringify(still.runs.slice(0, 3))}`
  );
  await page.close();
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "files-panel",
  run,
};
export default spec;
