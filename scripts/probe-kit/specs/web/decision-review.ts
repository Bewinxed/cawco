/**
 * The decision host's answers to the X7 design review (cawco-audit
 * X7-decisions, 04c683a9c), each read once by the engine on the pages its
 * captures draw (decision-embeds.ts `openCapturePage`), at 1440 light under
 * a mouse and 390 dark under a finger:
 *
 * 1. Every chip of an options row stands at one y, whether or not a badge
 *    wrapped beside it; "Add a note"'s first letter on the card's text edge.
 * 2. A wide diagram stands at its natural size, its words at 10px and up,
 *    fitting its well or scrolling sideways in it under the house edge fade
 *    from its start; a Row beside it
 *    stands at the body's width, not in a split column.
 * 3. Send, once sent, says "Sent" with its tick, the pair centred, and its
 *    keycaps gone.
 * 4. A piece the hub no longer holds is one line in its well.
 * 5. A dev server's preview holds its screen's height while it waits and
 *    keeps it once its origin answers; a component canvas's, whose height
 *    comes only once it serves, is one status row while it waits.
 * 6. Dials: each row the Effort chip's field (30px, 38 under a finger, 10px
 *    round, raised), the fill recess-deep with the lifted knob, names on one
 *    inset, names and values at 4.5:1 and up.
 * 7. The foot stands at the window's foot on a short page.
 * 8. The tool name in the offline band in the code face; a decided chip's
 *    label and keycap, and the page head's title and Caw, on one middle.
 * 9. The note's field takes the house focus ring.
 * 10. Under a finger every option chip reaches 44px.
 *
 *   bun scripts/probe-kit/run.ts web decision-review
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one view at a time
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each reader is one function `page.evaluate` sends whole (it runs in the page and can import nothing), as reach.ts's is
import type { Page } from "playwright-core";
import {
  openCapturePage,
  pageReach,
  SILENT_ORIGIN,
} from "../../decision-embeds";
import { type Kit, type Spec, settle } from "../../kit";

const VIEWS = [
  { view: "desk", theme: "light", label: "1440 light" },
  { view: "phone", theme: "dark", label: "390 dark (coarse)" },
] as const;

/** 1. Each open card's first options row: its chips' tops, and whether a badge wrapped under its chip. */
const chipRows = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-slot=decision]:not([data-decided])")]
      .map((card) => {
        const cells = [...card.querySelectorAll("[data-slot=option-cell]")];
        const first = cells[0]?.getBoundingClientRect().top ?? 0;
        const row = cells.filter(
          (cell) => Math.abs(cell.getBoundingClientRect().top - first) < 1
        );
        const tops = row.map(
          (cell) =>
            Math.round(
              (cell.querySelector("[data-option]")?.getBoundingClientRect()
                .top ?? 0) * 2
            ) / 2
        );
        const wrapped = row.some((cell) => {
          const chip = cell.querySelector("[data-option]");
          const badge = cell.querySelector("[data-slot=badge]");
          return (
            !!chip &&
            !!badge &&
            badge.getBoundingClientRect().top >
              chip.getBoundingClientRect().bottom - 1
          );
        });
        // "Add a note": where its words begin, beside the question's.
        const add = card.querySelector("[data-slot=note] button");
        const words = document.createRange();
        if (add?.firstChild) {
          words.selectNodeContents(add);
        }
        return {
          card: card.id,
          tops,
          wrapped,
          spread: Math.max(...tops) - Math.min(...tops),
          addAt: add
            ? Math.round(words.getBoundingClientRect().left * 2) / 2
            : 0,
          titleAt:
            Math.round(
              (card.querySelector("h2")?.getBoundingClientRect().left ?? 0) * 2
            ) / 2,
        };
      })
      .filter((one) => one.tops.length > 0)
  );

