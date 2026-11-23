<script lang="ts" module>
  import type { Pin, PinState } from "@cawco/core/comments/model";
  import { pinUnsent } from "@cawco/core/comments/model";

  /** Where pin `pin` stands: hollow while the session hasn't heard it, filled once sent, recessed once resolved. */
  export const markState = (pin: Pin): PinState => {
    if (pin.resolvedAt) {
      return "resolved";
    }
    return pinUnsent(pin) ? "unsent" : "sent";
  };
</script>

<script lang="ts">
  import PinDot from "./PinDot.svelte";

  /**
   * A comment's pill as the pane draws it (a rail's row, a thread's head, a
   * peek), the same as the page's (overlay pins.ts): `--spacing-row-compact` tall and at
   * least as wide, a square at one figure, its figures with `--spacing-space-2`
   * each side once they need more (a pill at 128), on one line whatever the
   * count; its figure in the label role (a badge) in tabular figures; a 2px raised
   * ring, then the xs shadow. Its face by state: provisional hollow and
   * bare, unsent hollow with its figure in the action ink, sent solid,
   * resolved recessed. `tail` names the corner that stands on the pressed
   * point, a `--radius-xs` corner; none is the round pill (the page as a
   * whole). `focused` is keyboard focus alone, a second ring in the focus
   * ink: an open pin is marked by its open card, never by a ring; a dot on its top end
   * says the agent is working (the live dot, ui/live-dot, on the shared
   * breath) or
   * an answer is unread (the needs-you dot, in `status-attn-glyph`, its
   * echo three loops and then still: DESIGN.md, Status dot); gone from the
   * page, a dashed `--color-ui-2` ring. `inline`, it stands in a line
   * of text as a chip's mark (a pin's chip, CommentChip): the inline
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
  class="relative inline-flex flex-none items-center justify-center h-row-compact min-w-row-compact data-inline:h-4.5 data-inline:min-w-4.5 rounded-pill px-space-2 whitespace-nowrap ring-2 ring-bg shadow-sm type-label num data-tail:rounded-es-xs data-[state=provisional]:inset-ring-2 data-[state=provisional]:inset-ring-accent data-[state=provisional]:bg-bg data-[state=unsent]:inset-ring-2 data-[state=unsent]:inset-ring-accent data-[state=unsent]:bg-bg data-[state=unsent]:text-accent data-[state=sent]:bg-accent data-[state=sent]:text-on-accent data-[state=resolved]:bg-ui-2 data-[state=resolved]:text-tx data-focused:outline-2 data-focused:outline-offset-2 data-focused:outline-solid data-focused:outline-accent not-data-focused:data-gone:outline-dashed not-data-focused:data-gone:outline-offset-2 not-data-focused:data-gone:outline-1 not-data-focused:data-gone:outline-ui-2"
  data-focused={focused || undefined}
  data-gone={gone || undefined}
  data-inline={size === "inline" || undefined}
  data-mark
  data-state={state}
  data-tail={tail === "none" ? undefined : tail}
>
  {#if number !== null}<span data-figure>{number}</span>{/if}
  {#if dot}<PinDot {dot} />{/if}
</span>
