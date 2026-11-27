/**
 * The reader: what the daemon's own page of a canvas (`by=stage`, agent
 * stage-render.ts) reads of each states file for the render report, and
 * posts to the stage, the one source every tool answers from.
 *
 * Each section is read in the rig, a world off screen no one sees: each
 * story mounted as the drawing would be, read at rest, probed in each
 * interaction its CSS reaches, then taken down; then each move played from
 * its `from`. The page posts as each section is read, and reads a section
 * again as a save reaches it (its module loaded again, or a file it draws
 * from swapped in place), so the daemon's kept page answers a read after a
 * save with the frames of the files as they stand.
 *
 * Only the stage's own page runs it: reader.ts, the `by=stage` entry, is
 * the one module that imports this one (biome.jsonc bans its import
 * anywhere else). A page a person uses (the panel, a Preview, a map card)
 * draws and never reads, so no read takes their focus, hears their keys,
 * scrolls their page or holds their main thread.
 */

import { readWithin } from "@cawco/core/bounded";
import {
  type AnimationRead,
  FORMS,
  type FrameRender,
  type Interaction,
  type MoveRender,
  type PageError,
  type PageReport,
  type PageSection,
  type PostedReport,
  type Story,
  type SweepStep,
} from "@cawco/core/stage";
import { queriesIn, userEventIn } from "@cawco/core/stage-play";
import { stageRenderWords } from "@cawco/core/words/stage-render";
import { firstNames } from "@cawco/providers/names";
import { stillPage } from "./held-scroll";
import {
  deltaOf,
  drew,
  elementsUnread,
  firedBetween,
  firstWords,
  lookOf,
  type Motion,
  motionOf,
  namedOf,
  pageError,
  partsOf,
  readAnimation,
  snapshot,
  valuesOf,
} from "./measure";
import {
  type Column,
  canvasOf,
  FORCED,
  frameTick,
  HELD,
  type Mounted,
  moduleOf,
  nextTask,
  type Page,
  type Probe,
  type Reader,
  type Section,
  type WidthSlot,
} from "./page";
import { allClass, type PseudoState } from "./pseudo";

/** The pseudo-class whose rules decide whether an interaction is reached. */
const DECIDES: Record<Exclude<Interaction, "rest">, PseudoState[]> = {
  hover: ["hover"],
  focus: ["focus", "focus-visible", "focus-within"],
  pressed: ["active"],
};
const FOCUSABLE =
  'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]';
/** How long a move may play before it is read as stuck. Ours. */
const PLAY_LIMIT_MS = 6000;
/** How long a move's animations are waited on after its play ends. Ours. */
const SETTLE_LIMIT_MS = 3000;
/** The quiet after the last change before a report is posted. Ours. */
const REPORT_QUIET_MS = 200;
/** The gap between two stories' boxes in a section's read, px: their places in the report, one under another. */
const ROW_GAP = 24;

/** What the canvas could not force, the first few and a notice of how many more there were. */
const notForcedSaid = (refused: ReadonlySet<string>): string[] => {
  const { more, shown } = firstNames([...refused]);
  return more > 0
    ? [...shown, stageRenderWords.andMore(more, "not forced")]
    : shown;
};

/** A probe step run as one task, named for the page's timeline (`cawco probe`, its interaction and phase in its detail). */
function probePhase<T>(
  interaction: Interaction,
  phase: string,
  run: () => T
): T {
  const start = performance.now();
  try {
    return run();
  } finally {
    performance.measure("cawco probe", {
      start,
      end: performance.now(),
      detail: { interaction, phase },
    });
  }
}

/** `interaction` forced on `body`, or let go. */
const forced = (
  body: HTMLElement,
  interaction: Exclude<Interaction, "rest">,
  on: boolean
) => {
  for (const state of FORCED[interaction]) {
    body.classList.toggle(allClass(state), on);
  }
};

/** Stories of a section that declare a flow move: `from` and a `play`. */
const movesOf = (section: Section): { from: string; to: string }[] =>
  (section.mod?.SHEET.stories ?? []).flatMap((one) =>
    one.play && one.from ? [{ from: one.from, to: one.name }] : []
  );

