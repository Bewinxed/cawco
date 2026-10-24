/**
 * The project page's design preview (design-previews/project), read from
 * the engine. The folder is served as it is, and its page is read at 390,
 * 680 and 1440 on Chromium and WebKit, in every state the preview offers
 * (at rest, waiting on him, the task pane open, an empty project, a read
 * failure) and both phone forks (the grouped list, the columns sideways).
 *
 *   bun scripts/probe-kit/run.ts project-preview
 *
 * Asserted:
 * - boxes: the page never scrolls sideways; inside the head, the bar, the
 *   view bar, every card, the pane's rows and the empty and failed blocks,
 *   no part spills out of its parent or covers a sibling;
 * - Caw, where he stands outside a row (the empty project's hero, the
 *   fault), has his centre on his block's within 1px, and the block's on
 *   the page column's;
 * - each card's lines match the grammar for its stage (the title at most
 *   two, the stage's one fact, a third line only for Working and Review,
 *   none on a card waiting on him);
 * - the pane holds at most two cards before its tabs;
 * - every named motion, held on the DevTools clock and sought to 0, ¼, ½,
 *   ¾ and 1 of its own length, moves the whole way on its own curve: each
 *   reading strictly between its ends, and within 0.06 of where the run's
 *   easing puts it (no hold, no jump);
 * - no console error on any page.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one state at a time
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import {
  type Kit,
  type MotionRun,
  readMotion,
  type Spec,
  type View,
} from "../kit";

const FOLDER = normalize(
  join(import.meta.dir, "..", "..", "..", "design-previews", "project")
);
const STATES = ["rest", "waiting", "open", "empty", "fault"] as const;
const SIZES: View[] = ["desk", "narrowDesk", "phone"];
const ENGINES = ["chromium", "webkit"] as const;
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
/** The house curves (DESIGN.md, Motion grammar) and the skeleton's cross-fade. */
const HOUSE_CURVES = [
  "cubic-bezier(0.23, 1, 0.32, 1)",
  "cubic-bezier(0.77, 0, 0.175, 1)",
  "cubic-bezier(0.32, 0.72, 0, 1)",
  "cubic-bezier(0.42, 0, 0.58, 1)",
];

const serve = () =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = normalize(join(FOLDER, path === "/" ? "index.html" : path));
      if (!file.startsWith(FOLDER)) {
        return new Response(null, { status: 403 });
      }
      const body = Bun.file(file);
      return (await body.exists())
        ? new Response(body)
        : new Response(null, { status: 404 });
    },
  });

