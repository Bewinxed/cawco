/**
 * The delegate tray's row (transcript/DelegateTray), on its bench
 * (/motion/delegate-tray, no hub: the real SessionPane and the composer
 * lent to it, twelve delegates running, starting, waiting on a heavy-run
 * slot and queued behind owned files, a plan of eight steps), on the desk.
 * Owner: "why the delegate chips here show +9 even though there's space
 * for them to show up?", with the open fan's queued chips' state running
 * past their edge.
 *
 *  - the row holds every chip that fits: the chips shown, their gaps and
 *    "+N" stand inside the row's width, and the first folded chip, at its
 *    least (its title cut to eight characters, its state to twelve, the
 *    rest whole), would not fit beside them (geometry);
 *  - every chip's title and state stand inside its chip, before its state
 *    glyph, cut with an ellipsis when they do not fit, in the row and in
 *    what "+N" opens (geometry, engine).
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each in-page reading walks the row's chips and parts in order.
import type { Page } from "playwright-core";
import { type Kit, open, type Spec, settle } from "../../kit";

const ROUTE = "/motion/delegate-tray";
/** The bench's delegates in the order they were made: title and state text. */
const WORK: [string, string][] = [
  ["Restore tab feet, Chrome-style", ""],
  [
    "Bake the decision page kit",
    "queued for a heavy-run slot behind 2 checks, 4m",
  ],
  [
    "Profile the board's first paint",
    "queued for a heavy-run slot behind 2 checks, 4m",
  ],
  ["Port the plan ring to iOS", ""],
  ["Measure transcript pin drift", ""],
  [
    "Restyle the effort chip",
    "queued: owns apps/dashboard/src/lib/cawco/effort/**",
  ],
  ["Sweep stale workspaces", ""],
  [
    "Check the Telegram bridge auth",
    "queued for a heavy-run slot behind 2 checks, 4m",
  ],
  ["Index the delegate events", ""],
  ["Cache the machine list", ""],
  [
    "Split the session card",
    "queued: owns apps/dashboard/src/lib/cawco/card/**",
  ],
  ["Fix the skeleton sweep", ""],
];
/** The least a chip shows of each, in characters, and the least chip. */
const TITLE_LEAST = 8;
const NOTE_LEAST = 12;
const CHIP_LEAST = 120;

/** The row: its width, the chips in it, and the least width of the first folded one. */
const rowNow = (page: Page) =>
  page.evaluate(
    ({ work, titleLeast, noteLeast, chipLeast }) => {
      const row = document.querySelector<HTMLElement>(".tray .row");
      if (!row) {
        return null;
      }
      const chips = [...row.querySelectorAll<HTMLElement>("[data-key]")].filter(
        (chip) =>
          !chip.closest(".fan") &&
          chip.checkVisibility({ opacityProperty: true })
      );
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      const widths = chips.map((chip) => chip.getBoundingClientRect().width);
      const used =
        widths.reduce((sum, width) => sum + width, 0) +
        gap * Math.max(0, chips.length - 1);
      const more = chips.find((chip) => chip.dataset.key === "more");
      const delegates = chips.filter((chip) => chip.dataset.key !== "more");
      const folded = more ? Number(more.textContent?.replace("+", "") ?? 0) : 0;

      // Each chip at its least, by the tray's rule, in the shown chips' own
      // faces and spaces.
      const [sample] = delegates;
      const title = document.querySelector<HTMLElement>(".tray .title");
      const note = document.querySelector<HTMLElement>(".tray .note");
      const ruler = document.createElement("canvas").getContext("2d");
      const least = (
        text: string,
        chars: number,
        face: HTMLElement | null
      ): number => {
        if (!(ruler && face && text)) {
          return 0;
        }
        const s = getComputedStyle(face);
        ruler.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
        const shown = text.length > chars ? `${text.slice(0, chars)}…` : text;
        return Math.ceil(ruler.measureText(shown).width) + 1;
      };
      // Each delegate's chip at its least, by the bench's order.
      const leasts: number[] = [];
      if (sample) {
        const chipStyle = getComputedStyle(sample);
        const words = sample.querySelector<HTMLElement>(".words");
        const wordsGap = words
          ? Number.parseFloat(getComputedStyle(words).columnGap) || 0
          : 0;
        const inner = Number.parseFloat(chipStyle.columnGap) || 0;
        const pad =
          Number.parseFloat(chipStyle.paddingInlineStart) +
          Number.parseFloat(chipStyle.paddingInlineEnd);
        const mark =
          sample.querySelector<HTMLElement>(".mark")?.offsetWidth ?? 0;
        const slot =
          sample.querySelector<HTMLElement>(".slot")?.offsetWidth ?? 0;
        for (const [name, state] of work) {
          const text =
            least(name, titleLeast, title) +
            (state ? wordsGap + least(state, noteLeast, note) : 0);
          leasts.push(
            Math.max(
              chipLeast,
              Math.ceil(pad + mark + inner + text + inner + slot)
            )
          );
        }
      }
      return {
        room: row.clientWidth,
        used,
        gap,
        shown: delegates.length,
        folded,
        moreWidth: more?.getBoundingClientRect().width ?? 0,
        leasts,
        texts: chips.map((chip) =>
          chip.textContent?.replace(/\s+/g, " ").trim()
        ),
      };
    },
    {
      work: WORK,
      titleLeast: TITLE_LEAST,
      noteLeast: NOTE_LEAST,
      chipLeast: CHIP_LEAST,
    }
  );

