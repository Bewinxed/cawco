/**
 * The glass's one card (GlassCard, DESIGN.md "The glass's cards"), on the
 * glass bench (/motion/echo, no hub), on the desk and the phone, light and
 * dark. Owner: "when switching from caw to machines to explore, the panel
 * should morph in place, not collapse and reopen"; and "if i open caw and
 * close it on the web, there's a residiual shadow on the top right of the
 * transcript".
 *
 * A switch (one card hanging, another opened by a press), caught on the
 * clock (anim.ts) and read at 0, 25, 50, 75 and 100%:
 *  - the card is the same node throughout (engine);
 *  - its box runs a width and height tween over --dur-morph on
 *    --ease-drawer, and nothing on the card or its wrapper runs translate;
 *  - the outgoing contents fade out over --dur-exit on --ease-out and the
 *    incoming fade in over --dur-morph on --ease-drawer, each one way;
 *  - its trailing edge on the glass's flank and its top on the glass's foot,
 *    within 1px, at every reading (geometry);
 *  - once settled, the focus where the new contents put it.
 * ⌘K into Jump while another hangs: no animation on the card, its contents
 * or the glass's join on any of the 20 frames after it.
 * On the desk: switching again half-way starts the new tween from the size
 * the box is drawn at; Escape gives the focus back to what had it before
 * the first card opened (Caw's button); with less motion the box takes its
 * new size at once and the contents still cross-fade.
 * Every way it shuts (a press outside, Escape, its own item, ⌘K on Jump, a
 * close caught mid-open, a close caught mid-switch): once shut, none of its
 * shadow (its border-image, outset under its box) lies below the cut,
 * nothing runs on it, and the glass draws no join and Caw's arcs are back.
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each switch and close is read in order, case by case.
// biome-ignore-all lint/performance/noAwaitInLoops: one switch, one reading, one close at a time.
import type { Page } from "playwright-core";
import { Clock } from "../../anim";
import { r2 } from "../../geom";
import { frames, type Kit, open, type Spec, settle, THEMES } from "../../kit";
import { emulateMotion } from "../../motion";

type Face = "caw" | "machines" | "jump";
const ROUTE = "/motion/echo";
const CARD = ".kit-pop.kit-hang.glass-card";
const PCTS = [0, 25, 50, 75, 100];
/** Where a press lands on the page, clear of the bar and the card. */
/**
 * A press outside every card. On a phone, under the foot of Jump's sheet,
 * which stands the screen's whole height but the bar and 24px at the foot
 * (FinderCard): 620 was on the finder itself.
 */
const OUTSIDE = { desk: { x: 700, y: 600 }, phone: { x: 195, y: 836 } };
/** The focus each card's contents take as they come in. */
const FOCUS: Record<Face, string> = {
  caw: "a.cover, button, .empty",
  machines: ".row",
  jump: "input",
};

interface Described {
  duration: number;
  easing: string;
  props: string[];
}

/** The card now: its node, what runs on it and its faces, and where it stands against the glass. */
const cardNow = (page: Page) =>
  page.evaluate((sel) => {
    const card = document.querySelector<HTMLElement>(sel);
    const glass = document.querySelector<HTMLElement>("[data-bar-group]");
    const joinEl = glass?.querySelector<HTMLElement>(".join");
    if (!(card && glass && joinEl)) {
      return null;
    }
    const describe = (run: Animation) => {
      const effect = run.effect as KeyframeEffect;
      return {
        props: [
          ...new Set(
            effect
              .getKeyframes()
              .flatMap((k) =>
                Object.keys(k).filter(
                  (x) =>
                    ![
                      "offset",
                      "easing",
                      "composite",
                      "computedOffset",
                    ].includes(x)
                )
              )
          ),
        ],
        duration: Number(effect.getComputedTiming().duration),
        easing: effect.getTiming().easing ?? "",
      };
    };
    const cb = card.getBoundingClientRect();
    const gb = glass.getBoundingClientRect();
    // The join reaches 1px under the glass's foot, into the card's top edge.
    const foot = joinEl.getBoundingClientRect().bottom - 1;
    return {
      same: card === (window as unknown as { __card?: Element }).__card,
      box: card.getAnimations().map(describe),
      wrapper: card.parentElement?.getAnimations().map(describe) ?? [],
      faces: [...card.querySelectorAll<HTMLElement>(".glass-face")].map(
        (f) => ({
          face: f.dataset.face as string,
          leaving: f.inert,
          opacity: Number(getComputedStyle(f).opacity),
          runs: f.getAnimations().map(describe),
        })
      ),
      trailing: cb.right - gb.right,
      top: cb.top - foot,
      size: [cb.width, cb.height],
    };
  }, CARD);
