/**
 * A decision page's pick, read from the engine as the person makes it, on
 * the hub's decision host with no hub (decision-embeds.ts
 * `startDecisionStage`, the overlay's own pick on the stand-in bridge). A
 * page of three cards: `path` and `look` tall (a long top-down diagram
 * each), `radius` short; and a several-pick card on a page of its own.
 *
 * A press picks and the card stays open (the owner: "The done and continue
 * are useless buttons that break the flow of how this form should work";
 * asked whether a picked card folds or stays open, "Stays open"). On
 * Chromium and WebKit, at 1440×900 light (a mouse's clicks) and 390×844 dark
 * under a finger (real taps, `locator.tap()`):
 * 1. The pressed option shows chosen where it stands and the card stays
 *    open: every option showing, no Continue, Clear, Change or Done (its
 *    only other button "Add a note"), nothing folded. On Chromium, on the
 *    clock (anim.ts `Clock`, the DevTools Animation domain): its edge, fill
 *    and keycap change over --dur-control on ease-out, landing on
 *    `brand-solid` and `chip-chosen-bg` (L905, L540), and nothing runs on
 *    the card's height. The live region says "Picked <option>". A press on
 *    the chosen option clears it ("Cleared <option>"); pressed again, it is
 *    the pick once more. The count and Send's label morph on one clock.
 *    Every card picked: every card open, every control reaching 44px under
 *    a finger and 24px under a mouse, and nothing spills.
 * 2. From the keyboard (L690: "A choice made from the keyboard … is
 *    instant"): the arrows move focus among a card's options, one tab stop,
 *    and pick nothing; Space and an option's digit pick on the next frame
 *    with no animation under the card, and Space on the chosen one clears
 *    it; Enter picks nothing and folds nothing; a digit picks only in the
 *    card focus is in; ⌘/Ctrl+Enter sends.
 * 3. Send is the page's one coral action from load and after every pick:
 *    no other coral control stands on the page.
 * 4. A several-pick card toggles each option, and stays open.
 * 5. A note: "Add a note" opens its field with no Done; what is typed is
 *    kept as it is typed (the bridge's note); emptied and left, it folds
 *    back into "Add a note".
 *
 *   bun scripts/probe-kit/run.ts web decision-pick
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import type { Locator, Page } from "playwright-core";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import { Clock, type Run } from "../../anim";
import {
  CAWCO_BRIDGE,
  pageReach,
  startDecisionStage,
} from "../../decision-embeds";
import { type Engine, type Kit, type Spec, settle } from "../../kit";

const NAME = "pick";
const LONG = Array.from({ length: 9 }, (_, i) => `S${i}[Step ${i + 1}]`).join(
  " --> "
);
const PROGRAM = [
  `root = Decisions("Shape the launch", [path, look, radius])`,
  `path = Decision("path", "Which path does a reader take to sign up?", [direct, docs], "Fewer steps convert better.", [flow1])`,
  `direct = Option("direct", "Straight to sign up", "Visit, read, sign up.", true, [], "Readers who want details leave.")`,
  `docs = Option("docs", "Through the docs", "Visit, docs, try, sign up.", false, [], "Two more steps.")`,
  `flow1 = Diagram("flowchart TD\\n${LONG}", "The long path")`,
  `look = Decision("look", "Which card goes beside the ledger?", [card, pin], "The week's spend is what a person checks.", [flow2])`,
  `card = Option("card", "The side card", "The week's spend in its own card.", true, [], "It takes 360px.")`,
  `pin = Option("pin", "The note", "Only the pinned note.", false, [], "The spend is a click away.")`,
  `flow2 = Diagram("flowchart TD\\n${LONG}", "Where it stands")`,
  `radius = Decision("radius", "How round are the cards?", [soft, sharp], "Softer reads friendlier on paper.")`,
  `soft = Option("soft", "Soft", "16px corners.", true, [], "Less room at the corners.")`,
  `sharp = Option("sharp", "Sharp", "8px corners.", false, [], "Reads colder.")`,
].join("\n");

/** A several-pick card, on a page of its own. */
const MANY = "many";
const MANY_PROGRAM = [
  `root = Decisions("Reach", [reach, after])`,
  `reach = Decision("reach", "Where does the launch reach people?", [mail, feed, talk], "Each reaches a different reader.", [], [], true)`,
  `mail = Option("mail", "The newsletter", "Every subscriber, once.", true, [], "One more thing to write each week.")`,
  `feed = Option("feed", "The feed", "Readers who follow along.", false, [], "It scrolls past in a day.")`,
  `talk = Option("talk", "A talk", "The room, live.", false, [], "One evening of preparing.")`,
  `after = Decision("after", "Who answers replies?", [owner, team], "Replies need a person.")`,
  `owner = Option("owner", "The owner", "One voice.", true, [], "Slower on busy weeks.")`,
  `team = Option("team", "The team", "Faster replies.", false, [], "Many voices.")`,
].join("\n");

