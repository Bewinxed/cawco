<script lang="ts">
  /**
   * Option C of the reader's own message (the design advisor's "select it,
   * and the composer answers"): no controls on the message at all. Each
   * part of the well is selectable, as a sidebar row is: the hover ghost
   * under the pointer, the selection pill once chosen (a click, a tap, Tab
   * and Enter), both in the part's own contour, square where a run opens
   * it (highlight.svelte.ts, The Concentric Rule). The well's fill is the
   * hover fill's own step, and the lift DESIGN.md names for that case
   * (`surface-recess`) is the page's own tone by day, so the ghost lifts to
   * `surface-raised`: the message comes up off the page. What can be done with the chosen message stands in the
   * composer's chip (msgrow-chip.svelte). A failed send shows its recovery
   * at rest.
   */
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import MessageBody from "../MessageBody.svelte";
  import Turn from "../turn/Turn.svelte";
  import Well from "../turn/Well.svelte";
  import Who from "../turn/Who.svelte";
  import type { RunPart } from "./msgrow";
  import Recovery from "./msgrow-recovery.svelte";

  let {
    parts,
    hovered = null,
    selected = null,
    onselect,
  }: {
    parts: RunPart[];
    /** The part under the pointer, held for a drawing. */
    hovered?: string | null;
    /** The chosen part, whose verbs the composer shows. */
    selected?: string | null;
    onselect?: (id: string | null) => void;
  } = $props();

  /** The part a mouse or a pen is over; a finger aims no ghost. */
  let pointing = $state<string | null>(null);
  /**
   * The ghost follows the row marked hovered as the mark changes, so a
   * drawing's held hover is marked once the list stands, a frame in.
   */
  let standing = $state(false);
  $effect(() => {
    const frame = requestAnimationFrame(() => {
      standing = true;
    });
    return () => cancelAnimationFrame(frame);
  });
  const under = $derived(pointing ?? (standing ? hovered : null));

  function keys(event: KeyboardEvent, id: string): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onselect?.(selected === id ? null : id);
    } else if (event.key === "Escape" && selected === id) {
      onselect?.(null);
    }
  }
</script>

<div
  data-slot="run"
  class="*:data-[slot=highlight-ghost]:bg-surface-raised"
  {@attach highlight({
    rows: '[data-slot="well"]',
    selected: '[aria-pressed="true"]',
    hovered: "[data-highlighted]",
  })}
>
  {#each parts as part, i (part.id)}
    {@const last = i === parts.length - 1}
    {@const failed = !!part.failed}
    <Turn
      data-hovered={under === part.id || undefined}
      data-message={part.id}
      grouped={i > 0}
      runsOn={!last}
      you
    >
      {#if i === 0}
        <Who
          name="You"
          note={failed ? "not sent" : undefined}
          timestamp={failed ? undefined : part.at}
          you
        />
      {/if}
      <!-- biome-ignore lint/a11y/useSemanticElements: the well holds the message's own controls (a failed send's recovery, its chips), and a <button> cannot hold buttons. -->
      <Well
        aria-pressed={selected === part.id}
        data-highlighted={under === part.id || undefined}
        grouped={i > 0}
        onclick={(event: MouseEvent) => {
          if (
            event.target instanceof Element &&
            event.target.closest("button, a")
          ) {
            return;
          }
          onselect?.(selected === part.id ? null : part.id);
        }}
        onkeydown={(event: KeyboardEvent) => keys(event, part.id)}
        onpointerenter={(event: PointerEvent) => {
          if (event.pointerType !== "touch") {
            pointing = part.id;
          }
        }}
        onpointerleave={() => {
          if (pointing === part.id) {
            pointing = null;
          }
        }}
        role="button"
        runsOn={!last}
        tabindex={0}
      >
        {#if i > 0}
          <Who grouped name="You" timestamp={part.at} you />
        {/if}
        <MessageBody said source={part.content} />
        {#if part.failed}
          <Recovery reason={part.failed} />
        {/if}
      </Well>
    </Turn>
  {/each}
</div>