/** 2. The plan card's Gantt: its well's scroller, its smallest words as drawn, and the Row under it. */
const ganttOf = (page: Page) =>
  page.evaluate(() => {
    const card = document.getElementById("decision-plan");
    const stage = card
      ?.querySelector("[data-slot=diagram]")
      ?.closest<HTMLElement>("[data-slot=media-stage]");
    const svg = card?.querySelector<SVGSVGElement>("[data-slot=diagram] svg");
    const view = svg?.viewBox.baseVal;
    const scale =
      svg && view?.width ? svg.getBoundingClientRect().width / view.width : 1;
    const sizes = [...(svg?.querySelectorAll("text") ?? [])]
      .map((one) => Number.parseFloat(getComputedStyle(one).fontSize) * scale)
      .filter((size) => size > 0);
    const grid = card?.querySelector("[data-slot=decision-media]");
    const row = card?.querySelector("[data-slot=stack]");
    return {
      smallest: Math.round(Math.min(...sizes) * 100) / 100,
      scrolls: stage ? stage.scrollWidth - stage.clientWidth : 0,
      at: stage?.scrollLeft ?? -1,
      faded: !!stage?.classList.contains("kit-edge-fade"),
      fade: stage ? getComputedStyle(stage).maskImage.slice(0, 40) : "",
      columns: grid
        ? getComputedStyle(grid).gridTemplateColumns.split(" ").length
        : 0,
      rowWidth: Math.round(row?.getBoundingClientRect().width ?? 0),
      gridWidth: Math.round(grid?.getBoundingClientRect().width ?? 0),
    };
  });

/** 3. Send as it stands: its words, its keycaps shown, its icon and words' middle against its own. */
const sendOf = (page: Page) =>
  page.evaluate(() => {
    const send = document.querySelector<HTMLElement>("[data-send]");
    const slot = send?.querySelector("[data-slot=btn-slot]");
    const words = send?.querySelector("[data-slot=label-text]");
    const box = send?.getBoundingClientRect();
    const a = slot?.getBoundingClientRect();
    const b = words?.getBoundingClientRect();
    const pair =
      a && b ? (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2 : 0;
    return {
      words: (words?.textContent ?? "").replace(/\s+/g, " ").trim(),
      keys: [...(send?.querySelectorAll("[data-slot=kbd]") ?? [])].filter(
        (key) => key.checkVisibility()
      ).length,
      icon: (slot?.querySelector("[data-active=true] svg") ? 1 : 0) as number,
      off: box
        ? Math.round(Math.abs(pair - (box.left + box.width / 2)) * 10) / 10
        : -1,
    };
  });

/** 4. Each piece's well that says its piece is gone: its height and its words. */
const goneOf = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-slot=media-gone]")].map((line) => ({
      words: line.textContent?.trim() ?? "",
      line: Math.round(line.getBoundingClientRect().height),
      well: Math.round(
        line.closest("[data-slot=media]")?.getBoundingClientRect().height ?? 0
      ),
    }))
  );

/** 5. A card's preview well: its height, its wait row's, and its frame's when it stands. */
const waitOf = (page: Page, card: string) =>
  page.evaluate((id) => {
    const well = document.querySelector(`#decision-${id} [data-slot=media]`);
    const row = well?.querySelector("[data-slot=wait-row]");
    const frame = well?.querySelector("iframe[data-slot=embed]");
    return {
      well: Math.round(well?.getBoundingClientRect().height ?? 0),
      row: Math.round(row?.getBoundingClientRect().height ?? 0),
      frame: frame
        ? `${Math.round(frame.getBoundingClientRect().width)}×${Math.round(frame.getBoundingClientRect().height)}`
        : "none",
      said: well?.querySelector("[role=status]")?.textContent?.trim() ?? "",
    };
  }, card);

