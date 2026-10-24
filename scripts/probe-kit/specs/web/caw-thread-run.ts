/**
 * Two of the person's messages in a row in Caw's chat stand in one well
 * with no room between them their actions and time do not draw (the owner,
 * in Cawco-Dev's Caw thread: "there's wasted space above the row in the
 * transcript here in cawco's chat, why").
 *
 * A scratch fleet (real hub, agent and sessiond) and the built dashboard. A
 * project made from a folder gets a Caw thread holding two of the person's
 * messages in a row (Caw is not woken inside a workspace, so nothing
 * answers between them, as in the owner's thread). On Chromium and WebKit,
 * at 1440 and 390, the thread is opened as a tab and read from the engine:
 *
 *  1. at rest the two messages stand as one run: the second part's own
 *     line holds its clock; from the first message's last line box to the
 *     seam between the parts is the well's padding, and from the seam to the
 *     second part's line nothing stands empty: the line's own drawn row
 *     starts at the seam;
 *  2. under the pointer (a finger: at rest, its handle) the second part's
 *     actions show on that line, covering neither message's words, and
 *     moving no text (the second message's first line and its part line
 *     within 0.5px);
 *  3. a mouse's layout is a finger's: on each engine, the first message's
 *     last line to the second part's line is the same at 1440 with a fine
 *     pointer and at 390 with a coarse one, measured from the line box and
 *     from the last run of glyphs alike (the owner's host read, glyphs to
 *     line, gave 11px with a mouse against 7px line box to line with a
 *     finger: the difference is the line's half-leading under the glyphs,
 *     in both, not room above the row);
 *  4. no console error.
 *
 *   bun scripts/probe-kit/run.ts web caw-thread-run
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import type { Page } from "playwright-core";
import { MACHINE, until } from "../../../scratch-fleet";
import {
  type Engine,
  type Kit,
  kitsOwnMessage,
  open,
  type Spec,
  settle,
  type View,
} from "../../kit";

const FIRST =
  "connect cawco-dev to its github repo so issues, discussions, prs, etc can show up here as tasks or something";
const SECOND = "how will u route them?";

const LEGS: { engine: Engine; view: View; label: string; touch: boolean }[] = [
  { engine: "chromium", view: "desk", label: "chromium 1440", touch: false },
  { engine: "webkit", view: "desk", label: "webkit 1440", touch: false },
  { engine: "chromium", view: "phone", label: "chromium 390", touch: true },
  { engine: "webkit", view: "phone", label: "webkit 390", touch: true },
];

interface Seam {
  /** The strip on the second part's line, or its handle on a touch screen. */
  actions: {
    bottom: number;
    opacity: string;
    top: number;
  } | null;
  clock: { bottom: number; opacity: string; text: string; top: number } | null;
  /**
   * The first message's last run of words, its own box's foot: the font's
   * content area, which stands the line's half-leading above the line box's
   * foot (Figtree at 14px on a 24px line: 17px of glyphs, 3.5px each side).
   */
  lastGlyphs: number;
  /** The first message's last line box, its foot. */
  lastLine: number;
  /** The second part's line: its box, and its clock's. */
  line: { bottom: number; top: number } | null;
  /** The well's padding at the foot of the first part, px. */
  padFoot: number;
  /** The page's pointer, as its media says. */
  pointer: "fine" | "coarse" | "none";
  /** The hairline between the parts: its top. */
  seam: number;
  /** The second part's first line box: its top. */
  secondTop: number;
  /** The gap token the parts' padding is. */
  token: number;
}

