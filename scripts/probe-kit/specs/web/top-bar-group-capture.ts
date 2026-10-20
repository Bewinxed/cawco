/**
 * The top bar's icon group decision page (decisions/top-bar-group/page.oui)
 * as the owner will see it, through the hub's decision host with no hub
 * (decision-embeds.ts): each Preview a live embed of its option's states
 * file (apps/dashboard/src/lib/cawco/bar-group/), drawn by the dashboard's
 * own stage. The page is not published: each Preview names a stand-in id
 * (decision-embeds.ts `idOf`) that this spec maps to its states file; the
 * page's publisher swaps in the ids `artifact_create` answers.
 *
 * At 1440×900 and 390×844, light and dark, each embed scrolled to as the
 * owner would, then read in its own frame:
 * 1. The program passes the hub's own check (`checkProgram`).
 * 2. Every embed draws the stories its Preview names: each frame drawn and
 *    shot where the person sees it (canvas-shots.ts `shootEmbedded`).
 * 3. Every frame stands whole in its card (none scrolls sideways), and each
 *    is its own Preview captioned Desk or Phone.
 * 4. The group as drawn, read off the engine in each frame (scaled back to
 *    the item's 28px): no number in any item; every desk symbol 20px, the
 *    lens too, except in "Smaller, as today" where it is 16px; the badge a
 *    9px disc centred at (22.5, 22.5) of its item, in the fail ink with the
 *    Mac down and the attention ink with it needing a sign-in, the server
 *    symbol in the muted ink and cut by a radial mask; the tint option's
 *    symbol in that status ink with no badge; the dot a 6px disc centred at
 *    (23, 5) in `brand-solid`, the folder cut by a radial mask; the phone's
 *    glass Caw alone, 32px.
 * 5. The page never scrolls sideways, and logs no console error.
 * 6. The page's own capture, taken window by window as the owner scrolls
 *    it (decision-embeds.ts `capturePage`), paints every embed.
 *
 * Writes each leg's page in tiles a window tall, each under 1 MiB, to
 * `.probe/decision-pages/top-bar-group-{1440,390}-{light,dark}-NN.png`, and
 * `top-bar-group-manifest.json` beside them: each card's question and
 * options, and every check above with its output. The run writes them into
 * a staging folder and swaps them in at its end, replacing only this page's
 * files.
 *
 *   bun scripts/probe-kit/run.ts web top-bar-group-capture
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import {
  blankEmbeds,
  CAWCO_BRIDGE,
  capturePage,
  EMBED_FRAME,
  type Embed,
  embedDrawFaults,
  idOf,
  readEmbeds,
  startDecisionStage,
} from "../../decision-embeds";
import { type Kit, ROOT, SCALE, type Spec, THEMES } from "../../kit";

/** Every decision page's captures: a folder this spec shares with the others. */
const OUT = join(ROOT, ".probe/decision-pages");
const NAME = "top-bar-group";
/** This run's tiles and manifest until it ends (publish). */
const NEXT = join(OUT, `.${NAME}-next`);
const PROGRAM = readFileSync(
  join(ROOT, "decisions/top-bar-group/page.oui"),
  "utf8"
);
const STATES = "src/lib/cawco/bar-group";

/** Each option canvas's stand-in id, by the name `idOf` makes it from, and its states file. */
const CANVASES: Record<string, string> = {
  "problem-badge": "ProblemBadge",
  "problem-tint": "ProblemTint",
  "problem-phone": "ProblemPhone",
  "files-none": "NewFilesNone",
  "files-dot": "NewFilesDot",
  "jump-group": "JumpGroupSize",
  "jump-today": "JumpToday",
};

