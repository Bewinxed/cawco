/**
 * Find and Mention (apps/dashboard/src/lib/cawco/find), on a scratch fleet
 * with sessions in mixed states, mounted on the dev bench `/dev/finder`.
 * Read from the engine (state, geometry, the animation clock), never a
 * picture:
 *
 * - a title fragment ranks its session first; ↵ opens it; → peeks in place;
 * - "Where … was said" arrives labelled with its coverage (every machine
 *   answered, then one frozen and named), and an older answer never
 *   replaces a newer one;
 * - "No sessions for …" is drawn only once every source has answered;
 * - @ inserts a chip whose sent text is `@<title> · <apart> <handle>`;
 * - desk 1055×567 and phone 390×844 hold the wireframe's heights;
 * - the three felt moments, scrubbed: the list narrowing under a keystroke
 *   (a row that stays slides), the peek unfolding (what follows makes room),
 *   the chip arriving (the menu leaves faster than the chip enters).
 *
 * The fleet: "Orchestrate cockpit fleet" twice (one Working, one Sleeping),
 * "Boundary quiet fix" (Stopped, its transcript holds "nsenter"), "Landing
 * copy polish" (Idle).
 *
 *   bun scripts/probe-kit/run.ts web finder
 */
import type { Page } from "playwright-core";
import { until } from "../../../scratch-fleet";
import { Clock } from "../../anim";
import type { Kit, Spec } from "../../kit";
import { open, settle } from "../../kit";
import { emulateMotion } from "../../motion";

const DESK = { width: 1055, height: 567 };
const ORCH = "Orchestrate cockpit fleet";
const BOUNDARY = "Boundary quiet fix";

interface Log {
  machine: { id: string }[];
  opened: { id: string; moment: string | null; title: string }[];
  sent: string[];
}
const log = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __finder: { log: Log } }).__finder.log
  );

/** Each drawn finder row: its key, title text, height, top. */
const rows = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-finder-card] .slot")]
      .filter((slot) => !slot.closest("[inert]"))
      .map((slot) => {
        const box = slot.getBoundingClientRect();
        return {
          key: slot.dataset.key ?? "",
          title: slot.querySelector(".title")?.textContent?.trim() ?? "",
          h: Math.round(box.height * 10) / 10,
          top: box.top,
          reason: slot.querySelector(".reason") !== null,
          active: slot.querySelector("[data-active]") !== null,
        };
      })
  );

const height = (page: Page, selector: string) =>
  page.evaluate(
    (sel) => document.querySelector(sel)?.getBoundingClientRect().height ?? -1,
    selector
  );

/** Types into the finder's field as one input, as a paste would. */
async function words(page: Page, text: string) {
  await page.locator("[data-finder-card] input").fill(text);
}

/** Waits until the finder has its names answer for the words in its field. */
const namesIn = (page: Page) =>
  page.waitForFunction(() => {
    const f = (
      window as unknown as {
        __finder: {
          finder: { names: { state: string; for?: string }; asked: string };
        };
      }
    ).__finder.finder;
    return f.names.state === "ok" && f.names.for === f.asked;
  });
/** Waits until the machines have answered for the words in the field. */
const everywhereIn = (page: Page) =>
  page.waitForFunction(
    () =>
      (
        window as unknown as {
          __finder: { finder: { everywhereNow: unknown } };
        }
      ).__finder.finder.everywhereNow !== null,
    null,
    { timeout: 15_000 }
  );

async function openFinder(page: Page) {
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[data-finder-card] input");
  await namesIn(page);
  await settle(page);
}

async function ranksAndOpens(
  kit: Kit,
  page: Page,
  ids: Record<string, string>
) {
  await words(page, "boundary qu");
  await namesIn(page);
  await settle(page);
  const [first] = await rows(page);
  kit.check(
    "a title fragment ranks its session first (“boundary qu” → Boundary quiet fix, active)",
    first?.title === BOUNDARY && first.active,
    JSON.stringify(first)
  );
  await words(page, "cockpit flee");
  await namesIn(page);
  await settle(page);
  const both = (await rows(page)).slice(0, 2);
  kit.check(
    "words in any order rank both sessions of that title above the rest (“cockpit flee”)",
    both.every((r) => r.title === ORCH),
    JSON.stringify(both)
  );
  await words(page, "boundary qu");
  await namesIn(page);
  await settle(page);
  await page.keyboard.press("Enter");
  const opened = (await log(page)).opened.at(-1);
  kit.check(
    "↵ opens the active session (the log names Boundary quiet fix by its id)",
    opened?.title === BOUNDARY && opened.id === ids.boundary,
    JSON.stringify(opened)
  );
}

