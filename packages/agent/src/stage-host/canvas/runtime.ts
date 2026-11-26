/**
 * The design graph page (design graph §2–3): the page a stage serves
 * at `CANVAS_PATH`, in the project's own page and CSS. What every page of it
 * shares lives here: each states file's section and its module (loaded,
 * failed, loaded again as it is edited), the CSS rewritten so a forced
 * interaction and a frame's width reach the project's rules, and the sheet
 * told to the pane's inspector. The render report is read and posted by
 * the stage's own page alone (`by=stage`, its entry reader.ts with rig.ts):
 * {@link boot} is every other page's, which draws and reads nothing for
 * the report, so no read runs in a page a person uses.
 *
 * What a page draws, the stage draws (stage.ts), every story as a
 * drawing: for a person's panel and the stage's own render (`by=panel`,
 * the default, and `by=stage`) the one live instance of the state the
 * panel keeps, the design graph's stage; for a decision page's Preview and
 * the panel map's live card (`by=embed`, `by=map`) each story it names, a
 * drawing in a column.
 *
 * Every drawing is live DOM that the browser itself draws, in this one
 * page: that is what a person judges and what every measure reads. At the
 * tens of drawings a states file holds, drawing them costs nothing;
 * measured on 2026-11-14, a page's cost is loading and compiling its
 * modules. If a page ever holds hundreds of live drawings and scrolling or
 * zooming it drops frames, look first at the browser's HTML-in-Canvas
 * (`chrome://flags/#canvas-draw-element`, on by default from Chrome 157;
 * Firefox, Safari and every iOS browser had none then): the GPU draws the
 * same live elements as textures while clicks and typing still reach them,
 * as github.com/berkantay/gpucanvas does for 5,000 React screens. A
 * renderer of our own (Dessn's WebGPU canvas,
 * x.com/eminimnim/status/2121249063576228036) is no answer here: its
 * drawing would no longer be the browser's.
 *
 * The stage's entry module hands {@link boot} (or reader.ts's) the framework's adapter
 * (`mountStory`, answering `unmount` and `update`) and how to load each
 * section; everything else is read from the page's URL: `file` per
 * section, `spec` (core `CanvasSpec`), and `scheme`, `width`, `motion`,
 * `fit` and `by`; and from the plan the stage writes into the page (core
 * `SectionPlan`): each section's name and its stories, so a section names
 * itself before its module loads.
 */

import { awaySaid } from "@cawco/core/page-wire";
import {
  CANVAS_PLAN_ID,
  type CanvasSpec,
  canvasSpecOf,
  MEASURE_PARAM,
  namedKept,
  type PageBy,
  type PageError,
  pageByOf,
  RENDER_STATE_PARAM,
  type Scheme,
  SECTION_BROKEN,
  SECTION_MENDED,
  SECTION_MISSING,
  SECTION_SWAPPED,
  SECTION_WRITTEN,
  type SectionPlan,
  type SheetOnPage,
  type SheetRead,
  type Story,
  type StoryThrew,
  screenHeight,
  sectionName,
  sectionPlansOf,
  sweptFiles,
} from "@cawco/core/stage";
import { dialSetOf } from "@cawco/core/stage-graph";
import { graphWords } from "@cawco/core/words/graph";
import { stageRenderWords } from "@cawco/core/words/stage-render";
import { holdFocus } from "./held-focus";
import { holdPageScroll } from "./held-scroll";
import { fromRoot, pageError } from "./measure";
import { ownModulesOf } from "./own";
import {
  type BootOptions,
  type Bridge,
  type CanvasState,
  type Column,
  type Csf,
  detailsOf,
  FORCED,
  fixingLine,
  type Mode,
  type Mounted,
  type MountSpec,
  moduleOf,
  nextTask,
  objectOf,
  type Page,
  paneAway,
  type Reader,
  readCsf,
  type Section,
  type SectionFailure,
  type SectionModule,
  setPaneAway,
  type View,
  type WidthSlot,
} from "./page";
import { PageStyle } from "./page-style";
import {
  allClass,
  emptyReach,
  forceMotion,
  type Rewrite,
  rewriteSheet,
} from "./pseudo";
import { onPageScheme, pageScheme } from "./scheme";
import { bootStage } from "./stage";
import {
  frameWidths,
  SCREEN_VH,
  SCREEN_VW,
  splitWidth,
  WIDTH_CONTAINER,
} from "./width";
import "./window-events";
import {
  recordLimitReading,
  takeLimitReadings,
} from "@cawco/core/limit-readings";
import { carryPageReadings } from "@cawco/core/limit-readings-page";

/** How long a section's failed import waits for the stage's words. Our call: Vite sends them before it answers the request. */
const STAGE_SAYS_MS = 1000;

/** A section module's address as an HMR update names it: `/@id/__x00__cawco:sheet/<the states file, encoded>.js`. */
const SECTION_PATH = /cawco:sheet\/([^?]+)\.js(?:\?|$)/u;

/** The states file (from the toolchain root) an update's module path is the section of; null for any other module. */
const sectionOfPath = (path: string): string | null => {
  const encoded = path.match(SECTION_PATH)?.[1];
  return encoded ? decodeURIComponent(encoded) : null;
};

/** The view the page's URL asks for. */
function viewOf(params: URLSearchParams): View {
  const scheme = params.get("scheme");
  const width = params.get("width");
  const widths = width
    ? width
        .split(",")
        .map(Number)
        .filter((one) => one > 0)
    : [];
  return {
    scheme:
      scheme === "light" || scheme === "dark" || scheme === "both"
        ? scheme
        : "page",
    widths: widths.length > 0 ? widths : null,
    motion: params.get("motion") === "reduce" ? "reduce" : "on",
    fit: params.get("fit") !== "0",
  };
}

/** Each states file's plan as the stage wrote it into the page; none when the page has no plan. */
const planOfPage = (): Record<string, SectionPlan> => {
  try {
    return sectionPlansOf(
      JSON.parse(document.getElementById(CANVAS_PLAN_ID)?.textContent ?? "{}")
    );
  } catch {
    return {};
  }
};

