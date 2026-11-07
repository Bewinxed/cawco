<script lang="ts">
  import { kindGlyph } from "#lib/cawco/decides/kind-glyph.js";
  /**
   * Shape A, the team: one band per member, its face and what it runs on
   * leading, the kinds it answers as cards along it, each card showing the
   * last question of that kind it answered. A kind moves by dragging its
   * card to another member's band.
   */
  import MemberFace from "#lib/cawco/decides/MemberFace.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { IconChevronDown, IconPlus, IconUndoLinear } from "#lib/icons.js";
  import {
    callsOf,
    kindById,
    kinds,
    members,
    routes,
    runsOn,
    tally,
    waiting,
  } from "./fixtures";

  let { state }: { state: string | null } = $props();
  const moving = $derived(state === "move");
  const kindsOf = (member: string) =>
    kinds.filter((kind) => routes[kind.id] === member);
  const waitingOn = Object.values(waiting).reduce((sum, n) => sum + n, 0);
</script>

{#snippet card(kindId: string, lifted = false)}
  {@const kind = kindById(kindId)}
  {@const last = callsOf(kindId)[0]}
  {@const Glyph = kindGlyph(kindId)}
  <div
    class={[
      "flex min-w-0 cursor-grab flex-col gap-space-2 rounded-md bg-surface-recess p-space-3",
      lifted && "bg-surface-raised shadow-overlay",
    ]}
  >
    <div class="mark-line flex items-center gap-space-2">
      <Glyph class="size-icon-sm flex-none text-ink-muted" />
      <span class="min-w-0 flex-auto type-label text-ink-strong"
        >{kind.name}</span
      >
      {#if waiting[kindId]}
        <Badge data-box variant="attn"
          ><span>{waiting[kindId]} waiting</span></Badge
        >
      {/if}
    </div>
    <p class="line-clamp-2 type-body text-pretty text-ink-strong">
      {last.question}
    </p>
    <p
      class="mark-line flex min-w-0 items-center gap-space-1 type-meta text-ink-muted"
    >
      {#if last.open}
        <span class="text-status-attn-ink">Waiting on you</span>
      {:else}
        {#if last.back}<IconUndoLinear
            class="size-icon-sm flex-none text-status-attn-glyph"
          />{/if}
        <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
          >{last.pick}</span
        >
      {/if}
      <span aria-hidden="true">·</span>
      <span class="flex-none tabular-nums">{last.age}</span>
    </p>
  </div>
{/snippet}

<div class="flex flex-col gap-space-4">
  {#each members as member (member.id)}
    {@const holds = kindsOf(member.id)}
    {@const t = tally[member.id]}
    {@const target = moving && member.id === "advisor"}
    <section
      class={[
        "grid grid-cols-(--band-cols) gap-x-space-5 rounded-lg bg-surface-raised p-space-3 shadow-tile",
        target && "inset-ring-2 inset-ring-brand-solid",
      ]}
      style:--band-cols={"var(--c-roster-row-min) minmax(0, 1fr)"}
    >
      <div class="flex min-w-0 items-start gap-space-3">
        <MemberFace {member} size={48} />
        <div class="flex min-w-0 flex-auto flex-col items-start gap-space-1">
          <h2 class="type-title text-ink-strong">{member.name}</h2>
          {#if runsOn[member.id] && member.id !== "caw"}
            <button
              class="mark-line inline-flex items-center gap-space-1 rounded-sm border border-border-control bg-surface-raised px-space-2 py-px type-label text-ink-strong hover:bg-surface-hover"
              type="button"
            >
              <span>{runsOn[member.id]}</span><IconChevronDown
                class="size-icon-sm text-ink-muted"
              />
            </button>
          {/if}
          {#if member.id === "you" && waitingOn > 0}
            <a
              class="type-label text-status-attn-ink underline-offset-2 hover:underline"
              href="#waiting">{waitingOn} waiting on you</a
            >
          {/if}
          {#if t.decided > 0 && member.id !== "you"}
            <p class="type-meta text-ink-muted tabular-nums">
              <span>{t.decided} calls this month</span>
              {#if t.back > 0}<br /><span class="text-status-attn-ink"
                  >you overruled {t.back}</span
                >{/if}
            </p>
          {/if}
        </div>
      </div>

      <div class="grid min-w-0 grid-cols-2 content-start gap-space-2">
        {#each holds as kind (kind.id)}
          {#if moving && kind.id === "scope"}
            <div
              class="rounded-md border border-dashed border-border-control"
            ></div>
          {:else}
            {@render card(kind.id)}
          {/if}
        {/each}
        {#if target}
          <div
            class="relative min-h-c-stat-h rounded-md border border-dashed border-brand-solid bg-brand-wash"
          >
            <div class="absolute inset-x-0 top-0 -mt-space-3 -ml-space-3">
              {@render card("scope", true)}
            </div>
          </div>
        {/if}
        {#if holds.length === 0 && !target}
          <div
            class="col-span-full grid min-h-c-stat-h place-items-center rounded-md border border-dashed border-border-control type-meta text-ink-muted"
          >
            <span>Drag a kind here</span>
          </div>
        {/if}
      </div>
    </section>
  {/each}

  <button
    class="mark-line flex items-center gap-space-3 rounded-lg border border-dashed border-border-control p-space-3 text-ink-muted hover:bg-surface-hover"
    type="button"
  >
    <span
      data-box
      class="grid size-c-roster-face place-items-center rounded-panel bg-surface-recess-deep"
      ><IconPlus class="size-icon-md" /></span
    >
    <span class="type-body font-medium text-ink-strong">Add an agent</span>
  </button>
</div>