type Now = NonNullable<Awaited<ReturnType<typeof cardNow>>>;

/** The card once shut: how far its shadow reaches below the cut, and what is left of it. */
const shutNow = (page: Page) =>
  page.evaluate((sel) => {
    const card = document.querySelector<HTMLElement>(sel);
    const glass = document.querySelector<HTMLElement>("[data-bar-group]");
    if (!(card?.parentElement && glass)) {
      return null;
    }
    const style = getComputedStyle(card);
    // border-image-outset: top [right [bottom [left]]].
    const outset = style.borderImageOutset
      .split(" ")
      .map((v) => Number.parseFloat(v) || 0);
    const reach = outset[2] ?? outset[0] ?? 0;
    const cut = card.parentElement.getBoundingClientRect().top;
    const runningOn = (el: Element) =>
      el.getAnimations().filter((run) => run.playState === "running").length;
    return {
      reach,
      belowCut: Math.max(0, card.getBoundingClientRect().bottom + reach - cut),
      running: [card, ...card.querySelectorAll(".glass-face")].reduce(
        (n, el) => n + runningOn(el),
        0
      ),
      joined: glass.hasAttribute("data-joined"),
      join: Number(
        getComputedStyle(glass.querySelector(".join") as Element).opacity
      ),
      arcs: [...document.querySelectorAll("[data-needs-caw] .rim.foot")].map(
        (rim) => Number(getComputedStyle(rim).opacity)
      ),
    };
  }, CARD);

/** Where the focus is: the face it is in and whether it is what its contents take. */
const focusNow = (page: Page) =>
  page.evaluate((focus) => {
    const at = document.activeElement as HTMLElement | null;
    const face = at?.closest<HTMLElement>(".glass-face")?.dataset.face ?? null;
    return {
      face,
      fits: face
        ? (at?.matches((focus as Record<string, string>)[face] ?? "") ?? false)
        : false,
      what: at?.getAttribute("aria-label") ?? at?.tagName ?? "nothing",
    };
  }, FOCUS);

