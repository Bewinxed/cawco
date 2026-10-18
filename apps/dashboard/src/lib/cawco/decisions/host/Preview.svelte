<!--
  Another artifact of the session's, live in a frame. A page stands at its
  own address on this page's origin (`/__cawco/page/<id>/`), as tall as its
  content up to most of the window: an animated mockup in HTML, say. A dev
  server's preview or a sheet stands on an origin of its own the hub opened
  for it (hub server.ts `embedAt`), named in the page's media, at the shape
  of a screen. One the hub no longer holds says so in words.
-->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { served } from "./page.svelte.js";

  let { props }: OpenUIRenderProps<{ artifact: unknown; caption?: unknown }> =
    $props();
  const id = $derived(String(props.artifact ?? ""));
  const held = $derived(served.media[id]);
  let frame = $state<HTMLIFrameElement>();
  let tall = $state<number | null>(null);
  let watch: ResizeObserver | undefined;

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
    measure();
    watch = new ResizeObserver(measure);
    watch.observe(root);
  }
  $effect(() => () => watch?.disconnect());

  /** How often, and how many times, an embed's origin is asked whether it serves yet. Our call: a dev server's start. */
  const PING_MS = 1000;
  const PINGS = 30;
  /**
   * An embed's address once its origin serves it: its ping (core
   * `PREVIEW_PING_PATH`, open to any page) answers ok when the machine's
   * listener for it does, starting it when it has none. Loaded before then,
   * the frame would hold the browser's own error page for good.
   */
  let ready = $state<string | null>(null);
  let waited = $state(false);
  $effect(() => {
    const embed = held?.embed;
    ready = null;
    waited = false;
    if (!embed) {
      return;
    }
    let gone = false;
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
            ready = embed;
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
    };
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
  {:else if held?.embed && ready}
    <iframe class="frame screen" src={ready} title={held.name}></iframe>
  {:else if held?.embed}
    <p class="gone" role="status">
      {waited
        ? `The ${held.kind} ${held.name} isn't answering; reload the page once it runs.`
        : `Opening the ${held.kind} ${held.name}…`}
    </p>
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
  .gone {
    color: var(--ink-muted);
    font: var(--type-meta);
  }
</style>
