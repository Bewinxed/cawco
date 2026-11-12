<!--
  Another artifact of the session's, live in a frame, at its real size: 1
  CSS px per px, never scaled (the owner's rule for every preview). A
  page-sized design (a page, a dev server's or a folder's preview, a sheet:
  a whole screen, the owner's "too narrow and small for me to view how the
  graph/timeline looks") naming no width takes its card's whole width
  (`fills`: its card's options stand one to a row), a screen's 16:10 of it
  under the media cap, and lays itself out to it. Naming its own layout
  width it stands at that width and that screen's own height (core
  `screenHeight`: upright under a desk's width, 16:10 from there up), the
  media cap aside: wider than its well it scrolls sideways, as a story does.
  Open full size opens it where a chip of it opens (the host's
  `openReference`, asked through the overlay's `cawco.open`), as Canvas's
  Open to draw does. Each draws the version the page's media
  names, the artifact's newest, whatever version its panel keeps open. A
  page stands at its own address on this page's origin
  (`/__cawco/page/<id>/`), loaded at once with no turn, a screen's skeleton
  standing over it until its frame has loaded; naming no width it is as tall as
  its content up to the media cap. One taller than its frame scrolls inside
  it, the house edge fade over its head and foot while more is past them,
  so nothing is cut off without a way to see it. A dev server's or a
  folder's preview or a sheet stands on an origin of its own the hub opened
  for it (hub server.ts `embedAt`), open in the panel or not, named in the
  page's media, loaded on its turn among the page's embeds and alone in it
  (one dashboard's load at a time, the one in view first, embed-turns.ts),
  once its card is close to the view (`DRAW_MARGIN`), holding that turn
  until its app has mounted (core `EMBED_DRAWN`), and shown once its frame
  has loaded and its app shows something (that same word: a dev server's
  app mounts seconds after its frame's load), its wait saying so until then,
  or, `DRAW_MS` past its load, the last file its server sent it (core
  `EMBED_ARRIVING`) and the last second its server held a request of it
  (core `previewHeld`): a cold dev server still compiling, or holding the
  page's modules or data, is still opening, that it showed nothing. A
  component canvas draws the stories its `stories` names (every one
  when it names none) as the component alone, each at the width it names
  (core `canvasEmbedUrl`), else at its own size, and
  says how tall it stands and how wide its widest story is (runtime.ts
  `sayShape`), so its frame is that wide and that tall; a page's canvases
  load together, each telling its module graph before it fetches any of it,
  fetching its share on its turn and the rest from the cache once another
  frame fetched it, so each module is asked of the network once for the
  page, the one in view or nearest it first (embed-turns.ts). A canvas's
  frame mounts and fetches only as its card nears the page's view, and
  draws only nearer still (`FETCH_MARGIN`, `DRAW_MARGIN`): a page of many
  canvases runs only the ones near what the person sees, and once drawn a
  frame stays, so what was done in it survives a scroll. Each stands in its well, which hugs it
  and scrolls it sideways where it is wider (Well.svelte). While a screen's
  origin is asked and its turn waited for, the well holds its shape as a
  skeleton for the whole wait; a canvas waiting its turn or loading holds its
  skeleton at its picture's own shape as the page's media knows it (what an
  embed of its stories said, in any browser, else its stories as the stage
  drew them; the kit's picture where none was ever drawn) until it stands
  drawn, never an empty box. Every one not yet drawn says so past the wait
  grace, one muted line after the live dot at its box's top (BrowserView.svelte's
  wait; DESIGN.md, Skeleton; The Claim Of Nothing Rule): waiting its
  turn, or opening. One that can't stand says why in
  one line in its place and shape, with Try again: an origin unreached, the
  proxy's own page in its frame (`cawco:down`: its workspace not running,
  its server stopped, its session closed it, its server answered the page
  with an error status) or its overlay's word that the page threw before it
  loaded and shows nothing (`crashed`), a canvas that says it can't
  draw what it names (core `CANVAS_EMBED_FAILED`), or one told to draw that
  says neither its shape nor why within `DRAW_MS`. One the hub no longer
  holds says so in words where it would stand.
-->
<script lang="ts">
  import {
    askHubReach,
    PREVIEW_REACH_PATH,
    type PreviewWays,
    previewHeld,
    previewsNeedWords,
    previewUnreachedWords,
    probePreview,
    unreachedOf,
  } from "@cawco/core/preview-reach";
  import { PREVIEW_DOWNS, type PreviewDown } from "@cawco/core/protocol";
  import {
    CANVAS_EMBED_FAILED,
    CANVAS_EMBED_FETCHED,
    CANVAS_EMBED_GO,
    CANVAS_EMBED_GRAPH,
    CANVAS_EMBED_READY,
    CANVAS_EMBED_SEEN,
    CANVAS_EMBED_SIZE,
    canvasEmbedUrl,
    EMBED_ARRIVING,
    EMBED_DRAWN,
    EMBEDDED,
    type EmbedShape,
    screenHeight,
    storiesKey,
  } from "@cawco/core/stage";
  import { commonWords } from "@cawco/core/words/common";
  import { decisionsWords } from "@cawco/core/words/decisions";
  import {
    type FrameObserver,
    frameObserver,
  } from "#lib/cawco/frame-observer.js";
  import { track } from "#lib/cawco/track.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconRefresh } from "#lib/icons.js";
  import { dur, reveal, revealHere } from "../../motion/curves.svelte";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { type EmbedTurn, embedTurn, scrollerOf } from "./embed-turns.js";
  import { bridge, pieceName, served } from "./page.svelte.js";
  import Well from "./Well.svelte";

  let {
    props,
  }: OpenUIRenderProps<{
    artifact: unknown;
    caption?: unknown;
    stories?: unknown;
    width?: unknown;
  }> = $props();
  const id = $derived(String(props.artifact ?? ""));
  const held = $derived(served.media[id]);
  /** What the page calls it, on screen and to a reader: never its artifact's name (page.svelte.ts `pieceName`). */
  const named = pieceName(() => props.caption, "preview");
  const stories = $derived(
    Array.isArray(props.stories) ? props.stories.map(String) : []
  );
  /** The width the program names for it, px; null where it names none. */
  const namedWidth = $derived(
    typeof props.width === "number" ? props.width : null
  );
  /** The key its at-rest shape is kept by (core `storiesKey`). */
  const shapeKey = $derived(storiesKey(stories, namedWidth));
  let frame = $state<HTMLIFrameElement>();
  /** The box the frame and its wait stand in: where the picture is on the page, for its turn (embed-turns.ts). */
  let box = $state<HTMLDivElement>();
  let tall = $state<number | null>(null);
  /** A component canvas's widest story, as it says it: its frame is that wide. */
  let saidWidth = $state<number | null>(null);
  /**
   * Its picture's loading shape, from the page's media (core
   * `CanvasShapes`), so its skeleton stands at the picture's own shape from
   * its first paint: the shape an embed of these stories said, as any
   * browser's Preview heard it; else each story it names as the stage drew
   * it at the width named (any, where it names none), one under another with the embed's own gap (agent canvas chrome.ts
   * `cawco-embed`: `--spacing-space-3`). Null where none has been drawn anywhere:
   * the kit's picture stands in.
   */
  const known = $derived.by(
    (): {
      parts: { h: number; w: number | null }[];
      w: number | null;
    } | null => {
      const shapes = held?.shapes;
      const said = shapes?.said[shapeKey];
      if (said) {
        return { parts: [said], w: said.w };
      }
      // The stage drew each story at its own width: a shape of another width than the one named is none of this picture's.
      const drawn = stories.map((one) => {
        const shape = shapes?.drawn[one];
        return shape && (namedWidth === null || shape.w === namedWidth)
          ? shape
          : undefined;
      });
      if (stories.length === 0 || !drawn.every((one) => one !== undefined)) {
        return null;
      }
      const parts = drawn as { h: number; w: number }[];
      return { parts, w: Math.max(...parts.map((one) => one.w)) };
    }
  );
  /**
   * The design's own width, px: the program's `width`, or the canvas's
   * widest story (as it says it, else as the page's media knows it) where
   * that is wider. Its frame stands at it, 1 CSS px per px; none, it takes the
   * well's width. Only a frame stands at it: a line saying the piece can't be
   * opened or is gone takes the card's width, never a picture's it no longer
   * shows.
   */
  const picture = $derived.by(() => {
    const widths = [
      typeof props.width === "number" ? props.width : 0,
      saidWidth ?? known?.w ?? 0,
    ];
    const widest = Math.max(...widths);
    return framed && widest > 0 ? widest : undefined;
  });
  /** A page taller than its frame: more is above or below what it shows (the edge fade's cue). */
  let more = $state({ above: false, below: false });
  /** It stands at a screen's shape, known before it serves: a dev server's preview or a sheet, not a component canvas, which says its own height. */
  const screen = $derived(held?.kind !== "component");
  /**
   * A page-sized design: a page, a dev server's or a folder's preview, or a
   * sheet, a whole screen that lays itself out to its frame, where a
   * component canvas is its stories at their own sizes.
   */
  const pageSized = $derived(!!held && held.kind !== "component");
  /**
   * A page-sized design's height, px, where it names its own width: that
   * screen's own (core `screenHeight`), real px whatever the page's window,
   * so a phone is judged at a phone's height and a desk at a desk's; null
   * where it names none, which stands at a screen's 16:10 under the media cap.
   */
  const screenTall = $derived(
    pageSized && picture !== undefined ? screenHeight(picture) : null
  );
  /** The frame's height: its screen's own, or as tall as it says it is; none until then, its class's 16:10. */
  const framedHeight = $derived.by(() => {
    const height = screenTall ?? tall;
    return height === null ? undefined : `${height}px`;
  });
  /** What a press on Open full size was refused, in the hub's words. */
  let refusal = $state("");
  let opening = $state(false);
  /** The preview in front of a panel at its whole size: where a chip of it opens (the host's `openReference`), as Canvas's Open to draw. */
  async function openFull() {
    opening = true;
    refusal = "";
    try {
      refusal = (await bridge()?.open(id)) ?? "";
    } finally {
      opening = false;
    }
  }
  let watch: FrameObserver | undefined;
  /** A component canvas's place among the page's canvases, which fetch their graphs together (embed-turns.ts): its share is held until it arrived, else until it says its shape. */
  let turn: EmbedTurn | undefined;
  /** Where its canvas's graph stands in the page's turns: told and waiting, fetching its share on its turn, or its share fetched whole. */
  let turnState = $state<"waiting" | "fetching" | "fetched">("waiting");
  /** Its frame's load now told its graph (core `CANVAS_EMBED_GRAPH`): its load then takes no turn for a page that told none. */
  let graphHeard = false;

  /**
   * The shape its canvas said at rest, told beside the page's own address
   * (hub preview.ts `PAGE_SHAPE_PATH`) where the media knew another: kept
   * for every next Preview of these stories at this width, in any browser.
   * Only the at-rest one (core `CANVAS_EMBED_SIZE`'s `rest`): after a list
   * opened and closed at 1540, the closed list's 506 was kept, and the next
   * load held its wells there and grew them 289px as the frames drew.
   * Unheard, the next stands at what the media knew; nothing waits on it.
   */
  const tellShape = (heard: EmbedShape) => {
    const had = held?.shapes?.said[shapeKey];
    if (had?.h === heard.h && had.w === heard.w) {
      return;
    }
    // Beside the page's own address (hub preview.ts `PAGE_SHAPE_PATH`).
    fetch("shape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        artifact: id,
        stories,
        width: namedWidth,
        ...heard,
      }),
    }).catch(() => undefined);
  };

  /** What a whole screen's overlay says of the document its frame holds, heard: true for its words, false for any other. */
  const heardScreen = (type: unknown): boolean => {
    // A new document in its frame (its overlay's first word, each load): a
    // dev server's reload after an edit or a restart shows nothing of its
    // own until it mounts again, so its wait stands over it until then,
    // never the frame's empty page.
    if (type === EMBEDDED) {
      appDrawn = false;
      arrived += screen ? 1 : 0;
      return true;
    }
    // Its server still sends what the page loads (a cold dev server
    // compiling its modules as they are asked for): still opening, so its
    // clock starts again ({@link DRAW_MS}).
    if (type === EMBED_ARRIVING) {
      arrived += screen ? 1 : 0;
      return true;
    }
    // A whole screen's app has mounted (its overlay saw it show something of its own): the page's turn is the next screen's.
    if (type === EMBED_DRAWN) {
      appDrawn = true;
      turnState = "fetched";
      turn?.done();
      return true;
    }
    return false;
  };

  /** A component canvas's own height and widest story, as it says them (agent canvas runtime `by=embed`): its frame is as tall and as wide. */
  $effect(() => {
    const heard = (event: MessageEvent) => {
      const said = event.data as {
        down?: unknown;
        height?: unknown;
        rest?: unknown;
        type?: unknown;
        urls?: unknown;
        why?: unknown;
        width?: unknown;
      } | null;
      if (event.source !== frame?.contentWindow) {
        return;
      }
      const why = failureIn(said);
      if (why !== null) {
        fail(why);
        return;
      }
      // Its graph, told before it fetches any of it, by every load of its
      // frame: each load fetches on a turn of its own.
      if (said?.type === CANVAS_EMBED_GRAPH && Array.isArray(said.urls)) {
        graphHeard = true;
        turnState = "waiting";
        turn?.graph(said.urls.map(String));
        return;
      }
      if (heardScreen(said?.type)) {
        return;
      }
      // Its share arrived: those modules are the page's, and the budget they held is free.
      if (said?.type === CANVAS_EMBED_FETCHED) {
        turnState = "fetched";
        turn?.fetched();
        return;
      }
      if (said?.type === CANVAS_EMBED_SIZE && typeof said.height === "number") {
        tall = said.height;
        saidWidth = typeof said.width === "number" ? said.width : null;
        turn?.done();
        if (said.rest === true) {
          tellShape({ h: tall, w: saidWidth });
        }
      }
    };
    addEventListener("message", heard);
    return () => removeEventListener("message", heard);
  });

  let unscroll: (() => void) | undefined;
  function sized() {
    watch?.disconnect();
    unscroll?.();
    let root: HTMLElement | undefined;
    const view = frame?.contentWindow;
    try {
      root = frame?.contentDocument?.documentElement;
    } catch {
      // Another origin's document: its own height is not this page's to read.
      return;
    }
    if (!(root && view)) {
      return;
    }
    /** Whether more of the page is above or below what its frame shows. */
    const mark = () => {
      const top = view.scrollY;
      more = {
        above: top > 0,
        below: top + view.innerHeight < root.scrollHeight - 1,
      };
    };
    const measure = () => {
      tall = root.scrollHeight;
      mark();
    };
    // Read now, and a change in the next frame (frameObserver): the frame
    // takes its height from it, up to the media cap, which lays its
    // document out again. A scroll lays nothing out, and is read at once.
    measure();
    watch = frameObserver(measure);
    watch.observe(root);
    view.addEventListener("scroll", mark, { passive: true });
    unscroll = () => view.removeEventListener("scroll", mark);
  }
  $effect(() => () => {
    watch?.disconnect();
    unscroll?.();
  });

  /**
   * How often an embed's origin is asked whether it serves yet, and for how
   * long an answer that it doesn't (the hub's word that it is down, or a
   * status: its server still starting) is waited out: once a second for 30 seconds. Our call: long enough for a
   * dev server's cold start, short enough that a dead one is said. Any other
   * failure is this browser's side or the hub's, said at once (core
   * preview-reach.ts).
   */
  const PING_MS = 1000;
  const START_MS = 30_000;
  /** `--duration-wait-grace` in ms, in the unit host.css writes it (motion `dur`: its minifier writes `1000ms` as `1s`): a wait shows nothing before it (DESIGN.md, The Real Wait Rule). */
  const grace = () => dur("--duration-wait-grace");
  /**
   * An embed's address once its origin serves it: its ping (core
   * `PREVIEW_PING_PATH`, open to any page) answers ok when the machine's
   * listener for it does, starting it when it has none. Loaded before then,
   * the frame would hold the browser's own error page for good.
   */
  let ready = $state<string | null>(null);
  /** The ready frame finished loading: until then the wait stands over it, so no empty box shows. */
  let drawn = $state(false);
  /**
   * A whole screen's app shows something of its own (core `EMBED_DRAWN`,
   * its overlay's word), in the document its frame holds now: each new one
   * (core `EMBEDDED`) starts without. Its frame's load is not that: a dev
   * server's app (a dashboard) shows nothing at its load and mounts once its
   * modules compile and run, which on a cold dev server takes seconds; shown
   * at its load, it stood as an empty box in the page's colour all that
   * while, and so did every reload of it once its first document had drawn.
   */
  let appDrawn = $state(false);
  /**
   * Each word that its screen is still arriving: a new document in its frame
   * (core `EMBEDDED`), or a file it loads come from its server (core
   * `EMBED_ARRIVING`). Its {@link DRAW_MS} runs from the last.
   */
  let arrived = $state(0);
  /** The frame stood unseen under its wait (its skeleton), so its showing is the skeleton's reveal. */
  let underWait = false;
  /**
   * It stands at its own shape: a screen once its frame has loaded and its
   * app shows something ({@link appDrawn}); a component canvas once it has said its height (every Preview of a canvas
   * by that one rule, the first as the rest), never at a screen's 16:10
   * while it hasn't. Until then its wait stands.
   */
  const shaped = $derived(screen ? drawn && appDrawn : tall !== null);
  /** What its frame's shape is now, for a reader: a screen's 16:10, drawn at the height its canvas said, or waiting for that. */
  const shape = $derived.by(() => {
    if (!shaped) {
      return "waiting";
    }
    return tall === null ? "screen" : "drawn";
  });
  /**
   * Why it can't stand: its origin unreached, in the shared classifier's
   * words (core `previewUnreachedWords`), or its frame's own failure, one
   * line (`decisionsWords.previewFailed`): the hop the proxy's page named,
   * the canvas's own why, or a draw that never came ({@link DRAW_MS}).
   */
  let failed = $state<
    | { cause: string; kind: "unreached" }
    | { kind: "failed"; line: string }
    | null
  >(null);
  /** It can't stand, for `why` (plain words, after "This preview didn't load:"): its wait ends, and its turn with it. */
  const fail = (why: string) => {
    failed = { kind: "failed", line: decisionsWords.previewFailed(why) };
    turn?.done();
  };
  /**
   * Why its frame's message says it can't stand, in plain words: the
   * proxy's own page in the frame, naming the hop that didn't answer (core
   * `downResponse`, `cawco:down`), or a canvas that can't draw what this
   * Preview names (core `CANVAS_EMBED_FAILED`); null for any other message.
   */
  const failureIn = (
    said: { down?: unknown; type?: unknown; why?: unknown } | null
  ): string | null => {
    const why = typeof said?.why === "string" ? said.why : null;
    if (said?.type === "cawco:down") {
      const hop = PREVIEW_DOWNS.find((one) => one === said.down);
      return hop ? downWhy(hop, why) : null;
    }
    return said?.type === CANVAS_EMBED_FAILED ? why : null;
  };
  /** Why the proxy's page says nothing serves it, by the hop it named (core `PreviewDown`) and the machine's words for it. */
  const downWhy = (hop: PreviewDown, why: string | null): string => {
    switch (hop) {
      case "server":
        return why === null
          ? decisionsWords.previewServerDown
          : decisionsWords.previewServerDownWhy(why);
      case "workspace":
        return decisionsWords.previewWorkspaceDown;
      case "machine":
        return why === null
          ? decisionsWords.previewMachineDown
          : decisionsWords.previewMachineDownWhy(why);
      case "reach":
        return why === null
          ? decisionsWords.previewReachDown
          : decisionsWords.previewReachDownWhy(why);
      case "closed":
        return decisionsWords.previewClosed;
      case "gone":
        return decisionsWords.previewGone;
      case "error":
        return decisionsWords.previewErrored(why ?? "with an error");
      case "crashed":
        return decisionsWords.previewCrashed(why ?? "no message");
      default:
        return hop satisfies never;
    }
  };
  /** Its draw's wait ({@link drawing}) has outlasted `--duration-wait-grace`: the failure may show. */
  let slow = $state(false);
  /** Each Try again asks the origin again from the start. */
  let attempt = $state(0);
  let asking = $state(false);
  /** How this hub's previews are reached, as its reach answer says it (core `PreviewWays`); unknown until the hub was asked. */
  let ways: PreviewWays | null = null;
  /** What previews need from this browser: a host-mode name stands on another host than this page's; a port on this one. */
  const previewsNeed = (at: URL) =>
    at.hostname === location.hostname
      ? previewsNeedWords({
          byHost: false,
          hostname: at.hostname,
          ports: ways?.ports ?? null,
          hostMode: ways?.hostMode ?? false,
        })
      : previewsNeedWords({ byHost: true, host: at.host });
  /**
   * How near the page's view a component canvas's card comes before its
   * frame mounts and fetches its graph ({@link FETCH_MARGIN}), and before it
   * loads its stories and draws ({@link DRAW_MARGIN}): shares of its
   * scroller's height above and below the view, so at a person's scroll the
   * network is behind it by the time it draws, and it has drawn by the time
   * it comes into view. Our calls, measured in canvas-cost's `decision` leg.
   */
  const FETCH_MARGIN = "500% 0px";
  const DRAW_MARGIN = "350% 0px";
  /**
   * Its card came within {@link FETCH_MARGIN} of the view: its frame mounts
   * and fetches its graph, and never goes while the Preview stands, so what
   * the person did in it (a menu opened, a pin) survives a scroll. Until
   * then its skeleton stands at its shape, and it asks nothing of its origin.
   */
  let near = $state(false);
  /** Its card came within {@link DRAW_MARGIN} of the view: its frame loads its stories and draws once its graph is in. */
  let close = $state(false);
  /** Its box stood in the view: a canvas told to draw has its frames from then (runtime.ts `settledHeight`), so its {@link DRAW_MS} runs from then. */
  let seen = $state(false);
  // A canvas's frame told its box stood in the view, once it has loaded: standing at no height until it says its shape, it can't see that itself.
  $effect(() => {
    if (seen && drawn && held?.kind === "component") {
      frame?.contentWindow?.postMessage({ type: CANVAS_EMBED_SEEN }, "*");
    }
  });
  /** Watches its card until it comes within `margin` of its scroller's view, then calls `came` once. */
  const watchNear = (place: Element, margin: string, came: () => void) => {
    const comes = new IntersectionObserver(
      (entries) => {
        if (entries.some((one) => one.isIntersecting)) {
          came();
          comes.disconnect();
        }
      },
      { root: scrollerOf(place), rootMargin: margin }
    );
    comes.observe(place);
    return () => comes.disconnect();
  };
  $effect(() => {
    const place = box;
    if (!place || near || !held?.embed) {
      return;
    }
    return watchNear(place, FETCH_MARGIN, () => {
      near = true;
    });
  });
  $effect(() => {
    const place = box;
    if (!place || close || !held?.embed) {
      return;
    }
    return watchNear(place, DRAW_MARGIN, () => {
      close = true;
    });
  });
  $effect(() => {
    const place = box;
    if (!place || seen || !held?.embed) {
      return;
    }
    return watchNear(place, "0px", () => {
      seen = true;
    });
  });
  /** The rest of its graph once every module of it is in (embed-turns.ts `ready`), held until its card is {@link close}; and the frame's origin to tell it to. */
  // Raw: a structured clone takes no proxy (postMessage refuses one with a DataCloneError).
  let rest = $state.raw<{ origin: string; urls: string[] } | null>(null);
  /** Its frame was told to draw (`CANVAS_EMBED_READY`): its whole graph is in this browser, and it has {@link DRAW_MS} to say its shape or why it can't. */
  let told = $state(false);
  $effect(() => {
    if (close && rest) {
      frame?.contentWindow?.postMessage(
        { type: CANVAS_EMBED_READY, urls: rest.urls },
        rest.origin
      );
      rest = null;
      told = true;
    }
  });
  /**
   * How long a canvas told to draw may take, once its box has stood in the
   * view, to say its shape or why it can't before its Preview says it didn't
   * load: its graph is already in this browser by then, so what is left is
   * evaluating it and mounting its stories (caw-panel's 839 modules drew
   * 2.3 s after they arrived, stage host.ts). It says its shape once its
   * stories have settled over their frames (runtime.ts `settledHeight`),
   * which a browser gives a cross-origin frame off the page's screen only
   * once it is scrolled to, so the clock runs from {@link seen}. Our call:
   * past any page's evaluation, short of a wait nobody reads as loading. A
   * frame that says neither (a page that isn't the canvas, an import that
   * never settles) is otherwise an empty box for good. A whole screen has
   * as long to show something ({@link appDrawn}) from its frame's load, and
   * again from each new document in it and each file its server sent it
   * since ({@link arrived}): a dev server woken from sleep answers the
   * document at once and compiles the app's modules as the page asks for
   * them, which on a cold start (its install, its dependencies bundled, its
   * reload once they are) passes 30 s, and the Preview said the page
   * "showed nothing" while it was still arriving (owner, 2026-11-07). Its
   * server may also hold what the page asked for, with nothing arriving: a
   * cold Vite holds every module that imports a dependency until it has
   * scanned and bundled them, and a route waits on its data; so its clock
   * starts again too each second the server holds a request of the page
   * (core `previewHeld`, the machine's listener's word). So it says so only
   * of a page that showed nothing for 30 s with nothing more coming and
   * nothing held; until then it is opening.
   */
  const DRAW_MS = 30_000;
  /** Its draw's clock runs: a canvas told to draw, or a screen whose frame loaded, its box in the view ({@link seen}). */
  const awaited = $derived(seen && (screen ? drawn : told));
  $effect(() => {
    track(arrived);
    if (!awaited || shaped || failed) {
      return;
    }
    const late = setTimeout(() => {
      fail(
        screen
          ? decisionsWords.previewBlank(DRAW_MS / 1000)
          : decisionsWords.previewLate(DRAW_MS / 1000)
      );
    }, DRAW_MS);
    return () => clearTimeout(late);
  });
  // While a screen's clock runs, its server is asked each second whether it
  // still holds a request of the page ({@link DRAW_MS}).
  $effect(() => {
    const embed = held?.embed;
    if (!(embed && screen && awaited) || shaped || failed) {
      return;
    }
    const { origin } = new URL(embed);
    let gone = false;
    const ask = async () => {
      if ((await previewHeld(origin)) && !gone) {
        arrived += 1;
      }
      if (!gone) {
        next = setTimeout(ask, PING_MS);
      }
    };
    let next = setTimeout(ask, PING_MS);
    return () => {
      gone = true;
      clearTimeout(next);
    };
  });
  $effect(() => {
    const embed = held?.embed;
    track(attempt);
    ready = null;
    rest = null;
    told = false;
    drawn = false;
    appDrawn = false;
    failed = null;
    if (!embed) {
      return;
    }
    const canvas = held?.kind === "component";
    // Far from the view it waits as its skeleton, asking nothing: a canvas
    // until it is near (its graph fetched ahead), a whole screen until it is
    // close (its load is its draw).
    if (canvas ? !near : !close) {
      return;
    }
    const address = canvas ? canvasEmbedUrl(embed, stories, namedWidth) : embed;
    let gone = false;
    const at = new URL(embed);
    /** The hub asked whether it reaches `origin`, and how its previews are reached heard with it. */
    const hubReach = (origin: string) =>
      askHubReach(
        `${PREVIEW_REACH_PATH}?origin=${encodeURIComponent(origin)}`,
        (heard) => {
          ways = heard;
        }
      );
    /** The origin asked once a second until it serves (null) or says why it won't, within {@link START_MS}. */
    const reached = async () => {
      const deadline = Date.now() + START_MS;
      for (;;) {
        // The preview's own server down is the origin reached (core
        // `unreachedOf`): its frame loads the proxy's page, whose
        // `cawco:down` says that hop's down state ({@link downWhy}).
        const why = unreachedOf(await probePreview(at.origin, hubReach));
        if (
          gone ||
          !why ||
          !(why.cause === "down" || why.cause === "status") ||
          Date.now() >= deadline
        ) {
          return why;
        }
        await new Promise((resolve) => setTimeout(resolve, PING_MS));
      }
    };
    asking = true;
    // Every embed of the page takes its place in its turns now, as it mounts, so every Preview of the page is in the queue before the first turn, the one in view first (embed-turns.ts). A canvas fetches its graph on its turn, its frame loading meanwhile, its skeleton standing; a whole screen loads on its turn, alone, once its origin answers, which it tells as an empty graph: seven dashboards asked at once held every frame of the page white for most of a minute.
    turnState = "waiting";
    if (canvas) {
      const { origin } = new URL(address);
      // Each load of its frame takes a turn of its own (embed-turns.ts
      // `graph`): its go, then its rest, told again for every load.
      turn = embedTurn(() => box, {
        go: (share) => {
          if (!gone) {
            turnState = "fetching";
            frame?.contentWindow?.postMessage(
              { type: CANVAS_EMBED_GO, urls: share },
              origin
            );
          }
        },
        ready: (urls) => {
          if (!gone) {
            rest = { origin, urls };
          }
        },
      });
    } else {
      turn = embedTurn(
        () => box,
        {
          go: () => {
            if (!gone) {
              turnState = "fetching";
              ready = address;
            }
          },
          ready: () => undefined,
        },
        true
      );
    }
    (async () => {
      const why = await reached();
      if (gone) {
        return;
      }
      if (why && !ways) {
        // An answered probe never asked the hub, whose answer names how its
        // previews are reached: asked once, for the words' fix.
        await hubReach(at.origin);
      }
      if (gone) {
        return;
      }
      asking = false;
      if (why) {
        failed = {
          kind: "unreached",
          cause: previewUnreachedWords(at.host, why, previewsNeed(at)),
        };
        turn?.done();
      } else if (canvas) {
        ready = address;
      } else {
        turn?.graph([]);
      }
    })();
    return () => {
      gone = true;
      asking = false;
      turn?.done();
      turn = undefined;
    };
  });

  /**
   * Its draw has begun: once its card is {@link close}. A failure shows only
   * once this has outlasted the grace, so one held back farther from the view
   * says why only once it comes close.
   */
  const drawing = $derived(!!held?.embed && close);
  $effect(() => {
    track(attempt);
    slow = false;
    if (!drawing) {
      return;
    }
    const after = setTimeout(() => {
      slow = true;
    }, grace());
    return () => clearTimeout(after);
  });

  /** A page's own address on this page's origin, which its frame loads at once (it takes no turn); null for any other kind. */
  const pageAddress = $derived(
    held?.kind === "page" ? `/__cawco/page/${held.id}/` : null
  );
  /** The page address its frame last finished loading: it stands drawn while that is the one it shows. */
  let pageLoaded = $state<string | null>(null);
  /** It has a frame to wait for: a page, or an embed the hub opened an origin for. */
  const framed = $derived(pageAddress !== null || !!held?.embed);
  /** It stands drawn: a page or a screen once its frame has loaded, a canvas once it has also said its shape. */
  const standing = $derived.by(() => {
    if (pageAddress !== null) {
      return pageLoaded === pageAddress;
    }
    return screen ? shaped : shaped && drawn;
  });
  /**
   * What its status says while it isn't drawn: an embed waiting for its turn
   * among the page's embeds (or for its card to come near the view), or
   * opening on its turn; a page opening from the moment it mounts; nothing
   * once it stands drawn or failed. Its line arrives after `--duration-wait-grace`
   * by CSS (`animate-wait-grace-in`), from the moment it mounts, so every
   * Preview not yet drawn says so, wherever it is in the queue.
   */
  const waitLine = $derived.by(() => {
    if (!framed || standing || failed) {
      return "";
    }
    return pageAddress === null && turnState === "waiting"
      ? decisionsWords.previewQueued(named())
      : decisionsWords.previewOpening(named());
  });
  /** The failure stands once the grace is over: inside it the wait shows nothing of its own. */
  const fault = $derived(slow ? failed : null);
  /**
   * The box's least height where a fault stands in it: the picture's own as
   * its wait held it (its said height, else its stories' as the media knows
   * them, `--spacing-space-3` between), so the card keeps its place and shape when
   * the picture fails, or a named width's screen height; null for a screen
   * naming no width, or a canvas never drawn anywhere, which hold the kit
   * picture's.
   */
  const heldHeight = $derived.by(() => {
    if (screen) {
      return screenTall === null ? null : `${screenTall}px`;
    }
    if (tall !== null) {
      return `${tall}px`;
    }
    if (!known) {
      return null;
    }
    const sum = known.parts.reduce((all, part) => all + part.h, 0);
    return `calc(${sum}px + ${known.parts.length - 1} * var(--spacing-space-3))`;
  });
  /**
   * A component canvas's box holds its picture's shape from its first paint
   * ({@link heldHeight}, else the kit picture's 16:10), whatever stands in
   * it: its skeleton is a layer over the box, never in its flow, so while
   * the skeleton goes in its reveal and the frame comes at its own height,
   * the two never stand one under the other (the box stood at both, 795
   * over 819, for the reveal's 400 ms, and the page moved under it twice).
   */
  const reserved = $derived(!(screen || fault));
</script>

{#snippet screenWait()}
  <!-- At the frame's own box: a screen's 16:10 under the same media cap, so the page stands as tall as it will when the frame comes. -->
  <Skeleton
    class="w-full"
    height={screenTall === null ? "screen" : undefined}
    style={screenTall === null ? undefined : `block-size: ${screenTall}px`}
  />
{/snippet}

{#snippet wait()}
  <!-- The well's wait (BrowserView.svelte's wait): one muted meta line at the well's top, `--spacing-space-5` in, after the live dot, arriving after the wait grace. The well stands it over its piece and holds it at the page's top while any of the piece is in view (Well.svelte `status`), so a frame taller than the view says it however far it is scrolled, never from a middle below the fold or under the page's foot. The live region stands throughout; its line comes and goes inside it. -->
  <p
    class="m-0 p-space-5 text-ink-muted type-meta"
    data-slot="wait-row"
    role="status"
  >
    {#if waitLine}
      <span class="mark-line flex items-start gap-space-2 animate-wait-grace-in"
        ><span class="mark-cell"><LiveDot /></span><span
          class="min-w-0 wrap-anywhere">{waitLine}</span
        ></span
      >
    {/if}
  </p>
{/snippet}

{#snippet full()}
  <Button
    data-open-full
    disabled={opening}
    onclick={openFull}
    size="sm"
    variant="ghost">{decisionsWords.openFull}</Button
  >
{/snippet}

<Well
  action={pageSized ? full : undefined}
  caption={props.caption ? String(props.caption) : undefined}
  fills={pageSized && picture === undefined}
  {picture}
  said={refusal}
  status={framed && !fault ? wait : undefined}
>
  {#if pageAddress !== null}
    <!-- A page taller than its frame scrolls inside it, under the house edge fade (its 40px, `--spacing-c-edge-fade-len`) at its head and foot while more is past them. Wider than its well, its well scrolls it sideways. Until its frame has loaded it holds a screen's skeleton at the frame's own box, and past the grace the wait's line stands over it (`status`), as a screen's embed does: never a blank box. -->
    <div
      class={["relative", picture === undefined ? "w-full" : "flex-none"]}
      data-cawco-embed-place={id}
    >
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load measures the page, so the frame is as tall as it, and says it stands drawn. -->
      <!-- biome-ignore lint/security/useIframeSandbox: a page CawCo serves itself under /__cawco, which needs scripts and its own origin to run, and with both a sandbox holds nothing back. -->
      <iframe
        bind:this={frame}
        class={[
          "block rounded-xs border-0 bg-surface-page outline-1 -outline-offset-1 outline-image-outline transition-opacity duration-(--duration-fade) not-data-more-below:data-more-above:mask-(--fade-above) not-data-more-above:data-more-below:mask-(--fade-below) data-more-above:data-more-below:mask-(--fade-both)",
          screenTall === null && "max-h-c-media-max-h",
          picture === undefined ? "w-full" : "flex-none",
          tall === null && screenTall === null && "aspect-16/10",
          !standing && "opacity-0",
        ]}
        data-cawco-artifact={id}
        data-drawn={standing || undefined}
        data-more-above={more.above || undefined}
        data-more-below={more.below || undefined}
        data-slot="embed"
        onload={(event) => {
          pageLoaded = event.currentTarget.getAttribute("src");
          sized();
        }}
        src={pageAddress}
        style:--fade="var(--spacing-c-edge-fade-len)"
        style:--fade-above={"linear-gradient(transparent, var(--color-mask-opaque) var(--fade))"}
        style:--fade-below={"linear-gradient(var(--color-mask-opaque) calc(100% - var(--fade)), transparent)"}
        style:--fade-both={"linear-gradient(transparent, var(--color-mask-opaque) var(--fade), var(--color-mask-opaque) calc(100% - var(--fade)), transparent)"}
        style:block-size={framedHeight}
        style:inline-size={picture === undefined ? undefined : `${picture}px`}
        title={named()}
      ></iframe>
      {#if !standing}
        <!-- The screen's skeleton over the page still loading; it goes in its reveal. -->
        <div class="absolute inset-0" out:reveal>
          {@render screenWait()}
        </div>
      {/if}
    </div>
  {:else if held?.embed}
    <!-- One box for the frame and its wait, at the frame's own height as soon as that is known. A dev server's preview or a sheet is a screen: it holds a screen's 16:10 from the start, a skeleton of it until the wait outlasts its grace, so nothing moves when it answers. A component canvas's height is known only once it says it (CANVAS_EMBED_SIZE), so its box holds its picture's own shape as the page's media knows it from its first paint (the kit's picture where none was ever drawn), its skeleton a layer over it until it stands drawn (said and loaded), its frame loading at no height under that layer, then at its own height. Past the grace the wait's line stands at the box's top over the skeleton, until it stands drawn; then the row stands over the frame, empty. An origin that can't be reached, a frame the proxy's own page stands in, a canvas that says it can't draw, or one that says nothing within DRAW_MS says why in its place and shape past the grace, with Try again: never an empty box. The live region is the row's one line throughout. -->
    <div
      bind:this={box}
      class={[
        "relative",
        picture === undefined ? "w-full" : "flex-none",
        reserved && (heldHeight === null ? "aspect-16/10" : "min-h-(--held-h)"),
      ]}
      data-cawco-embed-place={id}
      style:--held-h={reserved ? heldHeight : undefined}
      style:inline-size={picture === undefined ? undefined : `${picture}px`}
    >
      {#if fault}
        <!-- In the picture's own place and shape (`heldHeight`, else the kit picture's 16:10), never a box that says nothing: what happened in one line, then Try again. -->
        <div
          class={[
            "flex w-full flex-col items-center justify-center gap-space-2 p-space-4 text-center",
            heldHeight === null
              ? "aspect-16/10 max-h-c-media-max-h"
              : "min-h-(--held-h)",
          ]}
          data-slot="embed-fault"
          role="alert"
          style:--held-h={heldHeight}
        >
          {#if fault.kind === "unreached"}
            <p class="type-label text-ink-strong wrap-anywhere">
              {decisionsWords.previewUnreached(named())}
            </p>
            <p
              class="type-meta text-status-fail-ink wrap-anywhere"
              data-slot="embed-cause"
            >
              {fault.cause}
            </p>
          {:else}
            <p
              class="type-label text-ink-strong wrap-anywhere"
              data-slot="embed-cause"
            >
              {fault.line}
            </p>
          {/if}
          <Button
            icon={IconRefresh}
            label={commonWords.tryAgain}
            onclick={() => {
              attempt += 1;
            }}
            pending={asking}
            pendingLabel="Trying again…"
            size="sm"
            variant="outline"
          />
        </div>
      {:else}
        {#if ready}
          <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load says the frame is drawn, so the wait stands until then. -->
          <!-- biome-ignore lint/security/useIframeSandbox: the previewed app runs on its own origin (the preview proxy's), which is the boundary; a sandbox would take the forms, popups and downloads it is being tried with. -->
          <iframe
            bind:this={frame}
            class={[
              "block w-full rounded-xs border-0 bg-surface-page outline-1 -outline-offset-1 outline-image-outline transition-opacity duration-(--duration-fade)",
              tall === null &&
                screenTall === null &&
                (screen ? "aspect-16/10 max-h-c-media-max-h" : "h-0"),
              !(drawn && shaped) && "opacity-0",
            ]}
            data-cawco-artifact={id}
            data-drawn={drawn || undefined}
            data-shape={shape}
            data-slot="embed"
            data-turn={turnState}
            onload={() => {
              drawn = true;
              // A canvas's page that told no graph by its load has none to
              // fetch (a stage's error page): it holds no turn. One that told
              // it has its turn already; told again here, it would take a
              // second.
              if (!(screen || graphHeard)) {
                turn?.graph([]);
              }
              graphHeard = false;
            }}
            src={ready}
            style:block-size={framedHeight}
            title={named()}
            {@attach (node) => {
              if (!(drawn && shaped)) {
                underWait = true;
              } else if (underWait) {
                underWait = false;
                revealHere(node);
              }
            }}
          ></iframe>
          {#if !shaped && screen}
            <!-- The screen's skeleton over the frame still loading, for the whole wait; it goes in its reveal. -->
            <div class="absolute inset-0" out:reveal>
              {@render screenWait()}
            </div>
          {/if}
        {:else if screen}
          {@render screenWait()}
        {/if}
        {#if !(screen || (shaped && drawn))}
          <!-- A canvas waiting its turn or loading: its skeleton at its picture's own shape as the page's media knows it (`known`: what an embed of these stories said, else each story as drawn, one under another; the kit's picture where none was ever drawn), pulsing, over its frame once that holds its height; it goes in its reveal as the frame comes. -->
          <div class="absolute inset-0" data-slot="embed-wait" out:reveal>
            {#if tall === null && known}
              <div class="flex flex-col items-start gap-space-3">
                {#each known.parts as part, at (at)}
                  <Skeleton
                    class={part.w === null ? "w-full" : undefined}
                    style={`block-size: ${part.h}px;${part.w === null ? "" : ` inline-size: ${part.w}px;`}`}
                  />
                {/each}
              </div>
            {:else if tall === null}
              <Skeleton class="w-full" height="picture" />
            {:else}
              <Skeleton class="w-full" style={`block-size: ${tall}px`} />
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {:else if held?.unopened}
    <!-- The hub opened no origin for it as it served the page (every preview port in use): its words, and Try again serves the page's media again in place (Host.svelte's `cawco:revision`). -->
    <div
      data-slot="embed-unopened"
      class="flex flex-wrap items-center gap-space-3 w-full"
      role="alert"
    >
      <p class="flex-1 min-w-0 m-0 type-meta text-error-9 wrap-anywhere">
        {held.unopened}
      </p>
      <Button
        icon={IconRefresh}
        label={commonWords.tryAgain}
        onclick={() => {
          dispatchEvent(
            new CustomEvent("cawco:revision", { cancelable: true })
          );
        }}
        size="sm"
        variant="outline"
      />
    </div>
  {:else}
    <!-- One line in its well where the preview would stand, never a slab of its size. -->
    <p
      data-slot="media-gone"
      class="type-meta w-full text-ink-muted wrap-anywhere"
    >
      {held
        ? `The ${held.kind} this card shows can't be opened here now.`
        : "What this card showed is gone."}
    </p>
  {/if}
</Well>