async function peeksInPlace(kit: Kit, page: Page) {
  await openFinder(page);
  await words(page, "cockpit flee");
  await namesIn(page);
  await settle(page);
  await page.keyboard.press("ArrowRight");
  await settle(page);
  const placed = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>(
      "[data-finder-card] .slot:has([data-active])"
    );
    const peek = row?.nextElementSibling as HTMLElement | null;
    if (!(row && peek?.classList.contains("peek-slot"))) {
      return null;
    }
    return {
      gap:
        peek.getBoundingClientRect().top - row.getBoundingClientRect().bottom,
      text: peek.textContent?.replace(/\s+/g, " ").trim() ?? "",
    };
  });
  kit.check(
    "→ peeks in place: the peek stands directly under its row, flush (the row's next sibling, 0px gap)",
    placed !== null && Math.abs(placed.gap) < 1,
    JSON.stringify(placed)
  );
}

async function saidSection(kit: Kit, page: Page) {
  await words(page, "nsenter");
  await namesIn(page);
  const searching = await page.evaluate(
    () => document.querySelector(".searching")?.textContent?.trim() ?? null
  );
  kit.check(
    "before the machines answer, the head stands with “Searching 1 machine…” and no empty line",
    searching === "Searching 1 machine…" &&
      (await page.locator(".nothing").count()) === 0,
    String(searching)
  );
  await everywhereIn(page);
  await settle(page);
  const said = await page.evaluate(() => ({
    head: document.querySelector(".head")?.textContent?.trim(),
    covered: document.querySelector(".covered")?.textContent?.trim() ?? null,
  }));
  const found = await rows(page);
  kit.check(
    "the transcript section arrives labelled with its words and its coverage (“Where “nsenter” was said”, “The machine answered”)",
    said.head === "Where “nsenter” was said" &&
      said.covered === "The machine answered",
    JSON.stringify(said)
  );
  kit.check(
    "with no session named for it, the first transcript row is active on arrival and carries its ↳ moment",
    found[0]?.active === true && found[0].reason,
    JSON.stringify(found[0])
  );
  await page.keyboard.press("Enter");
  const opened = (await log(page)).opened.at(-1);
  kit.check(
    "↵ on a transcript row opens its session at that moment (the log carries the moment's id)",
    typeof opened?.moment === "string" && opened.moment.length > 0,
    JSON.stringify(opened)
  );
}

async function staleNeverWins(kit: Kit, page: Page) {
  const order: string[] = [];
  await page.route("**/api/find?*", async (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get("q") ?? "";
    if (url.searchParams.get("transcripts") === "0") {
      return route.continue();
    }
    // The older words' machines answer late, after the newer ones'.
    await new Promise((r) => setTimeout(r, q === "boundary" ? 1800 : 50));
    const response = await route.fetch().catch(() => null);
    order.push(q);
    if (response) {
      await route.fulfill({ response }).catch(() => undefined);
    }
  });
  await openFinder(page);
  await words(page, "boundary");
  await page.waitForTimeout(450);
  await words(page, "boundary quiet");
  await page.waitForTimeout(2600);
  const shown = await page.evaluate(() => ({
    head: document.querySelector(".head")?.textContent?.trim(),
    saidFor: (
      window as unknown as { __finder: { finder: { saidFor: string } } }
    ).__finder.finder.saidFor,
  }));
  kit.check(
    "an older answer never replaces a newer one (“boundary” answered last, the head still names “boundary quiet”)",
    shown.head === "Where “boundary quiet” was said" &&
      shown.saidFor === "boundary quiet",
    `${JSON.stringify(shown)}; answered in order ${order.join(" → ")}`
  );
  await page.unroute("**/api/find?*");
  await page.keyboard.press("Escape");
}

