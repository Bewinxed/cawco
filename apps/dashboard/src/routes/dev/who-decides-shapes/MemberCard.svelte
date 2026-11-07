<script lang="ts">
  /**
   * A member's card, hung from its face in the team row: its face and name,
   * what it runs on as a chip, its standing instructions as its own words,
   * and its recent calls with this month's figures: the place his
   * statistics live, opened on purpose.
   */
  import type { Member } from "@cawco/core/decides";
  import MemberFace from "#lib/cawco/decides/MemberFace.svelte";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { IconChevronDown, IconUndoLinear } from "#lib/icons.js";
  import { calls, instructions, runsOn, tally } from "./fixtures";

  let { member }: { member: Member } = $props();
  const recent = $derived(calls.filter((call) => call.by === member.id));
  const t = $derived(tally[member.id]);
</script>

<div
  class={[
    floatingSurface(),
    "absolute top-full left-0 z-10 mt-space-1 flex w-c-panel-w flex-col gap-space-3",
  ]}
>
  <div class="flex items-center gap-space-3">
    <MemberFace {member} size={48} />
    <div class="flex min-w-0 flex-col items-start gap-space-1">
      <span class="type-title text-ink-strong">{member.name}</span>
      {#if runsOn[member.id]}
        <button
          class="mark-line inline-flex items-center gap-space-1 rounded-sm border border-border-control bg-surface-raised px-space-2 py-px type-label text-ink-strong hover:bg-surface-hover"
          type="button"
        >
          <span>Claude Code · {runsOn[member.id]}</span><IconChevronDown
            class="size-icon-sm text-ink-muted"
          />
        </button>
      {/if}
    </div>
  </div>
  {#if instructions[member.id]}
    <p
      class="line-clamp-3 rounded-md bg-surface-recess px-space-3 py-space-2 type-body text-pretty text-ink-strong"
    >
      {instructions[member.id]}
    </p>
  {/if}
  <div class="flex flex-col gap-space-2">
    <p class="type-meta text-ink-muted tabular-nums">
      <span>{t.decided} calls this month</span>
      {#if t.back > 0}<span aria-hidden="true">{" · "}</span><span
          class="text-status-attn-ink">you overruled {t.back}</span
        >{/if}
    </p>
    <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
      {#each recent as call (call.id)}
        <li class="flex flex-col gap-px">
          <p class="line-clamp-2 type-body text-pretty text-ink-strong">
            {call.question}
          </p>
          <p
            class="mark-line flex min-w-0 items-center gap-space-1 type-meta text-ink-muted"
          >
            {#if call.back}<IconUndoLinear
                class="size-icon-sm flex-none text-status-attn-glyph"
              /><span class="text-status-attn-ink">You picked again</span><span
                aria-hidden="true">·</span
              >{/if}
            <span class="overflow-clip text-ellipsis whitespace-nowrap"
              >{call.pick}</span
            >
            <span aria-hidden="true">·</span><span class="flex-none"
              >{call.age}</span
            >
          </p>
        </li>
      {/each}
    </ul>
  </div>
</div>