const specOf = (params: URLSearchParams): CanvasSpec => {
  try {
    return canvasSpecOf(JSON.parse(params.get("spec") ?? "{}"));
  } catch {
    return {};
  }
};

export const bridge = (): Bridge | undefined => window.cawco;

/**
 * Every animation-frame callback the page asks for (the canvas's own and
 * each story's) held while the page holding it says its pane is away (core
 * `CANVAS_AWAY`), and asked for once it is back: WebKit runs a frame's rAF
 * at full rate under a pane `content-visibility: hidden` puts away, and
 * nothing in the frame can tell it is skipped. A held callback is the one
 * the page asked for, run on the next frame it is seen: what a person sees
 * is the same.
 *
 * And the canvas at rest while nobody can see it: its root marked
 * `data-offscreen` while its pane is away or none of its frame stands in
 * the top page's view (the implicit root of an observer in a frame), which
 * stops a dashboard canvas's loops as the dashboard stops its own
 * scrolled out of view (its design.css: `:where([data-offscreen]) .loops`
 * carries no animation; motion/rest.ts). WebKit renders every frame of the
 * page it shares a process with, whatever stands in view: a decision page
 * of 33 Previews, untouched, held its web process at 23% of a core, its
 * frames' loops (9 spinners and skeleton pulses, all in frames scrolled
 * away) the only thing running (canvas-cost `page`, its census), and at
 * 2% held here (56,310 ms of CPU over 240 s, then 5,130); Chromium draws
 * no cross-origin frame out of view.
 */
function holdWhileAway(): void {
  const ask = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  let unseen = false;
  const rest = () =>
    document.documentElement.toggleAttribute(
      "data-offscreen",
      paneAway() || unseen
    );
  new IntersectionObserver(([entry]) => {
    unseen = !entry?.isIntersecting;
    rest();
  }).observe(document.documentElement);
  /** Callbacks asked for while away, by the id the page was given (negative: none the browser gives). */
  const held = new Map<number, FrameRequestCallback>();
  /** A held callback asked for once back: the browser's id for it, by the page's. */
  const asked = new Map<number, number>();
  let last = 0;
  window.requestAnimationFrame = (callback) => {
    if (!paneAway()) {
      return ask(callback);
    }
    last -= 1;
    held.set(last, callback);
    return last;
  };
  window.cancelAnimationFrame = (id) => {
    if (held.delete(id)) {
      return;
    }
    const real = asked.get(id);
    asked.delete(id);
    cancel(real ?? id);
  };
  addEventListener("message", (event) => {
    const said =
      event.source === window.parent ? awaySaid(event.data) : undefined;
    if (said === undefined) {
      return;
    }
    setPaneAway(said);
    rest();
    if (said) {
      return;
    }
    for (const [id, callback] of held) {
      asked.set(
        id,
        ask((time) => {
          asked.delete(id);
          callback(time);
        })
      );
    }
    held.clear();
  });
}

/** The states files a page sweeps as it opens, in order (page.ts `sweeps`): none on the panel's page in its frame. */
const sweepsOf = (
  by: PageBy,
  files: string[],
  plans: Parameters<typeof sweptFiles>[1],
  state: string | null
): string[] => {
  if (by === "stage") {
    return sweptFiles(files, plans, state);
  }
  // The panel's page, framed by its design graph, which asks for each file it needs; a page on its own sweeps them all.
  return by === "panel" && window.top !== window ? [] : files;
};

/** A page a person uses (the panel, a Preview, a map's card): it draws, and reads nothing for the report. */
export function boot(options: BootOptions): void {
  bootPage(options, null);
}

/**
 * The page: its sections, their drawing and the mode that draws them;
 * `readerOf` the stage's own page's reader (reader.ts hands rig.ts's), none
 * on any other page.
 */