/** --ease-out as the engine writes it. */
const OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

const LEGS = [
  { engine: "chromium", view: "desk", theme: "light" },
  { engine: "chromium", view: "phone", theme: "dark" },
  { engine: "webkit", view: "desk", theme: "light" },
  { engine: "webkit", view: "phone", theme: "dark" },
] as const;

type Leg = (typeof LEGS)[number];
type View = Leg["view"];

const labelOf = (leg: Leg) =>
  `${leg.engine} ${leg.view === "desk" ? "1440 light" : "390 dark (coarse)"}`;

/**
 * A press as the device makes it: a finger's tap on the phone (touch input:
 * pointer, touch and compatibility mouse events, then the click), a mouse's
 * click on the desk.
 */
const pressOn = (locator: Locator, view: View) =>
  view === "phone" ? locator.tap() : locator.click();

/** A token's colour as the page computes it. */
const tokenColour = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("i");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);

/** A token's length in ms. */
const tokenMs = (page: Page, token: string) =>
  page.evaluate((name) => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    const value = Number.parseFloat(raw);
    return raw.endsWith("ms") ? value : value * 1000;
  }, token);

/** The chip `option` of card `id` as drawn: its edge, fill and keycap. */
const chipOf = (page: Page, id: string, option: string) =>
  page.evaluate(
    ([card, value]) => {
      const chip = document.querySelector<HTMLElement>(
        `#decision-${card} [data-option="${value}"]`
      );
      const cap = chip?.querySelector("[data-slot=kbd]");
      return {
        edge: chip ? getComputedStyle(chip).borderTopColor : "",
        fill: chip ? getComputedStyle(chip).backgroundColor : "",
        keycap: cap ? getComputedStyle(cap).backgroundColor : "",
      };
    },
    [id, option] as const
  );

/** Where focus stands: the card and option it is on, or Send. */
const focusOf = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return {
      card:
        active?.closest<HTMLElement>("[data-cawco-choice]")?.dataset
          .cawcoChoice ?? "",
      option: active?.dataset.option ?? "",
      send: !!active?.matches("[data-send]"),
    };
  });

/** Brings option `option` of card `id` to the window's middle, as a person scrolls to it. */
const toOption = async (page: Page, id: string, option: string) => {
  await page.evaluate(
    ([card, value]) =>
      document
        .querySelector(`#decision-${card} [data-option="${value}"]`)
        ?.scrollIntoView({ block: "center" }),
    [id, option] as const
  );
  await settle(page, 200);
};

/** Presses option `option` of card `id` and lets its pick settle. */
const pickIn = async (page: Page, id: string, option: string, view: View) => {
  await toOption(page, id, option);
  await pressOn(
    page.locator(`#decision-${id} [data-option="${option}"]`),
    view
  );
  await settle(page, 400);
};

