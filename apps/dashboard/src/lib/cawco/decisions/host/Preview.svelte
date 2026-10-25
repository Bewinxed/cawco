<!--
  Another artifact of the session's, live in a frame, at its real size: 1
  CSS px per px. A page-sized design (a page, a dev server's or a folder's
  preview, a sheet: a whole screen, the owner's "too narrow and small for
  me to view how the graph/timeline looks") naming no width takes its
  card's whole width (`fills`: its card's options stand one to a row), a
  screen's 16:10 of it, and lays itself out to it; naming its own layout
  width it stands at that width where its well holds it, else scaled down
  to the well's width (`embed-scale`), never under `--c-media-scale-min`
  (the house's least words at 10px), past which it scrolls sideways at
  that scale. Open full size brings it to the front of the session's panel,
  as Canvas's Open to draw does. A page stands at its own address on this
  page's origin (`/__cawco/page/<id>/`), as wide as its `width` says (the
  well's width where it says none) and as tall as its content up to the
  media cap; a taller one scrolls inside its frame, the house edge fade
  over its head and foot while more is past them, so nothing is cut off
  without a way to see it. A dev server's or a folder's preview or a sheet
  stands on an origin of its own the hub opened for it (hub server.ts
  `embedAt`), open in the panel or not, named
  in the page's media, at the shape of a screen as wide as its `width`
  says. A component canvas draws the stories its `stories` names (every one
  when it names none) as the component alone, each at its own size, and
  says how tall it stands and how wide its widest story is (runtime.ts
  `sayShape`), so its frame is that wide and that tall; a page's canvases
  fetch one at a time, the one in view or nearest it first, each once the
  graph of the one before it has arrived (embed-turns.ts: together they ask
  more than the browser takes in flight). Each stands in its well, which hugs it
  and scrolls it sideways where it is wider (Well.svelte). While a screen's
  origin is asked, the well holds its 16:10, a skeleton until the wait
  outlasts its grace; a canvas waiting its turn or loading holds its
  skeleton at its picture's own shape as the page's media knows it (what an
  embed of its stories said, in any browser, else its stories as the stage
  drew them; the kit's picture where none was ever drawn) until it stands
  drawn, never an empty box; past the
  grace Caw and the line stand over either (DESIGN.md, Skeleton, The Claim
  Of Nothing Rule, The Real Wait Rule). One the hub no longer holds says so
  in words where it would stand.
-->
<script lang="ts">
  import { commonWords } from "@cawco/core";
  import {
    askHubReach,
    PREVIEW_REACH_PATH,
    type PreviewWays,
    previewsNeedWords,
    previewUnreachedWords,
    probePreview,
  } from "@cawco/core/preview-reach";
  import {
    CANVAS_EMBED_FETCHED,
    CANVAS_EMBED_SIZE,
    canvasEmbedUrl,
    type EmbedShape,
    storiesKey,
  } from "@cawco/core/stage";
  import { decisionsWords } from "@cawco/core/words/decisions";
  import {
    type FrameObserver,
    frameObserver,
  } from "#lib/cawco/frame-observer.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconRefresh } from "#lib/icons.js";
  import cawDark from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-working.webp";
  import cawLight from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-working.webp";
  import { hubRefusal } from "../../hub-read.js";
  import { dur, reveal, revealHere } from "../../motion/curves.svelte";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { type EmbedTurn, embedTurn } from "./embed-turns.js";
  import { served } from "./page.svelte.js";
  import { scheme } from "./scheme.svelte.js";
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
  const stories = $derived(
    Array.isArray(props.stories) ? props.stories.map(String) : []
  );
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
   * it, one under another with the embed's own gap (agent canvas chrome.ts
   * `cawco-embed`: `--space-3`). Null where none has been drawn anywhere:
   * the kit's picture stands in.
   */
  const known = $derived.by(
    (): {
      parts: { h: number; w: number | null }[];
      w: number | null;
    } | null => {
      const shapes = held?.shapes;
      const said = shapes?.said[storiesKey(stories)];
      if (said) {
        return { parts: [said], w: said.w };
      }
      const drawn = stories.map((one) => shapes?.drawn[one]);
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
   * well's width.
   */
  const picture = $derived.by(() => {
    const widths = [
      typeof props.width === "number" ? props.width : 0,
      saidWidth ?? known?.w ?? 0,
    ];
    const widest = Math.max(...widths);
    return widest > 0 ? widest : undefined;
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
  /** The well's stage: the room its piece has (Well.svelte). */
  let stage = $state<HTMLDivElement>();
  /** The stage's width, px, as layout has it. */
  let room = $state(0);
  /** The least it is scaled to, `--c-media-scale-min`: the house's least words at 10px. */
  let least = 1;
  $effect(() => {
    const well = stage;
    if (!well) {
      return;
    }
    least =
      Number.parseFloat(
        getComputedStyle(well).getPropertyValue("--c-media-scale-min")
      ) || 1;
    const read = () => {
      room = Number.parseFloat(getComputedStyle(well).width) || 0;
    };
    read();
    const sizes = frameObserver(read);
    sizes.observe(well);
    return () => sizes.disconnect();
  });
  /**
   * A page-sized design's scale: 1 where its well holds its own layout
   * width (`width`), else down to the well's room, never under
   * `--c-media-scale-min` (its words at 10px), past which it scrolls
   * sideways in its well at that scale. With no width of its own it takes
   * the card's whole width and lays itself out to it, at 1.
   */
  const scale = $derived(
    pageSized && picture !== undefined && room > 0 && picture > room + 0.5
      ? Math.max(least, room / picture)
      : 1
  );
  const scaled = $derived(scale < 1 && picture !== undefined);
  /** The frame's own height on a scaled design: its box's height over its scale, so its first view fills the box. */
  const scaledHeight = $derived(scaled ? `calc(100% / ${scale})` : undefined);
  /** What a press on Open full size was refused, in the hub's words. */
  let refusal = $state("");
  let opening = $state(false);
  /** The preview at the front of the session's panel, at the panel's whole size (the house's open-in-panel path, as Canvas's Open to draw). */
  async function openFull() {
    opening = true;
    refusal = "";
    try {
      const response = await fetch(`/__cawco/artifact/${id}/show`, {
        method: "POST",
      });
      if (!response.ok) {
        refusal = (await hubRefusal(response, "so the preview didn't open."))
          .message;
      }
    } catch {
      refusal = "The preview didn't open: the hub didn't answer.";
    } finally {
      opening = false;
    }
  }
  let watch: FrameObserver | undefined;
  /** A component canvas's place among the page's canvases, which load one at a time (embed-turns.ts): its turn ends once it says its shape. */
  let turn: EmbedTurn | undefined;

  /**
   * The shape its canvas said, told beside the page's own address (hub
   * preview.ts `PAGE_SHAPE_PATH`) where the media knew another: kept for every next Preview of
   * these stories, in any browser. Unheard, the next stands at what the
   * media knew; nothing waits on it.
   */
  const tellShape = (heard: EmbedShape) => {
    const had = held?.shapes?.said[storiesKey(stories)];
    if (had?.h === heard.h && had.w === heard.w) {
      return;
    }
    // Beside the page's own address (hub preview.ts `PAGE_SHAPE_PATH`).
    fetch("shape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artifact: id, stories, ...heard }),
    }).catch(() => undefined);
  };

  /** A component canvas's own height and widest story, as it says them (agent canvas runtime `by=embed`): its frame is as tall and as wide. */
  $effect(() => {
    const heard = (event: MessageEvent) => {
      const said = event.data as {
        height?: unknown;
        type?: unknown;
        width?: unknown;
      } | null;
      if (event.source !== frame?.contentWindow) {
        return;
      }
      // Its graph arrived: the next canvas fetches while this one evaluates and draws.
      if (said?.type === CANVAS_EMBED_FETCHED) {
        turn?.done();
        return;
      }
      if (said?.type === CANVAS_EMBED_SIZE && typeof said.height === "number") {
        tall = said.height;
        saidWidth = typeof said.width === "number" ? said.width : null;
        turn?.done();
        tellShape({ h: tall, w: saidWidth });
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
  /** `--dur-wait-grace` in ms, in the unit host.css writes it (motion `dur`: its minifier writes `1000ms` as `1s`): a wait shows nothing before it (DESIGN.md, The Real Wait Rule). */
  const grace = () => dur("--dur-wait-grace");
  /**
   * An embed's address once its origin serves it: its ping (core
   * `PREVIEW_PING_PATH`, open to any page) answers ok when the machine's
   * listener for it does, starting it when it has none. Loaded before then,
   * the frame would hold the browser's own error page for good.
   */
  let ready = $state<string | null>(null);
  /** The ready frame finished loading: until then the wait stands over it, so no empty box shows. */
  let drawn = $state(false);
  /** The frame stood unseen under its wait (its skeleton), so its showing is the skeleton's reveal. */
  let underWait = false;
  /**
   * It stands at its own shape: a screen once its frame has loaded, a
   * component canvas once it has said its height (every Preview of a
   * canvas by that one rule, the first as the rest), never at a screen's
   * 16:10 while it hasn't. Until then its wait stands.
   */
  const shaped = $derived(screen ? drawn : tall !== null);
  /** What its frame's shape is now, for a reader: a screen's 16:10, drawn at the height its canvas said, or waiting for that. */
  const shape = $derived.by(() => {
    if (!shaped) {
      return "waiting";
    }
    return tall === null ? "screen" : "drawn";
  });
  /** Why the origin can't be reached, in the shared classifier's words (core `previewUnreachedWords`). */
  let failed = $state<string | null>(null);
  /** The wait has outlasted `--dur-wait-grace`: its line, or the failure, may show. */
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
  $effect(() => {
    const embed = held?.embed;
    // biome-ignore lint/complexity/noVoid: read-only dependency — each Try again asks again
    void attempt;
    ready = null;
    drawn = false;
    failed = null;
    slow = false;
    if (!embed) {
      return;
    }
    const canvas = held?.kind === "component";
    const address = canvas ? canvasEmbedUrl(embed, stories) : embed;
    let gone = false;
    const after = setTimeout(() => {
      slow = true;
    }, grace());
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
        // biome-ignore lint/performance/noAwaitInLoops: one ask a second until the origin serves, never several at once
        const why = await probePreview(at.origin, hubReach);
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
    (async () => {
      // A canvas loads in its turn among the page's canvases, the one in view first (embed-turns.ts); its skeleton stands meanwhile.
      if (canvas) {
        turn = embedTurn(() => box);
        await turn.granted;
      }
      const why = gone ? null : await reached();
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
        failed = previewUnreachedWords(at.host, why, previewsNeed(at));
        turn?.done();
      } else {
        ready = address;
      }
    })();
    return () => {
      gone = true;
      asking = false;
      clearTimeout(after);
      turn?.done();
      turn = undefined;
    };
  });

  /** What the embed's status says: nothing until the wait outlasts its grace, nothing once it stands at its shape or failed. */
  const waitLine = $derived.by(() => {
    if (!held?.embed || shaped || failed || !slow) {
      return "";
    }
    return `Opening the ${held.kind} ${held.name}…`;
  });
  /** The failure stands once the grace is over: inside it the wait shows nothing of its own. */
  const fault = $derived(slow ? failed : null);
</script>

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
  bind:stage
  caption={props.caption ? String(props.caption) : undefined}
  fills={pageSized && picture === undefined}
  {picture}
  said={refusal}
  shown={scaled && picture !== undefined ? picture * scale : undefined}
>
  {#if held?.kind === "page"}
    <!-- A page taller than the media cap scrolls inside its frame, under the house edge fade (its 40px, `--c-edge-fade-len`) at its head and foot while more is past them. Wider than its well, its frame stands at its own width scaled down to the well's (`embed-scale`), never under its words' 10px. -->
    <div
      class={scaled
        ? [
            "relative flex-none overflow-clip rounded-xs max-h-c-media-max-h",
            tall === null && "aspect-16/10",
          ]
        : "contents"}
      data-scale={scaled ? scale : undefined}
      data-slot="embed-scale"
      style:block-size={scaled && tall !== null
        ? `${tall * scale}px`
        : undefined}
      style:inline-size={scaled && picture !== undefined
        ? `${picture * scale}px`
        : undefined}
    >
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load measures the page, so the frame is as tall as it. -->
      <iframe
        bind:this={frame}
        class={[
          "block rounded-xs border-0 bg-surface-page not-data-more-below:data-more-above:mask-(--fade-above) not-data-more-above:data-more-below:mask-(--fade-below) data-more-above:data-more-below:mask-(--fade-both)",
          scaled
            ? "absolute start-0 top-0 origin-top-left scale-(--frame-scale) rtl:origin-top-right"
            : [
                "max-h-c-media-max-h",
                picture === undefined ? "w-full" : "flex-none",
                tall === null && "aspect-16/10",
              ],
        ]}
        data-cawco-artifact={id}
        data-more-above={more.above || undefined}
        data-more-below={more.below || undefined}
        data-slot="embed"
        onload={sized}
        src={`/__cawco/page/${id}/`}
        style:--fade="var(--c-edge-fade-len)"
        style:--fade-above={"linear-gradient(transparent, var(--mask-opaque) var(--fade))"}
        style:--fade-below={"linear-gradient(var(--mask-opaque) calc(100% - var(--fade)), transparent)"}
        style:--fade-both={"linear-gradient(transparent, var(--mask-opaque) var(--fade), var(--mask-opaque) calc(100% - var(--fade)), transparent)"}
        style:--frame-scale={scaled ? String(scale) : undefined}
        style:block-size={scaledHeight ??
          (tall === null ? undefined : `${tall}px`)}
        style:inline-size={picture === undefined ? undefined : `${picture}px`}
        title={held.name}
      ></iframe>
    </div>
  {:else if held?.embed}
    <!-- One box for the frame and its wait, at the frame's own height as soon as that is known. A dev server's preview or a sheet is a screen: it holds a screen's 16:10 from the start, a skeleton of it until the wait outlasts its grace, so nothing moves when it answers. A component canvas's height is known only once it says it (CANVAS_EMBED_SIZE), so until it stands drawn (said and loaded) its skeleton holds its place at its picture's own shape as the page's media knows it (the kit's picture where none was ever drawn), its frame loading at no height beside it, then under the skeleton at its own height. Past the grace Caw and the wait's line stand over the screen's place or the canvas's skeleton (The Real Wait Rule), until it stands at its shape; then the row stands over the frame, empty. An origin that can't be reached says why in its place past the grace, with Try again: never an empty box. The live region is the row's one line throughout. -->
    <div
      bind:this={box}
      class={["relative", picture === undefined ? "w-full" : "flex-none"]}
      style:inline-size={picture === undefined
        ? undefined
        : `${picture * scale}px`}
    >
      {#if fault}
        <div
          class="flex w-full flex-col items-center justify-center gap-space-2 py-space-4 text-center"
          data-slot="embed-fault"
          role="alert"
        >
          <p class="type-label text-ink-strong wrap-anywhere">
            The {held.kind}
            {held.name} can't be reached.
          </p>
          <p
            class="type-meta text-status-fail-ink wrap-anywhere"
            data-slot="embed-cause"
          >
            {fault}
          </p>
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
          <!-- A screen wider than its well: its frame at its own width and a screen's 16:10 of it, scaled down to the well's (`embed-scale`), never under its words' 10px. -->
          <div
            class={scaled
              ? "relative aspect-16/10 max-h-c-media-max-h w-full overflow-clip rounded-xs"
              : "contents"}
            data-scale={scaled ? scale : undefined}
            data-slot="embed-scale"
          >
            <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load says the frame is drawn, so the wait stands until then. -->
            <iframe
              bind:this={frame}
              class={[
                "block rounded-xs border-0 bg-surface-page transition-opacity duration-(--dur-fade)",
                scaled
                  ? "absolute start-0 top-0 origin-top-left scale-(--frame-scale) rtl:origin-top-right"
                  : [
                      "w-full",
                      tall === null &&
                        (screen ? "aspect-16/10 max-h-c-media-max-h" : "h-0"),
                    ],
                !(drawn && shaped) && "opacity-0",
              ]}
              data-cawco-artifact={id}
              data-drawn={drawn || undefined}
              data-shape={shape}
              data-slot="embed"
              onload={() => {
                drawn = true;
              }}
              src={ready}
              style:--frame-scale={scaled ? String(scale) : undefined}
              style:block-size={scaledHeight ??
                (tall === null ? undefined : `${tall}px`)}
              style:inline-size={scaled ? `${picture}px` : undefined}
              title={held.name}
              {@attach (node) => {
                if (!drawn) {
                  underWait = true;
                } else if (underWait) {
                  underWait = false;
                  revealHere(node);
                }
              }}
            ></iframe>
          </div>
          {#if !(shaped || slow) && screen}
            <!-- Inside the grace, the screen's skeleton over the frame still loading; it goes in its reveal. -->
            <div class="absolute inset-0" out:reveal>
              <Skeleton class="w-full" height="picture" />
            </div>
          {/if}
        {:else if screen}
          {#if slow}
            <div class="aspect-16/10 max-h-c-media-max-h w-full"></div>
          {:else}
            <Skeleton class="w-full" height="picture" />
          {/if}
        {/if}
        {#if !(screen || (shaped && drawn))}
          <!-- A canvas waiting its turn or loading: its skeleton at its picture's own shape as the page's media knows it (`known`: what an embed of these stories said, else each story as drawn, one under another; the kit's picture where none was ever drawn), pulsing, over its frame once that holds its height; it goes in its reveal as the frame comes. -->
          <div
            class={tall === null ? "w-full" : "absolute inset-0"}
            data-slot="embed-wait"
            out:reveal
          >
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
        <div
          class="mark-line pointer-events-none absolute inset-0 flex items-center justify-center gap-space-2"
          data-slot="wait-row"
        >
          {#if slow && !shaped}
            <img
              alt=""
              height="40"
              src={scheme.now === "dark" ? cawDark : cawLight}
              width="40"
            />
          {/if}
          <p
            class="type-meta min-w-0 text-ink-muted wrap-anywhere"
            role="status"
          >
            {waitLine}
          </p>
        </div>
      {/if}
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