/** Every drawn chip whose title or state leaves its box, runs under its glyph, or is cut with no ellipsis. */
const spills = (page: Page) =>
  page.evaluate(() => {
    const bad: string[] = [];
    for (const chip of document.querySelectorAll<HTMLElement>(
      ".tray [data-key]"
    )) {
      if (
        !chip.checkVisibility({
          opacityProperty: true,
          visibilityProperty: true,
        })
      ) {
        continue;
      }
      const box = chip.getBoundingClientRect();
      const glyph = chip.querySelector(".slot")?.getBoundingClientRect();
      for (const part of chip.querySelectorAll<HTMLElement>(".title, .note")) {
        const text = part.getBoundingClientRect();
        const s = getComputedStyle(part);
        const cut = part.scrollWidth > part.clientWidth + 0.5;
        const inside =
          text.left >= box.left - 0.5 &&
          text.right <= box.right + 0.5 &&
          (!glyph || text.right <= glyph.left + 0.5);
        // `clip` as well as `hidden`: DESIGN.md's Mark Line Rule (99e56fc00, "A run that truncates clips with `overflow: clip`, never `hidden`"), and every engine draws the ellipsis under it (WebKit 258265, fixed in 265445@main).
        const ellipsed =
          !cut ||
          ((s.overflowX === "hidden" || s.overflowX === "clip") &&
            s.textOverflow === "ellipsis");
        if (!(inside && ellipsed)) {
          bad.push(
            `${chip.dataset.key} .${part.className.split(" ")[0]}: text ${Math.round(text.left)}–${Math.round(text.right)} in chip ${Math.round(box.left)}–${Math.round(box.right)}, glyph at ${glyph ? Math.round(glyph.left) : "-"}, cut ${cut} ellipsis ${ellipsed}`
          );
        }
      }
    }
    return bad;
  });

async function desk(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk");
  await open(
    page,
    `${base}${ROUTE}`,
    () => !!document.querySelector(".tray .row [data-key]")
  );
  await settle(page, 600);
  const row = await rowNow(page);
  kit.check(
    "desk: the chips shown, their gaps and '+N' stand inside the row's width",
    !!row && row.used <= row.room + 0.5,
    JSON.stringify(row)
  );
  // The shown chips and the first folded one, each at its least, with their
  // gaps, and "+N" unless that one was the last folded.
  const withNext = row
    ? row.leasts
        .slice(0, row.shown + 1)
        .reduce((sum, width) => sum + width, 0) +
      row.gap * row.shown +
      (row.folded > 1 ? row.moreWidth + row.gap : 0)
    : 0;
  kit.check(
    "desk: the row holds every chip that fits: one more, every chip at its least, would not",
    !!row && (row.folded === 0 || withNext > row.room),
    `shown ${row?.shown}, +${row?.folded}, room ${row?.room}px, with the next at their least ${withNext}px (${row?.leasts.slice(0, (row?.shown ?? 0) + 1).join(" + ")})`
  );
  kit.check(
    "desk: more than one chip stands in the row",
    !!row && row.shown > 1,
    JSON.stringify(row?.texts)
  );
  const inRow = await spills(page);
  kit.check(
    "desk: every chip's title and state stand inside it, before its glyph, cut with an ellipsis",
    inRow.length === 0,
    inRow.join("; ")
  );
  // What "+N" opens: its chips' text too.
  await page.locator('.tray [data-key="more"]').click();
  await settle(page, 600);
  const opened = await spills(page);
  kit.check(
    "desk: opened from '+N', every chip's text stands inside its chip",
    opened.length === 0,
    opened.join("; ")
  );
}