/** The page's reader (`Page.reader`): made once, as the stage's own page boots. */
export function readerOf(page: Page): Reader {
  const { root, base, sections, state, view } = page;
  /** Off screen: where a story's states are probed and its moves played, never seen. */
  const rig = document.createElement("div");
  rig.className = "cawco-rig";
  rig.setAttribute("aria-hidden", "true");
  document.body.append(rig);
  /**
   * The layers on the body a play's story opened outside its body (a
   * popover or a dialog portalled to the body): what its `canvas` searches
   * beside the body, as a play on the drawing searches the drawing's
   * (stage.ts `layersOut`). The page's own children are none of them: what
   * holds its canvas (the drawing stands there), the rig, the width probe,
   * its scripts and styles.
   */
  const canvas = canvasOf();
  const rigLayers = (): HTMLElement[] =>
    [...document.body.children].filter(
      (one): one is HTMLElement =>
        one instanceof HTMLElement &&
        one !== rig &&
        !one.contains(canvas) &&
        !one.hasAttribute("data-cawco-probe") &&
        !one.matches("script, style, link, template")
    );

  /* --- What a frame reads ------------------------------------------------ */

  /** The interactions a story drawn in `body` reaches: each whose CSS rules match an element in it. */
  function reachedIn(body: HTMLElement): Interaction[] {
    const found: Interaction[] = ["rest"];
    for (const interaction of ["hover", "focus", "pressed"] as const) {
      const hit = DECIDES[interaction].some((pseudo) =>
        [...page.rewrite.reach[pseudo]].some((selector) => {
          let els: Element[];
          try {
            els = [...body.querySelectorAll(selector)];
          } catch {
            return false;
          }
          if (interaction !== "focus") {
            return els.length > 0;
          }
          return els.some(
            (el) =>
              el.matches(FOCUSABLE) ||
              (pseudo === "focus-within" && el.querySelector(FOCUSABLE))
          );
        })
      );
      if (hit) {
        found.push(interaction);
      }
    }
    return found;
  }

  const formWords = (story: Story, slot: WidthSlot): string => {
    const width = page.widthOf(story, slot);
    if (width === null) {
      return "fit";
    }
    const preset = Object.entries(FORMS).find(([, one]) => one === width)?.[0];
    return `${preset ?? "width"} ${width}`;
  };

  /**
   * A body that drew at its floor (its `min-inline-size`) with no width of
   * its own: the story gave it none, and its content measures nothing (a
   * size container), so it shrank to the floor and reads as a sliver. Said
   * as its failure, in words; no width is put in its place. Null when it
   * stands at a width of its own or past the floor.
   */
  function atFloor(
    story: Story,
    slot: WidthSlot,
    body: HTMLElement
  ): PageError | null {
    if (page.widthOf(story, slot) !== null) {
      return null;
    }
    const width = body.offsetWidth;
    const floor = Number.parseFloat(getComputedStyle(body).minInlineSize) || 0;
    return floor > 0 && width <= floor + 0.5
      ? {
          message: `drawn ${Math.round(width)}px wide: the story has no width of its own; give it a viewport or a width`,
          file: null,
          line: null,
          column: null,
        }
      : null;
  }

  /**
   * A story drawn in `body`, in `column`, read for the render report at
   * `box`: drawn, empty, or failed with why (its mount threw, its own width
   * is one the stage can't read, it drew at its body's floor); its first
   * words, the parts it is made of and, at rest, its look (`lookOf`).
   */
  function frameOf(
    story: Story,
    body: HTMLElement,
    column: Column,
    error: PageError | undefined,
    box: FrameRender["box"]
  ): FrameRender {
    let drawnAs: FrameRender["state"] = "empty";
    let said = error;
    if (said) {
      drawnAs = "failed";
    } else if (story.formUnread && view.widths === null) {
      // Its own width is one the stage can't read: drawn at none, it would pass for drawn at a width it never asked for.
      said = {
        message: story.formUnread,
        file: null,
        line: null,
        column: null,
      };
      drawnAs = "failed";
    } else if (drew(body)) {
      said = atFloor(story, column.width, body) ?? undefined;
      drawnAs = said ? "failed" : "drawn";
    }
    // Read at rest only: a forced state's frame is its rest's, the state put on.
    const look =
      drawnAs === "drawn" && column.interaction === "rest"
        ? lookOf(body)
        : null;
    const unread = elementsUnread(body);
    return {
      story: story.name,
      label: story.label,
      form: formWords(story, column.width),
      interaction: column.interaction,
      scheme: page.schemeOf(column),
      width: box.w,
      state: drawnAs,
      box,
      text: firstWords(body),
      parts: partsOf(body, root),
      ...(unread ? { elements: unread } : {}),
      ...(look ? { look } : {}),
      ...(said ? { error: said } : {}),
    };
  }

  /* --- Probes: each story's states read off screen ----------------------- */

  /**
   * A story mounted in `body`, standing at rest, probed in each interaction
   * it reaches, read from computed style alone (measure.ts `motionOf`,
   * `firedBetween`): the delta each state makes, and the transitions and
   * keyframes it fires. `atState` reads the body in each state as the
   * state's values are read, its frame for the report. The engine's
   * animation list is never asked: Chromium's `getAnimations` costs as
   * many animations as the page holds, whatever it is asked on (a body,
   * one element or the document took 1,038 ms each with 10,000 looping
   * elsewhere on the page, 9 ms with 1,000). So a probe costs its own
   * story's elements, whatever the page around it holds.
   *
   * Each style the body takes costs a restyle of every element in it,
   * through the project's whole sheet (the dashboard's 5,455 rules: 6 ms
   * for a 151-element body), so each is taken once and read whole, a task
   * of its own: at rest, the keyframes it names; each state forced, the
   * motion it declares (the hold let go only within the task, so what it
   * would run never starts); then held still (`cawco-held`, PAGE_CSS: no
   * keyframes, no transitions, so each read is the base style, never a
   * frame of a loop or a transition on its way), its values at rest, then
   * each state's values and frame. Of the values, a transition's
   * properties are read only where it runs (a duration past 0): every
   * element declares `all 0s`, and reading all it names read every
   * watched property twice more on every element.
   */
  async function probe(
    body: HTMLElement,
    reached: Exclude<Interaction, "rest">[],
    atState: (interaction: Exclude<Interaction, "rest">) => void
  ): Promise<Probe> {
    const read: Probe = { delta: new Map() };
    if (reached.length === 0) {
      return read;
    }
    const named = probePhase("rest", "motion at rest", () => namedOf(body));
    body.classList.add(HELD);
    try {
      const motions = new Map<Exclude<Interaction, "rest">, Motion>();
      for (const interaction of reached) {
        await nextTask();
        motions.set(
          interaction,
          probePhase(interaction, "motion forced", () => {
            body.classList.remove(HELD);
            forced(body, interaction, true);
            const motion = motionOf(body);
            forced(body, interaction, false);
            body.classList.add(HELD);
            return motion;
          })
        );
      }
      await nextTask();
      const before = probePhase("rest", "values at rest", () => ({
        watched: snapshot(body),
        moved: valuesOf(...motions.values()),
      }));
      for (const [interaction, motion] of motions) {
        await nextTask();
        probePhase(interaction, "values forced", () => {
          forced(body, interaction, true);
          try {
            read.delta.set(interaction, {
              animations: firedBetween(
                named,
                motion,
                before.moved,
                valuesOf(motion)
              ),
              ...deltaOf(before.watched, snapshot(body), root),
            });
            atState(interaction);
          } finally {
            forced(body, interaction, false);
          }
        });
      }
    } finally {
      body.classList.remove(HELD);
    }
    return read;
  }

  /* --- Moves: `from` + `play` ------------------------------------------ */

  /** Plays move `to` (from its `from`) in `body`: mounted from the start story's args, then its `play`; every animation it fired, read as it started. */
  async function playIn(
    section: Section,
    to: string,
    body: HTMLElement
  ): Promise<{ mounted: Mounted | undefined; move: MoveRender }> {
    const csf = page.csfOf(moduleOf(section, to), to) ?? {};
    const { play } = csf;
    const from = String(
      csf.from ??
        section.mod?.SHEET.stories.find((one) => one.name === to)?.from ??
        ""
    );
    const move: MoveRender = { from, to, animations: [] };
    if (!(from && play)) {
      move.error = {
        message: `${to} has no from and play to move by.`,
        file: null,
        line: null,
        column: null,
      };
      return { mounted: undefined, move };
    }
    const into: { error?: PageError } = {};
    const args = page.argsOf(section, from);
    const mounted = page.mountInto(body, section, from, args, into);
    await frameTick();
    const seen = new Set<Animation>();
    const reads: AnimationRead[] = [];
    const t0 = Number(document.timeline.currentTime);
    let watching = true;
    /** Every animation running in the body that was not seen yet, read as it started. */
    const look = () => {
      for (const one of body.getAnimations({ subtree: true })) {
        if (!seen.has(one)) {
          seen.add(one);
          reads.push(readAnimation(one, t0));
        }
      }
    };
    const watch = () => {
      look();
      if (watching) {
        requestAnimationFrame(watch);
      }
    };
    requestAnimationFrame(watch);
    let current = { ...args };
    try {
      const played = await readWithin(PLAY_LIMIT_MS, async () =>
        play({
          args: current,
          canvasElement: body,
          canvas: queriesIn(body, rigLayers),
          userEvent: userEventIn(body),
          step: async (_name: string, run: () => Promise<void>) => await run(),
          update: async (next: Record<string, unknown>) => {
            current = { ...current, ...next };
            mounted?.update(next);
            await frameTick();
          },
        })
      );
      if (played.kind === "unanswered") {
        throw new Error(`${to}'s play ran past ${PLAY_LIMIT_MS / 1000} s.`);
      }
      // The motion it started, played out (or the wait's end): each run's
      // end awaited, never a frame polled, so a page no frame comes to
      // waits once to the end and does not spin; a run one of them starts
      // as it ends is seen on the frame after.
      look();
      const end = performance.now() + SETTLE_LIMIT_MS;
      let running = [...seen].filter((one) => one.playState === "running");
      while (running.length > 0 && performance.now() < end) {
        await readWithin(Math.max(0, end - performance.now()), () =>
          Promise.all(running.map((one) => one.finished.catch(() => null)))
        );
        await frameTick();
        look();
        running = [...seen].filter((one) => one.playState === "running");
      }
      if (running.length > 0) {
        move.stillRunning = running.length;
      }
    } catch (error) {
      move.error = pageError(error, root, base);
    } finally {
      watching = false;
    }
    if (into.error && !move.error) {
      move.error = into.error;
    }
    move.animations = reads;
    return { mounted, move };
  }

  /** Every move of a section played off screen: what each fires, for the report. */
  async function playAll(section: Section): Promise<void> {
    const moves: MoveRender[] = [];
    for (const { to } of movesOf(section)) {
      await nextTask();
      const body = document.createElement("div");
      body.className = "cawco-frame-body";
      const story = section.mod?.SHEET.stories.find((one) => one.name === to);
      page.sizeBody(
        body,
        story ? page.widthOf(story, "own") : null,
        page.fills(section, to)
      );
      rig.append(body);
      let mounted: Mounted | undefined;
      try {
        sweepOn(section, "move", to);
        // Its mount and play are the component's: its own scrolls of the page are stopped (held-scroll.ts), so a picture's posed drawing stays where it stands.
        const played = await stillPage(() => playIn(section, to, body));
        ({ mounted } = played);
        moves.push(played.move);
      } finally {
        mounted?.unmount();
        body.remove();
      }
    }
    section.moves = moves;
    later();
  }

  /* --- The report: each section read in the rig --------------------------- */

  /** Where the sweep stands, for the stage's render to name when it runs out of time (stage-render.ts). */
  const sweepOn = (section: Section, step: SweepStep, story?: string) => {
    state.sweepAt = { file: section.file, step, ...(story ? { story } : {}) };
  };

  /** The column a section's stories are read in: the view's scheme, its width picked or each story's own. */
  const rigColumn = (): Column => ({
    interaction: "rest",
    scheme: view.scheme === "both" ? "light" : view.scheme,
    width: view.widths?.[0] ?? "own",
  });

  /** A story mounted in the rig, in a body of its own dressed as the drawing would be. */
  function mountInRig(section: Section, story: Story) {
    const body = document.createElement("div");
    body.className = "cawco-frame-body";
    page.dressBody(body, rigColumn(), story, page.fills(section, story.name));
    rig.append(body);
    const into: { error?: PageError } = {};
    const mounted = page.mountInto(
      body,
      section,
      story.name,
      page.argsOf(section, story.name),
      into
    );
    return { body, mounted, into };
  }

  /** Each section's stories as the rig read them, for the report. */
  const reads = new Map<Section, FrameRender[]>();
  /** When the code each section's last read stood on was loaded (`Section.loadedFrom`), by its file, for the report. */
  const readFrom = new Map<string, number>();

  /**
   * A section's stories read in the rig, one at a time, each its own
   * tasks: mounted as the drawing would be (the view's scheme, its own
   * width or the one picked), read at rest once its first frames are
   * drawn, then probed in each interaction its CSS reaches ({@link probe}),
   * each state's frame read as its values are; then taken down, its box
   * under the one before, as a column. One mount serves its frames and its
   * probe.
   */
  async function readInRig(section: Section): Promise<void> {
    const stories = section.mod?.SHEET.stories ?? [];
    const read: FrameRender[] = [];
    const probes = new Map<string, Probe>();
    let y = 0;
    for (const story of stories) {
      await nextTask();
      sweepOn(section, "draw");
      // As it mounts and draws its first frames, the component's own scrolls of the page are stopped (held-scroll.ts).
      const one = await stillPage(async () => {
        const mounted = mountInRig(section, story);
        await frameTick();
        return mounted;
      });
      try {
        // Read in a task of its own, never inside the frame it waited for.
        await nextTask();
        page.rewriteAll();
        if (page.fillsScreen(section, story, one.body)) {
          page.dressBody(one.body, rigColumn(), story, true);
        }
        const reached = reachedIn(one.body);
        section.interactions.set(story.name, reached);
        const at = y;
        const frameIn = (interaction: Interaction) =>
          frameOf(
            story,
            one.body,
            { ...rigColumn(), interaction },
            one.into.error,
            {
              x: 0,
              y: at,
              w: one.body.offsetWidth,
              h: one.body.offsetHeight,
            }
          );
        read.push(frameIn("rest"));
        sweepOn(section, "probe");
        const probed = await probe(
          one.body,
          reached.filter(
            (interaction): interaction is Exclude<Interaction, "rest"> =>
              interaction !== "rest"
          ),
          (interaction) => read.push(frameIn(interaction))
        );
        if (probed.delta.size > 0) {
          probes.set(story.name, probed);
        }
        y += one.body.offsetHeight + ROW_GAP;
      } finally {
        one.mounted?.unmount();
        one.body.remove();
      }
    }
    reads.set(section, read);
    section.probes = probes;
  }

  /** The sections whose read is under way: a report says them as drawing, never their half-read frames. */
  const reading = new Set<Section>();
  /** The sections the sweep has still to read, in its order. */
  const unswept = new Set(state.sweeps);
  /** The sections the daemon asked to be read again that are loading first ({@link readAgain}). */
  const reloading = new Set<string>();

  /**
   * A section read for the report: its stories in the rig, each with its
   * probe, then its moves; one pass at a time. A report says it as drawing
   * from the read's start to its end, then posts it.
   */
  function readSection(section: Section): Promise<void> {
    const before = section.settling ?? Promise.resolve();
    reading.add(section);
    later();
    const settling: Promise<void> = before
      .catch(() => undefined)
      .then(async () => {
        const from = section.loadedFrom ?? 0;
        sweepOn(section, "draw");
        await readInRig(section);
        readFrom.set(section.file, from);
        await playAll(section);
      })
      .finally(() => {
        // A read asked since stands in this one's place: the section is drawing until that one ends.
        if (section.settling === settling) {
          reading.delete(section);
          later();
        }
      });
    section.settling = settling;
    return settling;
  }

  /** The states files the page is drawing now: not swept yet, being read, or loading to be read again. */
  const drawing = (): string[] => [
    ...new Set([
      ...unswept,
      ...[...reading].map((section) => section.file),
      ...reloading,
    ]),
  ];

  /**
   * Each of `files` read again, as the daemon asks when the stage's report
   * holds no draw of it as it stands and the page draws none of them now (a
   * save that reached the file and no module of the page): one loaded,
   * read; one that failed to load, loaded again, and read as it is shown.
   */
  function readAgain(files: readonly string[]): void {
    for (const file of files) {
      const section = page.sectionOf(file);
      if (!section || reading.has(section) || reloading.has(file)) {
        continue;
      }
      if (section.loaded && !section.failure) {
        // No save reached a module of the page: what it draws is the files as they stand.
        section.loadedFrom = Date.now();
        page.quietly(readSection(section));
      } else if (!section.loaded) {
        reloading.add(file);
        page.quietly(
          page.loadSection(section).finally(() => {
            reloading.delete(file);
            later();
          })
        );
      }
    }
  }

  /**
   * Every section in turn, each read and reported before the next: the
   * files the page's address asks for (core `sweptFiles`).
   */
  async function sweep(): Promise<void> {
    for (const file of state.sweeps) {
      await sweepOne(file);
    }
    // A sweep of no section (a state no states file holds) still reports: the render reads it, then the page's refusal.
    if (state.sweeps.length === 0) {
      await post();
    }
    state.sweepAt = null;
    state.swept = true;
  }

  /** One states file loaded, read for the report and posted: the sweep's step. */
  async function sweepOne(file: string): Promise<void> {
    const section = page.sectionOf(file);
    if (!section) {
      unswept.delete(file);
      return;
    }
    try {
      sweepOn(section, "load");
      await page.loadSection(section);
      if (section.loaded) {
        await section.settling;
      }
    } finally {
      unswept.delete(file);
    }
    sweepOn(section, "post");
    await post();
    state.drawn.push(file);
  }

  /* --- What the page posts ------------------------------------------------- */

  let reportTimer: ReturnType<typeof setTimeout> | undefined;
  let reports = 0;

  function later(): void {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => page.quietly(post()), REPORT_QUIET_MS);
  }

  /** A section's frames as the report says them, each with its probe's delta; null while it has not been read. */
  const framesOf = (section: Section): FrameRender[] | null =>
    reads.get(section)?.map((one) => {
      const delta = section.probes.get(one.story)?.delta.get(one.interaction);
      return one.interaction === "rest" || !delta ? one : { ...one, delta };
    }) ?? null;

  function reportNow(): PageReport & Pick<PostedReport, "drawing"> {
    // A section loaded and not read yet, or read again now, posts nothing but its file under `drawing`: an empty or half-read one would stand over what an earlier draw saw of it.
    const now = drawing();
    const drawn: PageSection[] = sections.flatMap((section) => {
      const frames =
        section.loaded && !now.includes(section.file)
          ? framesOf(section)
          : null;
      return section.mod && frames
        ? [
            {
              file: section.file,
              title: section.mod.SHEET.meta.title ?? section.file,
              frames,
              moves: section.moves,
              notForced: notForcedSaid(page.rewrite.refused),
            },
          ]
        : [];
    });
    const unnamed = sections.flatMap((section) =>
      (section.mod?.SHEET.stories ?? [])
        .filter((story) => !story.label)
        .map((story) => `${section.file}:${story.name}`)
    );
    return {
      by: "stage",
      at: new Date().toISOString(),
      page: { errors: page.errorsNow() },
      sections: drawn,
      unnamed,
      drawing: now,
    };
  }

  async function post(): Promise<void> {
    const report = reportNow();
    // A section whose module the page couldn't load posts no section: its error goes as the stage's, which knows only what it served.
    const posted: PostedReport = {
      ...report,
      readFrom: Object.fromEntries(
        report.sections.map((one) => [one.file, readFrom.get(one.file) ?? 0])
      ),
      unloaded: sections.flatMap((section) =>
        section.failure?.kind === "page"
          ? [{ file: section.file, error: section.failure.error }]
          : []
      ),
      threw: page.threwNow(),
    };
    try {
      await fetch(new URL("rendered", location.href), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(posted),
      });
    } catch {
      // The stage is away: the next draw posts again.
    }
    reports += 1;
    state.report = report;
    state.reports = reports;
  }

  Object.assign(state, { drawing, readAgain });

  return {
    later,
    read: (section) => {
      page.quietly(readSection(section));
    },
    sweep,
  };
}
