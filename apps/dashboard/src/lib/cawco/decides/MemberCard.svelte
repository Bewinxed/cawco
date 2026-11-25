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
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { reflow } from "#lib/platform/motion/rows.svelte.js";
  import type { Facts } from "./decides.svelte";
  import MemberFace from "./MemberFace.svelte";
  import { ROSTER_WORDS, type RosterWords } from "./roster-words";

  let {
    member,
    facts,
    project,
    tiles,
    editing = false,
    parked = false,
    over = false,
    card = $bindable(),
    pencil,
    said = ROSTER_WORDS,
    brief = false,
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
    /** A dragged kind's tile is over it, from another card (kind-dnd.svelte.ts). */
    over?: boolean;
    /** The pencil that opens its settings; none for members with none. */
    pencil?: Snippet;
    /** Its words: Who decides' unless the surface drawing it says its own. */
    said?: RosterWords;
    /** Its name alone, its job in the house tooltip on its head (Roster `brief`). */
    brief?: boolean;
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
    "row-span-3 grid min-w-0 grid-rows-subgrid gap-y-space-2 rounded-lg bg-bg p-space-3 text-tx shadow-sm transition-control data-over:bg-ui data-over:inset-ring-1 data-over:inset-ring-accent",
    editing && "inset-ring-2 inset-ring-accent",
  ]}
  data-editing={editing || undefined}
  data-member={member.id}
  data-over={over || undefined}
  style:--stand-in="calc(calc(var(--spacing) * 12) + var(--spacing-space-3))"
>
  {#snippet head(props: Record<string, unknown> = {})}
    <div
      {...props}
      class={["flex gap-x-space-3", brief ? "items-center" : "items-start"]}
    >
      <MemberFace {member} size={48} />
      <div class="flex min-w-0 flex-auto flex-col">
        <div class="flex min-w-0 items-start gap-x-space-1">
          <h2
            class="min-w-0 flex-auto font-medium wrap-anywhere type-body"
            id="member-{member.id}"
          >
            {member.name}
          </h2>
          {@render pencil?.()}
        </div>
        <p
          class={[
            "text-pretty wrap-anywhere text-tx-2 type-meta",
            brief && "sr-only",
          ]}
        >
          {member.job}
        </p>
      </div>
    </div>
  {/snippet}
  {#if brief}
    <Tip label={member.job} tap>
      {#snippet children(props)}
        {@render head(props)}
      {/snippet}
    </Tip>
  {:else}
    {@render head()}
  {/if}
  <p
    class={[
      "ps-(--stand-in) text-pretty wrap-anywhere type-meta",
      facts?.attention ? "text-orange" : "text-tx-2",
    ]}
  >
    {#if parked && facts?.text}
      {facts.text} ·
      <span class="text-tx">{decidesWords.unsaved}</span>
    {:else}
      {factsLine}
    {/if}
  </p>
  <!-- Its tiles are a reflow list: a tile arriving opens its place, one
       leaving closes it (Roster). -->
  <div class="flex min-w-0 flex-col gap-space-2" {@attach reflow()}>
    {#if tiles}
      {@render tiles()}
    {:else}
      <p
        class="rounded-sm border border-dashed border-ui-2 px-space-3 py-space-4 text-center text-pretty text-tx-2 type-meta"
      >
        {project === null
          ? decidesWords.holdsNothingFleet
          : said.holdsNothing(project)}
      </p>
    {/if}
  </div>
</article>
