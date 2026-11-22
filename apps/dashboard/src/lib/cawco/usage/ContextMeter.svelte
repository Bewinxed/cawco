<script lang="ts" module>
  import type { MeterState } from "../usage";

  /** The conversation's context as the card has it: read, being read, or refused with why. */
  export type ContextReading =
    | { kind: "read"; used: number; state: MeterState; detail: string }
    | { kind: "reading" }
    | { kind: "refused"; why: string };
</script>

<script lang="ts">
  /**
   * The conversation's context, under the session card's head on the
   * head's text column: a meter of the share of its model's window it
   * fills, and that share in words beside it ("38% of context"), the exact
   * tokens its tooltip, which focus opens too. While it is being read, or
   * when the harness refused the read, the words of that stand where the
   * meter does, on the same line, so the head never jumps.
   *
   * Every size is the meta line's (12px Figtree, line 1.5), read off the
   * face rather than set by eye:
   * - the row is one meta line tall (`1lh`, 18px), the head's own rhythm;
   * - the track is one x-height tall (`1ex`, Figtree's 0.5em: 6px), and the
   *   row's words are trimmed to their x-height band (`mark-line`), so the
   *   bar stands exactly level with the lowercase of "of context";
   * - the fill's least length is the track's height, so a sliver of
   *   context is a round dot rather than a hairline;
   * - the track runs from the text column's start edge (the title's) to
   *   the words, which end on the column's end edge (the harness mark's),
   *   the meta line's own gap (`space-2`) between them.
   * The fill takes the share's state colour on a track that is no state's,
   * and the words carry the figure, so the fill never says it alone.
   */
  import { sessionStatWords as words } from "@cawco/core/words/session-stats";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";

  let { reading }: { reading: ContextReading } = $props();

  const share = $derived(
    reading.kind === "read" ? Math.min(100, Math.max(0, reading.used)) : 0
  );
</script>

<div data-slot="context" class="min-h-lh text-size-meta leading-body">
  {#if reading.kind === "read"}
    {@const said = words.context(reading.used)}
    <Tip label={reading.detail}>
      {#snippet children(tip)}
        <!-- A button only so focus reaches its tooltip: it does nothing else. -->
        <button
          {...tip}
          aria-label={`${said}. ${reading.detail}`}
          class="mark-line flex w-full cursor-default items-center gap-x-space-2 rounded-hair border-none bg-transparent p-0 text-start text-inherit text-ink-muted outline-offset-2"
          data-slot="context-meter"
          type="button"
        >
          <span
            aria-hidden="true"
            class="group/bar relative block h-x-height min-w-0 flex-1 overflow-hidden rounded-pill bg-border-control"
            data-box
            data-slot="track"
            data-state={reading.state}
          >
            <span
              class="absolute inset-y-0 start-0 w-(--fill-w) rounded-pill bg-ink-muted group-state-near/bar:bg-status-attn-glyph group-state-over/bar:bg-status-fail-glyph group-state-reached/bar:bg-status-fail-glyph group-state-stale/bar:bg-ink-subtle motion-safe:transition-[inline-size] motion-safe:duration-(--duration-fade) motion-safe:ease-drawer"
              data-slot="fill"
              style:--fill-w={share > 0
                ? `max(${share}%, 1ex)`
                : "0px"}
            ></span>
          </span>
          <span class="flex-none whitespace-nowrap tabular-nums">{said}</span>
        </button>
      {/snippet}
    </Tip>
  {:else if reading.kind === "reading"}
    <p
      class="mark-line m-0 flex items-center gap-space-2 text-ink-muted"
      data-slot="context-reading"
    >
      <span class="mark-cell"><LiveDot /></span><span
        >{words.contextReading}</span
      >
    </p>
  {:else}
    <p
      class="m-0 text-pretty wrap-anywhere text-ink-muted"
      data-slot="context-refused"
    >
      {reading.why}
    </p>
  {/if}
</div>