/** The bench's conversation (its +page.svelte `ID`), read off its composer's tray. */
const benchId = (page: Page) =>
  page.evaluate(
    () =>
      Object.values(
        (
          globalThis as unknown as {
            __cawcoDebug: {
              state: {
                workItems: Record<string, { parentInstanceId: string }>;
              };
            };
          }
        ).__cawcoDebug.state.workItems
      )[0]?.parentInstanceId ?? null
  );

/**
 * Where the preview sheet's foot stands, and the composer's top as drawn:
 * the tray row's chips' top, or the pill's with none drawn on it. The empty
 * suggestion row's top is read too, the box the sheet once stood on.
 */
const sheetFoot = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector<HTMLElement>(".preview-sheet-host");
    const dock = document.querySelector<HTMLElement>(".leaf > .dock .dock");
    if (!(host && dock)) {
      return null;
    }
    const drawn = { opacityProperty: true, visibilityProperty: true };
    const chips = [
      ...dock.querySelectorAll<HTMLElement>(".lift .kit-tray-chip"),
    ].filter(
      (chip) =>
        chip.checkVisibility(drawn) && chip.getBoundingClientRect().height > 0
    );
    const pill = dock.querySelector<HTMLElement>(":scope > .composer");
    const suggest = dock.querySelector<HTMLElement>(".suggest");
    return {
      chips: chips.length,
      edge:
        chips.length > 0
          ? Math.min(...chips.map((chip) => chip.getBoundingClientRect().top))
          : (pill?.getBoundingClientRect().top ?? null),
      foot: host.getBoundingClientRect().bottom,
      suggestTop: suggest?.getBoundingClientRect().top ?? null,
    };
  });

/**
 * The preview drawer as drawn: the part of it its host shows (the host
 * clips what stands below the composer), and the ask card's box if one is
 * up.
 */
const drawerNow = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector<HTMLElement>(".preview-sheet-host");
    const drawer = document.querySelector<HTMLElement>(
      ".preview-sheet[data-vaul-drawer]"
    );
    if (!(host && drawer)) {
      return null;
    }
    const clip = host.getBoundingClientRect();
    const box = drawer.getBoundingClientRect();
    const top = Math.max(box.top, clip.top);
    const bottom = Math.min(box.bottom, clip.bottom);
    const ask = document.querySelector<HTMLElement>(".leaf > .dock .dock .ask");
    const card = ask?.checkVisibility({
      opacityProperty: true,
      visibilityProperty: true,
    })
      ? ask.getBoundingClientRect()
      : null;
    const style = ask ? getComputedStyle(ask) : null;
    return {
      ask: card ? { bottom: card.bottom, top: card.top } : null,
      // The card as it stands, drawn or not, and the sheet's own state.
      askBox: ask
        ? `top ${Math.round(ask.getBoundingClientRect().top)} opacity ${style?.opacity} ${style?.visibility} animations ${ask.getAnimations({ subtree: true }).length}`
        : "none",
      bottom,
      height: Math.max(0, bottom - top),
      host: `${host.style.height} snap ${host.dataset.activeSnap}`,
      top,
    };
  });

