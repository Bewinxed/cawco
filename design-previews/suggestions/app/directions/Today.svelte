<!--
  Today: the real Suggestions.svelte (lib/cawco/suggestions), as main has
  it, in its default look, in the place it stands: under Caw in a thread
  nothing has been said in, or as the empty board's one action, in the
  surroundings every direction shares (Surround). A press puts the words in
  the composer, the caret after them, nothing sent. Its states are the
  stopped state builder's (states.ts): three, one, seven, longest, no
  reasons, loading.
-->
<script lang="ts">
  import Suggestions from "../../../../apps/dashboard/src/lib/cawco/suggestions/Suggestions.svelte";
  import { IN_THE_BOX, putIn } from "../clock.js";
  import Composer from "../Composer.svelte";
  import Surround from "../Surround.svelte";

  type Item = { text: string; reason?: string; glyph?: string };
  let {
    draws,
    where,
  }: {
    draws: { items: Item[]; loading: boolean };
    where: string;
  } = $props();

  let value = $state("");
  let said = $state("");
  let field = $state<HTMLTextAreaElement>();
</script>

{#snippet set()}
  <Suggestions
    label="Things to ask Caw"
    loading={draws.loading ? 3 : 0}
    onpick={(s) => {
      putIn(field, s.text);
      value = s.text;
      said = IN_THE_BOX;
    }}
    placement={where === "board" ? "panel" : "thread"}
    suggestions={draws.items as never}
  />
{/snippet}

{#snippet foot()}
  <Composer bind:field bind:value focused={where === "keyboard"} />
{/snippet}

<div class="direction" data-direction="today">
  <Surround {foot} {set} {where} />
  <p aria-live="polite" class="sr-only">{said}</p>
</div>

<style>
  .direction {
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
  }
</style>
