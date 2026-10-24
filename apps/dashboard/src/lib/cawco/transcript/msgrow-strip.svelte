<script lang="ts">
  /**
   * The message's actions as one small strip, for the drawings that keep a
   * glyph per message (A on the speaker line, B on the well's open side):
   * Copy message, Edit message, Fork from here, in that order, each the
   * kit's ghost `icon-xs` (24px) with its tooltip and its name. It fades in
   * over --dur-control under the pointer, for keyboard focus inside it, and
   * where its turn is marked hovered; it takes its own room, so showing it
   * changes paint only.
   */
  import { transcriptWords } from "@cawco/core/words/transcript";
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconCopy, IconFork, IconPenLine } from "#lib/icons.js";

  let { class: extra }: { class?: string } = $props();

  const acts = [
    { label: transcriptWords.copyMessage, icon: IconCopy },
    { label: transcriptWords.editMessage, icon: IconPenLine },
    { label: transcriptWords.forkFromHere, icon: IconFork },
  ];
</script>

<div
  data-slot="strip"
  class={[
    "flex flex-none items-center gap-space-1 opacity-0 pointer-events-none motion-safe:transition-[opacity] motion-safe:duration-(--dur-control) motion-safe:ease-out group-hover/turn:opacity-100 group-hover/turn:pointer-events-auto group-data-hovered/turn:opacity-100 group-data-hovered/turn:pointer-events-auto has-focus-visible:opacity-100 has-focus-visible:pointer-events-auto",
    extra,
  ]}
>
  {#each acts as act (act.label)}
    <Tip label={act.label}>
      {#snippet children(tip)}
        <Button {...tip} aria-label={act.label} size="icon-xs" variant="ghost">
          <act.icon aria-hidden="true" data-box />
        </Button>
      {/snippet}
    </Tip>
  {/each}
</div>
