<!--
  Another artifact of the session's, live in a frame, at its real size: 1
  CSS px per px, never scaled. A page stands at its own address on this
  page's origin (`/__cawco/page/<id>/`), as wide as its `width` says (the
  well's width where it says none) and as tall as its content up to the
  media cap; a taller one scrolls inside its frame, the house edge fade
  over its head and foot while more is past them, so nothing is cut off
  without a way to see it. A dev server's preview or a sheet stands on an
  origin of its own the hub opened for it (hub server.ts `embedAt`), named
  in the page's media, at the shape of a screen as wide as its `width`
  says. A component canvas draws the stories its `stories` names (every one
  when it names none) as the component alone, each at its own size, and
  says how tall it stands and how wide its widest story is (runtime.ts
  `sayShape`), so its frame is that wide and that tall; a page's canvases
  load one at a time, each once the one before it has said its shape
  (embed-turns.ts: together they ask more than the browser takes in
  flight). Each stands in its
  well, which hugs it and scrolls it sideways where it is wider
  (Well.svelte). While the origin is asked, the well holds the frame's own
  height where it is known (a screen's), else one status row, a skeleton
  until the wait outlasts its grace and Caw and the line then (DESIGN.md,
  The Claim Of Nothing Rule, The Real Wait Rule). One the hub no longer
  holds says so in words where it would stand.
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
  import { CANVAS_EMBED_SIZE, canvasEmbedUrl } from "@cawco/core/stage";
  import {
    type FrameObserver,
    frameObserver,
  } from "#lib/cawco/frame-observer.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconRefresh } from "#lib/icons.js";
  import cawDark from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-working.webp";
  import cawLight from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-working.webp";
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
  let tall = $state<number | null>(null);
  /** A component canvas's widest story, as it says it: its frame is that wide. */
  let saidWidth = $state<number | null>(null);
  /**
   * The design's own width, px: the program's `width`, or the canvas's
   * widest story where that is wider. Its frame stands at it, 1 CSS px per
   * px; none, it takes the well's width.
   */
  const picture = $derived.by(() => {
    const widths = [
      typeof props.width === "number" ? props.width : 0,
      saidWidth ?? 0,
    ];
    const widest = Math.max(...widths);
    return widest > 0 ? widest : undefined;
  });
  /** A page taller than its frame: more is above or below what it shows (the edge fade's cue). */
  let more = $state({ above: false, below: false });
  /** It stands at a screen's shape, known before it serves: a dev server's preview or a sheet, not a component canvas, which says its own height. */
  const screen = $derived(held?.kind !== "component");
  let watch: FrameObserver | undefined;
  /** A component canvas's place among the page's canvases, which load one at a time (embed-turns.ts): its turn ends once it says its shape. */
  let turn: EmbedTurn | undefined;

  /** A component canvas's own height and widest story, as it says them (agent canvas runtime `by=embed`): its frame is as tall and as wide. */
  $effect(() => {
    const heard = (event: MessageEvent) => {
      const said = event.data as {
        height?: unknown;
        type?: unknown;
        width?: unknown;
      } | null;
      if (
        event.source === frame?.contentWindow &&
        said?.type === CANVAS_EMBED_SIZE &&
        typeof said.height === "number"
      ) {
        tall = said.height;
        saidWidth = typeof said.width === "number" ? said.width : null;
        turn?.done();
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
   * long an answer that it doesn't (a status: its server still starting)
   * is waited out: once a second for 30 seconds. Our call: long enough for a
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
    const deadline = Date.now() + START_MS;
    /** The frame's address set once its origin serves, a canvas's once it is its turn among the page's canvases (embed-turns.ts). */
    const open = async () => {
      if (canvas) {
        turn = embedTurn();
        await turn.granted;
      }
      if (!gone) {
        ready = address;
        asking = false;
      }
    };
    asking = true;
    (async () => {
      for (;;) {
        // biome-ignore lint/performance/noAwaitInLoops: one ask a second until the origin serves, never several at once
        const why = await probePreview(at.origin, (origin) =>
          askHubReach(
            `${PREVIEW_REACH_PATH}?origin=${encodeURIComponent(origin)}`,
            (heard) => {
              ways = heard;
            }
          )
        );
        if (gone) {
          return;
        }
        if (!why) {
          await open();
          return;
        }
        if (why.cause !== "status" || Date.now() >= deadline) {
          failed = previewUnreachedWords(at.host, why, previewsNeed(at));
          asking = false;
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, PING_MS));
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

<Well caption={props.caption ? String(props.caption) : undefined} {picture}>
  {#if held?.kind === "page"}
    <!-- A page taller than the media cap scrolls inside its frame, under the house edge fade (its 40px, `--c-edge-fade-len`) at its head and foot while more is past them. -->
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load measures the page, so the frame is as tall as it. -->
    <iframe
      bind:this={frame}
      class={[
        "block max-h-c-media-max-h rounded-xs border-0 bg-surface-page not-data-more-below:data-more-above:mask-(--fade-above) not-data-more-above:data-more-below:mask-(--fade-below) data-more-above:data-more-below:mask-(--fade-both)",
        picture === undefined ? "w-full" : "flex-none",
        tall === null && "aspect-16/10",
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
      style:block-size={tall === null ? undefined : `${tall}px`}
      style:inline-size={picture === undefined ? undefined : `${picture}px`}
      title={held.name}
    ></iframe>
  {:else if held?.embed}
    <!-- One box for the frame and its wait, at the frame's own height as soon as that is known. A dev server's preview or a sheet is a screen: it holds a screen's 16:10 from the start, a skeleton of it until the wait outlasts its grace, so nothing moves when it answers. A component canvas's height is known only once it says it (CANVAS_EMBED_SIZE), so until it says it is one status row, a skeleton of its line before the grace, its frame loading at no height above it. Past the grace Caw and the wait's line stand in the row (The Real Wait Rule), over the screen's place, until it stands at its shape (a screen's frame loaded, a canvas's height said); then the row stands over the frame, empty. An origin that can't be reached says why in its place past the grace, with Try again: never an empty box. The live region is the row's one line throughout. -->
    <div
      class={["relative", picture === undefined ? "w-full" : "flex-none"]}
      style:inline-size={picture === undefined ? undefined : `${picture}px`}
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
          <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load says the frame is drawn, so the wait stands until then. -->
          <iframe
            bind:this={frame}
            class={[
              "block w-full rounded-xs border-0 bg-surface-page transition-opacity duration-(--dur-fade)",
              tall === null &&
                (screen ? "aspect-16/10 max-h-c-media-max-h" : "h-0"),
              !drawn && "opacity-0",
            ]}
            data-cawco-artifact={id}
            data-drawn={drawn || undefined}
            data-shape={shape}
            data-slot="embed"
            onload={() => {
              drawn = true;
            }}
            src={ready}
            style:block-size={tall === null ? undefined : `${tall}px`}
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
        <div
          class={[
            "mark-line flex items-center justify-center gap-space-2",
            screen || shaped
              ? "pointer-events-none absolute inset-0"
              : "min-h-c-btn-h-lg",
          ]}
          data-slot="wait-row"
        >
          {#if !(shaped || slow || screen)}
            <!-- The reveal's own box gives way as the bar it holds does (min-w-0):
                 its words keep the room they had beside the bare bar. -->
            <span class="flex min-w-0" data-box out:reveal>
              <Skeleton line="meta" width="title" />
            </span>
          {/if}
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
