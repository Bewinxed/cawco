<!--
  A drawing: a canvas artifact of the session's, shown live in its well. Its
  host page in a frame (`/__cawco/canvas/<id>/?embed=1`), which runs its own
  overlay, joins the canvas's doc and draws it read-only (canvas-host
  host.tsx `EMBEDDED`); this page names the canvas to it as the panel would,
  in the page's theme. The frame is the drawing's own box: the canvas tells
  it its shape (canvas-host host.tsx `tellShape`, `CANVAS_EMBED_SIZE` with
  its size and its view's margin), and the frame fits the well's width at
  that shape, or the media cap's height where the width would draw it
  taller, centred in its well; until the canvas has told it, its skeleton
  holds the well. The frame takes no presses: Open to draw brings the canvas
  to the front of the panel, where it is drawn. One the hub no longer holds
  says so in words where it would stand.
-->
<script lang="ts">
  import { CANVAS_EMBED_SIZE } from "@cawco/core/stage";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { frameObserver } from "../../frame-observer.js";
  import { hubRefusal } from "../../hub-read.js";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { served } from "./page.svelte.js";
  import { scheme } from "./scheme.svelte.js";
  import Well from "./Well.svelte";

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

  /** Names the canvas to its frame, as the panel names the artifact it shows. */
  function hello() {
    frame?.contentWindow?.postMessage(
      {
        type: "cawco:hello",
        artifact: { id, kind: "canvas", name: held?.name ?? "canvas" },
        sync: `/__cawco/artifact/${id}`,
        theme: scheme.now,
      },
      location.origin
    );
  }

  // The frame follows the page's theme.
  $effect(() => {
    const { now } = scheme;
    frame?.contentWindow?.postMessage(
      { type: "cawco:theme", theme: now },
      location.origin
    );
  });

  /** The drawing's shape as its canvas told it: its size at zoom 1 and its view's margin, px. */
  let shape = $state<{ width: number; height: number; margin: number } | null>(
    null
  );
  $effect(() => {
    const heard = (event: MessageEvent) => {
      const told = event.data as {
        height?: unknown;
        margin?: unknown;
        type?: unknown;
        width?: unknown;
      } | null;
      if (
        event.source === frame?.contentWindow &&
        told?.type === CANVAS_EMBED_SIZE &&
        typeof told.width === "number" &&
        typeof told.height === "number" &&
        typeof told.margin === "number"
      ) {
        shape = { width: told.width, height: told.height, margin: told.margin };
      }
    };
    addEventListener("message", heard);
    return () => removeEventListener("message", heard);
  });

  let stage = $state<HTMLDivElement>();
  let room = $state(0);
  // The well's room: read now, and a change in the next frame (frameObserver).
  $effect(() => {
    const well = stage;
    if (!well) {
      return;
    }
    const read = () => {
      room = well.clientWidth;
    };
    read();
    const sizes = frameObserver(read);
    sizes.observe(well);
    return () => sizes.disconnect();
  });

  /**
   * The frame's box: the well's width, the drawing standing in it at the
   * canvas's own fit (its margin in view px round it), its height from that;
   * where that is taller than the media cap, the cap's height and the width
   * it allows.
   */
  const box = $derived.by(() => {
    if (!(shape && frame && room > 0)) {
      return null;
    }
    const { width, height, margin } = shape;
    const edge = 2 * margin;
    const cap = Number.parseFloat(getComputedStyle(frame).maxBlockSize);
    const tall = edge + ((height - edge) * (room - edge)) / (width - edge);
    if (!(Number.isFinite(cap) && tall > cap)) {
      return { inline: room, block: tall };
    }
    return {
      inline: edge + ((width - edge) * (cap - edge)) / (height - edge),
      block: cap,
    };
  });
</script>

{#snippet open()}
  <Button
    data-open-draw
    disabled={opening}
    onclick={openToDraw}
    size="sm"
    variant="ghost">Open to draw</Button
  >
{/snippet}

<Well
  action={held?.kind === "canvas" ? open : undefined}
  bind:stage
  caption={props.caption ? String(props.caption) : undefined}
  {said}
>
  {#if held?.kind === "canvas"}
    {#if !box}
      <Skeleton class="w-full" height="view" />
    {/if}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load names the canvas to the frame's overlay. -->
    <iframe
      bind:this={frame}
      class={[
        "pointer-events-none block max-h-c-media-max-h flex-none rounded-xs border-0",
        !box && "absolute opacity-0",
      ]}
      onload={hello}
      src={`/__cawco/canvas/${id}/?embed=1`}
      style:block-size={box ? `${box.block}px` : undefined}
      style:inline-size={box ? `${box.inline}px` : "100%"}
      tabindex="-1"
      title={`Canvas: ${held.name}`}
    ></iframe>
  {:else}
    <p
      data-slot="media-gone"
      class="type-meta grid aspect-16/10 w-full place-items-center text-center text-ink-muted wrap-anywhere"
    >
      {held
        ? "This piece names an artifact that is not a canvas."
        : "The canvas this card showed is gone."}
    </p>
  {/if}
</Well>
