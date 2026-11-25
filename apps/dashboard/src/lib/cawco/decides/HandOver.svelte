<script lang="ts" module>
  /** The popover's width for `count` rows: two across where two fit, else one, never wider than the room beside the tile (bits-ui measures it). */
  export const handOverWidth = (count: number): string => {
    const across = Math.min(2, Math.max(1, count));
    return `min(calc(${across} * calc(var(--spacing) * 68) + ${across - 1} * var(--spacing-space-3) + 2 * var(--spacing-space-2) + 2px), calc(100vw - 2 * var(--kit-gutter)))`;
  };
</script>

<script lang="ts">
  /**
   * Who a kind can go to, in its tile's popover: the head, then every other
   * member as a row (face, name, job, and "Fleet's choice" where it is). Rows
   * stand two across wherever two fit in the popover's width, else one to a
   * line (a phone).
   */
  import type { Kind, Member } from "@cawco/core/decides";
  import MemberFace from "./MemberFace.svelte";
  import { ROSTER_WORDS, type RosterWords } from "./roster-words";

  let {
    headId,
    kind,
    members,
    fleetChoice,
    onpick,
    said = ROSTER_WORDS,
    describe = false,
  }: {
    /** The member the fleet names for this kind; null on the fleet's page, where every choice is the fleet's. */
    fleetChoice: string | null;
    /** The head's id, which names the popover. */
    headId: string;
    kind: Kind;
    /** Every member but the one holding it now. */
    members: Member[];
    onpick: (member: string) => void;
    /** Its words: Who decides' unless the surface drawing it says its own. */
    said?: RosterWords;
    /** The kind's example under the head, where its tile shows only its name (Roster `brief`). */
    describe?: boolean;
  } = $props();
</script>

<div class="flex flex-col gap-space-1">
  <p class="px-space-2 pt-space-1 text-pretty text-tx-2 type-meta" id={headId}>
    {said.handTo(kind.name)}
  </p>
  {#if describe}
    <p
      class="px-space-2 text-pretty text-tx-2 type-meta first-letter:uppercase"
    >
      {kind.example}
    </p>
  {/if}
  <ul
    class="m-0 grid list-none grid-cols-(--rows) gap-x-space-3 gap-y-space-1 p-0"
    style:--rows={"repeat(auto-fill, minmax(min(100%, calc(var(--spacing) * 68)), 1fr))"}
  >
    {#each members as member (member.id)}
      <li class="min-w-0">
        <button
          class="flex min-h-control-lg w-full items-start gap-x-space-2 concentric-xs p-space-2 text-start transition-control focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent focus-visible:outline-solid can-hover:hover:bg-ui"
          onclick={() => onpick(member.id)}
          type="button"
        >
          <MemberFace {member} size={28} />
          <span class="flex min-w-0 flex-auto flex-col">
            <span class="font-medium wrap-anywhere text-tx type-label">
              {member.name}
              {#if member.id === fleetChoice}
                <span class="font-normal text-tx-2">
                  · {said.fleetsChoice}</span
                >
              {/if}
            </span>
            <span class="text-pretty wrap-anywhere text-tx-2 type-meta"
              >{member.job}</span
            >
          </span>
        </button>
      </li>
    {/each}
  </ul>
</div>