/** Every console error and uncaught error a page says, by where it was said. */
const errors: string[] = [];
const listen = (page: Page, where: string): void => {
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`${where}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`${where}: ${error.message}`);
  });
};

/** Waits until the frame is drawn and nothing named moves in it. */
const still = async (page: Page): Promise<void> => {
  await page.waitForSelector("html[data-ready]");
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done(null)))
      )
  );
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          Number(animation.effect?.getComputedTiming().iterations ?? 1) > 1
      )
  );
};

const openFrame = async (
  page: Page,
  origin: string,
  state: string,
  layout = "list"
): Promise<void> => {
  await page.goto(`${origin}/frame.html?state=${state}&layout=${layout}`);
  await still(page);
};

/* ---------- Boxes ---------- */

const PARENTS = [
  ".bar",
  ".glass",
  ".head",
  ".head-words",
  ".head-acts",
  ".col-head",
  ".card",
  ".card-meta",
  ".card-third",
  ".viewbar",
  ".pane-top",
  ".pane-facts",
  ".pcard",
  ".chips",
  ".decision",
  ".ptabs",
  ".starters",
  ".starter",
  ".composer",
  ".fault-ways",
  ".empty",
  ".fault",
  ".caw-col-head",
  ".prow",
  ".review-who",
  ".attachments",
];

interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
}
interface Group {
  kids: { box: Box; name: string }[];
  outer: Box;
  selector: string;
}

/**
 * Each shown parent's box and its shown children's, in flow: a box placed
 * out of flow (absolute, fixed) or pinned over what scrolls under it
 * (sticky: the review's decision) is drawn over its neighbours by design.
 */
const groupsOf = (page: Page) =>
  page.evaluate((parents) => {
    const inFlow = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        box.width > 0 &&
        box.height > 0 &&
        style.visibility !== "hidden" &&
        !["absolute", "fixed", "sticky"].includes(style.position)
      );
    };
    const plain = (element: Element) => {
      const { bottom, left, right, top } = element.getBoundingClientRect();
      return { bottom, left, right, top };
    };
    const root = document.documentElement;
    const groups = parents.flatMap((selector) =>
      [...document.querySelectorAll(selector)].filter(inFlow).map((parent) => ({
        selector,
        outer: plain(parent),
        kids: [...parent.children].filter(inFlow).map((kid) => ({
          name: `${kid.localName}.${[...kid.classList].join(".")}`,
          box: plain(kid),
        })),
      }))
    );
    return { groups, wide: root.scrollWidth, view: root.clientWidth };
  }, PARENTS);

const spills = ({ kids, outer, selector }: Group): string[] =>
  kids.flatMap(({ box, name }) => {
    const over = Math.max(outer.left - box.left, box.right - outer.right);
    return over > 0.5
      ? [`${name} spills out of ${selector} by ${over.toFixed(1)}px`]
      : [];
  });

const overlaps = ({ kids, selector }: Group): string[] =>
  kids.flatMap((one, i) =>
    kids.slice(i + 1).flatMap((other) => {
      const w =
        Math.min(one.box.right, other.box.right) -
        Math.max(one.box.left, other.box.left);
      const h =
        Math.min(one.box.bottom, other.box.bottom) -
        Math.max(one.box.top, other.box.top);
      return w > 0.5 && h > 0.5
        ? [
            `${one.name} and ${other.name} overlap in ${selector} (${w.toFixed(1)}×${h.toFixed(1)})`,
          ]
        : [];
    })
  );

/** Spills, overlaps and sideways scroll, each said with what and by how much. */
const boxFaults = async (page: Page): Promise<string[]> => {
  const { groups, view, wide } = await groupsOf(page);
  return [
    ...(wide > view + 1
      ? [`the page scrolls sideways: ${wide} > ${view}`]
      : []),
    ...groups.flatMap((group) => [...spills(group), ...overlaps(group)]),
  ];
};

/** Caw's centre against his block's, and the block's against the page column's. */
const cawAxis = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".caw-hero, .caw-fault")]
      .filter((caw) => caw.getBoundingClientRect().width > 0)
      .map((caw) => {
        const centre = (box: DOMRect) => box.left + box.width / 2;
        const block = caw.parentElement as HTMLElement;
        const field = document.querySelector("#page") as HTMLElement;
        const pageBox = field.getBoundingClientRect();
        const pad = getComputedStyle(field);
        const column =
          (pageBox.left +
            Number.parseFloat(pad.paddingLeft) +
            pageBox.right -
            Number.parseFloat(pad.paddingRight)) /
          2;
        return {
          who: caw.className,
          caw: centre(caw.getBoundingClientRect()),
          block: centre(block.getBoundingClientRect()),
          column,
        };
      })
  );

/** Each card's lines: its title's, its stage fact's and its third line's. */
const cardLines = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".card[data-id]")]
      .filter((card) => card.getBoundingClientRect().height > 0)
      .map((card) => {
        // The lines its words are drawn on inside its own box: a clamp's
        // hidden lines are laid out below it, and a run trimmed to its
        // x-height band (the mark line) keeps every line it draws.
        const lines = (element: Element | null): number => {
          if (!element) {
            return 0;
          }
          const box = element.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(element);
          const tops = new Set<number>();
          for (const rect of range.getClientRects()) {
            if (rect.width > 0 && rect.top < box.bottom - 1) {
              tops.add(Math.round(rect.top));
            }
          }
          return tops.size;
        };
        return {
          id: card.dataset.id ?? "",
          stage: card.dataset.stage ?? "",
          needs: card.hasAttribute("data-needs"),
          title: lines(card.querySelector(".card-title")),
          meta: lines(card.querySelector(".card-meta > .words")),
          third: lines(card.querySelector(".card-third > .words")),
        };
      })
  );

const GRAMMAR: Record<string, [number, number][]> = {
  // [min, max] of the stage fact's lines, then of the third line's.
  needs: [
    [1, 2],
    [0, 0],
  ],
  ready: [
    [0, 1],
    [0, 0],
  ],
  working: [
    [1, 1],
    [1, 1],
  ],
  review: [
    [1, 1],
    [1, 1],
  ],
  done: [
    [1, 1],
    [0, 0],
  ],
  dropped: [
    [1, 1],
    [0, 0],
  ],
};

const offGrammar = (cards: Awaited<ReturnType<typeof cardLines>>): string[] =>
  cards.flatMap((card) => {
    const [[metaMin, metaMax], [thirdMin, thirdMax]] =
      GRAMMAR[card.needs ? "needs" : card.stage] ?? GRAMMAR.ready;
    const ok =
      card.title >= 1 &&
      card.title <= 2 &&
      card.meta >= metaMin &&
      card.meta <= metaMax &&
      card.third >= thirdMin &&
      card.third <= thirdMax;
    return ok
      ? []
      : [
          `${card.id} (${card.needs ? "needs you" : card.stage}): title ${card.title}, fact ${card.meta}, third ${card.third}`,
        ];
  });

const cardsBeforeTabs = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const scroll = document.querySelector(".pane-scroll");
    const tabs = scroll?.querySelector(".ptabs");
    if (!(scroll && tabs)) {
      return -1;
    }
    const order = [...scroll.children];
    return order
      .slice(0, order.indexOf(tabs))
      .filter((part) => part.classList.contains("pcard")).length;
  });

/* ---------- Motion ---------- */

/** The keyword curves as their cubic-bezier (WebKit names ease-in-out by its keyword). */
const KEYWORDS: Record<string, string> = {
  ease: "cubic-bezier(0.25, 0.1, 0.25, 1)",
  "ease-in-out": "cubic-bezier(0.42, 0, 0.58, 1)",
  "ease-out": "cubic-bezier(0, 0, 0.58, 1)",
  linear: "cubic-bezier(0, 0, 1, 1)",
};
const curveOf = (easing: string): string => KEYWORDS[easing] ?? easing;

/** A CSS cubic-bezier's progress at time fraction `x`. */
const bezier = (curve: string, x: number): number => {
  const numbers = curveOf(curve)
    .match(/-?[\d.]+/g)
    ?.map(Number);
  if (numbers?.length !== 4) {
    return x;
  }
  const [x1, y1, x2, y2] = numbers;
  const at = (a: number, b: number, t: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (at(x1, x2, mid) < x) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return at(y1, y2, (lo + hi) / 2);
};

/**
 * One value read at each fraction of a run's own length: it moves the whole
 * way (each reading strictly between its ends) and keeps to the run's curve
 * within 0.06 of the change (no hold, no jump).
 */
const continuous = (
  values: number[],
  held: MotionRun | undefined
): { ok: boolean; detail: string } => {
  const [first = 0] = values;
  const last = values.at(-1) ?? first;
  const change = last - first;
  const progress = values.map((value) => (value - first) / (change || 1));
  const expected = FRACTIONS.map((x) => bezier(held?.easing ?? "", x));
  const between = progress.slice(1, -1).every((p) => p > 0.001 && p < 0.999);
  const onCurve = progress.every((p, i) => Math.abs(p - expected[i]) <= 0.06);
  return {
    ok: Math.abs(change) > 0.01 && between && onCurve,
    detail: `${values.map((value) => value.toFixed(2)).join(" → ")} (progress ${progress
      .map((p) => p.toFixed(2))
      .join(
        ", "
      )}; ${held?.easing ?? "no run"} gives ${expected.map((p) => p.toFixed(2)).join(", ")})`,
  };
};

interface Motion {
  /** Names of runs that must start, each with its token duration. */
  expect: [string, number][];
  /** The run whose length the fractions are of, and whose curve the reading follows. */
  of: string;
  read: (page: Page) => Promise<number>;
}

const readOne = async (
  kit: Kit,
  page: Page,
  name: string,
  action: () => Promise<unknown>,
  motion: Motion
): Promise<void> => {
  const held = await readMotion(page, action, "body", {
    fractions: FRACTIONS,
    of: motion.of,
    read: () => motion.read(page),
  });
  for (const [run, duration] of motion.expect) {
    const found = held.runs.find((each) => each.name === run);
    kit.check(
      `${name}: “${run}” runs ${duration}ms on a house curve`,
      Boolean(
        found &&
        Math.abs(found.end - found.delay - duration) < 1 &&
        HOUSE_CURVES.includes(curveOf(found.easing))
      ),
      found
        ? `${found.end - found.delay}ms, ${found.easing}`
        : `runs: ${held.runs.map((each) => each.name).join(", ")}`
    );
  }
  // Sought to 1 a run is at its end and leaves the page's runs, so it lands
  // where the page then rests: the reading at rest is the reading at 1.
  await still(page);
  const rest = await motion.read(page);
  const atOne = held.at.at(-1)?.value ?? Number.NaN;
  kit.check(
    `${name}: “${motion.of}” lands where the page then rests`,
    Number.isNaN(rest) ? Number.isFinite(atOne) : Math.abs(rest - atOne) <= 0.5,
    `at 1 ${atOne.toFixed(2)}, at rest ${Number.isNaN(rest) ? "gone (a copy in flight, or a surface put away)" : rest.toFixed(2)}`
  );
  const run = held.runs.find((each) => each.name === motion.of);
  const { ok, detail } = continuous(
    held.at.map((reading) => reading.value),
    run
  );
  kit.check(
    `${name}: “${motion.of}” moves continuously at 0, ¼, ½, ¾, 1`,
    ok,
    detail
  );
};

/** A box's edge; NaN once it is gone (removed, or hidden). */
const edgeOf = (selector: string, edge: "top" | "left") => (page: Page) =>
  page.evaluate(
    ([s, e]) => {
      const box = document.querySelector(s)?.getBoundingClientRect();
      return box && box.width + box.height > 0
        ? box[e as "top" | "left"]
        : Number.NaN;
    },
    [selector, edge]
  );
const topOf = (selector: string) => edgeOf(selector, "top");
const leftOf = (selector: string) => edgeOf(selector, "left");
const opacityOf = (selector: string) => (page: Page) =>
  page.evaluate((s) => {
    const element = document.querySelector(s);
    return element ? Number(getComputedStyle(element).opacity) : Number.NaN;
  }, selector);
const heightOf = (selector: string) => (page: Page) =>
  page.evaluate(
    (s) =>
      document.querySelector(s)?.getBoundingClientRect().height ?? Number.NaN,
    selector
  );

const motions = async (
  kit: Kit,
  origin: string,
  engine: (typeof ENGINES)[number]
): Promise<void> => {
  const desk = await kit.page("desk", { engine });
  listen(desk, `motion ${engine} desk`);
  await openFrame(desk, origin, "rest");
  const manual = () =>
    desk.evaluate(() => {
      (
        window as unknown as { preview: { state: { auto: boolean } } }
      ).preview.state.auto = false;
    });
  await manual();
  const setState = (page: Page, state: string) => () =>
    page.evaluate((s) => {
      (
        window as unknown as { preview: { setState: (x: string) => void } }
      ).preview.setState(s);
    }, state);

  await readOne(
    kit,
    desk,
    `${engine} waiting on him`,
    setState(desk, "waiting"),
    {
      of: "needs-reflow",
      expect: [
        ["needs-reflow", 280],
        ["band-tint", 280],
        ["needs-morph", 180],
        ["arc-in", 280],
      ],
      read: topOf('.card[data-id="tsk-16"]'),
    }
  );
  await readOne(kit, desk, `${engine} the pane opens`, setState(desk, "open"), {
    of: "title-flight",
    expect: [
      ["title-flight", 280],
      ["pane-in", 280],
    ],
    read: leftOf("body > .pane-title"),
  });
  await readOne(
    kit,
    desk,
    `${engine} an answer chip`,
    () => desk.click('.chip[data-answer="Correct them in place"]'),
    {
      of: "card-settle",
      expect: [
        ["card-settle", 280],
        ["band-fade", 280],
        ["ask-fold", 160],
        ["needs-morph", 180],
        ["arc-out", 280],
      ],
      read: topOf('.card[data-id="tsk-16"]'),
    }
  );
  await readOne(
    kit,
    desk,
    `${engine} the answered ask folds`,
    () => desk.click('[data-act="approve"]'),
    {
      of: "card-land",
      expect: [
        ["card-land", 280],
        ["review-fold", 160],
        ["pill-morph", 180],
      ],
      read: leftOf('.card[data-id="tsk-16"]'),
    }
  );
  await readOne(
    kit,
    desk,
    `${engine} a tab`,
    () => desk.click('.ptab[data-tab="task"]'),
    {
      of: "translate",
      expect: [
        ["translate", 160],
        ["panel-in", 160],
      ],
      read: leftOf(".ptabs-thumb"),
    }
  );
  await readOne(
    kit,
    desk,
    `${engine} the ⋯ menu`,
    () => desk.click('[data-act="more"]'),
    {
      of: "opacity",
      expect: [["opacity", 260]],
      read: opacityOf(".pop"),
    }
  );
  await desk.keyboard.press("Escape");

  await setState(desk, "empty")();
  await still(desk);
  await readOne(
    kit,
    desk,
    `${engine} a suggestion`,
    () => desk.click(".starter"),
    {
      of: "draft-in",
      expect: [["draft-in", 120]],
      read: opacityOf('[data-slot="hero-field"]'),
    }
  );
  await readOne(
    kit,
    desk,
    `${engine} Send from the empty project`,
    () => desk.click(".composer-hero .composer-send"),
    {
      of: "field-flight",
      expect: [
        ["field-flight", 280],
        ["caw-col-in", 280],
        ["caw-leave", 200],
        ["empty-out", 200],
        ["board-reveal", 400],
        ["thread-arrive", 260],
      ],
      read: topOf("body > .composer"),
    }
  );
  await readOne(
    kit,
    desk,
    `${engine} the filed tasks arrive`,
    () =>
      desk.evaluate(() => {
        (
          window as unknown as { preview: { fileTasks: () => void } }
        ).preview.fileTasks();
      }),
    {
      of: "filed-arrive",
      expect: [["filed-arrive", 260]],
      read: opacityOf('.card[data-id="tw-1"]'),
    }
  );

  await setState(desk, "fault")();
  await still(desk);
  await desk.click('[data-act="retry"]');
  await readOne(
    kit,
    desk,
    `${engine} the hub answers a Retry`,
    () =>
      desk.evaluate(() => {
        (
          window as unknown as { preview: { hubAnswers: () => void } }
        ).preview.hubAnswers();
      }),
    {
      of: "board-reveal",
      expect: [
        ["board-reveal", 400],
        ["fault-out", 200],
      ],
      read: opacityOf('[data-slot="board"]'),
    }
  );
  await setState(desk, "fault")();
  await still(desk);
  await readOne(
    kit,
    desk,
    `${engine} Show details`,
    () => desk.click('[data-act="details"]'),
    {
      of: "details-unfold",
      expect: [["details-unfold", 260]],
      read: heightOf(".fault-details"),
    }
  );

  const phone = await kit.page("phone", { engine });
  listen(phone, `motion ${engine} phone`);
  await openFrame(phone, origin, "waiting");
  await readOne(
    kit,
    phone,
    `${engine} the phone's pane pushes in`,
    setState(phone, "open"),
    {
      of: "pane-push",
      expect: [
        ["pane-push", 280],
        ["page-fall", 280],
      ],
      read: leftOf('[data-slot="pane"]'),
    }
  );
  await readOne(
    kit,
    phone,
    `${engine} the phone's pane goes back`,
    () => phone.click('[data-act="close-pane"]'),
    {
      of: "pane-pop",
      expect: [
        ["pane-pop", 260],
        ["page-back", 260],
      ],
      read: leftOf('[data-slot="pane"]'),
    }
  );
};