/** What the page's one live region says now. */
const saidOf = (page: Page) =>
  page.evaluate(
    () =>
      document.querySelector("[data-slot=page-said]")?.textContent?.trim() ?? ""
  );

/**
 * Card `id` as drawn: the options it holds picked, the ones Tab reaches,
 * whether it stands open (every option showing, nothing folded), the names
 * of its buttons that are not options, and any of the old flow's controls.
 */
const cardOf = (page: Page, id: string) =>
  page.evaluate((card) => {
    const root = document.getElementById(`decision-${card}`);
    const seen = (el: Element) => el.checkVisibility({ opacityProperty: true });
    const options = [
      ...(root?.querySelectorAll<HTMLElement>("[data-option]") ?? []),
    ];
    return {
      picked: options
        .filter((one) => one.hasAttribute("data-cawco-picked"))
        .map((one) => one.dataset.option ?? ""),
      stops: options
        .filter((one) => one.tabIndex === 0)
        .map((one) => one.dataset.option ?? ""),
      open:
        options.length > 0 &&
        options.every(seen) &&
        !root?.hasAttribute("data-decided"),
      // Its own buttons: a media piece's own (a diagram's Open as canvas) are the piece's.
      buttons: [...(root?.querySelectorAll("button") ?? [])]
        .filter(
          (one) =>
            !(
              one.hasAttribute("data-option") ||
              one.closest(
                "[data-slot=decision-media], [data-slot=option-media]"
              )
            ) && seen(one)
        )
        .map((one) => one.textContent?.trim() ?? ""),
      old: [
        ...(root?.querySelectorAll(
          "[data-continue], [data-clear], [data-change], [data-slot=decided], [data-slot=decision-foot]"
        ) ?? []),
      ].length,
      height: Math.round((root?.getBoundingClientRect().height ?? 0) * 10) / 10,
    };
  }, id);

/** The one button a card stands beside its options: its note's opener. */
const ONLY_NOTE = '["Add a note"]';

/** Whether a card stands as the new flow draws it: open, nothing of the old flow, its one other button the note's opener. */
const standsOpen = (card: Awaited<ReturnType<typeof cardOf>>) =>
  card.open && card.old === 0 && JSON.stringify(card.buttons) === ONLY_NOTE;

/** The runs card `id` has on the next frame, and its pick's edge. */
const nextFrameOf = (page: Page, id: string) =>
  page.evaluate(
    (card) =>
      new Promise<{ edge: string; runs: string[] }>((done) =>
        requestAnimationFrame(() => {
          const root = document.getElementById(`decision-${card}`);
          const chip = root?.querySelector<HTMLElement>("[data-cawco-picked]");
          done({
            runs: (root?.getAnimations({ subtree: true }) ?? []).map(
              (run) =>
                `${run.constructor.name} ${(run as CSSTransition).transitionProperty ?? run.id}`
            ),
            edge: chip ? getComputedStyle(chip).borderTopColor : "",
          });
        })
      ),
    id
  );

/** Runs that share one start, length and curve: the faults, none when they do. */
const sameClock = (runs: readonly Run[]) => {
  const [first] = runs;
  if (!first) {
    return ["no runs"];
  }
  return runs.flatMap((run) =>
    run.start === null ||
    first.start === null ||
    Math.abs(run.start - first.start) > 0.5 ||
    Math.abs(run.end - first.end) > 0.5 ||
    run.easing !== first.easing
      ? [`${run.type} ${run.name} ${run.start}+${run.end} ${run.easing}`]
      : []
  );
};

/** A caught run in words. */
const said = (r: Run) =>
  `${r.type} ${r.name || "(web)"} start ${r.start} ${r.end}ms ${r.easing}`;

/** Every kit button on the page in the coral action's variant (DESIGN.md, Coral Action: the kit Button's `default`). */
const coralOf = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('button[data-variant="default"]')].map(
      (one) =>
        one.hasAttribute("data-send")
          ? "Send"
          : (one.textContent?.trim() ?? "?")
    )
  );

