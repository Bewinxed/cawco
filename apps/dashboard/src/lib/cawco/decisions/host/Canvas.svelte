<!--
  A drawing: a canvas artifact of the session's, shown live at its box. Its
  host page in a frame (`/__cawco/canvas/<id>/?embed=1`), which runs its own
  overlay, joins the canvas's doc and draws it read-only (canvas-host
  host.tsx `EMBEDDED`); this page names the canvas to it as the panel would,
  in the page's theme. The frame takes no presses: the panel's canvas is
  where it is drawn. One the hub no longer holds says so in words.
-->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { served } from "./page.svelte.js";

  let { props }: OpenUIRenderProps<{ artifact: unknown; caption?: unknown }> =
    $props();
  const id = $derived(String(props.artifact ?? ""));
  const held = $derived(served.media[id]);
  let frame = $state<HTMLIFrameElement>();

  const theme = () =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light";

  /** Names the canvas to its frame, as the panel names the artifact it shows. */
  function hello() {
    frame?.contentWindow?.postMessage(
      {
        type: "cawco:hello",
        artifact: { id, kind: "canvas", name: held?.name ?? "canvas" },
        sync: `/__cawco/artifact/${id}`,
        theme: theme(),
      },
      location.origin
    );
  }

  $effect(() => {
    if (!frame) {
      return;
    }
    const watch = new MutationObserver(() =>
      frame?.contentWindow?.postMessage(
        { type: "cawco:theme", theme: theme() },
        location.origin
      )
    );
    watch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => watch.disconnect();
  });
</script>

<figure class="dp-pane media">
  {#if held?.kind === "canvas"}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load names the canvas to the frame's overlay. -->
    <iframe
      bind:this={frame}
      class="frame"
      onload={hello}
      src={`/__cawco/canvas/${id}/?embed=1`}
      tabindex="-1"
      title={`Canvas: ${held.name}`}
    ></iframe>
  {:else}
    <p class="gone">
      {held
        ? "This piece names an artifact that is not a canvas."
        : "The canvas this card showed is gone."}
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
    aspect-ratio: 16 / 10;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    pointer-events: none;
  }
  .gone {
    color: var(--ink-muted);
    font: var(--type-meta);
  }
</style>