export function bootPage(
  options: BootOptions,
  readerOf: ((page: Page) => Reader) | null
): void {
  // What the page reads of the bounds waiting on data: posted to its preview
  // origin, and taken by the daemon's renderer from a page it drives
  // (stage-render.ts `closeContext`).
  window.__cawcoReadings = takeLimitReadings;
  carryPageReadings();
  holdFocus();
  holdPageScroll();
  holdWhileAway();
  const { adapter, root } = options;
  const params = new URLSearchParams(location.search);
  const files = params.getAll("file");
  const spec = specOf(params);
  const by = pageByOf(params);
  const view = viewOf(params);
  const base = location.pathname.slice(
    0,
    Math.max(0, location.pathname.lastIndexOf("/@cawco/"))
  );
  const rewrite: Rewrite = { reach: emptyReach(), refused: new Set() };
  const pageErrors: PageError[] = [];
  /** How many of the page's errors were dropped, oldest first, past the 20 kept. */
  let errorsDropped = 0;
  const sections: Section[] = [];
  const overrides = new Map<string, Record<string, unknown>>();
  /** Each section's newest ask of its whole sheet, by its file (`said`). */
  const sheetAsks = new Map<string, number>();
  /** The mode, made once what it is handed stands. */
  let mode: Mode | null = null;
  /** The stage's own page's reader, made once the page stands; none on any other page. */
  let reader: Reader | null = null;
  const embed = by === "embed";

  /* --- The page's own errors, from before the module ran ---------------- */

  const heard = (error: unknown) => {
    pageErrors.push(pageError(error, root, base));
    recordLimitReading(
      "agent.stage-page-errors",
      pageErrors.length + errorsDropped
    );
    // @limit recording: agent.stage-page-errors until 2026-12-03
    if (pageErrors.length > 20) {
      pageErrors.shift();
      errorsDropped += 1;
    }
    later();
  };
  /*
   * What the stage said of a module it couldn't serve: Vite's error, which
   * its server sends every page as it answers that request 500 (its
   * `logError`), here as the entry's `cawco:stage-error`. The browser's own
   * error for the failed import names only the URL ("Failed to fetch
   * dynamically imported module"), so a section that didn't load says the
   * stage's words.
   */
  let stageSaid: { at: number; failure: SectionFailure } | null = null;
  const stageHeard = new Set<() => void>();
  window.addEventListener("cawco:stage-error", (event) => {
    const err = event.detail;
    if (!err?.message) {
      return;
    }
    const at = (err.loc?.file ?? err.id ?? "").split("?")[0] ?? "";
    const own = at.startsWith(`${root}/`);
    stageSaid = {
      at: performance.now(),
      failure: {
        kind: err.pluginCode === SECTION_MISSING ? "missing" : "compile",
        frame: err.frame?.trim() || null,
        error: {
          message: err.message.trim(),
          file: own ? fromRoot(at, root) : null,
          line: own ? (err.loc?.line ?? null) : null,
          // Vite's (Rollup's) column is 0-based.
          column:
            own && typeof err.loc?.column === "number"
              ? err.loc.column + 1
              : null,
        },
      },
    };
    for (const done of stageHeard) {
      done();
    }
  });
  const saidSince = (since: number): SectionFailure | null =>
    stageSaid && stageSaid.at >= since ? stageSaid.failure : null;
  /** Why a section's import that began at `since` failed: the stage's words heard since, or within {@link STAGE_SAYS_MS}; else the page's own error. */
  async function loadFailure(
    error: unknown,
    since: number
  ): Promise<SectionFailure> {
    if (!saidSince(since)) {
      await new Promise<void>((done) => {
        const finish = () => {
          clearTimeout(timer);
          stageHeard.delete(finish);
          done();
        };
        const timer = setTimeout(finish, STAGE_SAYS_MS);
        stageHeard.add(finish);
      });
    }
    return (
      saidSince(since) ?? {
        kind: "page",
        frame: null,
        error: pageError(error, root, base),
      }
    );
  }
  /** A promise the page does not wait on: what it throws is a page error, never lost. */
  const quietly = (promise: Promise<unknown>) => {
    promise.catch(heard);
  };

  /*
   * What every story stands on (the app's global styles, the preview
   * file's decorators and parameters), loaded once, after the stage's
   * words are heard here: a save that broke one of them is every section's
   * failure, said in each section's place with the stage's words for it,
   * and the page stays up. Vite reloads the page on the next save that
   * compiles (no module of its graph accepts an edit to them), which draws
   * it again.
   */
  let preview: { decorators?: unknown; parameters?: unknown } = {};
  const sharedSince = performance.now();
  const shared: Promise<{ failure: SectionFailure } | null> = options
    .shared()
    .then(
      (loaded) => {
        preview = loaded;
        return null;
      },
      async (error: unknown) => {
        heard(error);
        return { failure: await loadFailure(error, sharedSince) };
      }
    );
  for (const one of window.__cawcoErrors ?? []) {
    heard(one.error);
  }
  window.__cawcoErrors = undefined;
  window.addEventListener("error", (event) =>
    heard(event.error ?? event.message)
  );
  window.addEventListener("unhandledrejection", (event) => heard(event.reason));

  /* --- The CSS: interaction states and motion, rewritten as sheets come -- */

  const sheetsNow = (): CSSStyleSheet[] => [
    ...document.styleSheets,
    ...document.adoptedStyleSheets,
  ];
  /** A sheet the canvas writes for itself (its page style, the width probe): it answers the window. */
  const canvasOwned = (sheet: CSSStyleSheet) => {
    const node = sheet.ownerNode;
    return (
      node instanceof HTMLElement &&
      ["cawcoCanvas", "cawcoProbe"].some((key) => key in node.dataset)
    );
  };
  const rewriteAll = () => {
    for (const sheet of sheetsNow()) {
      // Width first: the state rewrite then reaches the rules inside the containers it makes.
      if (!canvasOwned(sheet)) {
        frameWidths(sheet, rewrite.refused);
      }
      // An embed draws each story at rest only: no state is forced in it,
      // so its sheets' state rules stay as written.
      if (!embed) {
        rewriteSheet(sheet, rewrite);
      }
      // A sheet comes as the browser answers motion: only with motion reduced has it a condition to rewrite (setView rewrites and puts back every sheet's as the motion turns).
      if (view.motion === "reduce") {
        forceMotion(sheet, view.motion);
      }
    }
  };
  /** The project's page background and ink, as its body's rules write them: each body draws on them under its own scheme. */
  let pageGround: { background: string; color: string } | null = null;
  const groundOf = () => {
    if (pageGround) {
      return pageGround;
    }
    let background = "";
    let color = "";
    const visit = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule && BODY_RULE.test(rule.selectorText)) {
          background =
            rule.style.getPropertyValue("background-color") ||
            rule.style.getPropertyValue("background") ||
            background;
          color = rule.style.getPropertyValue("color") || color;
        } else if (
          rule instanceof CSSGroupingRule &&
          !(rule instanceof CSSStyleRule)
        ) {
          visit(rule.cssRules);
        }
      }
    };
    for (const sheet of sheetsNow()) {
      try {
        visit(sheet.cssRules);
      } catch {
        // cross-origin: not read
      }
    }
    pageGround = {
      background: background || "Canvas",
      color: color || "CanvasText",
    };
    return pageGround;
  };
  let rewriting = false;
  /** A change that only adds an embed's module preloads on its turn (host.ts `graphPreloads`): it brings no sheet, so nothing is rewritten. */
  const preloadsOnly = (changes: MutationRecord[]) =>
    changes.every(
      (change) =>
        change.type === "childList" &&
        change.removedNodes.length === 0 &&
        [...change.addedNodes].every(
          (node) =>
            node instanceof HTMLLinkElement && node.rel === "modulepreload"
        )
    );
  new MutationObserver((changes) => {
    if (rewriting || preloadsOnly(changes)) {
      return;
    }
    rewriting = true;
    queueMicrotask(() => {
      rewriting = false;
      rewriteAll();
      pageGround = null;
      mode?.restyled();
    });
  }).observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  // A stylesheet's link loaded: its rules are rewritten. A module's
  // preload (host.ts `graphPreloads`, one a module of the canvas's graph)
  // loads no sheet, and each of a 665-module graph's would walk every rule
  // of every sheet again.
  document.addEventListener(
    "load",
    (event) => {
      if (event.target instanceof HTMLLinkElement && event.target.sheet) {
        rewriteAll();
      }
    },
    true
  );
  rewriteAll();

  /* --- Script that asks matchMedia: reduced motion, and the drawing's width */

  const media = window.matchMedia.bind(window);
  /** The width of the body whose story mounts now: undefined between mounts, null for a body without one. */
  let mounting: number | null | undefined;
  /**
   * Where the engine answers a width condition at a given width: a hidden
   * container (`cawco-probe`) set to that width, a rule per condition
   * marking its child, so every syntax a container query takes (ranges,
   * `and`, `or`) answers as the project's CSS does.
   */
  const probeStyle = document.createElement("style");
  probeStyle.dataset.cawcoProbe = "";
  document.head.append(probeStyle);
  const probeBox = document.createElement("div");
  probeBox.dataset.cawcoProbe = "";
  probeBox.setAttribute("aria-hidden", "true");
  probeBox.style.cssText =
    "position: absolute; inset-block-start: 0; inset-inline-start: -100000px; block-size: 0; overflow: hidden; visibility: hidden; pointer-events: none; container: cawco-probe / inline-size;";
  const probeMark = document.createElement("i");
  probeBox.append(probeMark);
  document.body.append(probeBox);
  const conditions = new Map<string, number | null>();
  /**
   * Each condition's answer at a width, by `<its rule>@<width>`: a width
   * condition answers alike at one width every time, and each answer read
   * restyled and laid out the page (a component's `MediaQuery` asks at
   * every mount: 88 ms of a 14-story sheet's read).
   */
  const answers = new Map<string, boolean>();
  /** Whether `condition` holds in a container `width` px wide; null where the engine takes no such condition. */
  const holdsAt = (condition: string, width: number): boolean | null => {
    let at = conditions.get(condition);
    if (at === undefined) {
      const { sheet } = probeStyle;
      at = sheet?.cssRules.length ?? null;
      try {
        sheet?.insertRule(
          `@container cawco-probe ${condition} { [data-cawco-probe] > i[data-q="${at}"] { --cawco-q: 1; } }`,
          at ?? 0
        );
      } catch {
        at = null;
      }
      conditions.set(condition, at);
    }
    if (at === null) {
      return null;
    }
    const key = `${at}@${width}`;
    const known = answers.get(key);
    if (known !== undefined) {
      return known;
    }
    probeBox.style.inlineSize = `${width}px`;
    probeMark.dataset.q = String(at);
    const holds =
      getComputedStyle(probeMark).getPropertyValue("--cawco-q").trim() === "1";
    answers.set(key, holds);
    return holds;
  };

  /**
   * A list for `query` whose `matches` the canvas answers, its listeners
   * the window's own list's (`listened`): a native list's members are its
   * prototype's, so none of them is copied off it.
   */
  const answered = (
    query: string,
    listened: MediaQueryList,
    matches: () => boolean
  ): MediaQueryList => ({
    get matches() {
      return matches();
    },
    media: query,
    onchange: null,
    addEventListener: listened.addEventListener.bind(listened),
    removeEventListener: listened.removeEventListener.bind(listened),
    addListener: listened.addListener.bind(listened),
    removeListener: listened.removeListener.bind(listened),
    dispatchEvent: listened.dispatchEvent.bind(listened),
  });

  window.matchMedia = (query: string) => {
    if (view.motion === "reduce" && REDUCED_QUERY.test(query)) {
      const reduce = query.includes("reduce");
      return answered(query, media(query), () => reduce);
    }
    const split = splitWidth(query);
    if (split.kind !== "frame") {
      return media(query);
    }
    // A body's story asks at its body's width while it mounts; between mounts, at the width the mode says; else the window's, as a body without one answers its CSS.
    const asked = mounting;
    const widthNow = () =>
      (asked === undefined ? (mode?.mediaWidth() ?? null) : asked) ??
      document.documentElement.getBoundingClientRect().width;
    // Where its changes are heard: the window's own list; each query holds where the frame and the window both answer it (width.ts `FramePart`).
    const asWritten = media(query);
    return answered(query, asWritten, () => {
      const at = widthNow();
      let unknown = false;
      const holds = split.parts.some(({ container, media: rest }) => {
        const held = container ? holdsAt(container, at) : true;
        if (held === null) {
          unknown = true;
        }
        return held === true && (!rest || media(rest).matches);
      });
      // A condition the engine takes in no container query: the window answers the list as written.
      return holds || (unknown ? asWritten.matches : false);
    });
  };

  /* --- Sections ----------------------------------------------------------- */

  const plans = planOfPage();
  for (const file of files) {
    sections.push({
      file,
      name: plans[file]?.name ?? sectionName(null, null, file),
      failure: null,
      interactions: new Map(),
      loaded: false,
      moves: [],
      probes: new Map(),
    });
  }
  const sectionOf = (file: string) => sections.find((one) => one.file === file);

  /** The card a section whose module didn't load says so in: the error formula's line, then its error and where it threw under Show details. */
  function failedCard(section: Section, failure: SectionFailure): HTMLElement {
    const { error, frame, kind } = failure;
    const failed = document.createElement("div");
    failed.className = "cawco-section-failed cawco-ui";
    failed.dataset.cawcoFile = section.file;
    failed.setAttribute("role", "alert");
    const line = document.createElement("p");
    line.className = "cawco-section-failed-line";
    line.textContent = graphWords.sectionFailed[kind](section.name);
    const details = detailsOf(error.message);
    if (error.file) {
      // Its place on one line: the path gives way inside, its line and column never.
      const at = `:${error.line ?? 1}:${error.column ?? 1}`;
      const place = document.createElement("p");
      place.className = "cawco-section-failed-place";
      place.title = `${error.file}${at}`;
      const path = document.createElement("span");
      path.textContent = error.file;
      const lineColumn = document.createElement("span");
      lineColumn.textContent = at;
      place.append(path, lineColumn);
      details.append(place);
    }
    if (frame) {
      const code = document.createElement("pre");
      code.className = "cawco-section-failed-frame";
      code.textContent = frame;
      details.append(code);
    }
    failed.append(line, ...fixingLine(by, graphWords.agentTold), details);
    return failed;
  }

  const widthOf = (story: Story, slot: WidthSlot): number | null =>
    slot === "own" ? (story.form?.width ?? null) : slot;

  /** A column's scheme: its own, or the page's (scheme.ts: the host's theme, else the system's). */
  const schemeOf = (column: Column): Scheme =>
    column.scheme === "page" ? pageScheme() : column.scheme;

  /** The args a story mounts with: the meta's, its own, the pane's live ones, then the dials'. */
  const ownArgsOf = (
    section: Section,
    name: string
  ): Record<string, unknown> => {
    const mod = moduleOf(section, name);
    return {
      ...readCsf(mod.default)?.args,
      ...csfOf(mod, name)?.args,
      ...(overrides.get(`${section.file}|${name}`) ?? {}),
    };
  };
  const argsOf = (section: Section, name: string): Record<string, unknown> => ({
    ...ownArgsOf(section, name),
    ...dialArgs,
  });

  /** A story's CSF object (a function story is its `render`). */
  const csfOf = (mod: Record<string, unknown>, name: string): Csf | null =>
    readCsf(mod[name]);

  /** What the adapter mounts for story `name` of `section`, with `args`. */
  function specFor(
    section: Section,
    name: string,
    args: Record<string, unknown>
  ): MountSpec {
    const mod = moduleOf(section, name);
    const meta = readCsf(mod.default) ?? {};
    const csf = csfOf(mod, name) ?? {};
    return {
      args,
      context: {
        args,
        id: name,
        name: csf.name ?? name,
        title: meta.title ?? section.file,
        parameters: {
          ...objectOf(preview.parameters),
          ...meta.parameters,
          ...csf.parameters,
        },
        argTypes: {},
        globals: {},
        viewMode: "story",
      },
      component: csf.component ?? meta.component,
      render: csf.render ?? meta.render,
      // The story's innermost, then the meta's, then the preview file's, as Storybook nests them.
      decorators: [
        ...(csf.decorators ?? []),
        ...(meta.decorators ?? []),
        ...(Array.isArray(preview.decorators) ? preview.decorators : []),
      ],
    };
  }

  /**
   * Each story whose drawing threw, by `file|story`, until it mounts again:
   * posted with the report (`threw`), so the stage tells its agent.
   */
  const thrown = new Map<string, StoryThrew>();

  /** Mounts one story into `body`, its failure kept on `into`. */
  function mountInto(
    body: HTMLElement,
    section: Section,
    name: string,
    args: Record<string, unknown>,
    into: { error?: PageError }
  ): Mounted | undefined {
    into.error = undefined;
    const unreached = section.own?.unreached.get(name);
    if (unreached) {
      into.error = {
        message: stageRenderWords.seedUnreached(unreached),
        file: section.file,
        line: null,
        column: null,
      };
      return;
    }
    const was = mounting;
    // What the story's script asks of matchMedia while it mounts, its body answers.
    const width = Number.parseFloat(body.style.width);
    mounting = Number.isFinite(width) ? width : null;
    // A throw its framework catches after the mount (an edit applied in place, an effect) is said in the story's place by the mode; one during the mount, by whoever mounted it.
    let returned = false;
    const key = `${section.file}|${name}`;
    const threw = (error: unknown) => {
      into.error = pageError(error, root, base);
      thrown.set(key, { file: section.file, story: name, error: into.error });
    };
    thrown.delete(key);
    try {
      const mounted = adapter.mountStory(
        body,
        specFor(section, name, args),
        (error) => {
          threw(error);
          later();
          if (returned) {
            mode?.threw(body);
          }
        }
      );
      returned = true;
      return mounted;
    } catch (error) {
      threw(error);
      console.error(`[cawco] story ${name} did not mount:`, error);
    } finally {
      mounting = was;
    }
  }

  /**
   * A body at `width`: that width, the container its width rules answer,
   * and its screen (width.ts `SCREEN_VW`, `SCREEN_VH`: the device's at that
   * width, core `screenHeight`), which its viewport lengths answer; `fills`:
   * as tall as that screen, for a story with no height of its own
   * ({@link fillsScreen}). None of them with no width: the page's.
   */
  function sizeBody(
    body: HTMLElement,
    width: number | null,
    fills = false
  ): void {
    body.style.width = width === null ? "" : `${width}px`;
    body.style.container =
      width === null ? "" : `${WIDTH_CONTAINER} / inline-size`;
    const screen = width === null ? null : { w: width, h: screenHeight(width) };
    body.style.setProperty(SCREEN_VW, screen ? `${screen.w / 100}px` : "");
    body.style.setProperty(SCREEN_VH, screen ? `${screen.h / 100}px` : "");
    body.style.blockSize = screen && fills ? `${screen.h}px` : "";
  }

  /**
   * The stories, by `file|story`, drawn as tall as their screen: each has a
   * width and no height of its own. An app laid out to fill its window
   * (`height: 100%` down from its root, its parts placed absolutely or
   * fixed) stands 0 tall in a body whose height is its content's, so it
   * drew at the body's floor, and no picture of it could be taken. It
   * fills the screen its width names instead, as it fills a window.
   */
  const screenFilled = new Set<string>();
  const fillKey = (file: string, story: string) => `${file}|${story}`;
  /** Whether a body holds nothing with a height: its content measured with the body's floor let go. */
  const heightless = (body: HTMLElement): boolean => {
    const { blockSize, minBlockSize } = body.style;
    body.style.blockSize = "";
    body.style.minBlockSize = "0px";
    const height = body.offsetHeight;
    body.style.blockSize = blockSize;
    body.style.minBlockSize = minBlockSize;
    return height === 0;
  };
  /** Story `story` drawn as tall as its screen from now on when, drawn in `body`, it has a width and no height of its own; whether it now is. */
  const fillsScreen = (
    section: Section,
    story: Story,
    body: HTMLElement
  ): boolean => {
    const key = fillKey(section.file, story.name);
    const width = Number.parseFloat(body.style.width);
    if (screenFilled.has(key) || !Number.isFinite(width) || !heightless(body)) {
      return false;
    }
    screenFilled.add(key);
    return true;
  };

  /** A body dressed as a story drawn in `column` is: its scheme, width, forced state and the dials' variables. */
  function dressBody(
    body: HTMLElement,
    column: Column,
    story: Story,
    fills: boolean
  ): void {
    const scheme = schemeOf(column);
    const ground = groundOf();
    body.style.colorScheme = scheme;
    body.dataset.theme = scheme;
    body.classList.toggle("dark", scheme === "dark");
    body.style.backgroundColor = ground.background;
    body.style.color = ground.color;
    sizeBody(body, widthOf(story, column.width), fills);
    for (const states of Object.values(FORCED)) {
      for (const state of states) {
        body.classList.remove(allClass(state));
      }
    }
    if (column.interaction !== "rest") {
      for (const state of FORCED[column.interaction]) {
        body.classList.add(allClass(state));
      }
    }
    for (const value of dialVars) {
      body.style.setProperty(value[0], value[1]);
    }
  }

  /**
   * A section's module as this canvas loads it: on a person's graph (the
   * spec's `named`), the stories its agent named and their moves alone, so
   * no other story of the file is drawn, listed or reported here.
   */
  function namedOnly(mod: SectionModule): SectionModule {
    const named = spec.named?.[mod.SHEET.file];
    return named === undefined
      ? mod
      : {
          ...mod,
          SHEET: { ...mod.SHEET, stories: namedKept(mod.SHEET.stories, named) },
        };
  }

  /** Loads a section's states file; the mode draws its stories. */
  function loadSection(section: Section): Promise<void> {
    section.loading ??= (async () => {
      const standing = await shared;
      if (standing) {
        section.failure = standing.failure;
        mode?.failed(section, standing.failure);
        later();
        section.loading = undefined;
        return;
      }
      const since = performance.now();
      section.loadedFrom = Date.now();
      let loaded: SectionModule;
      try {
        loaded = namedOnly(await options.load(section.file, !!section.failure));
        section.mod = loaded;
        await seeded(section);
      } catch (error) {
        heard(error);
        section.failure = await loadFailure(error, since);
        mode?.failed(section, section.failure);
        later();
        section.loading = undefined;
        return;
      }
      show(section, loaded);
    })();
    return section.loading;
  }

  /** Whether a section's module has a `beforeEach`, the meta's or a story's: only then may a story hold modules of its own. */
  const seeds = (section: Section): boolean => {
    const mod = section.mod?.module ?? {};
    return (
      !!readCsf(mod.default)?.beforeEach ||
      (section.mod?.SHEET.stories ?? []).some(
        (story) => !!csfOf(mod, story.name)?.beforeEach
      )
    );
  };

  /**
   * Each story's `beforeEach` run, the meta's first, as Storybook runs them
   * before a story renders: once as its section loads, before any of its
   * frames mount, with the story's context. A story that imports a module
   * in it is evaluated in a runner of its own first (own.ts), made anew
   * each time its section loads, the last ones closed; what its
   * `beforeEach` writes is its runner's, which every frame of that story
   * reads. A story whose seed can't reach its component runs none: its
   * frames are refused ({@link mountInto}).
   */
  async function seeded(section: Section): Promise<void> {
    const was = section.own;
    section.own =
      (seeds(section)
        ? await ownModulesOf(section.file, options.moduleRunner)
        : null) ?? undefined;
    await was?.close();
    for (const story of section.mod?.SHEET.stories ?? []) {
      if (section.own?.unreached.has(story.name)) {
        continue;
      }
      const mod = moduleOf(section, story.name);
      const { context } = specFor(
        section,
        story.name,
        argsOf(section, story.name)
      );
      for (const hook of [
        readCsf(mod.default)?.beforeEach,
        csfOf(mod, story.name)?.beforeEach,
      ]) {
        await hook?.(context);
      }
    }
  }

  /** A section's module, loaded: what every mode reads of it, then the mode's drawing. */
  function show(section: Section, mod: SectionModule): void {
    // Its stories measured afresh as they mount (`fillsScreen`): an edit may have given one a height of its own.
    for (const story of mod.SHEET.stories) {
      screenFilled.delete(fillKey(section.file, story.name));
    }
    section.loaded = true;
    section.failure = null;
    section.name = sectionName(
      mod.SHEET.meta.title,
      section.name,
      section.file
    );
    for (const story of mod.SHEET.stories) {
      if (!section.interactions.has(story.name)) {
        section.interactions.set(story.name, ["rest"]);
      }
    }
    mode?.shown(section);
    quietly(said(section));
    later();
  }

  /* --- What the page says: the sheet for the inspector ------------------- */

  /**
   * The section's whole sheet, its components' props too, read from the
   * stage (core `SHEET_PATH`) once it has drawn, and told the pane (the
   * inspector, the design graph's model): its module carries none, so no
   * draw waits on docgen. A page no pane reads (a map's card, a Preview's
   * embed) asks for none. An answer older than the section's newest ask is
   * let go.
   */
  async function said(section: Section): Promise<void> {
    // No pane reads a stage's render, a map's card or a Preview's embed: none asks for the sheet's docgen.
    if (!section.mod || by !== "panel") {
      return;
    }
    const asked = (sheetAsks.get(section.file) ?? 0) + 1;
    sheetAsks.set(section.file, asked);
    // Beside the page, as its report is posted (core `SHEET_PATH`).
    const at = new URL("sheet", location.href);
    at.search = new URLSearchParams({ file: section.file }).toString();
    let read: SheetRead;
    try {
      const answer = await fetch(at);
      if (!answer.ok) {
        return;
      }
      read = await answer.json();
    } catch {
      // The stage is away: the next load of the section asks again.
      return;
    }
    if (sheetAsks.get(section.file) !== asked) {
      return;
    }
    const sheet: SheetOnPage = {
      ...read,
      stories: namedKept(read.stories, spec.named?.[section.file]),
      file: section.file,
    };
    window.__cawcoSheetsOnPage = {
      ...window.__cawcoSheetsOnPage,
      [section.file]: sheet,
    };
    dispatchEvent(new CustomEvent("cawco:sheet", { detail: sheet }));
  }

  /** A report soon: the stage's own page's reader posts one; no other page posts. */
  function later(): void {
    reader?.later();
  }

  /** The page's own errors, the newest 20, and a line saying how many more there were. */
  const errorsNow = (): PageError[] =>
    errorsDropped > 0
      ? [
          ...pageErrors,
          {
            message: stageRenderWords.andMore(errorsDropped, "errors"),
            file: null,
            line: null,
            column: null,
          },
        ]
      : [...pageErrors];

  /* --- Dials: CSS variables on every body, or args through update -------- */

  /**
   * The agent's dials as the panel turned them (core `StageDials`), the
   * whole set each time: a `cssVar` dial's value with its unit on every
   * body, an `arg` dial's through each body's `update`; a dial the set no
   * longer holds goes back to as written (its variable unset, its arg the
   * story's own).
   */
  let dialVars = new Map<string, string>();
  let dialArgs: Record<string, unknown> = {};
  const applyDials = (values: Record<string, unknown>) => {
    const { vars, args } = dialSetOf(spec.dials ?? [], values);
    const unset = [...dialVars.keys()].filter((name) => !vars.has(name));
    const back = Object.keys(dialArgs).filter((name) => !(name in args));
    const argsChanged = JSON.stringify(args) !== JSON.stringify(dialArgs);
    // The set the page draws already: nothing to set.
    if (
      !argsChanged &&
      JSON.stringify([...vars]) === JSON.stringify([...dialVars])
    ) {
      return;
    }
    dialVars = vars;
    dialArgs = args;
    for (const { body, mounted, written } of mode?.bodies() ?? []) {
      for (const name of unset) {
        body.style.removeProperty(name);
      }
      for (const [name, value] of dialVars) {
        body.style.setProperty(name, value);
      }
      if (argsChanged) {
        mounted?.update({
          ...Object.fromEntries(back.map((name) => [name, written?.[name]])),
          ...args,
        });
      }
    }
    later();
  };

  /* --- The pane's words, through the overlay ----------------------------- */

  window.addEventListener("cawco:story-args", (event) => {
    const { story, args } = event.detail ?? {};
    for (const section of sections) {
      if (!(
        story && section.mod?.SHEET.stories.some((one) => one.name === story)
      )) {
        continue;
      }
      const key = `${section.file}|${story}`;
      if (args && typeof args === "object") {
        overrides.set(key, args);
      } else {
        overrides.delete(key);
      }
      mode?.overridden(section, story);
    }
    dispatchEvent(new CustomEvent("cawco:hmr"));
    later();
  });
  // The pane's mode, as the overlay hears it (preview overlay/page.ts
  // `mode`): in Comment mode what the page marks of its own stays quiet,
  // since the comment target's tint is the one mark.
  window.addEventListener("cawco:mode", (event) => {
    const paneMode = event.detail?.mode;
    document.documentElement.toggleAttribute(
      "data-cawco-commenting",
      paneMode === "comment"
    );
  });
  window.addEventListener("cawco:story-select", (event) => {
    const story = event.detail?.story;
    const chosen = typeof story === "string" ? story : null;
    window.__cawcoSheetChosen = chosen;
    mode?.selected(chosen);
  });
  /** The view as it draws: the page's scheme as the scheme it stands in now. */
  const drawnView = () =>
    JSON.stringify({
      ...view,
      scheme: view.scheme === "page" ? pageScheme() : view.scheme,
    });
  /**
   * The pane's view: scheme, widths, motion. A view that draws as the page
   * already does redresses nothing and reads nothing again: the design
   * graph says its view to every page it loads (DesignGraph's view effect,
   * on `link.loads`), its scheme the dashboard's, which the page drew in
   * already as its own (`page`), so every load read every section twice,
   * the second read straight after the first.
   */
  const setView = (next: Partial<View>) => {
    const was = drawnView();
    const motionWas = view.motion;
    Object.assign(view, {
      ...(next.scheme ? { scheme: next.scheme } : {}),
      ...("widths" in next ? { widths: next.widths ?? null } : {}),
      ...(next.motion ? { motion: next.motion } : {}),
      ...(typeof next.fit === "boolean" ? { fit: next.fit } : {}),
    });
    if (drawnView() === was) {
      return;
    }
    if (view.motion !== motionWas) {
      for (const sheet of sheetsNow()) {
        forceMotion(sheet, view.motion);
      }
    }
    mode?.redressed();
    later();
  };
  window.addEventListener("cawco:canvas-view", (event) => {
    setView(event.detail ?? {});
  });

  /* --- HMR ------------------------------------------------------------- */

  // A page let go of (not kept in the back-forward cache) closes its sections' runners.
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      for (const section of sections) {
        quietly(section.own?.close() ?? Promise.resolve());
      }
    }
  });

  /*
   * A component a drawn section mounts, or a file it imports, was saved
   * (the stage's SECTION_SWAPPED, sent just ahead of Vite's update): its
   * framework swaps it in place, and the drawing stays mounted with its
   * state. What the page reads of the section off screen is read again
   * once the update has applied: its states for the report, and its sheet,
   * whose props the save may have changed. A section the same update loads
   * again (`cawco:section`: a file nothing accepts) is read as it is shown;
   * one the save broke waits for the save that mends it.
   */
  const swapPending = new Set<Section>();
  window.addEventListener(SECTION_SWAPPED, (event) => {
    for (const file of event.detail ?? []) {
      const section = sectionOf(file);
      if (section?.loaded) {
        swapPending.add(section);
      }
    }
  });
  /** The sections a save swapped in place, read again off screen; a task after the update, when the words of a save that broke one, queued behind it in Vite's client, are heard. */
  const readSwapped = async (swapped: Section[]) => {
    await nextTask();
    for (const section of swapped) {
      if (!section.failure) {
        // Its framework's update has applied: what it draws now is the save's.
        section.loadedFrom = Date.now();
        mode?.swapped(section);
        quietly(said(section));
      }
    }
  };

  window.addEventListener("cawco:section", (event) => {
    const mod = event.detail && namedOnly(event.detail);
    const section = sectionOf(mod?.SHEET.file ?? "");
    if (!section) {
      return;
    }
    // Loaded again: it is read as it is shown, never as swapped too.
    swapPending.delete(section);
    section.mod = mod;
    section.loadedFrom = Date.now();
    section.interactions.clear();
    section.probes.clear();
    const since = performance.now();
    quietly(
      seeded(section).then(
        () => {
          // A save that broke it was said after this update began: it stays said until the next.
          if (
            (brokenAt.get(section.file) ?? Number.NEGATIVE_INFINITY) >= since
          ) {
            return;
          }
          show(section, mod);
          dispatchEvent(new CustomEvent("cawco:hmr"));
        },
        async (error: unknown) => {
          heard(error);
          section.failure = await loadFailure(error, since);
          mode?.failed(section, section.failure);
          later();
        }
      )
    );
  });
  /*
   * A save broke a module a drawn section is drawn from (the stage's
   * SECTION_BROKEN, just after Vite's error for it): the section says so in
   * its own place, with the stage's words, its drawings taken down, rather
   * than standing at what it drew before the save, or at half of it. Vite
   * applies none of an update a module of which failed (its client calls
   * each accept with nothing), so what stood is no longer what the files
   * say. Its next save that compiles draws it again: the stage says so
   * ({@link SECTION_MENDED}), and a save of its states file also loads
   * its own module again (host.ts `hotUpdate`, `cawco:section`). A
   * section not yet drawn says its own load's failure.
   */
  const brokenAt = new Map<string, number>();
  window.addEventListener(SECTION_BROKEN, (event) => {
    const now = performance.now();
    const failure: SectionFailure = saidSince(now - STAGE_SAYS_MS) ?? {
      kind: "compile",
      frame: null,
      error: { message: "", file: null, line: null, column: null },
    };
    for (const file of event.detail ?? []) {
      const section = sectionOf(file);
      if (!section?.loaded) {
        continue;
      }
      brokenAt.set(section.file, now);
      section.failure = failure;
      mode?.failed(section, failure);
    }
    later();
  });
  // The save that broke it compiles now: drawn again from its module as it stands, its framework's update applied.
  window.addEventListener(SECTION_MENDED, (event) => {
    for (const file of event.detail ?? []) {
      const section = sectionOf(file);
      if (section?.loaded && section.failure && section.mod) {
        brokenAt.delete(section.file);
        show(section, section.mod);
      }
    }
  });
  // A states file it found missing is written: its section loads again, with no reload of the canvas.
  window.addEventListener(SECTION_WRITTEN, (event) => {
    const section = sectionOf(event.detail ?? "");
    if (!section || section.loaded || section.loading) {
      return;
    }
    quietly(
      loadSection(section).then(() => {
        dispatchEvent(new CustomEvent("cawco:hmr"));
      })
    );
  });
  /*
   * A section that failed to load, named in an update Vite sends (a file
   * its graph imports changed: Vite's propagation reaches its section's
   * module, which accepts itself), loads again. Its module never ran, so it
   * accepted nothing in this page, and Vite's client passes the update by
   * (`fetchUpdate`: no module of that path in `hotModulesMap`). The browser
   * keeps every module it fetched by its address, the failed one too ("If
   * moduleMap[(url, moduleType)] is a module script, run onComplete given
   * moduleMap[(url, moduleType)]", html.spec.whatwg.org fetch a single
   * module script), so the section is asked for at a fresh `?t=`, and Vite
   * writes each import of a module the change reached with that module's
   * HMR stamp (`depModule.lastHMRTimestamp > 0`: `?t=`; an HMR invalidation
   * stamps the changed module and every importer up to the one accepting
   * it): only that section's graph is fetched again, at new addresses, never
   * the page.
   */
  window.addEventListener("cawco:updates", (event) => {
    const updated = new Set((event.detail ?? []).map(sectionOfPath));
    for (const section of sections) {
      if (
        section.failure &&
        !section.loaded &&
        !section.loading &&
        updated.has(section.file)
      ) {
        quietly(
          loadSection(section).then(() => {
            dispatchEvent(new CustomEvent("cawco:hmr"));
          })
        );
      }
    }
  });
  window.addEventListener("cawco:after-update", () => {
    mode?.updated();
    if (swapPending.size > 0) {
      const swapped = [...swapPending];
      swapPending.clear();
      quietly(readSwapped(swapped));
    }
    dispatchEvent(new CustomEvent("cawco:hmr"));
    later();
  });

  /* --- The page's own style ----------------------------------------------- */

  const style = new PageStyle({
    tokens: options.tokens,
    faces: options.faces,
  });

  // The page's scheme turned (the host's theme, or the system's): every body drawn in it follows.
  onPageScheme(() => {
    mode?.redressed();
    later();
  });

  const state: CanvasState = {
    files,
    view,
    report: null,
    reports: 0,
    swept: false,
    // The panel's page loads no states file up front: only the one its
    // design graph has in front, or reaches or compares into (stage.ts
    // `loadOne`). A whole screen is some 1,264 modules, so three directions
    // loaded as it opens tripled the first wait. The stage's own page
    // sweeps the files it is asked for; an embed and a map card load every one.
    sweeps: sweepsOf(by, files, plans, params.get(RENDER_STATE_PARAM)),
    sweepAt: null,
    drawn: [],
    setView,
    loaded: () => sections.filter((one) => one.loaded).map((one) => one.file),
  };
  const page: Page = {
    applyDials,
    base,
    by,
    files,
    options,
    plans,
    rewrite,
    root,
    sections,
    spec,
    state,
    style,
    view,
    argsOf,
    csfOf,
    dressBody,
    errorsNow,
    failedCard,
    fills: (section, story) => screenFilled.has(fillKey(section.file, story)),
    fillsScreen,
    heard,
    later,
    loadSection,
    measuring: by === "stage" && params.get(MEASURE_PARAM) === "1",
    mountInto,
    ownArgsOf,
    quietly,
    get reader() {
      return reader;
    },
    rewriteAll,
    said,
    schemeOf,
    sectionOf,
    sizeBody,
    threwNow: () => [...thrown.values()],
    widthOf,
  };
  window.__cawcoCanvas = state;
  reader = readerOf?.(page) ?? null;
  mode = bootStage(page);
}

const BODY_RULE = /(^|,)\s*(body|html|:root)\s*(,|$)/u;
const REDUCED_QUERY = /prefers-reduced-motion/u;
