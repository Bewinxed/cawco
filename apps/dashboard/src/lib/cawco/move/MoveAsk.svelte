<script lang="ts">
  /**
   * What "Move it" does, as the person reads it before saying it (the
   * owner's pick D, "Plain + details"): its lines, then the git terms behind
   * a Details fold. New session's step 2 and the pane's approval card both
   * draw it, from the hub's words (core `MoveAsk`).
   */
  import type { MoveAsk } from "@cawco/core";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { IconChevronRight } from "#lib/icons.js";

  let { ask }: { ask: MoveAsk } = $props();
  let open = $state(false);
</script>

<div class="grid gap-space-2 min-w-0" style:--details-min-h="26px">
  {#each ask.lines as line, i (i)}
    <p
      class="m-0 type-body text-ink-strong text-pretty data-follows:text-ink-muted"
      data-follows={i > 0 || undefined}
    >{line}</p>
  {/each}
  <Collapsible.Root bind:open>
    <!-- literal: 26px -->
    <Collapsible.Trigger
      class="mark-line press-tint inline-flex items-center gap-space-1 justify-self-start min-h-(--details-min-h) p-0 border-none border-current rounded-xs bg-transparent type-label text-ink-muted cursor-pointer hover:text-ink-strong"
    >
      <span>Details</span>
      <span
        data-slot="chev"
        aria-hidden="true"
        class="inline-grid motion-safe:transition-[transform] motion-safe:dur-control motion-safe:ease-out data-open:transform-(--chev-turn)"
        data-open={open || undefined}
        style:--chev-turn="rotate(90deg)"
        data-box><IconChevronRight class="size-icon-sm" /></span
      >
    </Collapsible.Trigger>
    <Collapsible.Content reveal>
      <pre
        class="mx-0 mb-0 mt-space-1 p-space-3 rounded-sm bg-surface-recess type-code text-ink-strong whitespace-pre-wrap wrap-anywhere">{ask.details.join("\n")}</pre>
    </Collapsible.Content>
  </Collapsible.Root>
</div>