/** A permission parked on the bench's conversation, as the hub parks one; and taken back. */
const ASK_ID = "bench-ask";
const raiseAsk = (page: Page, instanceId: string | null) =>
  page.evaluate(
    ({ instanceId: id, requestId }) => {
      const debug = (
        globalThis as unknown as {
          __cawcoDebug: {
            state: { sessions: Record<string, { pending: unknown[] }> };
          };
        }
      ).__cawcoDebug;
      debug.state.sessions[id ?? ""]?.pending.push({
        heard: Date.now(),
        input: { command: "bun run check", description: "Run the checks" },
        instanceId: id,
        // The bench's conversation is no live row (no hub): an ask with no
        // origin there would be taken for one made in no conversation, its
        // pane the ask's card alone (SessionPane `askAlone`), closed once
        // answered. Made in this conversation, as a session's own ask is.
        originInstanceId: id,
        presentation: {
          asker: "Bench",
          changes: [],
          command: "bun run check",
          fields: [],
          summary: "Run the checks",
        },
        raisedAt: Date.now(),
        requestId,
        toolName: "Bash",
      });
    },
    { instanceId, requestId: ASK_ID }
  );
const answerAsk = (page: Page, instanceId: string | null) =>
  page.evaluate(
    ({ instanceId: id, requestId }) => {
      const session = (
        globalThis as unknown as {
          __cawcoDebug: {
            state: {
              sessions: Record<string, { pending: { requestId: string }[] }>;
            };
          };
        }
      ).__cawcoDebug.state.sessions[id ?? ""];
      if (session) {
        session.pending = session.pending.filter(
          (one) => one.requestId !== requestId
        );
      }
    },
    { instanceId, requestId: ASK_ID }
  );

/** The tab a folded drawer keeps: its grabber's touch area (SideSheet `TAB`). */
const TAB_PX = 44;

/**
 * An ask raised under the open drawer (a question or a permission is the
 * reader's to answer): the drawer folds to its tab, clear of the ask's card;
 * opened from the tab meanwhile it stands on the card's top; and once the
 * ask is answered it stands where it stood.
 */
async function overAsk(
  kit: Kit,
  page: Page,
  width: number | undefined,
  id: string | null
): Promise<void> {
  const before = await drawerNow(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message.split("\n")[0]));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text().split("\n").slice(0, 3).join(" / "));
    }
  });
  await raiseAsk(page, id);
  await page
    .waitForSelector(".leaf > .dock .dock.asking", { timeout: 10_000 })
    .catch(async () => {
      const seen = await page.evaluate((instanceId) => {
        const session = (
          globalThis as unknown as {
            __cawcoDebug: {
              state: { sessions: Record<string, { pending: unknown[] }> };
            };
          }
        ).__cawcoDebug.state.sessions[instanceId ?? ""];
        const dock = document.querySelector(".leaf > .dock .dock");
        return `pending ${session?.pending.length ?? "no session"}, .ask ${!!dock?.querySelector(".ask")}, composer "${dock?.getAttribute("class")}"`;
      }, id);
      throw new Error(
        `no ask raised on the composer: ${seen}, at ${page.url()}; page errors: ${errors.join(" | ") || "none"}; the page reads "${(await page.evaluate(() => document.body.innerText)).slice(0, 160)}"`
      );
    });
  await settle(page, 1200);
  const folded = await drawerNow(page);
  kit.check(
    `${width}px: an ask raised, the drawer folds to its tab, clear of the ask's card`,
    !!folded?.ask &&
      Math.abs(folded.height - TAB_PX) <= 1 &&
      folded.bottom <= folded.ask.top + 0.5,
    JSON.stringify({ before, folded })
  );
  // The tab's grabber pressed: its click, which a tap on it sends (vaul's
  // handle, SideSheet `cycleSnap`). The bench is a fixed layer over the
  // whole window (its `.bench`, at the top of the stack) and the drawer is
  // portalled under it to the body, so a finger at the grabber's place
  // lands on the bench's transcript; on the app's page the drawer stands
  // over the pane, where preview-touch taps it.
  await page.evaluate(() =>
    document.querySelector<HTMLElement>(".preview-sheet .preview-grab")?.click()
  );
  await settle(page, 1200);
  const opened = await drawerNow(page);
  kit.check(
    `${width}px: opened from its tab under an ask, the drawer's foot stands on the ask card's top`,
    !!opened?.ask &&
      opened.height > TAB_PX + 1 &&
      Math.abs(opened.bottom - opened.ask.top) <= 0.5,
    JSON.stringify(opened)
  );
  await answerAsk(page, id);
  await page.waitForFunction(
    () => !document.querySelector(".leaf > .dock .dock.asking"),
    undefined,
    { timeout: 10_000 }
  );
  await settle(page, 1200);
  const after = await drawerNow(page);
  kit.check(
    `${width}px: the ask answered, the drawer stands at the height it had`,
    !!before &&
      !!after &&
      after.ask === null &&
      Math.abs(after.height - before.height) <= 1 &&
      Math.abs(after.bottom - before.bottom) <= 0.5,
    JSON.stringify({
      after,
      before,
      composer: await page.evaluate(
        () => document.querySelector(".leaf > .dock .dock")?.className ?? null
      ),
      errors,
    })
  );
}