/** The two parts, read where they are drawn. In the page. */
function seamOf(texts: { first: string; second: string }): Seam | null {
  const turns = [
    ...document.querySelectorAll<HTMLElement>(
      'section[data-slot="turn"][data-you]'
    ),
  ];
  const turnOf = (text: string) =>
    turns.find(
      (turn) =>
        turn.querySelector("[data-lift-words]")?.textContent?.trim() === text
    );
  const one = turnOf(texts.first);
  const two = turnOf(texts.second);
  const words = (turn: HTMLElement | undefined) =>
    turn?.querySelector<HTMLElement>("[data-lift-words]");
  const firstWords = words(one);
  const secondWords = words(two);
  const wellOne = one?.querySelector<HTMLElement>('[data-slot="well"]');
  const wellTwo = two?.querySelector<HTMLElement>('[data-slot="well"]');
  if (!(firstWords && secondWords && wellOne && wellTwo)) {
    return null;
  }
  const lines = (el: HTMLElement) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()].filter((r) => r.height > 0);
  };
  const line = two?.querySelector<HTMLElement>('[data-slot="part-line"]');
  const clock = line?.querySelector<HTMLElement>('time[data-slot="when"]');
  const actions =
    line?.querySelector<HTMLElement>("[data-message-actions]") ??
    line?.querySelector<HTMLElement>('[data-slot="handle"]');
  const box = (el: HTMLElement | null | undefined) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  };
  const probe = document.createElement("i");
  probe.style.blockSize = "var(--space-2)";
  probe.style.display = "block";
  document.body.append(probe);
  const token = probe.getBoundingClientRect().height;
  probe.remove();
  const runs = lines(firstWords);
  let pointer: Seam["pointer"] = "none";
  if (matchMedia("(pointer: fine)").matches) {
    pointer = "fine";
  } else if (matchMedia("(pointer: coarse)").matches) {
    pointer = "coarse";
  }
  return {
    pointer,
    lastGlyphs: runs.at(-1)?.bottom ?? Number.NaN,
    lastLine: Math.max(...runs.map((r) => r.bottom)),
    padFoot: Number.parseFloat(getComputedStyle(wellOne).paddingBottom),
    seam: wellTwo.getBoundingClientRect().top,
    line: box(line),
    clock: clock
      ? {
          ...(box(clock) as { top: number; bottom: number }),
          opacity: getComputedStyle(clock).opacity,
          text: clock.textContent?.trim() ?? "",
        }
      : null,
    secondTop: Math.min(...lines(secondWords).map((r) => r.top)),
    actions: actions
      ? {
          ...(box(actions) as { top: number; bottom: number }),
          opacity: getComputedStyle(actions).opacity,
        }
      : null,
    token,
  };
}

const EDGE = 0.75;

/** What a leg measured at rest: from the first message's last line box, and its last run of glyphs, to the second part's line. */
interface Figures {
  glyphsToLine: number;
  lineToLine: number;
}

async function leg(
  kit: Kit,
  base: string,
  threadId: string,
  one: (typeof LEGS)[number]
): Promise<{ errors: string[]; figures: Figures | null }> {
  const page: Page = await kit.page(one.view, {
    theme: "light",
    engine: one.engine,
  });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  const tab = `thread:${threadId}`;
  await page.addInitScript((id) => {
    localStorage.setItem(
      "cawco-workspace",
      JSON.stringify({
        v: 1,
        root: { t: "l", id: "pone", tabs: [id], active: id, opened: null },
        focusedLeaf: "pone",
      })
    );
  }, tab);
  await open(
    page,
    `${base}/session/${tab}`,
    'section[data-slot="turn"][data-you]',
    120_000
  );
  await page
    .getByText(SECOND, { exact: true })
    .first()
    .waitFor({ timeout: 60_000 });
  await page.mouse.move(2, 2);
  await settle(page, 600);
  const rest = await page.evaluate(seamOf, { first: FIRST, second: SECOND });
  if (!rest?.line) {
    kit.check(
      `${one.label}: the two messages stand as one run`,
      false,
      JSON.stringify(rest)
    );
    await page.close();
    return { errors, figures: null };
  }
  const { line } = rest;
  kit.check(
    `${one.label}: the page's pointer is ${one.touch ? "coarse (a finger)" : "fine (a mouse)"}`,
    rest.pointer === (one.touch ? "coarse" : "fine"),
    rest.pointer
  );
  kit.check(
    `${one.label}: at rest the second message has its own line in the run, its clock shown (${rest.clock?.text})`,
    !!rest.clock && rest.clock.opacity === "1" && rest.clock.text !== "",
    JSON.stringify(rest.clock)
  );
  kit.check(
    `${one.label}: from the first message's last line box to the seam is the well's padding, the gap token (${(rest.seam - rest.lastLine).toFixed(2)}px of ${rest.token}px)`,
    Math.abs(rest.seam - rest.lastLine - rest.token) <= EDGE &&
      Math.abs(rest.padFoot - rest.token) <= EDGE,
    JSON.stringify(rest)
  );
  kit.check(
    `${one.label}: from the seam nothing stands empty: the second part's line starts at it (${(line.top - rest.seam).toFixed(2)}px), and its words a gap token under it (${(rest.secondTop - line.bottom).toFixed(2)}px)`,
    Math.abs(line.top - rest.seam) <= EDGE &&
      Math.abs(rest.secondTop - line.bottom - rest.token) <= EDGE,
    JSON.stringify(rest)
  );
  const turn = page
    .locator('section[data-slot="turn"][data-you]')
    .filter({ hasText: SECOND })
    .first();
  if (!one.touch) {
    await turn.locator("[data-lift-words]").hover();
    await settle(page, 400);
  }
  const shown = await page.evaluate(seamOf, { first: FIRST, second: SECOND });
  if (!one.touch) {
    kit.check(
      `${one.label}: showing the actions moves no text: the second message's first line and its part line stand where they stood (${((shown?.secondTop ?? 0) - rest.secondTop).toFixed(2)}px, ${((shown?.line?.top ?? 0) - line.top).toFixed(2)}px)`,
      !!shown?.line &&
        Math.abs(shown.secondTop - rest.secondTop) <= 0.5 &&
        Math.abs(shown.line.top - line.top) <= 0.5,
      JSON.stringify({ rest: rest.secondTop, shown: shown?.secondTop })
    );
  }
  kit.check(
    `${one.label}: ${one.touch ? "at rest a finger has its handle" : "under the pointer the actions show"} on the second part's line, covering neither message's words`,
    !!shown?.actions &&
      shown.actions.opacity === "1" &&
      shown.actions.top >= shown.lastLine - EDGE &&
      shown.actions.bottom <= shown.secondTop + EDGE,
    JSON.stringify(shown)
  );
  await page.close();
  return {
    errors: errors.map((error) => `${one.label}: ${error}`),
    figures: {
      lineToLine: line.top - rest.lastLine,
      glyphsToLine: line.top - rest.lastGlyphs,
    },
  };
}

