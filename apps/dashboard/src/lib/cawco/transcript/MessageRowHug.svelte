<script lang="ts">
  /**
   * Option B of the reader's own message (the design advisor's "well that
   * hugs its words"): the well stays left under "You" but is as wide as its
   * words, and the actions stand outside it on its open side, beside its
   * last line, where they cannot reach the words. A well with no room
   * beside it (full width) carries the strip under it at its end, in room
   * of its own. A run's messages stop joining: each is its own slab,
   * --space-1 apart, each with its own strip, and each later one's clock at
   * the row's end level with its first line, where the first message's
   * stands on the "You" line. A failed send's well is full
   * width with its recovery at rest and no strip. On a touch screen a ⋯
   * handle stands at the well's outer bottom corner at rest. A selected
   * message wears the selection pill in the well's own contour.
   */
  import { frameSize } from "#lib/cawco/frame-observer.js";
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

  /** Each slab's width and its row's, as laid out: where its strip can stand. */
  const wells = $state<Record<string, number>>({});
  const rows = $state<Record<string, number>>({});
  /** A later message's clock at the row's end: the strip stops short of it. */
  const clocks = $state<Record<string, number>>({});
  let stripW = $state(0);
  /** The strip's gap from the well's edge, --space-2, read once from the tokens. */
  let gap = $state(7);
  function readGap(node: HTMLElement): void {
    const value = Number.parseFloat(
      getComputedStyle(node).getPropertyValue("--space-2")
    );
    if (value > 0) {
      gap = value;
    }
  }
  const measureStrip = frameSize<HTMLElement>((node) => {
    stripW = node.offsetWidth;
  });
  const beside = (id: string) =>
    (wells[id] ?? 0) > 0 &&
    (wells[id] ?? 0) + gap + stripW + (clocks[id] ?? 0) <= (rows[id] ?? 0);
</script>

<div
  data-slot="run"
  {@attach readGap}
  {@attach highlight({
    rows: '[data-slot="well"]',
    selected: "[data-selected]",
    ghost: false,
  })}
>
  {#each parts as part, i (part.id)}
    {@const failed = !!part.failed}
    <Turn
      data-hovered={hovered === part.id || undefined}
      data-message={part.id}
      grouped={i > 0}
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
      <div
        data-slot="slab"
        class={["relative", i > 0 && "mt-space-1 pe-(--clock-room)"]}
        style:--clock-room={i > 0 ? `${clocks[part.id] ?? 0}px` : undefined}
        {@attach frameSize<HTMLElement>((node) => {
          rows[part.id] = node.clientWidth;
        })}
      >
        <!-- The well as wide as its words, up to the measure; a later
             message of the run keeps the row's end for its clock. -->
        <div
          class={[failed ? "w-full" : "w-fit", "max-w-full"]}
          {@attach frameSize<HTMLElement>((node) => {
            wells[part.id] = node.offsetWidth;
          })}
        >
          <Well data-selected={selected === part.id || undefined}>
            <MessageBody said source={part.content} />
            {#if part.failed}
              <Recovery reason={part.failed} />
            {/if}
          </Well>
          {#if !failed && touch}
            <!-- The handle on the well's outer bottom corner, at rest. -->
            <div class="flex justify-end mt-space-1">
              <Handle open={sheetOpen && i === 0} />
            </div>
          {/if}
        </div>
        {#if i > 0}
          <!-- A later message's clock at the row's end, level with its
               first line, where the first message's stands on the "You"
               line. -->
          <div
            class="absolute end-0 top-space-2"
            {@attach frameSize<HTMLElement>((node) => {
              // The room the clock's words take and a gap before them; its
              // speaker line's own box is wider than the words, and empty.
              const time = node.querySelector("time");
              clocks[part.id] = time ? time.offsetWidth + gap : 0;
            })}
          >
            <Who grouped name="You" timestamp={part.at} you />
          </div>
        {/if}
        {#if failed || touch}
          <!-- No strip: a failed send's recovery is at rest in its well,
               and a touch screen has the handle on the well's corner. -->
        {:else if beside(part.id)}
          <!-- On the well's open side, on its last line. -->
          <div
            class="absolute bottom-space-1 start-(--strip-x)"
            style:--strip-x="{(wells[part.id] ?? 0) + gap}px"
            {@attach measureStrip}
          >
            <Strip />
          </div>
        {:else}
          <!-- No open side: under the well at its end, in room of its own. -->
          <div class="flex justify-end mt-space-1">
            <div {@attach measureStrip}><Strip /></div>
          </div>
        {/if}
      </div>
    </Turn>
  {/each}
</div>
