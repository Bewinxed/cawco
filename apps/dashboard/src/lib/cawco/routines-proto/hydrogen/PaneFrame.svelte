<script lang="ts">
  import type { Snippet } from "svelte";
  import PageSurface from "#lib/cawco/side/PageSurface.svelte";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { IconChevronLeft } from "#lib/icons.js";

  let {
    label,
    title,
    backTo = "Routines",
    phone = false,
    slotName,
    slotValue,
    backLabel,
    onback,
    onclose,
    children,
  }: {
    backLabel?: string;
    backTo?: string;
    children: Snippet;
    label: string;
    onback?: () => void;
    onclose: () => void;
    phone?: boolean;
    slotName: "routine" | "run" | "editor";
    slotValue?: string;
    title: string;
  } = $props();
</script>

{#snippet backLeading()}
  {#if onback && backLabel}
    <BarGlass form="group">
      <BarItem icon={IconChevronLeft} label={backLabel} onclick={onback} />
    </BarGlass>
  {/if}
{/snippet}

{#snippet content()}
  <div
    class="flex min-h-0 flex-auto flex-col overflow-y-auto overscroll-contain pt-(--side-room) scroll-timeline-transcript-head"
    data-pane-id={slotValue}
    data-pane-kind={slotName}
  >
    <div
      class="flex flex-col gap-space-5 px-space-5 pt-space-2 pb-space-7 max-phone:px-space-4"
    >
      {@render children()}
    </div>
  </div>
{/snippet}

{#if phone}
  <PageSurface {backTo} {label} onclose={onback ?? onclose} {title}>
    {@render content()}
  </PageSurface>
{:else}
  <SideSurface
    {label}
    leading={onback && backLabel ? backLeading : undefined}
    of="task"
    {onclose}
    recessed={false}
    {title}
  >
    {@render content()}
  </SideSurface>
{/if}