/** A leg's page on the stage's `url`, its errors heard. */
async function pageAt(kit: Kit, leg: Leg, url: string) {
  const page = await kit.page(leg.view, {
    engine: leg.engine as Engine,
    theme: leg.theme,
    init: [CAWCO_BRIDGE],
  });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text().slice(0, 300));
    }
  });
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 300)));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-option]").length >= 4,
    undefined,
    { timeout: 30_000 }
  );
  await settle(page, 600);
  return { page, errors };
}

/** 1. A pick stays open; pressed again it clears; every card picked, every control in reach, nothing spilling. */
async function pickLeg(kit: Kit, leg: Leg, url: string) {
  const label = labelOf(leg);
  const { page, errors } = await pageAt(kit, leg, url);
  await page.waitForFunction(
    () => document.querySelectorAll("[data-slot=diagram] svg").length >= 2,
    undefined,
    { timeout: 30_000 }
  );
  await settle(page, 400);
  const edge = await tokenColour(page, "--brand-solid");
  const keycap = await tokenColour(page, "--chip-chosen-bg");
  const control = await tokenMs(page, "--dur-control");
  await toOption(page, "path", "direct");
  const before = await cardOf(page, "path");
  if (leg.engine === "chromium") {
    const clock = await Clock.on(page);
    const runs = await clock.catchRuns(
      () =>
        pressOn(
          page.locator('#decision-path [data-option="direct"]'),
          leg.view
        ),
      "#decision-path"
    );
    const chip: Record<string, Awaited<ReturnType<typeof chipOf>>> = {};
    const height: Record<string, number> = {};
    for (const at of [0, 0.5, 1]) {
      await clock.seek(at);
      chip[String(at)] = await chipOf(page, "path", "direct");
      height[String(at)] = (await cardOf(page, "path")).height;
    }
    await clock.release();
    const colours = runs.filter(
      (run) => run.type === "CSSTransition" && run.name !== "opacity"
    );
    kit.check(
      `${label}: a pick turns the option chosen where it stands (its edge, fill and keycap over --dur-control on ease-out, landing on brand-solid and chip-chosen-bg), and nothing runs on the card's height: it stands at its height at 0, ½ and 1`,
      colours.length > 0 &&
        colours.every(
          (run) => Math.abs(run.end - control) < 1 && run.easing === OUT
        ) &&
        sameClock(colours).length === 0 &&
        chip["1"]?.edge === edge &&
        chip["1"]?.keycap === keycap &&
        chip["0"]?.keycap !== keycap &&
        Object.values(height).every((h) => Math.abs(h - before.height) < 1),
      JSON.stringify({ runs: runs.map(said), chip, height, was: before.height })
    );
  } else {
    await pressOn(
      page.locator('#decision-path [data-option="direct"]'),
      leg.view
    );
  }
  await settle(page, 400);
  const after = await cardOf(page, "path");
  const words = await saidOf(page);
  const drawn = await chipOf(page, "path", "direct");
  kit.check(
    `${label}: a press picks and the card stays open: every option showing, the pick in its chosen look, no Continue, Clear, Change or Done (its one other button "Add a note"), and the live region says "Picked Straight to sign up"`,
    JSON.stringify(after.picked) === '["direct"]' &&
      standsOpen(after) &&
      drawn.edge === edge &&
      drawn.keycap === keycap &&
      words === "Picked Straight to sign up",
    JSON.stringify({ after, drawn, words })
  );
  await pressOn(
    page.locator('#decision-path [data-option="direct"]'),
    leg.view
  );
  await settle(page, 400);
  const cleared = await cardOf(page, "path");
  const clearedSaid = await saidOf(page);
  await pressOn(
    page.locator('#decision-path [data-option="direct"]'),
    leg.view
  );
  await settle(page, 400);
  const again = await cardOf(page, "path");
  kit.check(
    `${label}: a press on the chosen option clears it ("Cleared Straight to sign up"), the card open; pressed again, it is the pick once more`,
    cleared.picked.length === 0 &&
      standsOpen(cleared) &&
      clearedSaid === "Cleared Straight to sign up" &&
      JSON.stringify(again.picked) === '["direct"]' &&
      standsOpen(again),
    JSON.stringify({ cleared, clearedSaid, again })
  );
  await pickIn(page, "look", "pin", leg.view);
  await pickIn(page, "radius", "sharp", leg.view);
  const cards = await Promise.all(
    ["path", "look", "radius"].map((id) => cardOf(page, id))
  );
  const count = await page.evaluate(
    () => document.querySelector("[data-slot=meter]")?.textContent?.trim() ?? ""
  );
  // Every card picked, read a window at a time (decision-embeds.ts
  // `pageReach`): under a finger each control's area reaches 44px (The 44
  // Touch Rule); at a desk 24px (The 24 Pointer Rule); nothing spills.
  const reach = await pageReach(page);
  const short = reach.controls.filter((one) =>
    leg.view === "phone" ? !one.touch : !one.pointer
  );
  kit.check(
    `${label}: every card picked, every card stands open, the count says "3 of 3 picked", every control reaches ${leg.view === "phone" ? "44px under a finger" : "24px under a mouse"} and nothing spills (${reach.controls.length} controls)`,
    cards.every(standsOpen) &&
      cards.every((one) => one.picked.length === 1) &&
      count.startsWith("3 of 3 picked") &&
      short.length === 0 &&
      reach.spills.length === 0,
    JSON.stringify({
      cards: cards.map((one) => [one.picked, one.open, one.buttons]),
      count,
      short: short.map((one) => one.line),
      spills: reach.spills,
    })
  );
  kit.check(
    `${label}: the page reported no error`,
    errors.length === 0,
    errors.join(" | ")
  );
  await page.close();
}

