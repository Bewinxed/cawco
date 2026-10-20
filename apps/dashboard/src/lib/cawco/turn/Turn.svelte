<script lang="ts">
  /**
   * One turn of a conversation, as the transcript draws it (MessageRow) and
   * a pin's thread does (PinCard): its place in the rhythm, a turn
   * --space-4 under the one before, a later turn of the same speaker
   * --space-2 under it, and the reader's later messages abutting their well
   * (Well). What it holds is the caller's: the speaker line (Who), the
   * words, and for the reader the well around them. It imports nothing of
   * the transcript or the fleet, so an artifact's own tab can draw it.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    you = false,
    grouped = false,
    runsOn = false,
    class: extra,
    children,
    ...rest
  }: HTMLAttributes<HTMLElement> & {
    /** The reader's own turn. */
    you?: boolean;
    /** The same speaker's turn is right above. */
    grouped?: boolean;
    /** The reader's next message is right below, in the same run. */
    runsOn?: boolean;
    children: Snippet;
  } = $props();
</script>

<section
  data-you={you || undefined}
  data-slot="turn"
  data-runs-on={runsOn || undefined}
  data-grouped={grouped || undefined}
  class={[
    "group/turn",
    grouped ? "flow-root" : "mt-space-4",
    grouped && (you ? "mt-0" : "mt-space-2"),
    you && "relative",
    extra,
  ]}
  style:--pad={you ? "var(--seam-inset)" : undefined}
  {...rest}
>
  {@render children()}
</section>
