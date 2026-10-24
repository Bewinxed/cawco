<script lang="ts">
  /**
   * The chip's peek, the same in both options: today's reference peek
   * (ThingReference's floating tag) standing under its chip, its head
   * "Kind · state" in meta, the full name in label, then the kind's facts.
   * The live chip portals it to the viewport after `--dur-peek`; on the
   * canvas it stands open under the chip.
   */
  import { type ChipSpec, headOf, PEEK_FACTS } from "./kinds";

  let { chip }: { chip: ChipSpec } = $props();

  const facts = $derived(PEEK_FACTS[chip.kind] ?? []);
</script>

<span
  class="absolute start-0 top-full z-(--layer-float) mt-space-1 flex w-max max-w-c-pin-card-w flex-col gap-space-1 rounded-sm border border-border-control bg-surface-raised px-space-2 py-space-1 shadow-tile"
  data-slot="reference-peek"
>
  <span class="type-meta text-ink-muted">{headOf(chip)}</span>
  <span class="type-label text-ink-strong text-pretty wrap-anywhere"
    >{chip.label}</span
  >
  {#each facts as line (line)}
    <span
      class="type-meta text-ink-muted line-clamp-2 text-pretty wrap-anywhere"
      >{line}</span
    >
  {/each}
</span>
