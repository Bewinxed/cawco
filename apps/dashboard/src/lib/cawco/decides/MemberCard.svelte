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
  }: {
    /** What it runs on, or why it can't be reached; null for members with none. */
    facts: Facts | null;
    member: Member;
    /** The project's name; null on the fleet's page. */
    project: string | null;
    /** Its kinds' tiles; none when it holds nothing. */
    tiles: Snippet | undefined;
  } = $props();
</script>

<article
  aria-labelledby="member-{member.id}"
  class="row-span-3 grid min-w-0 grid-rows-subgrid gap-y-space-2 rounded-lg bg-surface-raised p-space-3 text-ink-strong shadow-tile"
  data-member={member.id}
  style:--stand-in="calc(var(--c-roster-face) + var(--space-3))"
>
  <div class="flex items-start gap-x-space-3">
    <MemberFace {member} size={48} />
    <div class="flex min-w-0 flex-auto flex-col">
      <h2 class="type-body font-medium wrap-anywhere" id="member-{member.id}">
        {member.name}
      </h2>
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
    {facts?.text ?? ""}
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