/** 2. From the keyboard: arrows move focus, Space and digits pick and clear in one frame, Enter does nothing, ⌘/Ctrl+Enter sends. */
async function keyLeg(kit: Kit, leg: Leg, url: string) {
  const label = labelOf(leg);
  const { page: keys } = await pageAt(kit, leg, url);
  const edge = await tokenColour(keys, "--brand-solid");
  await toOption(keys, "path", "direct");
  await keys.locator('#decision-path [data-option="direct"]').focus();
  const atRest = await cardOf(keys, "path");
  await keys.keyboard.press("ArrowDown");
  const down = { focus: await focusOf(keys), card: await cardOf(keys, "path") };
  await keys.keyboard.press("ArrowUp");
  const up = { focus: await focusOf(keys), card: await cardOf(keys, "path") };
  kit.check(
    `${label}: the arrows move focus among a card's options, one tab stop that follows focus, and pick nothing`,
    JSON.stringify(atRest.stops) === '["direct"]' &&
      down.focus.option === "docs" &&
      JSON.stringify(down.card.stops) === '["docs"]' &&
      up.focus.option === "direct" &&
      JSON.stringify(up.card.stops) === '["direct"]' &&
      down.card.picked.length === 0 &&
      up.card.picked.length === 0,
    JSON.stringify({ atRest, down, up })
  );
  await keys.keyboard.press("Enter");
  await settle(keys, 200);
  const none = await cardOf(keys, "path");
  kit.check(
    `${label}: Enter on a card with no pick does nothing: nothing picked, the card open`,
    none.picked.length === 0 && standsOpen(none),
    JSON.stringify(none)
  );
  await keys.keyboard.press(" ");
  const space = await nextFrameOf(keys, "path");
  const spaceCard = await cardOf(keys, "path");
  const spaceSaid = await saidOf(keys);
  await keys.keyboard.press(" ");
  const unspace = await nextFrameOf(keys, "path");
  const unspaceCard = await cardOf(keys, "path");
  kit.check(
    `${label}: Space picks the focused option on the next frame, no animation under the card, the card open ("Picked Straight to sign up"); Space again clears it the same way`,
    space.runs.length === 0 &&
      space.edge === edge &&
      JSON.stringify(spaceCard.picked) === '["direct"]' &&
      standsOpen(spaceCard) &&
      spaceSaid === "Picked Straight to sign up" &&
      unspace.runs.length === 0 &&
      unspaceCard.picked.length === 0 &&
      standsOpen(unspaceCard),
    JSON.stringify({ space, spaceCard, spaceSaid, unspace, unspaceCard })
  );
  await keys.keyboard.press("2");
  const digit = await nextFrameOf(keys, "path");
  const digitCard = await cardOf(keys, "path");
  const digitFocus = await focusOf(keys);
  const digitSaid = await saidOf(keys);
  kit.check(
    `${label}: the digit 2 picks the second option on the next frame, focus with it, no animation under the card, and the live region says "Picked Through the docs"`,
    digit.runs.length === 0 &&
      JSON.stringify(digitCard.picked) === '["docs"]' &&
      digitFocus.option === "docs" &&
      digitSaid === "Picked Through the docs",
    JSON.stringify({ digit, digitCard, digitFocus, digitSaid })
  );
  await keys.keyboard.press("Enter");
  await settle(keys, 200);
  const entered = await cardOf(keys, "path");
  const enteredFocus = await focusOf(keys);
  kit.check(
    `${label}: Enter on a picked card picks nothing and folds nothing: the pick stands, the card open, focus where it was`,
    JSON.stringify(entered.picked) === '["docs"]' &&
      standsOpen(entered) &&
      enteredFocus.option === "docs",
    JSON.stringify({ entered, enteredFocus })
  );
  await toOption(keys, "look", "card");
  await keys.locator('#decision-look [data-option="card"]').focus();
  await keys.keyboard.press("1");
  await settle(keys, 100);
  const lookCard = await cardOf(keys, "look");
  const pathCard = await cardOf(keys, "path");
  kit.check(
    `${label}: a digit picks only in the card focus is in`,
    JSON.stringify(lookCard.picked) === '["card"]' &&
      JSON.stringify(pathCard.picked) === '["docs"]',
    JSON.stringify({ lookCard, pathCard })
  );
  const goes = await keys.evaluate(
    () =>
      document
        .querySelector("[data-send] [data-slot=morph-text]")
        ?.textContent?.trim() ?? ""
  );
  await keys.keyboard.press("Control+Enter");
  await settle(keys, 300);
  // Sent, Send runs the kit's pending (DESIGN.md, Buttons, Pending): its
  // check held for --dur-hold, its label "Sent" and its keycaps gone.
  const sent = await keys.evaluate(() => {
    const send = document.querySelector("[data-send]");
    return {
      check:
        send?.querySelector("[data-slot=tick]")?.getAttribute("data-on") ??
        null,
      label:
        send?.querySelector("[data-slot=morph-text]")?.textContent?.trim() ??
        "",
      keys: [...(send?.querySelectorAll("[data-slot=kbd]") ?? [])].length,
    };
  });
  kit.check(
    `${label}: Ctrl+Enter sends from an option ("${goes}"): Send's pending ends on its check, its label now "${sent.label}", ${sent.keys} keycaps`,
    sent.check === "true" &&
      goes.startsWith("Send ") &&
      sent.label === "Sent" &&
      sent.keys === 0,
    JSON.stringify({ goes, ...sent })
  );
  await keys.close();
}

