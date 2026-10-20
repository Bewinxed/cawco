<!--
  A drawing: a canvas artifact of the session's, shown live in its well. Its
  host page in a frame (`/__cawco/canvas/<id>/?embed=1`), which runs its own
  overlay, joins the canvas's doc and draws it read-only (canvas-host
  host.tsx `EMBEDDED`); this page names the canvas to it as the panel would,
  in the page's theme. The frame fits the well's width under the media cap
  and takes no presses: Open to draw brings the canvas to the front of the
  panel, where it is drawn. One the hub no longer holds says so in words
  where it would stand.
-->
<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
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
    const now = scheme.now;
    frame?.contentWindow?.postMessage(
      { type: "cawco:theme", theme: now },
      location.origin
    );
  });
</script>

{#snippet open()}
  <Button disabled={opening} onclick={openToDraw} size="sm" variant="ghost"
    >Open to draw</Button
  >
{/snippet}

<Well
  action={held?.kind === "canvas" ? open : undefined}
  caption={props.caption ? String(props.caption) : undefined}
  {said}
>
  {#if held?.kind === "canvas"}
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load names the canvas to the frame's overlay. -->
    <iframe
      bind:this={frame}
      class="pointer-events-none block aspect-16/10 max-h-c-media-max-h w-full rounded-xs border-0"
      onload={hello}
      src={`/__cawco/canvas/${id}/?embed=1`}
      tabindex="-1"
      title={`Canvas: ${held.name}`}
    ></iframe>
  {:else}
    <p
      class="type-meta grid aspect-16/10 w-full place-items-center text-center text-ink-muted wrap-anywhere"
    >
      {held
        ? "This piece names an artifact that is not a canvas."
        : "The canvas this card showed is gone."}
    </p>
  {/if}
</Well>
