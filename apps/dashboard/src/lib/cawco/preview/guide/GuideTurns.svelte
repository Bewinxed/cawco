<script lang="ts" module>
  /** One turn of the conversation: who, when, and their words. */
  export interface GuideTurn {
    at: string;
    by: "agent" | "person";
    id: string;
    text: string;
  }
</script>

<script lang="ts">
  /**
   * The conversation's turns as the transcript draws them (MessageRow: Turn,
   * Who, MessageBody; the reader's words in their Well), and under an
   * agent's turn whatever an option attaches there (`under`).
   */
  import type { Snippet } from "svelte";
  import MessageBody from "../../MessageBody.svelte";
  import Turn from "../../turn/Turn.svelte";
  import Well from "../../turn/Well.svelte";
  import Who from "../../turn/Who.svelte";
  import { AGENT } from "./fixture";

  let {
    turns,
    under,
  }: {
    turns: GuideTurn[];
    /** What stands under an agent's turn, by its id. */
    under?: Snippet<[string]>;
  } = $props();
</script>

{#each turns as turn, i (turn.id)}
  {@const grouped = turns[i - 1]?.by === turn.by}
  {#if turn.by === "person"}
    <Turn {grouped} you>
      {#if !grouped}<Who name="You" timestamp={turn.at} you />{/if}
      <Well {grouped}><MessageBody source={turn.text} wrap="pretty" /></Well>
    </Turn>
  {:else}
    <Turn {grouped}>
      <Who {grouped} name={AGENT} timestamp={turn.at} />
      <MessageBody source={turn.text} wrap="pretty" />
      {@render under?.(turn.id)}
    </Turn>
  {/if}
{/each}
