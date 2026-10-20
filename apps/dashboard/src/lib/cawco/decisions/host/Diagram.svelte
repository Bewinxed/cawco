<!--
  A Mermaid diagram drawn by Pele (pele.run, MIT, pinned in package.json:
  "Pin an exact version in production") in its well, drawn as written:
  `render()` with `autoDirection: false` ("Set `autoDirection: false` to
  preserve the source direction", pele.run/api; `mount()` passes the
  container's width as `maxWidth`, and below 640px "a wide `flowchart LR` may
  render as `flowchart TB`"), at its natural size with `responsive: false`,
  then scaled by its box alone to fit the well's width and the media cap
  (`c-media-max-h`), never so far that its smallest words draw under 10px:
  past that floor it scrolls sideways under the house edge fade. Its colours
  and roles are the house's (host.css, `[data-slot=diagram]`), so a theme
  change needs no redraw. Links and images in the Mermaid are off, so a page
  reaches no network. "Open as canvas" makes it a canvas in the panel,
  offered only for the types @excalidraw/mermaid-to-excalidraw 2.2.2 draws as
  elements (flowchart, sequence, class, state, ER); it draws any other as a
  picture.
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
  /** The least a diagram's words draw at, in px (LIBRARY.md: "with its words still 10px"). */
  const TYPE_FLOOR = 10;

  const text = $derived(String(props.mermaid ?? ""));
  let box = $state<HTMLDivElement>();
  let stage = $state<HTMLDivElement>();
  let type = $state<string | null>(null);
  let failed = $state("");
  /** Its natural size and the least it scales to (its words at the floor). */
  let drawn = $state<{ width: number; height: number; least: number } | null>(
    null
  );
  let room = $state(0);
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
        // Its words at their roles (host.css), in its own units: the
        // smallest sets how far it may shrink.
        const sizes = [...element.querySelectorAll("text")].map(
          (word) => Number.parseFloat(getComputedStyle(word).fontSize) || 0
        );
        const smallest = Math.min(...sizes.filter((size) => size > 0));
        const least = Number.isFinite(smallest)
          ? Math.min(1, TYPE_FLOOR / smallest)
          : 1;
        const { width, height } = drawing;
        drawn =
          svg && width > 0 && height > 0 ? { width, height, least } : null;
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

  // The well's room, as it changes.
  $effect(() => {
    const held = stage;
    if (!held) {
      return;
    }
    const watch = new ResizeObserver(() => {
      const pad = getComputedStyle(held);
      room =
        held.clientWidth -
        (Number.parseFloat(pad.paddingInlineStart) || 0) -
        (Number.parseFloat(pad.paddingInlineEnd) || 0);
    });
    watch.observe(held);
    return () => watch.disconnect();
  });

  /** Too wide for the well even at its floor: it scrolls sideways. */
  const wide = $derived(
    drawn !== null && room > 0 && drawn.width * drawn.least > room + 0.5
  );

  // Its width: as drawn, the well's room, or what the cap's height allows,
  // whichever is least, and never under its floor; its height follows its
  // viewBox.
  $effect(() => {
    // Read first: the effect follows what it reads, and the SVG is a DOM
    // query no state announces.
    const sized = drawn;
    const across = room;
    const svg = box?.querySelector("svg");
    if (!(svg && sized && across > 0)) {
      return;
    }
    const { width, height, least } = sized;
    svg.style.inlineSize = `max(${width * least}px, min(${width}px, ${room}px, calc(var(--c-media-max-h) * ${width / height})))`;
    svg.style.blockSize = "auto";
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
  bind:stage
  caption={props.caption ? String(props.caption) : undefined}
  {said}
  {wide}
>
  <div bind:this={box} class="type-label flex-none" data-slot="diagram"></div>
  {#if failed}
    <p class="type-meta text-center text-ink-muted wrap-anywhere">{failed}</p>
  {/if}
</Well>
