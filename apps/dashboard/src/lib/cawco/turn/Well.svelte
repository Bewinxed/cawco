<script lang="ts">
  /**
   * The reader's well, one message's part of it (MessageRow's `.turn.you`,
   * PinCard's person's entries): the reader's own turns are the one thing
   * that carries a surface, ONE well holding the whole run of them, a step
   * below the pane, with a hairline between its messages. A list drawn a
   * row at a time draws it a part at a time: the top edge on the run's
   * first part, the bottom edge on its last, a hairline where the next
   * message follows. Every part has the same box whatever its place, so a
   * run growing or shrinking changes paint only. It stands inside a Turn
   * (`--pad`) and imports nothing of the transcript or the fleet.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    grouped = false,
    runsOn = false,
    lifted = false,
    class: extra,
    children,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    /** A later message of the run: open at the top, the hairline over the part above. */
    grouped?: boolean;
    /** Another message follows: no bottom edge or corners. */
    runsOn?: boolean;
    /** Its words are away (in the composer): the well folds away with them. */
    lifted?: boolean;
    children: Snippet;
  } = $props();
</script>

<!-- The surface and its edge are painted by ::before, under the words, so a
     part can open without clipping the words landing in it; ::after is the
     hairline from the message above, drawn by the LOWER message across the
     text column on the pixel row the part above leaves for its edge. The box
     is the same for every part, so a part becoming the last, or no longer
     the last, repaints and never reflows. A later message opens its top and
     starts its surface on that same pixel row; another message following
     drops the bottom edge and corners; words lifted into the composer fold
     the well away with them. -->
<div
  data-slot="well"
  data-runs-on={runsOn || undefined}
  data-grouped={grouped || undefined}
  data-lifted={lifted || undefined}
  class={[
    "relative isolate flow-root ms-(--well-x) px-(--pad) py-space-2 data-lifted:py-0 motion-safe:transition-[padding-block] motion-safe:dur-panel motion-safe:ease-drawer",
    "before:absolute before:inset-0 before:-z-1 before:rounded-well-r before:border before:border-well-edge before:bg-surface-recess-deep motion-safe:before:transition-well-surface theme-flip:before:transition-none data-grouped:before:-inset-bs-px data-grouped:before:border-bs-0 data-grouped:before:rounded-ss-none data-grouped:before:rounded-se-none data-runs-on:before:border-be-transparent data-runs-on:before:rounded-ee-none data-runs-on:before:rounded-es-none data-lifted:before:opacity-0",
    "after:absolute after:inset-x-(--pad) after:-inset-bs-px after:h-px after:bg-seam after:opacity-0 motion-safe:after:transition-[opacity] motion-safe:after:dur-pop motion-safe:after:ease-out theme-flip:after:transition-none not-data-lifted:data-grouped:after:opacity-100 data-lifted:after:opacity-0",
    extra,
  ]}
  {...rest}
>
  {@render children()}
</div>