async function readAt(kit: Kit, view: "desk" | "phone", theme: string) {
  const where = `${view} ${theme}`;
  const page = await kit.page(view, { theme: theme as "light" | "dark" });
  await open(
    page,
    `${await kit.bench()}${ROUTE}?theme=${theme}`,
    "[data-needs-caw]",
    120_000
  );
  await settle(page, 400);
  // The card's unseen first open, placed and shut.
  await page.waitForTimeout(800);
  await page.evaluate((sel) => {
    (window as unknown as { __card?: Element }).__card =
      document.querySelector(sel) ?? undefined;
  }, CARD);
  const tokens = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const read = (name: string) => root.getPropertyValue(name).trim();
    return {
      morph: Number.parseFloat(read("--dur-morph")),
      exit: Number.parseFloat(read("--dur-exit")),
      drawer: read("--ease-drawer"),
      out: read("--ease-out"),
    };
  });
  const touch = view === "phone";
  const outside = OUTSIDE[view];
  const press = async (card: Face) => {
    if (card === "caw") {
      await page.click("[data-needs-caw]");
    } else if (card === "machines") {
      await page.click(".bar-item.machines");
    } else if (touch) {
      await page.click(".burger");
      await settle(page, 300);
      await page.click(".rail-sheet button.search");
    } else {
      await page.click("[data-share='jump']");
    }
  };
  const rest = async () => {
    await settle(page, 350);
  };
  const clock = await Clock.on(page);

  const switchTo = async (to: Face) => {
    const name = `${where}: switching to ${to}`;
    await clock.catchRuns(() => press(to), CARD);
    const read: Now[] = [];
    for (const pct of PCTS) {
      await clock.seek(pct / 100);
      const now = await cardNow(page);
      if (now) {
        read.push(now);
      }
    }
    await clock.release();
    await rest();
    if (to === "caw") {
      await page.waitForTimeout(200);
    }
    const [first] = read;
    const runsOf = (one: Now) => [...one.box, ...one.wrapper];
    kit.check(
      `${name}: the same card throughout`,
      read.length === PCTS.length && read.every((one) => one.same)
    );
    const box = first?.box ?? [];
    kit.check(
      `${name}: its box tweens width and height over --dur-morph on --ease-drawer, nothing translates`,
      box.length > 0 &&
        box.every(
          (run: Described) =>
            run.props.includes("width") &&
            run.props.includes("height") &&
            run.duration === tokens.morph &&
            run.easing === tokens.drawer
        ) &&
        read.every((one) =>
          runsOf(one).every((run) => !run.props.includes("translate"))
        ),
      box
        .map((run) => `${run.props.join("+")} ${run.duration}ms ${run.easing}`)
        .join("; ") || "no tween"
    );
    const leaving = first?.faces.find((f) => f.leaving);
    const coming = first?.faces.find((f) => f.face === to && !f.leaving);
    const opacities = (face: string | undefined) =>
      read.map((one) => one.faces.find((f) => f.face === face)?.opacity ?? 0);
    const outs = opacities(leaving?.face);
    const ins = opacities(coming?.face);
    kit.check(
      `${name}: the contents cross-fade, out over --dur-exit on --ease-out, in over --dur-morph on --ease-drawer`,
      !!leaving &&
        !!coming &&
        leaving.runs.some(
          (run) =>
            run.props.includes("opacity") &&
            run.duration === tokens.exit &&
            run.easing === tokens.out
        ) &&
        coming.runs.some(
          (run) =>
            run.props.includes("opacity") &&
            run.duration === tokens.morph &&
            run.easing === tokens.drawer
        ) &&
        outs.every((v, k) => k === 0 || v <= (outs[k - 1] ?? 1) + 0.01) &&
        ins.every((v, k) => k === 0 || v >= (ins[k - 1] ?? 0) - 0.01) &&
        (ins.at(-1) ?? 0) > 0.99,
      `out ${leaving?.face} ${outs.map(r2).join(" → ")}; in ${coming?.face} ${ins.map(r2).join(" → ")}`
    );
    kit.check(
      `${name}: its trailing edge on the glass's flank and its top on its foot, within 1px, at every reading`,
      read.every(
        (one) => Math.abs(one.trailing) <= 1 && Math.abs(one.top) <= 1
      ),
      `trailing ${read.map((one) => r2(one.trailing)).join(" ")}; top ${read.map((one) => r2(one.top)).join(" ")}; size ${read.map((one) => one.size.map(r2).join("×")).join(" → ")}`
    );
    const focus = await focusNow(page);
    kit.check(
      `${name}: the focus where its contents put it`,
      focus.face === to && focus.fits,
      `${focus.face} ${focus.what}`
    );
  };

  /** ⌘K into Jump: the 20 frames after it, and what ran on them. */
  const shortcut = async (from: Face) => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __frames: { faces: string[]; runs: number; joinRuns: number }[];
        __done: boolean;
      };
      w.__frames = [];
      w.__done = false;
      const step = () => {
        const card = document.querySelector(".kit-pop.kit-hang.glass-card");
        const joinEl = document.querySelector("[data-bar-group] .join");
        const faces = [
          ...(card?.querySelectorAll<HTMLElement>(".glass-face") ?? []),
        ];
        w.__frames.push({
          faces: faces.map((f) => f.dataset.face ?? ""),
          runs:
            (card?.getAnimations().length ?? 0) +
            faces.reduce((k, f) => k + f.getAnimations().length, 0),
          joinRuns: joinEl?.getAnimations().length ?? 0,
        });
        if (w.__frames.length < 20) {
          requestAnimationFrame(step);
        } else {
          w.__done = true;
        }
      };
      requestAnimationFrame(step);
    });
    await page.keyboard.press("Control+k");
    await page.waitForFunction(
      () => (window as unknown as { __done: boolean }).__done
    );
    const list = (await page.evaluate(
      () => (window as unknown as { __frames: unknown[] }).__frames
    )) as { faces: string[]; runs: number; joinRuns: number }[];
    await rest();
    const focus = await focusNow(page);
    kit.check(
      `${where}: ⌘K from ${from} changes the card to Jump at once, nothing animating`,
      JSON.stringify(list.at(-1)?.faces) === '["jump"]' &&
        list.every((f) => f.runs === 0 && f.joinRuns === 0) &&
        focus.face === "jump" &&
        focus.fits,
      `frames with runs ${list.filter((f) => f.runs > 0).length}, with join runs ${list.filter((f) => f.joinRuns > 0).length}; faces ${list.at(-1)?.faces}; focus ${focus.face} ${focus.what}`
    );
  };

  // Opened from closed by a press: Caw on the desk, Jump from the phone's sidebar.
  const first: Face = touch ? "jump" : "caw";
  await press(first);
  await page.evaluate(() => {
    (window as unknown as { __before?: Element }).__before =
      document.activeElement ?? undefined;
  });
  await rest();
  for (const to of touch
    ? (["caw"] as Face[])
    : (["machines", "jump", "caw"] as Face[])) {
    await switchTo(to);
  }
  await shortcut("caw");
  if (touch) {
    // The sheet's search field invoked Jump and went with the sheet: the
    // card was handed what invoked the sheet, the burger (WAI-ARIA APG,
    // dialog pattern).
    await page.keyboard.press("Escape");
    await rest();
    const atBurger = await page.evaluate(
      () => document.activeElement?.matches(".burger") ?? false
    );
    kit.check(
      `${where}: Escape gives the focus to the burger, which invoked the sheet Jump was opened from`,
      atBurger,
      (await focusNow(page)).what
    );
  } else {
    await page.click(".bar-item.machines");
    await rest();
    await shortcut("machines");

    // Switched again half-way through a switch.
    await press("caw");
    await rest();
    await clock.catchRuns(() => press("machines"), CARD);
    await clock.seek(0.5);
    const drawnAt = (await cardNow(page))?.size ?? [0, 0];
    await press("jump");
    await page.waitForTimeout(80);
    const from = await page.evaluate((sel) => {
      const start = (
        document.querySelector(sel)?.getAnimations()[0]?.effect as
          KeyframeEffect | undefined
      )?.getKeyframes()[0];
      return start
        ? [
            Number.parseFloat(String(start.width)),
            Number.parseFloat(String(start.height)),
          ]
        : null;
    }, CARD);
    await clock.release();
    await rest();
    kit.check(
      `${where}: switched again half-way, the new tween starts from the size the box is drawn at`,
      !!from &&
        Math.abs((from[0] ?? 0) - (drawnAt[0] ?? 0)) <= 1 &&
        Math.abs((from[1] ?? 0) - (drawnAt[1] ?? 0)) <= 1,
      `drawn ${drawnAt.map(r2).join("×")}, tween from ${from?.join("×") ?? "none"}`
    );

    await page.keyboard.press("Escape");
    await rest();
    const back = await page.evaluate(
      () =>
        document.activeElement ===
        (window as unknown as { __before?: Element }).__before
    );
    kit.check(
      `${where}: Escape gives the focus back to what had it before the first card opened`,
      back
    );

    // With less motion.
    await emulateMotion(page, "reduce");
    await press("caw");
    await rest();
    await press("machines");
    await page.waitForFunction(
      (sel) =>
        document.querySelector(`${sel} .glass-face[data-face="machines"]`) !==
        null,
      CARD
    );
    await frames(page);
    const reduced = await cardNow(page);
    kit.check(
      `${where}: with less motion the box takes its new size at once and the contents still cross-fade`,
      !!reduced &&
        reduced.box.length === 0 &&
        reduced.faces.some((f) =>
          f.runs.some((run) => run.props.includes("opacity"))
        ),
      `box runs ${reduced?.box.length}; faces ${reduced?.faces.map((f) => `${f.face} ${f.runs.length}`).join(", ")}`
    );
    await rest();
    await page.keyboard.press("Escape");
    await rest();
    await emulateMotion(page, null);
  }

  // Any other text field keeps ⌘K: typed there, it opens nothing.
  await page.evaluate(() => {
    const field = document.createElement("input");
    field.className = "probe-field";
    document.body.append(field);
    field.focus();
  });
  await page.keyboard.press("Control+k");
  await rest();
  const otherField = await page.evaluate((sel) => {
    const field = document.querySelector<HTMLInputElement>(".probe-field");
    const kept = document.activeElement === field;
    field?.remove();
    return {
      kept,
      open: document.querySelector(sel)?.getAttribute("data-state") === "open",
    };
  }, CARD);
  kit.check(
    `${where}: ⌘K in any other text field opens nothing and keeps the field's focus`,
    otherField.kept && !otherField.open,
    JSON.stringify(otherField)
  );

  // Every way it shuts, each from a card standing open.
  const opener: Face = touch ? "jump" : "caw";
  const outsidePress = async () => {
    const onCard = await page.evaluate(
      ({ x, y, sel }) =>
        document.elementFromPoint(x, y)?.closest(sel)?.className ?? null,
      { ...outside, sel: CARD }
    );
    if (onCard !== null) {
      throw new Error(
        `the press outside (${outside.x}, ${outside.y}) lands on the card (${onCard})`
      );
    }
    await page.mouse.click(outside.x, outside.y);
  };
  const closes: [string, () => Promise<void>][] = [
    [
      "a press outside",
      async () => {
        await press(opener);
        await rest();
        await outsidePress();
      },
    ],
    [
      "Escape",
      async () => {
        await press(opener);
        await rest();
        await page.keyboard.press("Escape");
      },
    ],
    [
      "Caw pressed again",
      async () => {
        await press("caw");
        await rest();
        await press("caw");
      },
    ],
    [
      "⌘K on Jump",
      async () => {
        await page.keyboard.press("Control+k");
        await rest();
        // As it always is once Jump stands open: its own field has the focus.
        const inField = await focusNow(page);
        kit.check(
          `${where}: Jump's field has the focus as ⌘K closes it`,
          inField.face === "jump" && inField.fits,
          `${inField.face} ${inField.what}`
        );
        await page.keyboard.press("Control+k");
      },
    ],
    [
      "a close caught mid-open",
      async () => {
        await press("caw");
        await page.waitForFunction(
          (sel) => document.querySelector(`${sel}[data-shown]`) !== null,
          CARD
        );
        await page.waitForTimeout(60);
        await outsidePress();
      },
    ],
    [
      "a close caught mid-switch",
      async () => {
        await press(opener);
        await rest();
        await press(touch ? "caw" : "machines");
        await page.waitForTimeout(touch ? 70 : 40);
        await outsidePress();
      },
    ],
  ];
  for (const [how, act] of closes) {
    await act();
    await rest();
    const shut = await shutNow(page);
    kit.check(
      `${where}: shut by ${how}, none of its shadow below the cut, nothing running, no join, Caw's arcs back`,
      !!shut &&
        shut.belowCut <= 0 &&
        shut.running === 0 &&
        !shut.joined &&
        shut.join === 0 &&
        shut.arcs.every((v) => v === 1),
      shut
        ? `shadow reach ${shut.reach}px, below the cut ${r2(shut.belowCut)}px, running ${shut.running}, joined ${shut.joined}, join ${shut.join}, arcs ${shut.arcs.join(",")}`
        : "no card"
    );
  }
  await page.close();
}

const spec: Spec = {
  name: "glass-morph",
  run: async (kit) => {
    for (const view of ["desk", "phone"] as const) {
      for (const theme of THEMES) {
        await readAt(kit, view, theme);
      }
    }
  },
};
export default spec;