const DECISION =
  /^(\w+) = Decision\("([^"]+)", "((?:[^"\\]|\\.)*)", \[([^\]]*)\]/;
const OPTION =
  /^(\w+) = Option\("([^"]+)", "((?:[^"\\]|\\.)*)"[^\n]*?, (true|false), /;
const PREVIEW = /^\w+ = Preview\("([0-9a-f-]+)"/;
/** A frame of the group read as wordless by `embedDrawFaults`: its symbols carry no text. */
const WORDLESS =
  /^(ProblemBadge|ProblemTint|ProblemPhone|NewFilesNone|NewFilesDot|JumpGroupSize|JumpToday)\/(Down|SignIn|Caw|NewFiles|Desk): \d+px tall, 0 characters$/;
/** The most a capture tile may weigh: a picture a reader opens whole. */
const MIB = 1024 * 1024;
/** A frame's caption names its form after the option's label: "A badge · Desk, the Mac down". */
const FORM = /^(Desk|Phone)\b/;

/** Each card's question and its options, in the program's order. */
function cardsOf(program: string) {
  const lines = program.split("\n");
  const options = new Map<
    string,
    { id: string; label: string; recommended: boolean }
  >();
  for (const line of lines) {
    const found = OPTION.exec(line);
    if (found) {
      options.set(found[1], {
        id: found[2],
        label: found[3],
        recommended: found[4] === "true",
      });
    }
  }
  return lines.flatMap((line) => {
    const found = DECISION.exec(line);
    if (!found) {
      return [];
    }
    return [
      {
        id: found[2],
        question: found[3].replace(/\\"/g, '"'),
        options: found[4]
          .split(",")
          .map((one) => options.get(one.trim()))
          .filter((one) => one !== undefined),
      },
    ];
  });
}

/** One leg's check: what it asserts, whether it holds, and the output that shows it. */
type Say = (assertion: string, ok: boolean, output: string) => void;

/** Every frame stands whole in its card (none scrolls sideways), and each is its own Preview captioned Desk or Phone. */
function frameChecks(embeds: Embed[], say: Say): void {
  const wide = embeds.flatMap((e) =>
    e.frames
      .filter((f) => f.wide)
      .map(
        (f) =>
          `“${e.caption}”: ${f.w}px drawn, scrolls ${f.scrolls}px at ${f.zoom}×`
      )
  );
  say(
    "every frame stands whole in its card: none scrolls sideways",
    wide.length === 0,
    wide.join(" | ") ||
      embeds
        .map(
          (e) => `${e.caption} ${e.frames.map((f) => `${f.zoom}×`).join(" ")}`
        )
        .join("; ")
  );
  const unnamed = embeds
    .filter(
      (e) => e.named.length !== 1 || !FORM.test(e.caption.split(" · ")[1])
    )
    .map((e) => `“${e.caption}” shows ${e.named.join(", ")}`);
  say(
    "each frame is its own Preview, its caption saying Desk or Phone",
    unnamed.length === 0,
    unnamed.join(" | ") || embeds.map((e) => e.caption).join("; ")
  );
}

/** One item of the group as drawn, in the item's own 28px units. */
interface ItemRead {
  /** The badge's or dot's box: its centre and side, item units. */
  badge: { cx: number; cy: number; side: number } | null;
  dot: { cx: number; cy: number; side: number } | null;
  /** The badge's fill and the dot's background, as computed. */
  dotInk: string;
  fill: string;
  item: string;
  /** The symbol's mask-image. */
  mask: string;
  /** A number drawn in the item. */
  num: boolean;
  /** The symbol's side and ink. */
  symbol: number;
  symbolInk: string;
}

/** The group in one embed's frames: each item, the tokens it should wear, the glass's height. */
interface GroupRead {
  glass: number;
  inks: Record<"attn" | "brand" | "fail" | "muted", string>;
  items: ItemRead[];
}

/** Read in the embed's document: every group frame's items, scaled back to the 28px item. */
function readGroups(): GroupRead[] {
  const box = (el: Element | null, origin: DOMRect, unit: number) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      cx: round((r.left + r.width / 2 - origin.left) / unit),
      cy: round((r.top + r.height / 2 - origin.top) / unit),
      side: round(r.width / unit),
    };
  };
  return [
    ...document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"] [data-bar-group]'
    ),
  ].map((group) => {
    const ink = (value: string) => {
      const probe = document.createElement("span");
      probe.style.color = value;
      group.append(probe);
      const said = getComputedStyle(probe).color;
      probe.remove();
      return said;
    };
    const glass = group.getBoundingClientRect();
    const first = group.querySelector("[data-bar-item]");
    const scale = first
      ? first.getBoundingClientRect().height /
        (group.closest('[data-form="phone"]') ? 32 : 28)
      : 1;
    return {
      glass: Math.round((glass.height / scale) * 100) / 100,
      inks: {
        attn: ink("var(--status-attn-glyph)"),
        fail: ink("var(--status-fail-glyph)"),
        brand: ink("var(--brand-solid)"),
        muted: ink("var(--ink-muted)"),
      },
      items: [...group.querySelectorAll<HTMLElement>("[data-bar-item]")].map(
        (item) => {
          const origin = item.getBoundingClientRect();
          const unit = origin.height / 28;
          const symbol = item.querySelector<SVGElement>(
            ":scope > svg:not([data-slot])"
          );
          const badge = item.querySelector('[data-slot="badge"]');
          const dot = item.querySelector('[data-slot="dot"]');
          const name =
            (
              [
                ["files", "[data-files-control]"],
                ["jump", ".jump"],
                ["machines", "[data-machines]"],
              ] as const
            ).find(([, selector]) => item.matches(selector))?.[0] ?? "caw";
          return {
            item: name,
            num: !!item.querySelector(".num, [data-slot='num']"),
            symbol: symbol
              ? Math.round(
                  (symbol.getBoundingClientRect().width / unit) * 100
                ) / 100
              : 0,
            symbolInk: symbol ? getComputedStyle(symbol).color : "",
            mask: symbol ? getComputedStyle(symbol).maskImage : "",
            badge: box(badge, origin, unit),
            dot: box(dot, origin, unit),
            fill: badge ? getComputedStyle(badge).fill : "",
            dotInk: dot ? getComputedStyle(dot).backgroundColor : "",
          };
        }
      ),
    };
  });
}

/** Within half a pixel of the item's units. */
const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;

/** The phone's glass: Caw alone on it, 32px. */
function phoneFaults(story: string, group: GroupRead): string[] {
  const alone =
    group.items.length === 1 &&
    group.items[0]?.item === "caw" &&
    near(group.glass, 32);
  return story !== "Caw" || alone
    ? []
    : [
        `phone glass ${group.glass}px holding ${group.items.map((one) => one.item).join(", ")}`,
      ];
}

/** Every desk symbol 20px, the lens 16px only in "Smaller, as today". */
function sizeFaults(file: string, group: GroupRead): string[] {
  const lensSide = file === "JumpToday" ? 16 : 20;
  return group.items.flatMap((one) => {
    if (one.item === "caw") {
      return [];
    }
    const side = one.item === "jump" ? lensSide : 20;
    return near(one.symbol, side)
      ? []
      : [`${one.item} symbol ${one.symbol}px, not ${side}px`];
  });
}

/** The machines item: a 9px badge at (22.5, 22.5) over a muted, masked symbol, or the symbol tinted with no badge. */
function machineFaults(
  file: string,
  story: string,
  group: GroupRead
): string[] {
  const server = group.items.find((one) => one.item === "machines");
  const tone = story === "Down" ? group.inks.fail : group.inks.attn;
  if (!server) {
    return ["no machines item"];
  }
  if (file === "ProblemTint") {
    return server.badge || server.symbolInk !== tone
      ? [
          `tint: server ink ${server.symbolInk} (its ink ${tone}), badge ${JSON.stringify(server.badge)}`,
        ]
      : [];
  }
  if (file !== "ProblemBadge") {
    return server.badge ? ["a badge with nothing wrong"] : [];
  }
  const b = server.badge;
  return [
    ...(b && near(b.cx, 22.5) && near(b.cy, 22.5) && near(b.side, 9)
      ? []
      : [`badge at ${JSON.stringify(b)}`]),
    ...(server.fill === tone
      ? []
      : [`badge fill ${server.fill}, its ink ${tone}`]),
    ...(server.symbolInk === group.inks.muted
      ? []
      : [`server ink ${server.symbolInk}, not the muted ink`]),
    ...(server.mask.includes("radial-gradient")
      ? []
      : [`server mask ${server.mask}`]),
  ];
}

/** The folder: a 6px brand dot at (23, 5) over a masked folder in the dot option, no dot anywhere else. */
function folderFaults(file: string, group: GroupRead): string[] {
  const folder = group.items.find((one) => one.item === "files");
  if (!folder) {
    return ["no Files item"];
  }
  if (file !== "NewFilesDot") {
    return folder.dot ? ["a dot on the folder"] : [];
  }
  const d = folder.dot;
  return [
    ...(d && near(d.cx, 23) && near(d.cy, 5) && near(d.side, 6)
      ? []
      : [`dot at ${JSON.stringify(d)}`]),
    ...(folder.dotInk === group.inks.brand
      ? []
      : [`dot ink ${folder.dotInk}, brand ${group.inks.brand}`]),
    ...(folder.mask.includes("radial-gradient")
      ? []
      : [`folder mask ${folder.mask}`]),
  ];
}

/** What each canvas's group must show: the faults in one embed's reads. */
function groupFaults(
  file: string,
  story: string,
  groups: GroupRead[]
): string[] {
  return groups.flatMap((group) => [
    ...group.items
      .filter((one) => one.num)
      .map((one) => `a number in ${one.item}`),
    ...(file === "ProblemPhone"
      ? phoneFaults(story, group)
      : [
          ...sizeFaults(file, group),
          ...machineFaults(file, story, group),
          ...folderFaults(file, group),
        ]),
  ]);
}

/** Every embed's group read off the engine, against what its canvas proposes. */
async function groupChecks(page: Page, embeds: Embed[], say: Say) {
  const reads: string[] = [];
  const faults: string[] = [];
  const handles = await page.$$(EMBED_FRAME);
  for (const [index, handle] of handles.entries()) {
    const e = embeds[index];
    const file = Object.values(CANVASES).find((one) => e?.file === one);
    if (!(e && file) || e.named[0] === "Machines") {
      continue;
    }
    const groups =
      (await (await handle.contentFrame())?.evaluate(readGroups)) ?? [];
    if (groups.length === 0) {
      faults.push(`“${e.caption}”: no group drawn`);
      continue;
    }
    faults.push(
      ...groupFaults(file, e.named[0] ?? "", groups).map(
        (fault) => `“${e.caption}”: ${fault}`
      )
    );
    reads.push(
      `${e.caption}: ${groups
        .flatMap((g) =>
          g.items.map(
            (one) =>
              `${one.item}${one.item === "caw" ? ` on ${g.glass}px glass` : ` ${one.symbol}`}${one.badge ? ` badge ${one.badge.side} at ${one.badge.cx},${one.badge.cy}` : ""}${one.dot ? ` dot ${one.dot.side} at ${one.dot.cx},${one.dot.cy}` : ""}`
          )
        )
        .join(", ")}`
    );
  }
  say(
    "the group as drawn: no numbers, one symbol size, the badge, dot and lens where each option puts them",
    faults.length === 0 && reads.length > 0,
    faults.join(" | ") || reads.join("; ")
  );
}

/**
 * The page's capture in tiles a window tall, top to bottom, each a picture
 * a reader opens whole, the capture removed. Answers the tiles' paths from
 * the repo's root.
 */
async function tileCapture(
  page: Page,
  shot: string,
  leg: string,
  say: Say
): Promise<string[]> {
  const whole = PNG.sync.read(readFileSync(shot));
  const step = Math.round(
    (await page.evaluate(() => innerHeight * devicePixelRatio)) || 1
  );
  const tiles: { bytes: number; path: string }[] = [];
  for (let top = 0; top < whole.height; top += step) {
    const rows = Math.min(step, whole.height - top);
    const tile = new PNG({ width: whole.width, height: rows });
    PNG.bitblt(whole, tile, 0, top, whole.width, rows, 0, 0);
    const path = join(
      NEXT,
      `${NAME}-${leg}-${String(tiles.length + 1).padStart(2, "0")}.png`
    );
    const bytes = PNG.sync.write(tile, { colorType: 2, deflateLevel: 9 });
    writeFileSync(path, bytes);
    tiles.push({ path, bytes: bytes.length });
  }
  rmSync(shot);
  const heavy = tiles.filter((one) => one.bytes >= MIB);
  say(
    `the capture in ${tiles.length} tiles a window tall, each under 1 MiB`,
    tiles.length > 0 && heavy.length === 0,
    tiles
      .map(
        (one) =>
          `${one.path.split("/").at(-1)} ${Math.round(one.bytes / 1024)} KiB`
      )
      .join(", ")
  );
  return tiles.map((one) =>
    join(OUT, one.path.split("/").at(-1) as string).slice(ROOT.length + 1)
  );
}

/** This run's files into OUT: this page's files from the last run out, this run's in. */
function publish(): void {
  for (const old of readdirSync(OUT)) {
    if (old.startsWith(`${NAME}-`)) {
      rmSync(join(OUT, old));
    }
  }
  for (const made of readdirSync(NEXT)) {
    renameSync(join(NEXT, made), join(OUT, made));
  }
  rmSync(NEXT, { recursive: true, force: true });
}

const spec: Spec = {
  name: "top-bar-group-capture",
  run: async (kit: Kit) => {
    rmSync(NEXT, { recursive: true, force: true });
    rmSync(join(OUT, "frames", NAME), { recursive: true, force: true });
    mkdirSync(NEXT, { recursive: true });
    const checks: {
      leg: string;
      ok: boolean;
      assertion: string;
      output: string;
    }[] = [];
    const check = (
      leg: string,
      assertion: string,
      ok: boolean,
      output: string
    ) => {
      checks.push({ leg, ok, assertion, output });
      kit.check(`${leg}: ${assertion}`, ok, output);
    };

    let refusal = "";
    try {
      checkProgram(PROGRAM);
    } catch (error) {
      refusal = (error as Error).message;
    }
    check(
      "program",
      "the hub's check keeps the program",
      refusal === "",
      refusal || "kept"
    );
    const previews = PROGRAM.split("\n").filter((line) =>
      PREVIEW.test(line)
    ).length;
    const files = Object.fromEntries(
      Object.entries(CANVASES).map(([name, file]) => [
        idOf(name),
        [`${STATES}/${file}.stories.ts`],
      ])
    );

    const stage = await startDecisionStage(new Map([[NAME, PROGRAM]]), files);
    const shots: string[] = [];
    try {
      for (const view of ["desk", "phone"] as const) {
        for (const theme of THEMES) {
          const width = view === "desk" ? 1440 : 390;
          const leg = `${width === 1440 ? "1440×900" : "390×844"} ${theme}`;
          const page = await kit.page(view, { theme, init: [CAWCO_BRIDGE] });
          const errors: string[] = [];
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text().slice(0, 240));
            }
          });
          page.on("pageerror", (error) =>
            errors.push(error.message.slice(0, 240))
          );
          await page.goto(stage.pageUrl(NAME, theme), { waitUntil: "load" });
          await page.waitForSelector(".dp-card", { timeout: 30_000 });
          await page.waitForFunction(
            ({ n, selector }) =>
              document.querySelectorAll(selector).length === n,
            { n: previews, selector: EMBED_FRAME },
            { timeout: 60_000 }
          );
          const { embeds, undrawn } = await readEmbeds(
            page,
            theme,
            join(OUT, "frames", NAME, `${width}-${theme}`)
          );
          // The group is symbols alone, no words: its frames' drawing is
          // proven by the group's reads below (each item, its symbol's
          // side), not by `embedDrawFaults`' words count.
          const faults = [
            ...embeds
              .flatMap(embedDrawFaults)
              .filter((one) => !WORDLESS.test(one)),
            ...undrawn,
          ];
          check(
            leg,
            `every embed (${embeds.length} of ${previews}) draws the stories its Preview names`,
            embeds.length === previews && faults.length === 0,
            faults.join(" | ") ||
              embeds
                .map(
                  (e) =>
                    `${e.file}: ${e.shots.map((one) => `${one.story} ${one.stats.width / SCALE}×${one.stats.height / SCALE}`).join(" + ")}`
                )
                .join("; ")
          );
          const say: Say = (assertion, ok, output) =>
            check(leg, assertion, ok, output);
          frameChecks(embeds, say);
          await groupChecks(page, embeds, say);
          await page.evaluate(() => window.scrollTo(0, 0));
          const across = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
            tall: document.documentElement.scrollHeight,
          }));
          check(
            leg,
            "the page never scrolls sideways",
            across.scroll <= across.client + 1,
            `scrollWidth ${across.scroll}, clientWidth ${across.client}; the page ${across.tall}px tall`
          );
          check(
            leg,
            "no console errors, the page and its canvases",
            errors.length === 0,
            [...new Set(errors)].slice(0, 12).join(" | ") || "none"
          );
          const shot = join(NEXT, `${NAME}-${width}-${theme}.png`);
          const paints = await capturePage(page, shot);
          const blank = blankEmbeds(paints);
          check(
            leg,
            `the page's own capture paints every embed (${paints.length} of ${previews})`,
            paints.length === previews && blank.length === 0,
            blank.join(" | ") ||
              paints
                .map(
                  (one) =>
                    `${one.embed} at y ${one.rect.y}: ${Math.round(one.flat * 1000) / 10}% its commonest colour`
                )
                .join("; ")
          );
          const tiles = await tileCapture(page, shot, `${width}-${theme}`, say);
          shots.push(...tiles);
          await page.close();
        }
      }
    } finally {
      await stage.stop();
    }
    writeFileSync(
      join(NEXT, `${NAME}-manifest.json`),
      `${JSON.stringify(
        {
          page: null,
          program: "decisions/top-bar-group/page.oui",
          canvases: Object.fromEntries(
            Object.entries(CANVASES).map(([name, file]) => [
              idOf(name),
              `apps/dashboard/${STATES}/${file}.stories.ts`,
            ])
          ),
          shots,
          cards: cardsOf(PROGRAM),
          checks,
        },
        null,
        2
      )}\n`
    );
    publish();
  },
};

export default spec;
