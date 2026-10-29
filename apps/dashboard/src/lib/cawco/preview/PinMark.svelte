<script lang="ts" module>
  import type { Pin, PinState } from "@cawco/core/comments";
  import { pinUnsent } from "@cawco/core/comments";

  /** Where pin `pin` stands: hollow while the session hasn't heard it, filled once sent, recessed once resolved. */
  export const markState = (pin: Pin): PinState => {
    if (pin.resolvedAt) {
      return "resolved";
    }
    return pinUnsent(pin) ? "unsent" : "sent";
  };

  /**
   * A pill's face by its state, as tokens: its fill and its edge (the
   * hollow ones a 2px `action-solid` ring on the raised surface). What a
   * thread's card grows from and goes back into (PinFloat `face`).
   */
  export const markFace = (
    state: PinState
  ): { edge: `--${string}`; fill: `--${string}` } => {
    if (state === "sent") {
      return { fill: "--action-solid", edge: "--action-solid" };
    }
    if (state === "resolved") {
      return { fill: "--surface-fill-strong", edge: "--surface-fill-strong" };
    }
    return { fill: "--surface-raised", edge: "--action-solid" };
  };
</script>

<script lang="ts">
  import PinDot from "./PinDot.svelte";

  /**
   * A comment's pill as the pane draws it (a rail's row, a thread's head, a
   * peek), the same as the page's (overlay pins.ts): `--c-pin` tall, as wide
   * as one figure, or the figures and `--c-pin-pad` each side for two or
   * three; its figure in the caps role in tabular figures; a 2px raised
   * ring, then the xs shadow. Its face by state: provisional hollow and
   * bare, unsent hollow with its figure in the action ink, sent solid,
   * resolved recessed. `tail` names the corner that stands on the pressed
   * point, a `--radius-hair` corner; none is the round pill (the page as a
   * whole). `focused` is keyboard focus alone, a second ring in the focus
   * ink: an open pin is marked by its open card, never by a ring; a dot on its top end
   * says the agent is working (the live dot, ui/live-dot, on the shared
   * breath) or
   * an answer is unread (the needs-you dot, in `status-attn-glyph`, its
   * echo three loops and then still: DESIGN.md, Status dot); gone from the
   * page, a dashed `--border-control` ring. `inline`, it stands in a line
   * of text as a chip's mark (a pin's chip, PinReference): the inline
   * chip's line tall.
   */
  let {
    number = null,
    state = "sent",
    tail = "bottom-start",
    focused = false,
    dot = null,
    gone = false,
    size = "regular",
  }: {
    number?: number | null;
    state?: PinState;
    tail?: "bottom-start" | "none";
    focused?: boolean;
    dot?: "live" | "unread" | null;
    gone?: boolean;
    size?: "regular" | "inline";
  } = $props();
</script>

<!-- mark-line: the dot stands on the pill's top-end corner, absolutely, not beside its figure -->
<span
  aria-hidden="true"
  class="relative inline-flex flex-none items-center justify-center h-c-pin min-w-c-pin data-inline:h-c-inline-chip-line data-inline:min-w-c-inline-chip-line rounded-pill ring-2 ring-surface-raised shadow-xs type-caps num leading-none data-wide:px-c-pin-pad data-tail:rounded-es-hair data-[state=provisional]:border-2 data-[state=provisional]:border-action-solid data-[state=provisional]:bg-surface-raised data-[state=unsent]:border-2 data-[state=unsent]:border-action-solid data-[state=unsent]:bg-surface-raised data-[state=unsent]:text-action-solid data-[state=sent]:bg-action-solid data-[state=sent]:text-on-action data-[state=resolved]:bg-surface-fill-strong data-[state=resolved]:text-ink-muted data-focused:outline-2 data-focused:outline-offset-2 data-focused:outline-solid data-focused:outline-focus-ring not-data-focused:data-gone:outline-dashed not-data-focused:data-gone:outline-offset-2 not-data-focused:data-gone:outline-(length:--c-pin-gone-ring) not-data-focused:data-gone:outline-border-control"
  data-focused={focused || undefined}
  data-gone={gone || undefined}
  data-inline={size === "inline" || undefined}
  data-mark
  data-state={state}
  data-tail={tail === "none" ? undefined : tail}
  data-wide={number !== null && number >= 10 ? "" : undefined}
>
  {#if number !== null}<span data-figure>{number}</span>{/if}
  {#if dot}<PinDot {dot} />{/if}
</span>
