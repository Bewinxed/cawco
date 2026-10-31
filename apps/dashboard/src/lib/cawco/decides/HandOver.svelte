<script lang="ts">
  /**
   * Who a kind can go to: every other member as a row (face, name, job, and
   * "Fleet's choice" at the end where it is). Rows stand two across wherever
   * two fit in the width the slot gives it, else one to a line: the one rule,
   * in the card's own width and across two columns alike.
   */
  import type { Kind, Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import MemberFace from "./MemberFace.svelte";

  let {
    kind,
    members,
    fleetChoice,
    onpick,
  }: {
    /** The member the fleet names for this kind. */
    fleetChoice: string;
    kind: Kind;
    /** Every member but the one holding it now. */
    members: Member[];
    onpick: (member: string) => void;
  } = $props();
</script>

<div class="flex flex-col gap-space-2">
  <p class="type-meta text-ink-muted text-pretty">
    {decidesWords.handTo(kind.name)}
  </p>
  <ul
    class="m-0 grid list-none grid-cols-(--rows) gap-x-space-3 gap-y-space-1 p-0"
    style:--rows={"repeat(auto-fill, minmax(min(100%, var(--c-roster-row-min)), 1fr))"}
  >
    {#each members as member (member.id)}
      <li class="min-w-0">
        <button
          class="flex min-h-c-touch-floor w-full items-start gap-x-space-2 rounded-xs p-space-2 text-start transition-control hover:bg-surface-recess focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
          onclick={() => onpick(member.id)}
          type="button"
        >
          <MemberFace {member} size={28} />
          <span class="flex min-w-0 flex-auto flex-col">
            <span class="type-label font-medium text-ink-strong wrap-anywhere">
              {member.name}
              {#if member.id === fleetChoice}
                <span class="font-normal text-ink-muted">
                  · {decidesWords.fleetsChoice}</span
                >
              {/if}
            </span>
            <span class="type-meta text-ink-muted text-pretty wrap-anywhere"
              >{member.job}</span
            >
          </span>
        </button>
      </li>
    {/each}
  </ul>
</div>
