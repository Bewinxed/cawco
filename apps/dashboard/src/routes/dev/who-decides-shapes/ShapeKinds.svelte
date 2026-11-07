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
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { IconChevronDown, IconPlus, IconTick, IconUndoLinear } from "#lib/icons.js";
  import { callsOf, kinds, memberOf, members, perKind, routes, runsOn, tally, waiting } from "./fixtures";

  let { state }: { state: string | null } = $props();
  const picking = $derived(state === "pick" ? "scope" : null);
  const waitingOn = Object.values(waiting).reduce((sum, n) => sum + n, 0);
</script>

<div class="flex flex-col gap-space-5">
  <div class="flex flex-col gap-space-3">
    <ul class="m-0 flex list-none flex-wrap gap-space-2 p-0">
      {#each members as member (member.id)}
        <li>
          <button class="relative flex w-[120px] flex-col items-center gap-space-1 rounded-lg p-space-2 hover:bg-surface-hover" type="button">
            <span class="relative">
              <MemberFace {member} size={56} />
              {#if member.id === "you" && waitingOn > 0}
                <span class="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-status-attn-bg px-1 type-label text-status-attn-ink tabular-nums">{waitingOn}</span>
              {/if}
            </span>
            <span class="w-full truncate text-center type-label text-ink-strong">{member.name}</span>
            <span class="type-meta text-ink-muted tabular-nums">
              {#if runsOn[member.id] && member.id !== "caw"}{runsOn[member.id]}{:else if member.id === "you"}{tally.you.decided} this month{:else}&nbsp;{/if}
            </span>
          </button>
        </li>
      {/each}
      <li>
        <button class="flex w-[120px] flex-col items-center gap-space-1 rounded-lg p-space-2 text-ink-muted hover:bg-surface-hover" type="button">
          <span class="grid size-14 place-items-center rounded-[16px] border border-dashed border-border-control"><IconPlus class="size-icon-md" /></span>
          <span class="type-label">Add an agent</span>
        </button>
      </li>
    </ul>
  </div>

  <div class="grid grid-cols-3 gap-space-3">
    {#each kinds as kind (kind.id)}
      {@const Glyph = kindGlyph(kind.id)}
      {@const who = memberOf(routes[kind.id])}
      {@const asked = callsOf(kind.id).slice(0, 3)}
      <article class="relative flex min-w-0 flex-col rounded-lg bg-surface-raised shadow-tile">
        <header class="flex items-center gap-space-2 px-space-3 pt-space-3">
          <Glyph class="size-icon-md flex-none text-ink-muted" />
          <h2 class="min-w-0 flex-auto type-body font-medium text-ink-strong">{kind.name}</h2>
          {#if waiting[kind.id]}<Badge variant="attn">{waiting[kind.id]} waiting</Badge>{/if}
        </header>
        <ul class="m-0 flex flex-auto list-none flex-col gap-space-3 px-space-3 py-space-3">
          {#each asked as call (call.id)}
            <li class="flex flex-col gap-px">
              <p class="line-clamp-2 type-body text-pretty text-ink-strong">{call.question}</p>
              <p class="flex min-w-0 items-center gap-space-1 type-meta text-ink-muted">
                {#if call.open}
                  <span class="text-status-attn-ink">Waiting on you</span>
                {:else}
                  {#if call.back}<IconUndoLinear class="size-icon-sm flex-none text-status-attn-glyph" />{/if}
                  <span class="min-w-0 truncate">{call.pick}</span>
                {/if}
                <span aria-hidden="true">·</span><span class="flex-none">{call.age}</span>
              </p>
            </li>
          {/each}
        </ul>
        <footer class="flex items-center gap-space-2 border-t border-border-hairline px-space-2 py-space-2">
          <button class={["flex min-w-0 items-center gap-space-2 rounded-md py-space-1 pr-space-2 pl-space-1 hover:bg-surface-hover", picking === kind.id && "bg-surface-pressed"]} type="button">
            <MemberFace member={who} size={28} />
            <span class="truncate type-label text-ink-strong">{who.name}</span>
            <IconChevronDown class="size-icon-sm flex-none text-ink-muted" />
          </button>
          <span class="ml-auto pr-space-1 type-meta text-ink-muted tabular-nums">{perKind[kind.id]} this month</span>
        </footer>
        {#if picking === kind.id}
          <div class={[floatingSurface(), "absolute top-[calc(100%-var(--space-2))] left-space-2 z-10 flex w-72 flex-col gap-px"]}>
            {#each members as member (member.id)}
              <button class="flex items-center gap-space-2 rounded-xs px-space-2 py-space-1 text-left hover:bg-surface-hover" type="button">
                <MemberFace {member} size={28} />
                <span class="min-w-0 flex-auto">
                  <span class="block truncate type-label text-ink-strong">{member.name}</span>
                  {#if runsOn[member.id] && member.id !== "caw"}<span class="block type-meta text-ink-muted">{runsOn[member.id]}</span>{/if}
                </span>
                {#if member.id === who.id}<IconTick class="size-icon-sm text-ink-strong" />{/if}
              </button>
            {/each}
          </div>
        {/if}
      </article>
    {/each}
  </div>
</div>
