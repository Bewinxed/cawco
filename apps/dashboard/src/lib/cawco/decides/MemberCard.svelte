<script lang="ts">
  /**
   * One member of Who decides: its face, name and job, the facts line (what
   * it runs on, or why it can't be reached in the attention ink; kept empty
   * for members with none), then the kinds it decides as tiles. Its three
   * tracks are the roster line's own (subgrid), so the cards in a line share
   * their name, facts and first tile whatever their words.
   */
  import type { Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import type { Snippet } from "svelte";
  import type { Facts } from "./decides.svelte";
  import MemberFace from "./MemberFace.svelte";

  let {
    member,
    facts,
    project,
    tiles,
    editing = false,
    parked = false,
    card = $bindable(),
    pencil,
  }: {
    /** What it runs on, or why it can't be reached; null for members with none. */
    facts: Facts | null;
    member: Member;
    /** The project's name; null on the fleet's page. */
    project: string | null;
    /** Its kinds' tiles; none when it holds nothing. */
    tiles: Snippet | undefined;
    /** Its settings stand open, hung from it: it is edged in coral. */
    editing?: boolean;
    /** Its settings were closed before saving: the facts line says so. */
    parked?: boolean;
    /** The card, which its settings hang from. */
    card?: HTMLElement | null;
    /** The pencil that opens its settings; none for members with none. */
    pencil?: Snippet;
  } = $props();

  const factsLine = $derived(
    [facts?.text, parked ? decidesWords.unsaved : null]
      .filter(Boolean)
      .join(" · ")
  );
</script>

<article
  bind:this={card}
  aria-labelledby="member-{member.id}"
  class={[
    "row-span-3 grid min-w-0 grid-rows-subgrid gap-y-space-2 rounded-lg bg-surface-raised p-space-3 text-ink-strong shadow-tile transition-control",
    editing && "inset-ring-2 inset-ring-brand-solid",
  ]}
  data-editing={editing || undefined}
  data-member={member.id}
  style:--stand-in="calc(var(--spacing-c-roster-face) + var(--spacing-space-3))"
>
  <div class="flex items-start gap-x-space-3">
    <MemberFace {member} size={48} />
    <div class="flex min-w-0 flex-auto flex-col">
      <div class="flex min-w-0 items-start gap-x-space-1">
        <h2
          class="min-w-0 flex-auto type-body font-medium wrap-anywhere"
          id="member-{member.id}"
        >
          {member.name}
        </h2>
        {@render pencil?.()}
      </div>
      <p class="type-meta text-ink-muted text-pretty wrap-anywhere">
        {member.job}
      </p>
    </div>
  </div>
  <p
    class={[
      "ps-(--stand-in) type-meta text-pretty wrap-anywhere",
      facts?.attention ? "text-status-attn-ink" : "text-ink-muted",
    ]}
  >
    {#if parked && facts?.text}
      {facts.text} ·
      <span class="text-ink-strong">{decidesWords.unsaved}</span>
    {:else}
      {factsLine}
    {/if}
  </p>
  <div class="flex min-w-0 flex-col gap-space-2">
    {#if tiles}
      {@render tiles()}
    {:else}
      <p
        class="rounded-well border border-dashed border-border-control px-space-3 py-space-4 text-center type-meta text-ink-muted text-pretty"
      >
        {project === null
          ? decidesWords.holdsNothingFleet
          : decidesWords.holdsNothing(project)}
      </p>
    {/if}
  </div>
</article>
