<!--
  A Mermaid diagram drawn by Pele (pele.run, MIT, pinned in package.json:
  "Pin an exact version in production") on the house tokens: its colours
  are CSS variables, so a theme change needs no redraw, and it lays itself
  out again for the width it has. Links and images in the Mermaid are off,
  so a page reaches no network. "Open as canvas" makes it a canvas in the
  panel, offered only for the types @excalidraw/mermaid-to-excalidraw 2.2.2
  draws as elements (flowchart, sequence, class, state, ER); it draws any
  other as a picture.
-->
<script lang="ts">
  import type { Mounted } from "pele/lazy";
  import { hubRefusal } from "../../hub-read.js";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { overlayTag } from "./page.svelte.js";

  let {
    props,
    statementId,
  }: OpenUIRenderProps<{ mermaid: unknown; caption?: unknown }> = $props();

  /** What the converter draws as elements (its parseMermaid.ts), by Pele's names for them. */
  const CANVAS_TYPES = new Set([
    "flowchart",
    "sequence",
    "class",
    "state",
    "er",
  ]);

  const text = $derived(String(props.mermaid ?? ""));
  let box = $state<HTMLDivElement>();
  let type = $state<string | null>(null);
  let opening = $state(false);
  let said = $state("");

  $effect(() => {
    const source = text;
    const element = box;
    if (!element) {
      return;
    }
    let diagram: Mounted | undefined;
    let gone = false;
    import("pele/lazy").then(async (pele) => {
      if (gone) {
        return;
      }
      type = pele.detectType(source);
      diagram = await pele.mountAsync(element, source, {
        links: false,
        images: false,
        zoom: "auto",
      });
      if (gone) {
        diagram.destroy();
      }
    });
    return () => {
      gone = true;
      diagram?.destroy();
    };
  });

  async function openAsCanvas() {
    const { artifact } = overlayTag();
    if (!artifact) {
      return;
    }
    opening = true;
    said = "";
    try {
      const response = await fetch(`/__cawco/artifact/${artifact}/canvas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mermaid: text, from: statementId ?? null }),
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
</script>

<figure class="dp-pane diagram">
  <div bind:this={box} class="draw"></div>
  {#if props.caption || (type && CANVAS_TYPES.has(type))}
    <figcaption class="foot">
      <span class="caption">{String(props.caption ?? "")}</span>
      {#if type && CANVAS_TYPES.has(type)}
        <button
          class="open"
          disabled={opening}
          onclick={openAsCanvas}
          type="button">Open as canvas</button
        >
      {/if}
    </figcaption>
  {/if}
  {#if said}<p class="said" role="status">{said}</p>{/if}
</figure>

<style>
  .diagram {
    min-inline-size: 0;
    --pele-bg: var(--surface-raised);
    --pele-fg: var(--ink-strong);
    --pele-muted: var(--ink-muted);
    --pele-line: var(--ink-muted);
    --pele-surface: var(--surface-page);
    --pele-surface-alt: var(--surface-recess);
    --pele-border: var(--border-control);
    --pele-accent: var(--brand-solid);
    --pele-critical: var(--status-fail-ink);
    --pele-error: var(--status-fail-ink);
    --pele-font: var(--font-sans);
    --pele-font-mono: var(--font-mono);
    --pele-radius: var(--radius-sm);
    --pele-series-1: var(--chart-1);
    --pele-series-2: var(--chart-2);
    --pele-series-3: var(--chart-3);
    --pele-series-4: var(--chart-4);
    --pele-series-5: var(--chart-5);
    --pele-series-6: var(--chart-brand);
    --pele-series-7: var(--ink-muted);
    --pele-series-8: var(--border-contrast);
  }
  .draw {
    display: block;
    min-inline-size: 0;
    overflow-x: auto;
    border-radius: var(--radius-md);
    background: var(--surface-raised);
  }
  /* Centred narrow, scaled wide, as a component embed (canvas runtime.ts
     fitToEmbed): a diagram narrower than its panel stands in its middle;
     a wider one Pele shrinks to the panel (its svg's max-width: 100%). */
  .draw > :global(svg) {
    display: block;
    margin-inline: auto;
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
  /* Under a finger its area reaches 44px (DESIGN.md, The 44 Touch Rule), its drawn size unchanged. */
  .open {
    position: relative;
    font: var(--type-meta);
    min-inline-size: max-content;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-page);
    color: var(--ink-strong);
    cursor: pointer;
    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
    @media (hover: hover) {
      &:hover {
        border-color: var(--ink-muted);
      }
    }
    @media (pointer: coarse) {
      &::after {
        content: "";
        position: absolute;
        inset-block-start: 50%;
        inset-inline-start: 50%;
        inline-size: max(100%, 44px);
        block-size: max(100%, 44px);
        translate: -50% -50%;
      }
    }
  }
  .said {
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
</style>
