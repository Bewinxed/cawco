<!--
  Today: the real Suggestions.svelte (lib/cawco/suggestions), as main has
  it, in its default look, in the place it stands: under Caw in a thread
  nothing has been said in (its title "What’s next for Cawco?"), or as the
  empty board's one action ("Nothing on the board yet"). A press puts the
  words in the composer, the caret after them, nothing sent. Its states
  are the stopped state builder's (states.ts): three, one, seven, longest,
  no reasons, loading.
-->
<script lang="ts">
  import Suggestions from "../../../../apps/dashboard/src/lib/cawco/suggestions/Suggestions.svelte";
  import { IN_THE_BOX, putIn } from "../clock.js";
  import CawStill from "../CawStill.svelte";
  import Composer from "../Composer.svelte";

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
  const board = $derived(where === "board");
</script>

<div class="today" data-direction="today" data-where={where}>
  <div class="hero">
    <CawStill class="caw" size={80} />
    <h2 class="title">{board ? "Nothing on the board yet" : "What’s next for Cawco?"}</h2>
    <div class="action">
      <Suggestions
        label="Things to ask Caw"
        loading={draws.loading ? 3 : 0}
        onpick={(s) => {
          putIn(field, s.text);
          value = s.text;
          said = IN_THE_BOX;
        }}
        placement={board ? "panel" : "thread"}
        suggestions={draws.items as never}
      />
    </div>
  </div>
  <div class="foot"><Composer bind:field bind:value /></div>
  <p aria-live="polite" class="sr-only">{said}</p>
</div>

<style>
  .today {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    block-size: 100%;
    min-block-size: 0;
  }

  .hero {
    display: grid;
    justify-items: start;
    gap: var(--space-2);
    min-inline-size: 0;
  }

  .hero :global(.caw) {
    inline-size: var(--c-caw-hero);
    block-size: var(--c-caw-hero);
    margin-block-end: var(--space-3);
    object-fit: contain;
  }

  .title {
    margin: 0;
    font: var(--type-title);
    letter-spacing: var(--track-title);
    text-wrap: balance;
  }

  .action {
    inline-size: 100%;
    min-inline-size: 0;
    margin-block-start: var(--space-4);
  }

  .foot {
    margin-block-start: auto;
  }
</style>
