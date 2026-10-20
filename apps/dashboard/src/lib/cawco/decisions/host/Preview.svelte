<!--
  Another artifact of the session's, live in a frame. A page stands at its
  own address on this page's origin (`/__cawco/page/<id>/`), as tall as its
  content up to most of the window: an animated mockup in HTML, say. A dev
  server's preview or a sheet stands on an origin of its own the hub opened
  for it (hub server.ts `embedAt`), named in the page's media, at the shape
  of a screen. A component canvas draws the stories its `stories` names (every
  one when it names none) as the component alone, at their own size, and
  says how tall it stands, so its frame is as tall as it. One the hub no
  longer holds says so in words.
-->
<script lang="ts">
  import { CANVAS_EMBED_SIZE, canvasEmbedUrl } from "@cawco/core/stage";
  import {
    type FrameObserver,
    frameObserver,
  } from "#lib/cawco/frame-observer.js";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { served } from "./page.svelte.js";

  let {
    props,
  }: OpenUIRenderProps<{
    artifact: unknown;
    caption?: unknown;
    stories?: unknown;
  }> = $props();
  const id = $derived(String(props.artifact ?? ""));
  const held = $derived(served.media[id]);
  const stories = $derived(
    Array.isArray(props.stories) ? props.stories.map(String) : []
  );
  let frame = $state<HTMLIFrameElement>();
  let tall = $state<number | null>(null);
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
  /** `--dur-wait-grace` in ms, from the kit's tokens: a wait shows nothing before it (DESIGN.md, The Real Wait Rule). */
  const grace = () =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--dur-wait-grace"
      )
    ) || 0;
  /**
   * An embed's address once its origin serves it: its ping (core
   * `PREVIEW_PING_PATH`, open to any page) answers ok when the machine's
   * listener for it does, starting it when it has none. Loaded before then,
   * the frame would hold the browser's own error page for good.
   */
  let ready = $state<string | null>(null);
  let waited = $state(false);
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
    if (!held?.embed || ready || !slow) {
      return "";
    }
    return waited
      ? `The ${held.kind} ${held.name} isn't answering; reload the page once it runs.`
      : `Opening the ${held.kind} ${held.name}…`;
  });
</script>

<figure class="dp-pane media">
  {#if held?.kind === "page"}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load measures the page, so the frame is as tall as it. -->
    <iframe
      bind:this={frame}
      class="frame"
      onload={sized}
      src={`/__cawco/page/${id}/`}
      style:block-size={tall === null ? undefined : `${tall}px`}
      title={held.name}
    ></iframe>
  {:else if held?.embed}
    {#if ready}
      <iframe
        bind:this={frame}
        class={["frame", tall === null ? "screen" : "drawn"]}
        src={ready}
        style:block-size={tall === null ? undefined : `${tall}px`}
        title={held.name}
      ></iframe>
    {/if}
    <!-- The live region stands from the start; its words come only once the wait has lasted. -->
    <p class="gone" role="status">{waitLine}</p>
  {:else}
    <p class="gone">
      {held
        ? `The ${held.kind} this card shows can't be opened here now.`
        : "What this card showed is gone."}
    </p>
  {/if}
  {#if props.caption}<figcaption>{String(props.caption)}</figcaption>{/if}
</figure>

<style>
  .media {
    min-inline-size: 0;
  }
  .frame {
    display: block;
    inline-size: 100%;
    min-block-size: 12rem;
    max-block-size: 80vb;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--surface-page);
  }
  .screen {
    aspect-ratio: 16 / 10;
    max-block-size: 80vb;
  }
  /* A component canvas that said its height: as tall as its frames; the page scrolls past it. */
  .drawn {
    min-block-size: 0;
    max-block-size: none;
  }
  .gone {
    color: var(--ink-muted);
    font: var(--type-meta);
  }
</style>
