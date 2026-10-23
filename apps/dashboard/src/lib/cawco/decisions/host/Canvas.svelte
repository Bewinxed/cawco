<!--
  A drawing: a canvas artifact of the session's, shown live in its well. Its
  host page in a frame (`/__cawco/canvas/<id>/?embed=1`), which runs its own
  overlay, joins the canvas's doc and draws it read-only (canvas-host
  host.tsx `EMBEDDED`); this page names the canvas to it as the panel would,
  in the page's theme. The frame is the drawing's own box at its real size:
  the canvas tells it its shape (canvas-host host.tsx `tellShape`,
  `CANVAS_EMBED_SIZE` with its size at zoom 1 and its view's margin), and
  the frame stands at that size, so the canvas fits its drawing at zoom 1,
  1 CSS px per px; its well hugs it and scrolls it sideways where it is
  wider (Well.svelte). Until the canvas has told it, its skeleton holds the
  well. The frame takes no presses: Open to draw brings the canvas
  to the front of the panel, where it is drawn. One the hub no longer holds
  says so in words where it would stand.
-->
<script lang="ts">
  import { CANVAS_EMBED_SIZE } from "@cawco/core/stage";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
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

  /** The drawing's shape as its canvas told it: its size at zoom 1, its view's margin included, px. */
  let shape = $state<{ width: number; height: number } | null>(null);
  $effect(() => {
    const heard = (event: MessageEvent) => {
      const told = event.data as {
        height?: unknown;
        type?: unknown;
        width?: unknown;
      } | null;
      if (
        event.source === frame?.contentWindow &&
        told?.type === CANVAS_EMBED_SIZE &&
        typeof told.width === "number" &&
        typeof told.height === "number"
      ) {
        shape = { width: told.width, height: told.height };
      }
    };
    addEventListener("message", heard);
    return () => removeEventListener("message", heard);
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
  caption={props.caption ? String(props.caption) : undefined}
  picture={held?.kind === "canvas" ? shape?.width : undefined}
  {said}
>
  {#if held?.kind === "canvas"}
    {#if !shape}
      <Skeleton class="w-full" height="view" />
    {/if}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load names the canvas to the frame's overlay. -->
    <iframe
      bind:this={frame}
      class={[
        "pointer-events-none block flex-none rounded-xs border-0",
        !shape && "absolute opacity-0",
      ]}
      onload={hello}
      src={`/__cawco/canvas/${id}/?embed=1`}
      style:block-size={shape ? `${shape.height}px` : undefined}
      style:inline-size={shape ? `${shape.width}px` : "100%"}
      tabindex="-1"
      title={`Canvas: ${held.name}`}
    ></iframe>
  {:else}
    <!-- One line in its well where the drawing would stand, never a slab of its size. -->
    <p
      data-slot="media-gone"
      class="type-meta w-full text-ink-muted wrap-anywhere"
    >
      {held
        ? "This piece names an artifact that is not a canvas."
        : "The canvas this card showed is gone."}
    </p>
  {/if}
</Well>
