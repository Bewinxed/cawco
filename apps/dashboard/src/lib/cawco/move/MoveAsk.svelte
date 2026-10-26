<script lang="ts">
  /**
   * What "Move it" does, as the person reads it before saying it (the
   * owner's pick D, "Plain + details"): its lines, then the git terms behind
   * a Details fold. New session's step 2 and the pane's approval card both
   * draw it, from the hub's words (core `MoveAsk`).
   */
  import type { MoveAsk } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { IconChevronRight } from "#lib/icons.js";

  let { ask }: { ask: MoveAsk } = $props();
  let open = $state(false);
</script>

<div class="grid gap-space-2 min-w-0">
  {#each ask.lines as line, i (i)}
    <p
      class="m-0 type-body text-ink-strong text-pretty data-follows:text-ink-muted"
      data-follows={i > 0 || undefined}
    >
      {line}
    </p>
  {/each}
  <Collapsible.Root bind:open>
    <!-- The fold's toggle is the kit Button, the link look in the fold's
         muted ink, so it carries the house hit area: 44px under a finger
         (DESIGN.md, The 44 Touch Rule), its drawn size the xs button's. -->
    <Collapsible.Trigger class="justify-self-box-start">
      {#snippet child({ props })}
        <Button {...props} pad="none" size="xs" tone="quiet" variant="link">
          <span>Details</span>
          <span
            data-slot="chev"
            aria-hidden="true"
            class="inline-grid motion-safe:transition-[rotate] motion-safe:duration-(--dur-control) motion-safe:ease-out data-open:rotate-90"
            data-open={open || undefined}
            data-box><IconChevronRight class="size-icon-sm" /></span
          >
        </Button>
      {/snippet}
    </Collapsible.Trigger>
    <Collapsible.Content reveal>
      <pre
        class="mx-0 mb-0 mt-space-1 p-space-3 rounded-sm bg-surface-recess type-code text-ink-strong whitespace-pre-wrap wrap-anywhere">{ask.details.join(
          "\n"
        )}</pre>
    </Collapsible.Content>
  </Collapsible.Root>
</div>