const spec: Spec = {
  name: "caw-thread-run",
  async run(kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const base = await fleet.dashboard();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Cawco-Dev",
      machineId: MACHINE,
      cwd: fleet.repo,
    });
    // Caw is not woken inside a workspace: the thread holds the words, and
    // the start answers with why.
    await fleet
      .api(`/api/projects/${project.id}/threads`, { body: FIRST })
      .catch(() => undefined);
    const [thread] = await until(
      "the thread",
      () => fleet.api<{ id: string }[]>(`/api/projects/${project.id}/threads`),
      (now) => now.length > 0,
      60_000
    );
    await fleet
      .api(`/api/projects/${project.id}/threads/${thread?.id}/messages`, {
        body: SECOND,
      })
      .catch(() => undefined);
    const said = await until(
      "both messages on the hub",
      () =>
        fleet.api<{ messages: { author: string; body: string }[] }>(
          `/api/projects/${project.id}/threads/${thread?.id}`
        ),
      (now) => now.messages.filter((one) => one.author === "you").length === 2,
      60_000
    );
    kit.check(
      "the thread holds the person's two messages in a row",
      said.messages
        .filter((one) => one.author === "you")
        .map((one) => one.body)
        .join("|") === `${FIRST}|${SECOND}`,
      JSON.stringify(said.messages.map((one) => one.author))
    );
    const errors: string[] = [];
    const figures = new Map<string, Figures | null>();
    for (const one of LEGS) {
      const read = await leg(kit, base, thread?.id ?? "", one);
      errors.push(...read.errors);
      figures.set(one.label, read.figures);
    }
    // A mouse's layout and a finger's are one: the first message's last
    // line to the second part's line is the same with either, measured from
    // its line box or from its glyphs (the glyphs stand the line's
    // half-leading higher, in both).
    for (const engine of ["chromium", "webkit"] as const) {
      const mouse = figures.get(`${engine} 1440`);
      const finger = figures.get(`${engine} 390`);
      kit.check(
        `${engine}: with a mouse the first message's last line stands as far from the second part's line as with a finger (line box ${mouse?.lineToLine.toFixed(2)} / ${finger?.lineToLine.toFixed(2)}px, glyphs ${mouse?.glyphsToLine.toFixed(2)} / ${finger?.glyphsToLine.toFixed(2)}px)`,
        !!(mouse && finger) &&
          Math.abs(mouse.lineToLine - finger.lineToLine) <= 0.5 &&
          Math.abs(mouse.glyphsToLine - finger.glyphsToLine) <= 0.5,
        JSON.stringify({ mouse, finger })
      );
    }
    kit.check(
      `no console error on any page: ${errors.length}`,
      errors.length === 0,
      errors.slice(0, 6).join(" | ")
    );
  },
};

export default spec;
