<!--
  A drawing: a canvas artifact of the session's, shown live at its box. Its
  host page in a frame (`/__cawco/canvas/<id>/?embed=1`), which runs its own
  overlay, joins the canvas's doc and draws it read-only (canvas-host
  host.tsx `EMBEDDED`); this page names the canvas to it as the panel would,
  in the page's theme. The frame takes no presses: Open to draw brings the
  canvas to the front of the panel, where it is drawn. One the hub no longer
  holds says so in words.
-->
<script lang="ts">
  import { hubRefusal } from "../../hub-read.js";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { served } from "./page.svelte.js";

  let { props }: OpenUIRenderProps<{ artifact: unknown; caption?: unknown }> =
    $props();
  const id = $derived(String(props.artifact ?? ""));
  const held = $derived(served.media[id]);
  let frame = $state<HTMLIFrameElement>();
  let opening = $state(false);
  let said = $state("");

  /** The canvas at the front of the session's panel, to draw on. */
  async function openToDraw() {
    opening = true;
    said = "";
    try {
      const response = await fetch(`/__cawco/artifact/${id}/show`, {
        method: "POST",
      });
      if (!response.ok) {
        said = (await hubRefusal(response, "so the canvas didn't open."))
          .message;
      }
    } catch {
      said = "The canvas didn't open: the hub didn't answer.";
    } finally {
      opening = false;
    }
  }

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
  {#if held?.kind === "canvas"}
    <figcaption class="foot">
      <span class="caption">{String(props.caption ?? "")}</span>
      <button class="open" disabled={opening} onclick={openToDraw} type="button"
        >Open to draw</button
      >
    </figcaption>
  {:else if props.caption}
    <figcaption>{String(props.caption)}</figcaption>
  {/if}
  {#if said}<p class="said" role="status">{said}</p>{/if}
</figure>

<style>
  /* tailwind: this file is bundled by Bun for the decision host page, which loads only the kit's page.css and tokens.css and has no Tailwind compiler, so a utility class here would have no CSS behind it — https://tailwindcss.com/docs/installation */
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
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .caption {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  .open {
    font: var(--type-meta);
    min-inline-size: max-content;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-page);
    color: var(--ink-strong);
    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
    @media (hover: hover) {
      &:hover {
        border-color: var(--ink-muted);
      }
    }
  }
  .said {
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
</style>
