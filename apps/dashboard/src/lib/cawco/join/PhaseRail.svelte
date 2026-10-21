<script lang="ts">
  /**
   * The five phases of an add, drawn (DESIGN.md, The Show Don't Tell Rule):
   * one 4px segment each, a 4px gap between them. A finished phase's fill
   * eases to full over --dur-pop on ease-out; the phase in progress
   * breathes its track (Live work breathes); a failed one moves to the fail
   * hue over --dur-panel. Joined, the gaps close (bridges grow over
   * --dur-pop on ease-in-out, a beat after the last fill) and the bar moves
   * to the done hue over --dur-panel: the one state colour this decoration
   * earns, because by then it is a result (The Reserved Hue Rule).
   *
   * Every change is a transition on a data attribute, so a Stop mid-fill
   * turns back from where it is drawn (The Interruptible Rule). With less
   * motion the fills and the bridges land at once and only colour moves.
   *
   * `names`: the phases' names under the segments (meta, muted, the
   * current one in strong ink), the desk's.
   */
  import { PHASE_NAMES, type Segment } from "./join-view";

  let {
    segments,
    names = false,
  }: { segments: readonly Segment[]; names?: boolean } = $props();

  const joined = $derived(segments.every((segment) => segment === "done"));
</script>

<div
  data-slot="phase-rail"
  data-joined={joined || undefined}
  class="group/rail flex min-w-0 flex-col gap-space-1"
>
  <!-- The rail is read as its words (the sentence above it says the step);
       the phases are named for a screen reader in one list. -->
  <ol
    aria-label="Phases"
    class="m-0 flex h-space-1 min-w-0 list-none items-stretch p-0"
  >
    {#each segments as segment, index (index)}
      {#if index > 0}
        <!-- The gap: closed by its bridge once every phase is done. -->
        <li
          aria-hidden="true"
          data-slot="bridge"
          class="w-space-1 flex-none scale-x-0 bg-status-done-glyph group-data-joined/rail:scale-x-100 motion-safe:transition-[scale] motion-safe:duration-(--dur-pop) motion-safe:ease-in-out group-data-joined/rail:motion-safe:delay-(--join-close,0ms)"
        ></li>
      {/if}
      <li
        aria-current={segment === "current" ? "step" : undefined}
        data-slot="segment"
        data-state={segment}
        class="relative min-w-0 flex-1 overflow-clip bg-surface-recess-deep first:rounded-s-hair last:rounded-e-hair not-group-data-joined/rail:rounded-hair data-[state=current]:bg-ink-subtle data-[state=current]:breathe motion-safe:transition-[border-radius] motion-safe:duration-(--dur-pop) motion-safe:ease-in-out group-data-joined/rail:motion-safe:delay-(--join-close,0ms)"
      >
        <span class="sr-only">{PHASE_NAMES[index]}</span>
        <!-- The fill: its reach (scale, --dur-pop) and its ink (colour,
             --dur-panel, on the join's second beat) each on a clock of its own. -->
        <span
          aria-hidden="true"
          data-slot="fill"
          class="absolute inset-0 origin-left scale-x-0 rtl:origin-right data-[state=done]:scale-x-100 data-[state=failed]:scale-x-100 data-[state=filled]:scale-x-100 motion-safe:transition-[scale] motion-safe:duration-(--dur-pop) motion-safe:ease-out"
          data-state={segment}
        >
          <span
            data-slot="fill-ink"
            class="block size-full bg-ink-muted transition-[background-color] duration-(--dur-panel) ease-out data-[state=done]:bg-status-done-glyph data-[state=failed]:bg-status-fail-glyph group-data-joined/rail:delay-(--join-close,0ms)"
            data-state={segment}
          ></span>
        </span>
      </li>
    {/each}
  </ol>
  {#if names}
    <div
      aria-hidden="true"
      data-slot="phase-names"
      class="flex min-w-0 gap-space-1"
    >
      {#each segments as segment, index (index)}
        <span
          data-state={segment}
          class="min-w-0 flex-1 truncate type-meta text-ink-muted data-[state=current]:text-ink-strong"
          >{PHASE_NAMES[index]}</span
        >
      {/each}
    </div>
  {/if}
</div>
