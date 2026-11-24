<script lang="ts">
  /**
   * One direction of a design, drawn live outside its graph (the composer's
   * parked pick): the design graph's own stage page, framed at the
   * artifact's origin as the panel frames it (PreviewPane), standing at the
   * direction's live story (`story`, else its states file's first, read off
   * the sheet the page says once the file is loaded). No second renderer:
   * the page mounts the real component exactly as the graph's stage does,
   * at the well's width, in the dashboard's scheme, and says how tall it
   * drew, which the well takes.
   *
   * The page is greeted as the panel greets it (`cawco:hello`, joining the
   * artifact's doc), turned away once it enters through the entry with the
   * browser's pass (preview/pass.ts), and asked to reach the story once it
   * says it stands greeted. Until the reach lands the well's cover says what
   * is drawn; the component throwing as it mounts, the proxy's own page
   * naming a hop that didn't answer, the hub refusing the address, or a
   * page that says nothing in {@link SILENT_MS}, each fails it in words, with
   * Draw again.
   */
  import type { FrameSays } from "@cawco/core/page-wire";
  import type { ParkedArtifact } from "@cawco/core/parked";
  import {
    PREVIEW_LOCKED_MESSAGE,
    previewRoute,
  } from "@cawco/core/preview/routes";
  import {
    STAGE_LOAD,
    STAGE_REACH,
    stageFaultOf,
    stageLaidOf,
    stageReachedOf,
  } from "@cawco/core/stage-graph";
  import { graphWords } from "@cawco/core/words/graph";
  import { downState } from "@cawco/core/words/preview-down";
  import { untrack } from "svelte";
  import { track } from "#lib/platform/track.js";
  import { theme } from "#lib/theme.svelte.js";
  import { artifactSyncPath } from "../preview/artifact-doc";
  import { hearDown } from "../preview/frame-down";
  import { artifactAddress } from "../preview/page-source";
  import { entryTo, turnedAwayWords } from "../preview/pass";
  import { pageMessage, previewSheet } from "../preview/wire";
  import DirectionWell, { type DirectionDrawing } from "./DirectionWell.svelte";

  let {
    artifact,
    path,
    name,
    file,
    story = null,
  }: {
    artifact: ParkedArtifact;
    /** The graph's stage page on the artifact's origin (the artifact's canvas address). */
    path: string;
    /** The direction's name: its well is read by it. */
    name: string;
    /** Its states file, as the canvas names it. */
    file: string;
    /** Its live story; null for the file's first. */
    story?: string | null;
  } = $props();

  /** How long a framed page has to say anything before the well says it didn't answer, ms: the panel's own wait for a page that says nothing (core preview-reach `PAGE_SILENT_MS` is its cousin). Our call. */
  const SILENT_MS = 20_000;

  let frame = $state<HTMLIFrameElement | null>(null);
  let origin = $state<string | null>(null);
  let src = $state<string | null>(null);
  let drawing = $state<DirectionDrawing>({ state: "loading" });
  /** How tall the page drew the story, px; null until it said. */
  let tall = $state<number | null>(null);
  /** Draw again's presses: each frames the page afresh. */
  let tries = $state(0);
  /** The story the page reaches: the one named, else the file's first once its sheet came. */
  let reaching = $state<string | null>(null);
  let greeted = false;
  let turnedAway = 0;
  let ask = 0;

  const fail = (why: string) => {
    drawing = { state: "failed", why };
  };

  function post(message: FrameSays | Record<string, unknown>) {
    if (origin) {
      frame?.contentWindow?.postMessage(message, origin);
    }
  }

  /** The page stands at the story, at rest, from nothing. */
  function reach(to: string) {
    ask += 1;
    post({
      type: STAGE_REACH,
      ask,
      to: { file, story: to },
      from: null,
      play: false,
      still: true,
    });
  }

  /**
   * The artifact's id and its stage page's address, as values: the parked
   * list is read again on every move of what waits on the person, each read
   * a new `artifact` with the same id, and the frame loads again only when
   * the id or the address itself moved. Read through the object, every
   * read framed the page afresh, so a whole screen that loads longer than
   * the gap between two reads was never drawn (nightly 8623).
   */
  const artifactId = $derived(artifact.id);
  const stagePath = $derived(path);

  // Where the artifact is served, asked once per direction and again on
  // Draw again; the page loads at the graph's own canvas address there.
  $effect(() => {
    const id = artifactId;
    const at = stagePath;
    track(tries);
    let live = true;
    untrack(() => {
      origin = null;
      src = null;
      tall = null;
      greeted = false;
      turnedAway = 0;
      reaching = story;
      drawing = { state: "loading" };
    });
    artifactAddress(id).then((asked) => {
      if (!live) {
        return;
      }
      if ("problem" in asked) {
        fail(graphWords.notDrawn(asked.problem));
        return;
      }
      const route = previewRoute(asked.address, location);
      if (!route) {
        fail(graphWords.notDrawnSilent);
        return;
      }
      ({ origin } = route);
      src = `${route.origin}${at}`;
    });
    const silent = setTimeout(() => {
      if (live && !greeted && drawing.state === "loading") {
        fail(graphWords.notDrawnSilent);
      }
    }, SILENT_MS);
    return () => {
      live = false;
      clearTimeout(silent);
    };
  });

  // The dashboard's scheme turning tells the page.
  $effect(() => {
    const scheme = theme.resolved;
    untrack(() => {
      if (greeted) {
        post({ type: "cawco:theme", theme: scheme } satisfies FrameSays);
      }
    });
  });

  // The proxy's own page in the frame: the hop that didn't answer, in words.
  $effect(() =>
    hearDown(
      () => frame,
      (down) => {
        const said = downState(down.down, down.why);
        fail(graphWords.notDrawn(said.title));
      }
    )
  );

  /** Turned away by the origin (no pass yet): through the entry once, which lands it where it was loading; twice, said. */
  function turnedAwayBy(at: string) {
    turnedAway += 1;
    if (turnedAway > 1) {
      fail(graphWords.notDrawn(turnedAwayWords(at)));
      return;
    }
    entryTo(at, path).then((entry) => {
      if ("refused" in entry) {
        fail(graphWords.notDrawn(entry.refused));
      } else if (frame) {
        frame.src = entry.url;
      }
    });
  }

  /** Whether this load of the page was greeted: it is greeted once a load. */
  let helloSent = false;

  /**
   * The host's first word, said as the frame loads, as the panel says it
   * (PreviewPane's `announce` on the frame's load): the page's overlay holds
   * everything it says, its ready among it, until its host's hello names
   * the host's origin (preview overlay host-origin.ts `toHost`), so a hello
   * that waited on the page's ready never went.
   */
  function hello() {
    if (helloSent) {
      return;
    }
    helloSent = true;
    post({
      type: "cawco:hello",
      theme: theme.resolved,
      artifact: {
        id: artifact.id,
        kind: "component",
        name: artifact.name,
        title: artifact.title,
      },
      sync: artifactSyncPath(artifact.id),
      headed: false,
      bareScroll: true,
      headRoom: 0,
    } satisfies FrameSays);
  }

  /** Each load of the frame (the first, or after the entry let it in) holds no greeting: it is greeted as it loads. */
  function greetOnLoad(node: HTMLIFrameElement) {
    const loaded = () => {
      helloSent = false;
      greeted = false;
      hello();
    };
    node.addEventListener("load", loaded);
    return () => node.removeEventListener("load", loaded);
  }

  /** The page said it is ready: greeted, if this load was not yet; once greeted, asked to stand at the story. */
  function ready(greetedAlready: boolean) {
    if (!greetedAlready) {
      hello();
      return;
    }
    greeted = true;
    post({
      type: "cawco:canvas-view",
      view: { scheme: theme.resolved, widths: null, motion: "on", fit: true },
    } satisfies FrameSays);
    if (reaching) {
      reach(reaching);
    } else {
      post({ type: STAGE_LOAD, file });
    }
  }

  /** What the stage said of its drawing: the file's first story when none is named, the reach landed or failed, its height, a fault. */
  function stageSaid(message: Record<string, unknown> & { type: string }) {
    if (message.type === "cawco:sheet") {
      const said = previewSheet(message.sheet);
      const [first] = said?.sheet.file === file ? said.sheet.stories : [];
      if (first && !reaching) {
        reaching = first.name;
        reach(first.name);
      }
      return;
    }
    const reached = stageReachedOf(message);
    if (reached?.ask === ask) {
      if (reached.failed) {
        fail(graphWords.notDrawn(reached.failed.message));
      } else if (!reached.superseded && drawing.state === "loading") {
        drawing = { state: "drawn" };
      }
      return;
    }
    const laid = stageLaidOf(message);
    if (laid) {
      ({ tall } = laid);
      return;
    }
    const fault = stageFaultOf(message);
    if (fault) {
      fail(graphWords.notDrawn(fault.message));
    }
  }

  // Only its own frame, from its own origin, is heard.
  $effect(() => {
    const heard = (event: MessageEvent) => {
      if (!(
        origin &&
        event.source === frame?.contentWindow &&
        event.origin === origin
      )) {
        return;
      }
      if (event.data?.type === PREVIEW_LOCKED_MESSAGE) {
        turnedAwayBy(origin);
        return;
      }
      const message = pageMessage(event.data);
      if (message?.type === "cawco:ready") {
        ready(message.greeted === true);
      } else if (message) {
        stageSaid(message);
      }
    };
    window.addEventListener("message", heard);
    return () => window.removeEventListener("message", heard);
  });
</script>

<DirectionWell
  {drawing}
  {name}
  onretry={() => {
    tries += 1;
  }}
>
  {#if src}
    {#key src}
      <iframe
        class="block h-(--tall,auto) w-full border-none bg-transparent scheme-light scheme-dark:scheme-dark"
        style:--tall={tall === null ? undefined : `${tall}px`}
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        {src}
        title={graphWords.directionWell(name)}
        bind:this={frame}
        {@attach greetOnLoad}
      ></iframe>
    {/key}
  {/if}
</DirectionWell>