/** 3. Send is the page's one coral action, from load and after a pick. */
async function coralLeg(kit: Kit, leg: Leg, url: string) {
  const label = labelOf(leg);
  const { page } = await pageAt(kit, leg, url);
  const atLoad = await coralOf(page);
  await pickIn(page, "path", "docs", leg.view);
  const picked = await coralOf(page);
  kit.check(
    `${label}: Send is the page's one coral action, at load and after a pick`,
    JSON.stringify(atLoad) === '["Send"]' &&
      JSON.stringify(picked) === '["Send"]',
    JSON.stringify({ atLoad, picked })
  );
  await page.close();
}

/** 4. A several-pick card toggles each option and stays open. */
async function manyLeg(kit: Kit, leg: Leg, url: string) {
  const label = labelOf(leg);
  const { page } = await pageAt(kit, leg, url);
  await pickIn(page, "reach", "mail", leg.view);
  await pickIn(page, "reach", "feed", leg.view);
  const both = await cardOf(page, "reach");
  await pickIn(page, "reach", "mail", leg.view);
  const one = await cardOf(page, "reach");
  kit.check(
    `${label}: a several-pick card toggles each option, and stays open: mail and feed picked, then mail let go`,
    JSON.stringify([...both.picked].sort()) === '["feed","mail"]' &&
      standsOpen(both) &&
      JSON.stringify(one.picked) === '["feed"]' &&
      standsOpen(one),
    JSON.stringify({ both, one })
  );
  await page.close();
}

