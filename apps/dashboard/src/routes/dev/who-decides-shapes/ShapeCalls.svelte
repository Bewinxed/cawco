<script lang="ts">
  import { kindGlyph } from "#lib/cawco/decides/kind-glyph.js";
  /**
   * Shape C, the calls: what was asked and who answered, newest first, each
   * row the member's face, the question, the pick and its kind; a row's
   * Next time hands its kind to someone else from the call itself. Who
   * answers each kind stands beside the calls.
   */
  import MemberFace from "#lib/cawco/decides/MemberFace.svelte";
  import { IconChevronDown, IconUndoLinear } from "#lib/icons.js";
  import {
    type Call,
    calls,
    kindById,
    kinds,
    memberOf,
    members,
    routes,
  } from "./fixtures";
  import MemberPick from "./MemberPick.svelte";

  let { state }: { state: string | null } = $props();
  const rerouting = $derived(state === "reroute" ? "c6" : null);
  const days: Call["day"][] = ["Today", "Yesterday", "This week"];
  /** A call's columns: face, the question, its kind's glyph, its age. */
  const rowCols =
    "calc(var(--c-btn-h-xs) + var(--space-1)) minmax(0, 1fr) var(--icon-md) calc(var(--space-8) * 2)";
</script>

<div
  class="grid grid-cols-(--page-cols) items-start gap-space-5"
  style:--page-cols={"minmax(0, 1fr) var(--c-roster-row-min)"}
>
  <div class="flex min-w-0 flex-col gap-space-3">
    <div
      class="mark-line flex items-center gap-px self-start rounded-md bg-surface-recess-deep p-px"
    >
      <span
        class="rounded-xs bg-surface-raised px-space-2 py-space-1 type-label text-ink-strong shadow-xs"
        >Everyone</span
      >
      {#each members.slice(0, 4) as member (member.id)}
        <span
          data-box
          class="flex items-center px-space-1 py-space-1"
          title={member.name}><MemberFace {member} size={24} /></span
        >
      {/each}
    </div>

    <div class="rounded-lg bg-surface-raised shadow-tile">
      {#each days as day (day)}
        {@const rows = calls.filter((call) => call.day === day)}
        <h3
          class="border-border-hairline border-b px-space-3 pt-space-3 pb-space-1 type-caps text-ink-muted"
        >
          {day}
        </h3>
        <ul class="m-0 list-none p-0">
          {#each rows as call (call.id)}
            {@const by = memberOf(call.by)}
            {@const Glyph = kindGlyph(call.kind)}
            <li
              class={[
                "mark-line grid grid-cols-(--row-cols) items-start gap-x-space-3 border-border-hairline border-b px-space-3 py-space-2 last:border-b-0",
                rerouting === call.id && "bg-surface-hover",
              ]}
              style:--row-cols={rowCols}
            >
              <span class="flex" data-box
                ><MemberFace member={by} size={28} /></span
              >
              <div class="flex min-w-0 flex-col" data-box>
                <p class="type-body text-pretty text-ink-strong">
                  {call.question}
                </p>
                <p
                  class="mark-line flex min-w-0 items-center gap-space-1 type-meta text-ink-muted"
                >
                  <span>{call.project}</span><span aria-hidden="true">·</span>
                  {#if call.open}
                    <span class="text-status-attn-ink">Waiting on you</span>
                  {:else}
                    <span
                      class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-strong"
                      >{call.pick}</span
                    >
                    {#if call.sources}<span aria-hidden="true">·</span><span
                        class="flex-none"
                        >{call.sources}
                        {call.sources === 1 ? "source" : "sources"}</span
                      >{/if}
                    {#if call.back}<span aria-hidden="true">·</span
                      ><IconUndoLinear
                        class="size-icon-sm flex-none text-status-attn-glyph"
                      /><span class="flex-none text-status-attn-ink"
                        >You picked again</span
                      >{/if}
                  {/if}
                </p>
                {#if rerouting === call.id}
                  <div
                    class="mark-line relative mt-space-2 flex items-center gap-space-2"
                  >
                    <span class="type-label text-ink-muted">Next time</span>
                    <span
                      data-box
                      class="mark-line flex items-center gap-space-1 rounded-md border border-border-control bg-surface-raised py-px pr-space-2 pl-px type-label text-ink-strong"
                      ><span class="flex" data-box
                        ><MemberFace member={by} size={24} /></span
                      ><span>{by.name}</span><IconChevronDown
                        class="size-icon-sm text-ink-muted"
                      /></span
                    >
                    <div data-box><MemberPick current={by.id} /></div>
                  </div>
                {/if}
              </div>
              <span
                data-box
                aria-label={kindById(call.kind).name}
                class="pt-space-1 text-ink-muted"
                role="img"
                title={kindById(call.kind).name}
                ><Glyph class="size-icon-md" /></span
              >
              <span
                class="pt-px text-right type-label text-ink-muted tabular-nums"
                >{call.age}</span
              >
            </li>
          {/each}
        </ul>
      {/each}
    </div>
  </div>

  <aside
    class="sticky top-0 flex flex-col rounded-lg bg-surface-raised p-space-2 shadow-tile"
  >
    <h2 class="px-space-2 pt-space-1 pb-space-2 type-label text-ink-muted">
      Who answers
    </h2>
    <ul class="m-0 flex list-none flex-col p-0">
      {#each kinds as kind (kind.id)}
        {@const Glyph = kindGlyph(kind.id)}
        {@const who = memberOf(routes[kind.id])}
        <li>
          <button
            class="mark-line flex w-full items-center gap-space-2 rounded-md px-space-2 py-space-2 text-left hover:bg-surface-hover"
            type="button"
          >
            <Glyph class="size-icon-md flex-none text-ink-muted" />
            <span
              class="min-w-0 flex-auto overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
              >{kind.name}</span
            >
            <span data-box title={who.name}
              ><MemberFace member={who} size={24} /></span
            >
          </button>
        </li>
      {/each}
    </ul>
  </aside>
</div>