/**
 * The preview sheet on a phone stands on the composer as drawn (owner:
 * "Thr drawer tab on the web app mobile view starts its bottom above the
 * delegate chips, buggy"): its foot on the chips' top while the tray row
 * shows them, on the pill's once it shows none.
 */
async function phone(
  kit: Kit,
  base: string,
  view: "phone" | "phoneWide"
): Promise<void> {
  const page = await kit.page(view);
  const width = page.viewportSize()?.width;
  // Suggestions on, as the owner has them: the composer keeps their row
  // laid out over the tray row, empty until a draft asks.
  await page.route("**/api/jev", (route) =>
    route.fulfill({ json: { route: "bench", suggestWhileTyping: true } })
  );
  await open(
    page,
    `${base}${ROUTE}`,
    () => !!document.querySelector(".tray .row [data-key]")
  );
  await settle(page, 600);
  const id = await benchId(page);
  // The agent showing a preview, as the hub's frame would say it.
  await page.evaluate((instanceId) => {
    const debug = (
      globalThis as unknown as {
        __cawcoDebug: { state: { previews: Record<string, unknown> } };
      }
    ).__cawcoDebug;
    debug.state.previews[instanceId ?? ""] = {
      artifact: { id: "bench-preview", kind: "page", name: "bench" },
      instanceId,
      kind: "preview",
      revision: "1",
      state: "open",
    };
  }, id);
  await page.waitForSelector(".preview-sheet-host", { timeout: 10_000 });
  await settle(page, 800);
  const shown = await sheetFoot(page);
  kit.check(
    `${width}px: with the delegate chips, under an empty suggestion row, the preview sheet's foot stands on their top`,
    !!shown &&
      shown.chips > 0 &&
      shown.suggestTop !== null &&
      shown.edge !== null &&
      shown.suggestTop < shown.edge &&
      Math.abs(shown.foot - shown.edge) <= 0.5,
    JSON.stringify(shown)
  );
  await overAsk(kit, page, width, id);
  // The delegates done and the plan gone: nothing on the tray row.
  await page.evaluate((instanceId) => {
    const debug = (
      globalThis as unknown as {
        __cawcoDebug: {
          state: {
            plans: Record<string, unknown>;
            workItems: Record<string, unknown>;
          };
        };
      }
    ).__cawcoDebug;
    for (const key of Object.keys(debug.state.workItems)) {
      delete debug.state.workItems[key];
    }
    delete debug.state.plans[instanceId ?? ""];
  }, id);
  await settle(page, 800);
  const bare = await sheetFoot(page);
  kit.check(
    `${width}px: with no chips on the tray row, the preview sheet's foot stands on the pill's top`,
    !!bare &&
      bare.chips === 0 &&
      bare.edge !== null &&
      Math.abs(bare.foot - bare.edge) <= 0.5,
    JSON.stringify(bare)
  );
  await page.close();
}

const spec: Spec = {
  name: "delegate-tray",
  async run(kit) {
    const base = await kit.bench();
    await desk(kit, base);
    await phone(kit, base, "phone");
    await phone(kit, base, "phoneWide");
  },
};
export default spec;
