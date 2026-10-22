<script lang="ts">
  /**
   * The chip's peek, the same in both options: one house hover panel
   * (HoverPanelFrame, HoverPanel's surface without its session watch) over
   * the chip, its head "Kind · state" in meta, the full
   * name in label, the kind's body, then its Open action. A press on the
   * chip opens it; the chip never navigates by itself.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import HoverPanelFrame from "../HoverPanelFrame.svelte";
  import { type ChipSpec, headOf, PEEK_BODY } from "./kinds";

  let { chip, open, id }: { chip: ChipSpec; open: boolean; id: string } =
    $props();

  const head = $derived(headOf(chip));
  const body = $derived(chip.body ?? PEEK_BODY[chip.kind] ?? []);
</script>

<HoverPanelFrame
  aria-label={head}
  {id}
  key={open ? chip.kind : null}
  role="dialog"
  side="above"
  style="--x: 0px; --origin: var(--space-5); --span: var(--hover-panel-max)"
>
  {#snippet children()}
    <div class="grid justify-items-start gap-space-1" data-slot="peek">
      <span class="type-meta text-ink-muted">{head}</span>
      <span class="type-label text-ink-strong">{chip.label}</span>
      {#each body as line (line)}
        <p class="type-meta text-ink-muted text-pretty">{line}</p>
      {/each}
      <Button class="mt-space-2" size="xs" variant="outline">Open</Button>
    </div>
  {/snippet}
</HoverPanelFrame>
