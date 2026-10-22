<!--
  Another artifact of the session's, live in a frame. A page stands at its
  own address on this page's origin (`/__cawco/page/<id>/`), as tall as its
  content up to most of the window: an animated mockup in HTML, say. A dev
  server's preview or a sheet stands on an origin of its own the hub opened
  for it (hub server.ts `embedAt`), named in the page's media, at the shape
  of a screen. A component canvas draws the stories its `stories` names (every
  one when it names none) as the component alone, at their own size, and
  says how tall it stands, so its frame is as tall as it; the canvas's own
  runtime centres each story at its own size, scales one wider than the
  frame to fit it and scrolls one too wide at its words' floor sideways
  under the house edge fade (runtime.ts `fitToEmbed`). Each stands in its
  well. While the origin is asked, the well holds the frame's own height
  where it is known (a screen's), else one status row, a skeleton until the
  wait outlasts its grace and Caw and the line then (DESIGN.md, The Claim Of
  Nothing Rule, The Real Wait Rule). One the hub no longer holds says so in
  words where it would stand.
-->
<script lang="ts">
  import { CANVAS_EMBED_SIZE, canvasEmbedUrl } from "@cawco/core/stage";
  import {
    type FrameObserver,
    frameObserver,
  } from "#lib/cawco/frame-observer.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import cawDark from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-working.webp";
  import cawLight from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-working.webp";
  import { dur } from "../../motion/curves.svelte";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
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
  /** It stands at a screen's shape, known before it serves: a dev server's preview or a sheet, not a component canvas, which says its own height. */
  const screen = $derived(held?.kind !== "component");
  let watch: FrameObserver | undefined;

  /** A component canvas's own height, as it says it (agent canvas runtime `by=embed`): its frame is as tall. */
  $effect(() => {
    const heard = (event: MessageEvent) => {
      const said = event.data as { height?: unknown; type?: unknown } | null;
      if (
        event.source === frame?.contentWindow &&
        said?.type === CANVAS_EMBED_SIZE &&
        typeof said.height === "number"
      ) {
        tall = said.height;
      }
    };
    addEventListener("message", heard);
    return () => removeEventListener("message", heard);
  });

  function sized() {
    watch?.disconnect();
    let root: HTMLElement | undefined;
    try {
      root = frame?.contentDocument?.documentElement;
    } catch {
      // Another origin's document: its own height is not this page's to read.
      return;
    }
    if (!root) {
      return;
    }
    const measure = () => {
      tall = root.scrollHeight;
    };
    // Read now, and a change in the next frame (frameObserver): the frame
    // takes its height from it, which lays its document out again.
    measure();
    watch = frameObserver(measure);
    watch.observe(root);
  }
  $effect(() => () => watch?.disconnect());

  /**
   * How often, and how many times, an embed's origin is asked whether it
   * serves yet: once a second for 30 seconds. Our call: long enough for a
   * dev server's cold start, short enough that a dead one is said.
   */
  const PING_MS = 1000;
  const PINGS = 30;
  /** `--dur-wait-grace` in ms, in the unit host.css writes it (motion `dur`: its minifier writes `1000ms` as `1s`): a wait shows nothing before it (DESIGN.md, The Real Wait Rule). */
  const grace = () => dur("--dur-wait-grace");
  /**
   * An embed's address once its origin serves it: its ping (core
   * `PREVIEW_PING_PATH`, open to any page) answers ok when the machine's
   * listener for it does, starting it when it has none. Loaded before then,
   * the frame would hold the browser's own error page for good.
   */
  let ready = $state<string | null>(null);
  let waited = $state(false);
  /**
   * It stands at its own shape: a screen once its origin serves, a
   * component canvas once it has said its height (every Preview of a
   * canvas by that one rule, the first as the rest), never at a screen's
   * 16:10 while it hasn't.
   */
  const shaped = $derived(screen ? ready !== null : tall !== null);
  /** What its frame's shape is now, for a reader: a screen's 16:10, drawn at the height its canvas said, or waiting for that. */
  const shape = $derived.by(() => {
    if (!shaped) {
      return "waiting";
    }
    return tall === null ? "screen" : "drawn";
  });
  /** The wait has outlasted `--dur-wait-grace`: its line may show. */
  let slow = $state(false);
  $effect(() => {
    const embed = held?.embed;
    ready = null;
    waited = false;
    slow = false;
    if (!embed) {
      return;
    }
    const address =
      held?.kind === "component" ? canvasEmbedUrl(embed, stories) : embed;
    let gone = false;
    const after = setTimeout(() => {
      slow = true;
    }, grace());
    const ping = new URL("/__cawco/ping", embed).href;
    (async () => {
      for (let tries = 0; tries < PINGS && !gone; tries += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: one ask a second until the origin serves, never several at once
        const ok = await fetch(ping, { cache: "no-store" }).then(
          (answer) => answer.ok,
          () => false
        );
        if (ok) {
          if (!gone) {
            ready = address;
          }
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, PING_MS));
      }
      if (!gone) {
        waited = true;
      }
    })();
    return () => {
      gone = true;
      clearTimeout(after);
    };
  });

  /** What the embed's status says: nothing until the wait outlasts its grace, nothing once it serves. */
  const waitLine = $derived.by(() => {
    if (!held?.embed || shaped || !slow) {
      return "";
    }
    return waited
      ? `The ${held.kind} ${held.name} isn't answering; reload the page once it runs.`
      : `Opening the ${held.kind} ${held.name}…`;
  });
</script>

<Well
  bleed={typeof props.width === "number"}
  caption={props.caption ? String(props.caption) : undefined}
>
  {#if held?.kind === "page"}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load measures the page, so the frame is as tall as it. -->
    <iframe
      bind:this={frame}
      class={[
        "block max-h-c-media-max-h w-full rounded-xs border-0 bg-surface-page",
        tall === null && "aspect-16/10",
      ]}
      data-cawco-artifact={id}
      data-slot="embed"
      onload={sized}
      src={`/__cawco/page/${id}/`}
      style:block-size={tall === null ? undefined : `${tall}px`}
      title={held.name}
    ></iframe>
  {:else if held?.embed}
    <!-- One box for the frame and its wait, at the frame's own height as soon as that is known. A dev server's preview or a sheet is a screen: it holds a screen's 16:10 from the start, a skeleton of it until the wait outlasts its grace, so nothing moves when it answers. A component canvas's height is known only once it says it (CANVAS_EMBED_SIZE), so until it says it is one status row, a skeleton of its line before the grace, its frame loading at no height above it. Past the grace Caw and the wait's line stand in the row (The Real Wait Rule), over the screen's place; once it stands at its shape, the row stands over the frame, empty. The live region is the row's one line throughout. -->
    <div class="relative w-full">
      {#if ready}
        <iframe
          bind:this={frame}
          class={[
            "block w-full rounded-xs border-0 bg-surface-page",
            tall === null &&
              (screen ? "aspect-16/10 max-h-c-media-max-h" : "h-0"),
          ]}
          data-cawco-artifact={id}
          data-shape={shape}
          data-slot="embed"
          src={ready}
          style:block-size={tall === null ? undefined : `${tall}px`}
          title={held.name}
        ></iframe>
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
          <Skeleton data-box line="meta" width="title" />
        {/if}
        {#if slow && !waited && !shaped}
          <img
            alt=""
            height="40"
            src={scheme.now === "dark" ? cawDark : cawLight}
            width="40"
          />
        {/if}
        <p class="type-meta min-w-0 text-ink-muted wrap-anywhere" role="status">
          {waitLine}
        </p>
      </div>
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
