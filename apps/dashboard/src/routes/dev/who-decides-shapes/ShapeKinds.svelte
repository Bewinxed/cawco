<script lang="ts">
  import { kindGlyph } from "#lib/cawco/decides/kind-glyph.js";
  /**
   * Shape B, the kinds, after the critique: each kind of choice a card, its
   * glyph and name leading and the face of who answers trailing, which is
   * pressed to hand the kind over; under them the last questions of that
   * kind agents asked and their picks. The team stands over the cards as a
   * row of faces, each opening that member's card, where its calls and
   * figures are. No figure stands on the first view.
   */
  import MemberFace from "#lib/cawco/decides/MemberFace.svelte";
  import { IconChevronDown, IconPlus } from "#lib/icons.js";
  import { callsOf, kinds, memberOf, members, routes } from "./fixtures";
  import MemberCard from "./MemberCard.svelte";
  import MemberPick from "./MemberPick.svelte";

  let { state }: { state: string | null } = $props();
  const picking = $derived(state === "pick" ? "scope" : null);
  const opened = $derived(state === "member" ? "advisor" : null);
</script>

<div class="flex flex-col gap-space-5">
  <ul class="m-0 flex list-none flex-wrap gap-space-2 p-0">
    {#each members as member (member.id)}
      <li class="relative">
        <button
          class={[
            "mark-line flex items-center gap-space-2 rounded-pill py-space-1 pr-space-3 pl-space-1 hover:bg-surface-hover",
            opened === member.id && "bg-surface-pressed",
          ]}
          type="button"
        >
          <span class="flex" data-box><MemberFace {member} size={28} /></span>
          <span class="type-label text-ink-strong">{member.name}</span>
        </button>
        {#if opened === member.id}
          <MemberCard {member} />
        {/if}
      </li>
    {/each}
    <li>
      <button
        class="mark-line flex items-center gap-space-2 rounded-pill py-space-1 pr-space-3 pl-space-1 text-ink-muted hover:bg-surface-hover"
        type="button"
      >
        <span
          class="grid size-c-btn-h-sm place-items-center rounded-pill border border-border-control border-dashed"
          data-box><IconPlus class="size-icon-sm" /></span
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
        class="flex min-w-0 flex-col gap-space-3 rounded-lg bg-surface-raised p-space-3 shadow-tile"
      >
        <header class="mark-line relative flex items-center gap-space-2">
          <Glyph class="size-icon-md flex-none text-ink-muted" />
          <h2 class="min-w-0 flex-auto type-body font-medium text-ink-strong">
            {kind.name}
          </h2>
          <button
            data-box
            class={[
              "mark-line -my-space-1 -mr-space-1 flex min-w-0 items-center gap-space-2 rounded-pill py-space-1 pr-space-2 pl-space-1 hover:bg-surface-hover",
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
          {#if picking === kind.id}
            <div class="contents" data-box>
              <MemberPick current={who.id} end />
            </div>
          {/if}
        </header>
        <ul class="m-0 flex list-none flex-col gap-space-3 p-0">
          {#each asked as call (call.id)}
            <li class="flex flex-col gap-px">
              <p class="line-clamp-2 type-body text-pretty text-ink-strong">
                {call.question}
              </p>
              {#if call.open}
                <a
                  class="w-fit type-meta text-status-attn-ink underline-offset-2 hover:underline"
                  href="#card">Waiting on you</a
                >
              {:else}
                <p
                  class="overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
                >
                  {call.pick}
                </p>
              {/if}
            </li>
          {/each}
        </ul>
      </article>
    {/each}
  </div>
</div>
