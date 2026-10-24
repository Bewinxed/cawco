<script lang="ts">
  /**
   * Option A of the reader's own message (the design advisor's "strip on
   * the speaker line"): MessageRow's user turn with its action band gone.
   * The well holds its words alone; Copy, Edit and Fork from here stand on
   * the speaker line before the clock, under the pointer or for keyboard
   * focus. In a run every later part has its own line, its clock and its
   * strip on it. A failed send shows its recovery at rest and no strip. On
   * a touch screen a ⋯ handle stands after the clock at rest and opens the
   * bottom sheet. A selected message wears the selection pill in the well's own
   * contour (highlight.svelte.ts, The Concentric Rule).
   */
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import MessageBody from "../MessageBody.svelte";
  import Turn from "../turn/Turn.svelte";
  import Well from "../turn/Well.svelte";
  import Who from "../turn/Who.svelte";
  import type { RunPart } from "./msgrow";
  import Handle from "./msgrow-handle.svelte";
  import Recovery from "./msgrow-recovery.svelte";
  import Strip from "./msgrow-strip.svelte";

  let {
    parts,
    hovered = null,
    selected = null,
    touch = false,
    sheetOpen = false,
  }: {
    parts: RunPart[];
    /** The part under the pointer, held for a drawing. */
    hovered?: string | null;
    /** The part chosen (keyboard focus in its strip, or the one being edited). */
    selected?: string | null;
    /** A touch screen: the handle at rest instead of the hover strip. */
    touch?: boolean;
    /** The handle's sheet open, on the first part. */
    sheetOpen?: boolean;
  } = $props();
</script>

<div
  data-slot="run"
  {@attach highlight({
    rows: '[data-slot="well"]',
    selected: "[data-selected]",
    ghost: false,
  })}
>
  {#each parts as part, i (part.id)}
    {@const last = i === parts.length - 1}
    {@const failed = !!part.failed}
    {#snippet actions()}
      <Strip class="me-space-2" />
    {/snippet}
    {#snippet end()}
      <Handle class="-me-space-1" open={sheetOpen && i === 0} />
    {/snippet}
    <Turn
      data-hovered={hovered === part.id || undefined}
      data-message={part.id}
      grouped={i > 0}
      runsOn={!last}
      you
    >
      {#if i === 0}
        <Who
          actions={failed || touch ? undefined : actions}
          end={touch && !failed ? end : undefined}
          name="You"
          note={failed ? "not sent" : undefined}
          timestamp={failed ? undefined : part.at}
          you
        />
      {/if}
      <Well
        data-selected={selected === part.id || undefined}
        grouped={i > 0}
        runsOn={!last}
      >
        {#if i > 0}
          <!-- The part's own line, on the hairline from the part above: its
               strip and its clock, so a run carries every message's time. -->
          <div data-slot="part-line" class="flex justify-end">
            <Who
              actions={failed || touch ? undefined : actions}
              end={touch && !failed ? end : undefined}
              grouped
              name="You"
              timestamp={part.at}
              you
            />
          </div>
        {/if}
        <MessageBody said source={part.content} />
        {#if part.failed}
          <Recovery reason={part.failed} />
        {/if}
      </Well>
    </Turn>
  {/each}
</div>