/** 6. The Dials rows: each field's box, the fill and knob, the names' x, and the contrast of names and values on the field. */
const dialsOf = (page: Page) =>
  page.evaluate(() => {
    const paint = document.createElement("canvas").getContext("2d");
    const rgb = (colour: string) => {
      if (!paint) {
        return [0, 0, 0];
      }
      paint.clearRect(0, 0, 1, 1);
      paint.fillStyle = colour;
      paint.fillRect(0, 0, 1, 1);
      return [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const lum = (c: number[]) =>
      c
        .map((v) => {
          const s = v / 255;
          return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
    const ratio = (ink: string, under: string) => {
      const [a, b] = [lum(rgb(ink)), lum(rgb(under))].sort((x, y) => y - x);
      return Math.round((((a ?? 0) + 0.05) / ((b ?? 0) + 0.05)) * 100) / 100;
    };
    const slider = document.querySelector<HTMLElement>(".dialkit-slider");
    const field = slider ? getComputedStyle(slider, "::before") : null;
    const fill = document.querySelector<HTMLElement>(".dialkit-slider-fill");
    const knob = fill ? getComputedStyle(fill, "::after") : null;
    const colourRow = document.querySelector<HTMLElement>(
      ".dialkit-color-control"
    );
    const colourField = colourRow
      ? getComputedStyle(colourRow, "::before")
      : null;
    const name = document.querySelector<HTMLElement>(".dialkit-slider-label");
    const value = document.querySelector<HTMLElement>(".dialkit-slider-value");
    const colourName = document.querySelector<HTMLElement>(
      ".dialkit-color-label"
    );
    const ground = field?.backgroundColor ?? "";
    const probe = document.createElement("i");
    probe.style.backgroundColor = "var(--surface-raised)";
    slider?.append(probe);
    const raised = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      field: field
        ? `${Math.round((slider?.getBoundingClientRect().height ?? 0) - 2 * Number.parseFloat(field.top))}px r${field.borderTopLeftRadius} ${field.backgroundColor === raised ? "raised" : field.backgroundColor}`
        : "",
      colourField: colourField
        ? `${Math.round((colourRow?.getBoundingClientRect().height ?? 0) - 2 * Number.parseFloat(colourField.top))}px r${colourField.borderTopLeftRadius}`
        : "",
      row: Math.round(slider?.getBoundingClientRect().height ?? 0),
      fill: fill ? getComputedStyle(fill).backgroundColor : "",
      knob: knob
        ? `${knob.width}×${knob.height} r${knob.borderTopLeftRadius} ${knob.boxShadow.slice(0, 48)}`
        : "",
      names: [name, colourName].map(
        (one) =>
          Math.round(
            ((one?.getBoundingClientRect().left ?? 0) -
              (document.querySelector(".dialkit-panel")?.getBoundingClientRect()
                .left ?? 0)) *
              2
          ) / 2
      ),
      nameContrast: name ? ratio(getComputedStyle(name).color, ground) : 0,
      valueContrast: value ? ratio(getComputedStyle(value).color, ground) : 0,
      nameOnFill:
        name && fill
          ? ratio(
              getComputedStyle(name).color,
              getComputedStyle(fill).backgroundColor
            )
          : 0,
    };
  });

/** 7. The foot against the window's foot, and the page's height against the window. */
const footOf = (page: Page) =>
  page.evaluate(() => {
    const foot = document.querySelector("[data-slot=page-foot]");
    return {
      bottom: Math.round((foot?.getBoundingClientRect().bottom ?? 0) * 2) / 2,
      window: innerHeight,
      page: document.documentElement.scrollHeight,
    };
  });

/** 8. The code face in the offline band, a decided chip's label against its keycap, and the head's title against Caw. */
const linesOf = (page: Page) =>
  page.evaluate(() => {
    const mid = (el: Element | null | undefined) => {
      const r = el?.getBoundingClientRect();
      return r ? r.top + r.height / 2 : Number.NaN;
    };
    const chip = document.querySelector("[data-slot=decided] [data-pick]");
    const head = document.querySelector("[data-slot=page-head]");
    const code = document.querySelector("[data-slot=alert] code");
    return {
      code: code ? getComputedStyle(code).fontFamily.split(",")[0] : "",
      codeSize: code ? getComputedStyle(code).fontSize : "",
      chip:
        Math.round(
          Math.abs(
            mid(chip?.querySelector("[data-slot=kbd]")) -
              mid(chip?.querySelector("span:not([data-slot])"))
          ) * 10
        ) / 10,
      head:
        Math.round(
          Math.abs(
            mid(head?.querySelector("img")) - mid(head?.querySelector("h1"))
          ) * 10
        ) / 10,
      // The boxes the head's middles come from.
      boxes: ["img", ".mark-cell", "h1"].map((one) => {
        const el = head?.querySelector(one);
        const r = el?.getBoundingClientRect();
        const s = el ? getComputedStyle(el) : null;
        return `${one} y${Math.round((r?.top ?? 0) * 10) / 10} h${Math.round((r?.height ?? 0) * 10) / 10} pad ${s?.paddingTop} lh ${s?.lineHeight} trim ${s?.getPropertyValue("text-box-trim")} ${s?.getPropertyValue("text-box-edge")}`;
      }),
    };
  });

/** 9. The note's field, focused from the keyboard: its outline, offset and shadow, and the house ring's colour. */
const ringOf = async (page: Page) => {
  const card = page.locator("[data-slot=decision]:not([data-decided])").first();
  await card.locator("[data-slot=note] button").first().click();
  const field = card.locator("[data-slot=note] textarea:not([aria-hidden])");
  await field.waitFor();
  await field.focus();
  await settle(page, 300);
  return field.evaluate((el) => {
    const s = getComputedStyle(el);
    const probe = document.createElement("i");
    probe.style.outlineColor = "var(--focus-ring)";
    document.body.append(probe);
    const ring = getComputedStyle(probe).outlineColor;
    probe.remove();
    return {
      outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
      offset: s.outlineOffset,
      shadow: s.boxShadow,
      ring,
    };
  });
};

async function readView(
  kit: Kit,
  page: Page,
  view: "desk" | "phone",
  label: string
) {
  // 1, 8 and 10: the landing page.
  await openCapturePage(page, "landing");
  await settle(page, 400);
  const rows = await chipRows(page);
  kit.check(
    `${label}: every options row's chips stand at one y, a wrapped badge or not, and "Add a note"'s words begin on the question's edge (${rows.map((one) => `${one.card} chips ${one.tops.join("/")}${one.wrapped ? " (a badge wrapped)" : ""}, Add at ${one.addAt} vs title ${one.titleAt}`).join("; ")})`,
    rows.length > 0 &&
      rows.every(
        (one) => one.spread <= 0.5 && Math.abs(one.addAt - one.titleAt) <= 1.5
      ),
    JSON.stringify(rows)
  );
  const lines = await linesOf(page);
  kit.check(
    `${label}: a decided chip's label on its keycap's middle (${lines.chip}px off) and the page head's title on Caw's (${lines.head}px off), The Mark Line Rule`,
    lines.chip <= 0.5 && lines.head <= 0.5,
    JSON.stringify(lines)
  );
  if (view === "phone") {
    const reach = await pageReach(page);
    const chips = reach.controls.filter((one) => one.name.includes("[option]"));
    kit.check(
      `${label}: every option chip reaches 44px under a finger (${chips.length} chips: ${chips
        .slice(0, 4)
        .map((one) => one.line.split("\t")[8])
        .join("; ")})`,
      chips.length > 0 && chips.every((one) => one.touch),
      chips
        .filter((one) => !one.touch)
        .map((one) => one.line)
        .join("\n    ")
    );
  }
  // 3: Send pressed, read once its check has handed over (--dur-hold).
  await page.locator("[data-send]").click();
  await page.waitForTimeout(1600);
  const send = await sendOf(page);
  kit.check(
    `${label}: Send once sent says "${send.words}" with its tick, the pair ${send.off}px off its middle, ${send.keys} keycaps shown`,
    send.words === "Sent" &&
      send.icon === 1 &&
      send.off <= 1 &&
      send.keys === 0,
    JSON.stringify(send)
  );
  // 9: the note's ring.
  const ring = await ringOf(page);
  kit.check(
    `${label}: the note's field takes the house focus ring: ${ring.outline}, offset ${ring.offset}, shadow ${ring.shadow} (the ring ${ring.ring})`,
    ring.outline.includes(ring.ring) && ring.outline.includes("2px"),
    JSON.stringify(ring)
  );
  // 8: the offline band.
  await openCapturePage(page, "landing", { bridge: false });
  const offline = await linesOf(page);
  kit.check(
    `${label}: the offline band's tool name in the code face (${offline.code} ${offline.codeSize})`,
    offline.code.includes("JetBrains") && offline.codeSize === "12px",
    JSON.stringify(offline)
  );
}

async function mediaView(
  kit: Kit,
  page: Page,
  view: "desk" | "phone",
  label: string
) {
  // 2 and 6: the media page.
  await openCapturePage(page, "media");
  await page.waitForFunction(
    () => document.querySelectorAll("[data-slot=diagram] svg").length >= 3
  );
  await settle(page, 600);
  const gantt = await ganttOf(page);
  kit.check(
    `${label}: the Gantt ${gantt.scrolls > 0 ? `scrolls ${gantt.scrolls}px sideways under the edge fade (${gantt.faded ? "kit-edge-fade" : "no fade"}) from ${gantt.at}` : "fits its well"}, its smallest words ${gantt.smallest}px; its card's media ${gantt.columns} column, the Row ${gantt.rowWidth} of ${gantt.gridWidth}px`,
    gantt.smallest >= 9.95 &&
      (gantt.scrolls <= 0 || (gantt.faded && gantt.at === 0)) &&
      gantt.columns === 1 &&
      gantt.rowWidth === gantt.gridWidth,
    JSON.stringify(gantt)
  );
  // The embed card: its options' cells on shared rows (the lane's design
  // item 8), one with media and one without, their chips on one line.
  const cells = await page.evaluate(() =>
    [
      ...document.querySelectorAll("#decision-host [data-slot=option-cell]"),
    ].map((cell) => ({
      media: !!cell.querySelector("[data-slot=option-media]"),
      chip: Math.round(
        cell.querySelector("[data-option]")?.getBoundingClientRect().top ?? 0
      ),
      column: Math.round(cell.getBoundingClientRect().left),
    }))
  );
  kit.check(
    `${label}: the embed card's options stand on shared rows, ${cells.map((one) => `the cell at x${one.column} ${one.media ? "with" : "without"} media, its chip at y${one.chip}`).join("; ")}`,
    cells.length === 2 && cells.some((one) => one.media),
    JSON.stringify(cells)
  );
  await page.locator("[data-slot=dials]").scrollIntoViewIfNeeded();
  await settle(page, 300);
  const dials = await dialsOf(page);
  const fieldH = view === "phone" ? "38px" : "30px";
  kit.check(
    `${label}: Dials rows are the Effort chip's field (slider ${dials.field}, colour ${dials.colourField}, in a ${dials.row}px row), the fill ${dials.fill} with the knob ${dials.knob}, names at x ${dials.names.join(" and ")}, names ${dials.nameContrast}:1 and values ${dials.valueContrast}:1 on the field, names ${dials.nameOnFill}:1 on the fill`,
    dials.field.startsWith(`${fieldH} r10px raised`) &&
      dials.colourField.startsWith(`${fieldH} r10px`) &&
      dials.knob.includes("r8px") &&
      dials.names[0] === dials.names[1] &&
      dials.nameContrast >= 4.5 &&
      dials.valueContrast >= 4.5 &&
      dials.nameOnFill >= 4.5,
    JSON.stringify(dials)
  );
  // 4: the gone page.
  await openCapturePage(page, "gone");
  const gone = await goneOf(page);
  kit.check(
    `${label}: each piece the hub no longer holds is one line in its well (${gone.map((one) => `"${one.words}" ${one.line}px in a ${one.well}px well`).join("; ")})`,
    gone.length === 3 && gone.every((one) => one.line <= 20 && one.well <= 80),
    JSON.stringify(gone)
  );
  // 7: the pricing page, short.
  await openCapturePage(page, "pricing");
  await settle(page, 300);
  const foot = await footOf(page);
  kit.check(
    `${label}: on a short page the foot stands at the window's foot (its bottom ${foot.bottom} of ${foot.window}, the page ${foot.page}px)`,
    Math.abs(foot.bottom - foot.window) <= 0.5,
    JSON.stringify(foot)
  );
}

/** 5: the dev server's and the component canvas's previews held, then the dev server's answered. */
async function waitView(kit: Kit, page: Page, label: string) {
  let answer: (() => void) | undefined;
  const answered = new Promise<void>((done) => {
    answer = done;
  });
  await page.route(`${SILENT_ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/__cawco/ping") {
      await answered;
      return route.fulfill({
        status: 200,
        body: "ok",
        headers: { "access-control-allow-origin": "*" },
      });
    }
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><title>Site</title><h1>The launch site</h1>",
    });
  });
  await openCapturePage(page, "wait");
  await page.waitForFunction(() =>
    document.querySelector("[role=status]")?.textContent?.startsWith("Opening")
  );
  const before = await waitOf(page, "site");
  const cards = await waitOf(page, "parts");
  answer?.();
  await page.locator("#decision-site iframe[data-slot=embed]").waitFor();
  await settle(page, 300);
  const after = await waitOf(page, "site");
  kit.check(
    `${label}: a dev server's well holds its screen's height while it waits (${before.well}px: "${before.said}") and keeps it once it serves (${after.frame}, the well ${after.well}px); a component canvas's, whose height comes only once it serves, is one status row (its row ${cards.row}px, the well ${cards.well}px: "${cards.said}")`,
    Math.abs(after.well - before.well) <= 1 &&
      after.frame !== "none" &&
      cards.row <= 48 &&
      cards.frame === "none",
    JSON.stringify({ before, after, cards })
  );
  await page.unroute(`${SILENT_ORIGIN}/**`);
}

/**
 * 11. A pictured page at 390 in a window whose scrollbars take their width
 * (a desk panel's Chromium): no element paints past the window, and the
 * page's scroller holds no more than its own width (design.css
 * `well-bleed` reaches `--page-room`, not `100vi`).
 */
async function gutterView(kit: Kit) {
  const page = await kit.page("deskPanel", { theme: "dark", scrollbars: true });
  await openCapturePage(page, "media");
  await page.waitForFunction(
    () => document.querySelectorAll("[data-slot=diagram] svg").length >= 3
  );
  await settle(page, 600);
  const room = await page.evaluate(() => {
    const root = document.querySelector("[data-slot=decision-page]");
    const scroller = root?.firstElementChild as HTMLElement | null;
    const width = scroller?.clientWidth ?? document.documentElement.clientWidth;
    const spills = [...(scroller?.querySelectorAll("*") ?? [])]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(
        ({ el, r }) =>
          r.width > 1 &&
          r.right > 0 &&
          r.left < width &&
          (r.left < -0.5 || r.right > width + 0.5) &&
          !el.closest("[data-slot=media-stage]")?.contains(el.parentElement)
      )
      .map(
        ({ el, r }) =>
          `${el.tagName.toLowerCase()}${el.getAttribute("data-slot") ? `[${el.getAttribute("data-slot")}]` : ""} ${Math.round(r.left)} to ${Math.round(r.right)}`
      );
    return {
      pictured: root?.hasAttribute("data-pictured") ?? false,
      window: innerWidth,
      width,
      holds: scroller?.scrollWidth ?? 0,
      in: scroller?.clientWidth ?? 0,
      spills,
    };
  });
  kit.check(
    `390 with classic scrollbars: the pictured page's scroller holds ${room.holds} in ${room.in} (window ${room.window}, room ${room.width}), ${room.spills.length} spills${room.spills.length ? ` (${room.spills.slice(0, 3).join("; ")})` : ""}`,
    room.pictured && room.holds <= room.in && room.spills.length === 0,
    JSON.stringify(room)
  );
  await page.close();
}

const spec: Spec = {
  name: "decision-review",
  run: async (kit: Kit) => {
    await gutterView(kit);
    for (const { view, theme, label } of VIEWS) {
      const page = await kit.page(view, { theme });
      await readView(kit, page, view, label);
      await page.close();
      const media = await kit.page(view, { theme });
      await mediaView(kit, media, view, label);
      await media.close();
      const wait = await kit.page(view, { theme });
      await waitView(kit, wait, label);
      await wait.close();
    }
  },
};
export default spec;
