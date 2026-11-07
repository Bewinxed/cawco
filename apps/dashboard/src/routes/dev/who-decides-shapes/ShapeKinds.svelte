<script lang="ts">
  import { kindGlyph } from "#lib/cawco/decides/kind-glyph.js";
  /**
   * Shape B, the kinds: each kind of choice a card holding the last
   * questions of that kind agents asked, and at its foot the face of who
   * answers it, which is pressed to hand the kind to someone else. The team
   * stands over the cards, a face pressed opening that member.
   */
  import MemberFace from "#lib/cawco/decides/MemberFace.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { IconChevronDown, IconPlus, IconUndoLinear } from "#lib/icons.js";
  import {
    callsOf,
    kinds,
    memberOf,
    members,
    perKind,
    routes,
    runsOn,
    tally,
    waiting,
  } from "./fixtures";
  import MemberPick from "./MemberPick.svelte";

  let { state }: { state: string | null } = $props();
  const picking = $derived(state === "pick" ? "scope" : null);
  const waitingOn = Object.values(waiting).reduce((sum, n) => sum + n, 0);
</script>

<div class="flex flex-col gap-space-5">
  <ul class="m-0 grid list-none grid-cols-7 gap-space-2 p-0">
    {#each members as member (member.id)}
      <li class="min-w-0">
        <!-- mark-line: the face stands over its name, not beside it -->
        <button
          class="flex w-full flex-col items-center gap-space-1 rounded-lg p-space-2 hover:bg-surface-hover"
          type="button"
        >
          <MemberFace {member} size={48} />
          <span
            class="mark-line flex max-w-full items-center gap-space-1 type-label text-ink-strong"
          >
            <span class="overflow-clip text-ellipsis whitespace-nowrap"
              >{member.name}</span
            >
            {#if member.id === "you" && waitingOn > 0}
              <Badge data-box size="tally" variant="attn-count"
                ><span>{waitingOn}</span></Badge
              >
            {/if}
          </span>
          <span class="type-meta text-ink-muted tabular-nums">
            {#if runsOn[member.id] && member.id !== "caw"}
              {runsOn[member.id]}
            {:else if member.id === "you"}
              {tally.you.decided} this month
            {:else}
              &nbsp;
            {/if}
          </span>
        </button>
      </li>
    {/each}
    <li class="min-w-0">
      <!-- mark-line: the plus stands over its words, not beside them -->
      <button
        class="flex w-full flex-col items-center gap-space-1 rounded-lg p-space-2 text-ink-muted hover:bg-surface-hover"
        type="button"
      >
        <span
          class="grid size-c-roster-face place-items-center rounded-panel border border-border-control border-dashed"
          ><IconPlus class="size-icon-md" /></span
        >
        <span class="type-label">Add an agent</span>
      </button>
    </li>
  </ul>

  <div class="grid grid-cols-3 gap-space-3">
    {#each kinds as kind (kind.id)}
      {@const Glyph = kindGlyph(kind.id)}
      {@const who = memberOf(routes[kind.id])}
      {@const asked = callsOf(kind.id).slice(0, 2)}
      <article
        class="relative flex min-w-0 flex-col rounded-lg bg-surface-raised shadow-tile"
      >
        <header
          class="mark-line flex items-center gap-space-2 px-space-3 pt-space-3"
        >
          <Glyph class="size-icon-md flex-none text-ink-muted" />
          <h2 class="min-w-0 flex-auto type-body font-medium text-ink-strong">
            {kind.name}
          </h2>
          {#if waiting[kind.id]}
            <Badge data-box variant="attn"
              ><span>{waiting[kind.id]} waiting</span></Badge
            >
          {/if}
        </header>
        <ul
          class="m-0 flex flex-auto list-none flex-col gap-space-3 px-space-3 py-space-3"
        >
          {#each asked as call (call.id)}
            <li class="flex flex-col gap-px">
              <p class="line-clamp-2 type-body text-pretty text-ink-strong">
                {call.question}
              </p>
              <p
                class="mark-line flex min-w-0 items-center gap-space-1 type-meta text-ink-muted"
              >
                {#if call.open}
                  <span class="text-status-attn-ink">Waiting on you</span>
                {:else}
                  {#if call.back}<IconUndoLinear
                      class="size-icon-sm flex-none text-status-attn-glyph"
                    />{/if}
                  <span
                    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                    >{call.pick}</span
                  >
                {/if}
                <span aria-hidden="true">·</span><span class="flex-none"
                  >{call.age}</span
                >
              </p>
            </li>
          {/each}
        </ul>
        <footer
          class="relative flex items-center gap-space-2 border-border-hairline border-t px-space-2 py-space-2"
        >
          <button
            class={[
              "mark-line flex min-w-0 items-center gap-space-2 rounded-md py-space-1 pr-space-2 pl-space-1 hover:bg-surface-hover",
              picking === kind.id && "bg-surface-pressed",
            ]}
            type="button"
          >
            <span class="flex" data-box
              ><MemberFace member={who} size={28} /></span
            >
            <span
              class="overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
              >{who.name}</span
            >
            <IconChevronDown class="size-icon-sm flex-none text-ink-muted" />
          </button>
          <span class="ml-auto pr-space-1 type-meta text-ink-muted tabular-nums"
            >{perKind[kind.id]} this month</span
          >
          {#if picking === kind.id}
            <MemberPick current={who.id} />
          {/if}
        </footer>
      </article>
    {/each}
  </div>
</div>