async function nothingLast(kit: Kit, page: Page) {
  await page.route("**/api/find?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("transcripts") !== "0") {
      await new Promise((r) => setTimeout(r, 1200));
    }
    await route.continue().catch(() => undefined);
  });
  await openFinder(page);
  await page.evaluate(() => {
    const w = window as unknown as { __nothingAt?: number };
    new MutationObserver(() => {
      if (w.__nothingAt === undefined && document.querySelector(".nothing")) {
        w.__nothingAt = performance.now();
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await words(page, "zqxvw");
  await everywhereIn(page);
  await settle(page);
  const timing = await page.evaluate(() => {
    const answered = performance
      .getEntriesByType("resource")
      .filter(
        (e) => e.name.includes("q=zqxvw") && !e.name.includes("transcripts=0")
      )
      .map((e) => (e as PerformanceResourceTiming).responseEnd);
    return {
      nothingAt: (window as unknown as { __nothingAt?: number }).__nothingAt,
      answeredAt: Math.max(...answered),
      line: document.querySelector(".nothing-line")?.textContent?.trim(),
    };
  });
  kit.check(
    "“No sessions for …” is drawn only once every source answered (after the machines' answer landed, never while it was read)",
    timing.nothingAt !== undefined &&
      timing.nothingAt >= timing.answeredAt &&
      timing.line === "No sessions for “zqxvw”",
    JSON.stringify(timing)
  );
  await page.unroute("**/api/find?*");
  await page.keyboard.press("Escape");
}

async function missingMachine(kit: Kit, page: Page, frozen: string) {
  await openFinder(page);
  await words(page, "nsenter");
  await everywhereIn(page);
  await settle(page);
  const line = await page.evaluate(
    () =>
      document
        .querySelector(".coverage")
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? null
  );
  // The engine names a machine by its hostname (a scratch fleet's second
  // machine shares this host's): its coverage entry for the frozen one.
  const missing = await page.evaluate(
    (id) =>
      (
        window as unknown as {
          __finder: {
            finder: {
              everywhereNow: {
                coverage: {
                  machines: {
                    answered: boolean;
                    machineId: string;
                    name: string;
                  }[];
                };
              } | null;
            };
          };
        }
      ).__finder.finder.everywhereNow?.coverage.machines.find(
        (m) => m.machineId === id
      ) ?? null,
    frozen
  );
  kit.check(
    "a machine that didn't answer is named at the section's head with Retry, and nothing claims to be empty",
    missing !== null &&
      !missing.answered &&
      [missing.name, "didn't", "Retry"].every(
        (w) => line?.includes(w) === true
      ) &&
      (await page.locator(".nothing").count()) === 0,
    JSON.stringify({ line, missing })
  );
  await page.keyboard.press("Escape");
}

async function mentions(kit: Kit, page: Page) {
  await page.click(".editor");
  await page.keyboard.type("pass the fixes to the @orchestrate cockpit", {
    delay: 15,
  });
  await page.waitForSelector(".menu [data-find-row]");
  await settle(page);
  const handle = await page.evaluate(async () => {
    const r = await fetch(
      "/api/find?q=orchestrate%20cockpit&transcripts=0&kinds=conversation,thread,machine"
    );
    const body = (await r.json()) as { results: { handle: string | null }[] };
    return body.results.find((x) => x.handle)?.handle ?? null;
  });
  const widths = await page.evaluate(() => ({
    menu: document.querySelector(".menu")?.getBoundingClientRect().width,
    composer: document.querySelector("[data-composer]")?.getBoundingClientRect()
      .width,
    gap:
      (document.querySelector("[data-composer]")?.getBoundingClientRect().top ??
        0) -
      (document.querySelector(".menu")?.getBoundingClientRect().bottom ?? 0),
  }));
  kit.check(
    "the @ menu floats above the field at the composer's width (within its 1px edges), growing from its bottom edge",
    widths.menu !== undefined &&
      widths.composer !== undefined &&
      Math.abs(widths.composer - widths.menu) <= 2 &&
      widths.gap > 0,
    JSON.stringify(widths)
  );
  const clock = await Clock.on(page);
  await clock.catchRuns(() => page.keyboard.press("Enter"), "[data-composer]");
  const at = async () =>
    page.evaluate(() => {
      const chip = document.querySelector<HTMLElement>(".mention-chip");
      const menu = document.querySelector<HTMLElement>(".menu");
      return {
        chip: chip
          ? {
              opacity: Number(getComputedStyle(chip).opacity),
              transform: getComputedStyle(chip).transform,
            }
          : null,
        menu: menu ? Number(getComputedStyle(menu).opacity) : null,
      };
    });
  await clock.seek(0);
  const start = await at();
  await clock.seek(0.5);
  const mid = await at();
  await clock.seek(1);
  const end = await at();
  const chipRun = clock.length();
  await clock.release();
  kit.check(
    "the chip arrives where the words stood: it grows from 0.92 as it fades up (scrubbed 0 → ½ → 1), and the menu is fading out meanwhile",
    start.chip !== null &&
      start.chip.opacity < 0.05 &&
      start.chip.transform.startsWith("matrix(0.92") &&
      (mid.chip?.opacity ?? 0) > 0.3 &&
      end.chip?.opacity === 1 &&
      (end.chip?.transform === "none" ||
        end.chip?.transform.startsWith("matrix(1,")) &&
      (mid.menu === null || mid.menu < (start.menu ?? 1)),
    JSON.stringify({ start, mid, end, chipRun })
  );
  await page.keyboard.type("now");
  await page.keyboard.press("Enter");
  const sent = (await log(page)).sent.at(-1) ?? "";
  const shape = new RegExp(
    `^pass the fixes to the @${ORCH} · [^<]+ <([^>]+)> ?now$`
  );
  const match = shape.exec(sent.replace(/\s+/g, " "));
  kit.check(
    "@ inserts a chip whose sent text is the serialised form: `@<title> · <what tells it apart> <handle>` (the title is shared), the handle the hub answered",
    match !== null && match[1] === handle,
    `sent ${JSON.stringify(sent)}, hub handle ${handle}`
  );
}

async function deskHeights(kit: Kit, page: Page) {
  await openFinder(page);
  await words(page, "orchestrate fleet");
  await namesIn(page);
  await everywhereIn(page);
  await settle(page);
  const drawn = await rows(page);
  const card = await page.evaluate(() => {
    const box = document
      .querySelector("[data-finder-card]")
      ?.getBoundingClientRect();
    return box ? { h: box.height, bottom: box.bottom } : null;
  });
  const parts = {
    field: await height(page, "[data-finder-card] .field"),
    hints: await height(page, "[data-finder-card] .hints"),
    head: await height(page, "[data-finder-card] .head"),
    chips: await height(page, "[data-finder-card] .chips"),
  };
  kit.check(
    "desk 1055×567: rows are 52px, 70px with the ↳ line; field 44, hints 32, head 28, chips 36",
    drawn.length > 0 &&
      drawn.every((r) => r.h === (r.reason ? 70 : 52)) &&
      parts.field === 44 &&
      parts.hints === 32 &&
      parts.head === 28 &&
      parts.chips === 36,
    JSON.stringify({ rows: drawn.map((r) => r.h), parts })
  );
  // The mark line (DESIGN.md The Mark Line Rule): each title is trimmed to
  // its x-height and padded back (padding on, and its box still its 20px
  // line, which an untrimmed run would outgrow by the padding), so its box's
  // middle is its x-height's middle, on the glyph's middle within ½px.
  const lines = await page.evaluate(() =>
    [...document.querySelectorAll("[data-finder-card] .slot .row")].map(
      (row) => {
        const title = row.querySelector(".title") as HTMLElement;
        const glyph = row.querySelector(".glyph") as HTMLElement;
        const t = title.getBoundingClientRect();
        const g = glyph.getBoundingClientRect();
        return {
          pad: Number.parseFloat(getComputedStyle(title).paddingTop),
          h: t.height,
          off: t.top + t.height / 2 - (g.top + g.height / 2),
        };
      }
    )
  );
  kit.check(
    "desk: every title is on the mark line, its x-height's middle on its glyph's within ½px",
    lines.length > 0 &&
      lines.every((l) => l.pad > 0 && l.h === 20 && Math.abs(l.off) <= 0.5),
    JSON.stringify(lines.slice(0, 4))
  );
  kit.check(
    "desk 1055×567: the card stays within 499px, 24px clear of the window's foot",
    card !== null && card.h <= 499 && card.bottom <= DESK.height - 24 + 0.5,
    JSON.stringify(card)
  );
  await page.keyboard.press("Escape");
}

async function phoneHeights(kit: Kit, phone: Page) {
  await phone.click("[data-jump]");
  await phone.waitForSelector("[data-finder-card] input");
  await namesIn(phone);
  await words(phone, "orchestrate cockpit");
  await namesIn(phone);
  await settle(phone);
  const drawn = await rows(phone);
  const field = await phone.evaluate(() => {
    const f = document
      .querySelector("[data-finder-card] .field")
      ?.getBoundingClientRect();
    const rowsBottom = Math.max(
      ...[...document.querySelectorAll("[data-finder-card] .slot")].map(
        (s) => s.getBoundingClientRect().bottom
      )
    );
    return f ? { top: f.top, bottom: f.bottom, rowsBottom } : null;
  });
  const titles = await phone.evaluate(() =>
    [...document.querySelectorAll("[data-finder-card] .slot")].map((s) => ({
      lines: Math.round(
        (s.querySelector(".title")?.getBoundingClientRect().height ?? 0) / 20
      ),
      metaLines: Math.round(
        (s.querySelector(".meta")?.getBoundingClientRect().height ?? 0) / 16
      ),
      reasonLines: s.querySelector(".reason") ? 1 : 0,
      h: s.getBoundingClientRect().height,
    }))
  );
  kit.check(
    "phone 390×844: a row is 56px and 72px when its meta wraps (the wireframe's figures): 10px above and below, 20px title lines (16px, whole), 16px meta lines (13px)",
    titles.length > 0 &&
      titles.every(
        (t) =>
          Math.abs(
            t.h - (20 + 20 * t.lines + 16 * (t.metaLines + t.reasonLines))
          ) < 0.5
      ) &&
      titles.some((t) => t.lines === 1 && t.metaLines === 1 && t.h === 56),
    JSON.stringify(titles)
  );
  kit.check(
    "phone 390×844: the field sits at the sheet's foot and the best match is the row nearest it",
    field !== null &&
      Math.abs(field.bottom - 844) < 1 &&
      Math.abs(field.top - field.rowsBottom) <= 5 &&
      drawn.at(-1)?.title === ORCH,
    JSON.stringify({ field, last: drawn.at(-1) })
  );
}

async function narrowsBySliding(kit: Kit, page: Page, orchKey: string) {
  await openFinder(page);
  const before = await page.evaluate(
    (key) =>
      document
        .querySelector(`[data-finder-card] .slot[data-key="${key}"]`)
        ?.getBoundingClientRect().top ?? null,
    orchKey
  );
  const clock = await Clock.on(page);
  const runs = await clock.catchRuns(
    () => words(page, "orchestrate"),
    "[data-finder-card] .list"
  );
  const top = () =>
    page.evaluate(
      (key) =>
        document
          .querySelector(`[data-finder-card] .slot[data-key="${key}"]`)
          ?.getBoundingClientRect().top ?? null,
      orchKey
    );
  // The narrowing's own runs: a loop caught beside them (the searching
  // spinner) has no end and would stretch the clock past the slide.
  const finite = runs.filter((r) => !(r.loop || r.scroll));
  const slide = Math.max(...finite.map((r) => r.end));
  const of = (fraction: number) => (fraction * slide) / clock.length();
  await clock.seek(of(0));
  const t0 = await top();
  await clock.seek(of(0.5));
  const tHalf = await top();
  await clock.seek(of(1));
  const t1 = await top();
  const starts = new Set(finite.map((r) => Math.round(r.start ?? -1)));
  await clock.release();
  kit.check(
    "the first keystroke narrows the list by moving it: the session in both lists is the same row and slides from where it stood (scrubbed: at 0 where it was, at ½ between, at 1 where it lands)",
    before !== null &&
      t0 !== null &&
      tHalf !== null &&
      t1 !== null &&
      Math.abs(t0 - before) < 1 &&
      Math.abs(t1 - before) > 4 &&
      Math.min(t0, t1) < tHalf &&
      tHalf < Math.max(t0, t1),
    JSON.stringify({ before, t0, tHalf, t1 })
  );
  kit.check(
    "every piece of the narrowing starts on one frame (one start time across its runs)",
    starts.size === 1,
    JSON.stringify([...starts])
  );

  await settle(page);
  const below = await page.evaluate(() => {
    const active = document.querySelector(
      "[data-finder-card] .slot:has([data-active])"
    );
    return (
      (active?.nextElementSibling as HTMLElement | null)?.dataset.key ?? null
    );
  });
  const nextTop = () =>
    page.evaluate(
      (key) =>
        key
          ? (document
              .querySelector(`[data-finder-card] [data-key="${key}"]`)
              ?.getBoundingClientRect().top ?? null)
          : null,
      below
    );
  const was = await nextTop();
  const peekClock = await Clock.on(page);
  const peekRuns = await peekClock.catchRuns(
    () => page.keyboard.press("ArrowRight"),
    "[data-finder-card] .list"
  );
  const unfold = Math.max(
    ...peekRuns.filter((r) => !(r.loop || r.scroll)).map((r) => r.end)
  );
  const at = (fraction: number) =>
    peekClock.seek((fraction * unfold) / peekClock.length());
  await at(0);
  const p0 = await nextTop();
  await at(0.5);
  const pHalf = await nextTop();
  await at(1);
  const p1 = await nextTop();
  const peekH = await height(page, "[data-finder-card] .peek-slot");
  await peekClock.release();
  kit.check(
    "→ unfolds the peek in place: the row under it makes room on the same clock (scrubbed: at 0 where it was, at ½ between, at 1 lower by the peek's height)",
    was !== null &&
      p0 !== null &&
      pHalf !== null &&
      p1 !== null &&
      Math.abs(p0 - was) < 1 &&
      p0 < pHalf &&
      pHalf < p1 &&
      Math.abs(p1 - was - peekH) < 1.5,
    JSON.stringify({ was, p0, pHalf, p1, peekH })
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
}

async function chipWithLessMotion(kit: Kit, page: Page) {
  await emulateMotion(page, "reduce");
  await page.click(".editor");
  await page.keyboard.type(" and @landing copy", { delay: 15 });
  await page.waitForSelector(".menu [data-find-row]");
  await settle(page);
  await page.keyboard.press("Enter");
  const frames = await page.evaluate(() => {
    const chip = [
      ...document.querySelectorAll<HTMLElement>(".mention-chip"),
    ].at(-1);
    return (chip?.getAnimations() ?? []).map((a: Animation) =>
      (a.effect as KeyframeEffect)
        .getKeyframes()
        .map((k: Keyframe) => Object.keys(k))
    );
  });
  kit.check(
    "with less motion the chip only fades: no transform in its keyframes",
    frames.length > 0 &&
      frames.every((ks) => ks.every((k) => !k.includes("transform"))),
    JSON.stringify(frames)
  );
  await emulateMotion(page, null);
}

const spec: Spec = {
  name: "finder",
  run: async (kit: Kit) => {
    const fleet = await kit.fleet((request) =>
      request.last.includes("keep working")
        ? { everyMs: 400, words: Array.from({ length: 600 }, () => "working") }
        : { everyMs: 5, words: ["Noted."] }
    );
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const repliedTo = (text: string) =>
      until(
        `a reply to “${text}”`,
        () => fleet.seen.filter((s) => s.last.includes(text)).length,
        (n) => n > 0,
        60_000
      );

    const working = await fleet.spawn("claude", ORCH);
    const sleeping = await fleet.spawn("claude", ORCH);
    const boundary = await fleet.spawn("claude", BOUNDARY);
    await fleet.spawn("claude", "Landing copy polish");

    await fleet.send(
      boundary,
      "nsenter needs CAP_SYS_ADMIN inside the namespace"
    );
    await fleet.send(
      sleeping,
      "the orchestrate fleet session owns the rollout"
    );
    await repliedTo("nsenter needs CAP_SYS_ADMIN");
    await repliedTo("owns the rollout");
    await fleet.send(
      working,
      "decision: no nsenter, boundary-quiet instead. keep working"
    );
    await repliedTo("keep working");
    await Bun.sleep(1500);
    await fleet.control(sleeping, "sleep");
    await fleet.stopSession(boundary);
    await until(
      "the sleeping and stopped sessions filed",
      () => [
        fleet.instance(sleeping)?.status,
        fleet.instance(boundary)?.status,
      ],
      ([a, b]) => a === "sleeping" && b === "stopped",
      60_000
    );
    // A machine's index catches up when a search finds it over 10s old.
    await Bun.sleep(11_000);

    const base = await fleet.devDashboard();
    const page = await kit.page("desk");
    await page.setViewportSize(DESK);
    await open(page, `${base}/dev/finder`, "[data-composer]");

    // narrowsBySliding opens the finder itself, and leaves it shut.
    await narrowsBySliding(kit, page, `conversation:${working}`);
    await openFinder(page);
    await ranksAndOpens(kit, page, { boundary });
    await peeksInPlace(kit, page);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await openFinder(page);
    await saidSection(kit, page);
    await staleNeverWins(kit, page);
    await nothingLast(kit, page);
    await deskHeights(kit, page);
    await mentions(kit, page);
    await chipWithLessMotion(kit, page);

    const phone = await kit.page("phone");
    await open(phone, `${base}/dev/finder`, "[data-composer]");
    await phoneHeights(kit, phone);

    // Online once launched (scratch-fleet `launchMachine`); frozen, it holds
    // its connection and answers nothing, so the hub's ask times out.
    const other = await fleet.launchMachine("probe-frozen");
    process.kill(other.agent.pid, "SIGSTOP");
    try {
      await missingMachine(kit, page, "probe-frozen");
    } finally {
      process.kill(other.agent.pid, "SIGCONT");
    }
  },
};

export default spec;
