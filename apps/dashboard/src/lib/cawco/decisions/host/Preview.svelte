<!--
  Another page artifact of the session's, live in a frame at its own
  address (`/__cawco/page/<id>/`, on this page's origin): an animated
  mockup in HTML, say. The frame is as tall as its page, up to most of the
  window. One the hub no longer holds says so in words.
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
    const root = frame?.contentDocument?.documentElement;
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
  {:else}
    <p class="gone">
      {held
        ? "This piece names an artifact that is not a page."
        : "The page this card showed is gone."}
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
  .gone {
    color: var(--ink-muted);
    font: var(--type-meta);
  }
</style>
