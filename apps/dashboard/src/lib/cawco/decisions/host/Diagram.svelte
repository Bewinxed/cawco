<!--
  A Mermaid diagram drawn by Pele (pele.run, MIT, pinned in package.json:
  "Pin an exact version in production") in its well, drawn as written:
  `render()` with `autoDirection: false` ("Set `autoDirection: false` to
  preserve the source direction", pele.run/api; `mount()` passes the
  container's width as `maxWidth`, and below 640px "a wide `flowchart LR` may
  render as `flowchart TB`"), at its natural size with `responsive: false`,
  and shown at that size, 1 CSS px per px: its well hugs it and scrolls it
  sideways where it is wider (Well.svelte). Its colours and roles are the
  house's (host.css, `[data-slot=diagram]`), so a theme change needs no
  redraw. Links and images in the Mermaid are off, so a page reaches no
  network. "Open as canvas" makes it a canvas in the panel, offered only for
  the types @excalidraw/mermaid-to-excalidraw 2.2.2 draws as elements
  (flowchart, sequence, class, state, ER); it draws any other as a picture.
-->
<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { hubRefusal } from "../../hub-read.js";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { overlayTag } from "./page.svelte.js";
  import Well from "./Well.svelte";

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
  let failed = $state("");
  /** Its natural width, px: it is shown at it. */
  let drawn = $state<number | null>(null);
  let opening = $state(false);
  let said = $state("");

  $effect(() => {
    const source = text;
    const element = box;
    if (!element) {
      return;
    }
    let gone = false;
    (async () => {
      const pele = await import("pele/lazy");
      // Pele measures labels in the font it is given: the house face, loaded.
      await document.fonts.ready;
      if (gone) {
        return;
      }
      type = pele.detectType(source);
      try {
        const drawing = await pele.renderAsync(source, {
          links: false,
          images: false,
          autoDirection: false,
          responsive: false,
          fontFamily: getComputedStyle(element).fontFamily,
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        });
        if (gone) {
          return;
        }
        element.innerHTML = drawing.svg;
        failed = "";
        const svg = element.querySelector("svg");
        const { width, height } = drawing;
        if (svg && width > 0 && height > 0) {
          // At its natural size: its height follows its viewBox.
          svg.style.inlineSize = `${width}px`;
          svg.style.blockSize = "auto";
          drawn = width;
        } else {
          drawn = null;
        }
      } catch (error) {
        if (!(error instanceof pele.PeleError)) {
          throw error;
        }
        element.textContent = "";
        drawn = null;
        failed = error.message;
      }
    })();
    return () => {
      gone = true;
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

{#snippet open()}
  {#if type && CANVAS_TYPES.has(type)}
    <Button
      data-open-canvas
      disabled={opening}
      onclick={openAsCanvas}
      size="sm"
      variant="ghost">Open as canvas</Button
    >
  {/if}
{/snippet}

<Well
  action={type && CANVAS_TYPES.has(type) ? open : undefined}
  caption={props.caption ? String(props.caption) : undefined}
  picture={drawn ?? undefined}
  {said}
>
  <div bind:this={box} class="type-label flex-none" data-slot="diagram"></div>
  {#if failed}
    <p class="type-meta text-center text-ink-muted wrap-anywhere">{failed}</p>
  {/if}
</Well>