/** 5. A note opens with no Done, is kept as typed, and folds back once emptied and left. */
async function noteLeg(kit: Kit, leg: Leg, url: string) {
  const label = labelOf(leg);
  const { page } = await pageAt(kit, leg, url);
  const add = page.locator("#decision-radius [data-slot=note] button").first();
  await add.scrollIntoViewIfNeeded();
  await pressOn(add, leg.view);
  await settle(page, 600);
  const field = page.locator("#decision-radius textarea:not([aria-hidden])");
  await field.fill("Softer, but not 16px");
  await settle(page, 1200);
  const writing = await cardOf(page, "radius");
  const kept = await page.evaluate(
    () =>
      new Promise<string>((done) => {
        const bridge = (
          window as unknown as {
            cawco: {
              on: (
                event: "picks",
                listener: (picks: Record<string, { note?: string }>) => void
              ) => () => void;
            };
          }
        ).cawco;
        const stop = bridge.on("picks", (picks) => {
          done(picks.radius.note ?? "");
        });
        stop();
      })
  );
  const shown = await field.evaluate((el) =>
    el.checkVisibility({ opacityProperty: true })
  );
  await field.fill("");
  await page.locator("#decision-radius h2").click();
  await settle(page, 1200);
  const folded = await cardOf(page, "radius");
  kit.check(
    `${label}: "Add a note" opens its field with no Done, the words kept as typed; emptied and left, it folds back into "Add a note"`,
    shown &&
      writing.buttons.length === 0 &&
      writing.old === 0 &&
      kept === "Softer, but not 16px" &&
      JSON.stringify(folded.buttons) === ONLY_NOTE,
    JSON.stringify({ shown, writing, kept, folded })
  );
  await page.close();
}

const spec: Spec = {
  name: "decision-pick",
  run: async (kit: Kit) => {
    for (const program of [PROGRAM, MANY_PROGRAM]) {
      let refusal = "";
      try {
        checkProgram(program);
      } catch (error) {
        refusal = (error as Error).message;
      }
      kit.check(
        `the hub's check keeps the program (${program.slice(0, 40)}…)`,
        refusal === "",
        refusal
      );
    }
    const stage = await startDecisionStage(
      new Map([
        [NAME, PROGRAM],
        [MANY, MANY_PROGRAM],
      ]),
      {}
    );
    try {
      for (const leg of LEGS) {
        const url = stage.pageUrl(NAME, leg.theme);
        await pickLeg(kit, leg, url);
        await keyLeg(kit, leg, url);
        await coralLeg(kit, leg, url);
        await manyLeg(kit, leg, stage.pageUrl(MANY, leg.theme));
        await noteLeg(kit, leg, url);
      }
    } finally {
      await stage.stop();
    }
  },
};

export default spec;
