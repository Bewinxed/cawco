<script lang="ts">
  /** The hand-over list: every member by its face, what it runs on, the one answering now ticked. */
  import MemberFace from "#lib/cawco/decides/MemberFace.svelte";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { IconTick } from "#lib/icons.js";
  import { members, runsOn } from "./fixtures";

  let { current }: { current: string } = $props();
</script>

<div
  class={[
    floatingSurface(),
    "absolute top-full left-0 z-10 mt-space-1 flex w-c-pop-w flex-col gap-px",
  ]}
>
  {#each members as member (member.id)}
    <button
      class="mark-line flex items-center gap-space-2 rounded-xs px-space-2 py-space-1 text-left hover:bg-surface-hover"
      type="button"
    >
      <span class="flex" data-box><MemberFace {member} size={28} /></span>
      <span class="min-w-0 flex-auto" data-box>
        <span
          class="block overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
          >{member.name}</span
        >
        {#if runsOn[member.id] && member.id !== "caw"}
          <span class="block type-meta text-ink-muted">{runsOn[member.id]}</span
          >
        {/if}
      </span>
      {#if member.id === current}
        <IconTick class="size-icon-sm text-ink-strong" />
      {/if}
    </button>
  {/each}
</div>