/* ---------- The run ---------- */

/** One state of the frame, at one size on one engine: its boxes, its cards, Caw and the pane. */
const checkState = async (
  kit: Kit,
  page: Page,
  where: string,
  state: string
): Promise<void> => {
  const faults = await boxFaults(page);
  kit.check(
    `${where}: nothing spills or overlaps`,
    faults.length === 0,
    faults.slice(0, 6).join("; ")
  );
  const off = offGrammar(await cardLines(page));
  kit.check(
    `${where}: every card keeps its stage's grammar`,
    off.length === 0,
    off.slice(0, 6).join("; ")
  );
  for (const axis of await cawAxis(page)) {
    kit.check(
      `${where}: Caw stands on the axis`,
      Math.abs(axis.caw - axis.block) <= 1 &&
        Math.abs(axis.block - axis.column) <= 1,
      `Caw ${axis.caw.toFixed(2)}, his block ${axis.block.toFixed(2)}, the page column ${axis.column.toFixed(2)}`
    );
  }
  if (state === "open") {
    const count = await cardsBeforeTabs(page);
    kit.check(
      `${where}: the pane shows at most two cards before its tabs`,
      count >= 1 && count <= 2,
      `${count}`
    );
  }
};

/** Every state and fork the size shows (the columns fork under the drawer's line only). */
const LEGS = (size: View): [string, string][] =>
  size === "desk"
    ? STATES.map((state) => [state, "list"])
    : [
        ...STATES.map((state): [string, string] => [state, "list"]),
        ["rest", "columns"],
        ["waiting", "columns"],
      ];

