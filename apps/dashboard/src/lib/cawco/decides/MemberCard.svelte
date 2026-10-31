<script lang="ts">
  /**
   * One member of Who decides: its face, name and job, the facts line (what
   * it runs on, kept empty for members with none), then the kinds it decides
   * as tiles. Its three tracks are the roster line's own (subgrid), so the
   * cards in a line share their name, facts and first tile whatever their
   * words. A hand-over open from one of its tiles joins it to the list under
   * it: its foot opens, and `joined` carries its surface down the gap.
   */
  import type { Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import type { Snippet } from "svelte";
  import MemberFace from "./MemberFace.svelte";

  let {
    member,
    facts,
    project,
    joined,
    tiles,
  }: {
    /** What it runs on, in one line; null for members with none. */
    facts: string | null;
    /** The hand-over under this card is open: it reads as one surface with it. */
    joined: boolean;
    member: Member;
    project: string;
    /** Its kinds' tiles; none when it holds nothing. */
    tiles: Snippet | undefined;
  } = $props();
</script>

<article
  class="relative row-span-3 grid min-w-0 grid-rows-subgrid gap-y-space-2 rounded-lg bg-surface-raised p-space-3 text-ink-strong shadow-tile after:absolute after:inset-x-0 after:top-full after:hidden after:h-(--join) after:bg-surface-raised data-joined:z-2 data-joined:rounded-ee-none data-joined:rounded-es-none data-joined:after:block"
  data-joined={joined || undefined}
  data-member={member.id}
  style:--join="calc(var(--space-3) + 2px)"
  style:--stand-in="calc(var(--c-roster-face) + var(--space-3))"
>
  <div class="flex items-start gap-x-space-3">
    <MemberFace {member} size={48} />
    <div class="flex min-w-0 flex-auto flex-col">
      <h3 class="type-body font-medium wrap-anywhere">{member.name}</h3>
      <p class="type-meta text-ink-muted text-pretty wrap-anywhere">
        {member.job}
      </p>
    </div>
  </div>
  <p class="ps-(--stand-in) type-meta text-ink-muted wrap-anywhere">
    {facts ?? ""}
  </p>
  <div class="flex min-w-0 flex-col gap-space-2">
    {#if tiles}
      {@render tiles()}
    {:else}
      <p
        class="rounded-well border border-dashed border-border-control px-space-3 py-space-4 text-center type-meta text-ink-muted"
      >
        {decidesWords.holdsNothing(project)}
      </p>
    {/if}
  </div>
</article>