const boxes = async (kit: Kit, origin: string): Promise<void> => {
  for (const engine of ENGINES) {
    for (const size of SIZES) {
      const page = await kit.page(size, { engine });
      listen(page, `${engine} ${size}`);
      await page.goto(`${origin}/index.html`);
      await page.waitForFunction(() => document.fonts.status === "loaded");
      const shell = await boxFaults(page);
      kit.check(
        `${engine} ${size}: the preview page holds its frames`,
        shell.length === 0,
        shell.join("; ")
      );
      for (const [state, layout] of LEGS(size)) {
        await openFrame(page, origin, state, layout);
        await checkState(
          kit,
          page,
          `${engine} ${size} ${state}${layout === "columns" ? " (columns)" : ""}`,
          state
        );
      }
    }
  }
};

const probe = async (kit: Kit): Promise<void> => {
  const server = serve();
  const origin = `http://127.0.0.1:${server.port}`;
  try {
    await boxes(kit, origin);
    for (const engine of ENGINES) {
      await motions(kit, origin, engine);
    }
    kit.check(
      "no page said a console error",
      errors.length === 0,
      errors.slice(0, 8).join("; ")
    );
  } finally {
    server.stop(true);
  }
};

const spec: Spec = { name: "project-preview", run: probe };
export default spec;
