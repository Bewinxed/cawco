<!--
  The suggestions preview as a state machine (the owner: "just take the
  approach of the state machine and do it in a preview page"; "i need to
  judge BOTH" how they are arranged and how they look). One state on screen
  at a time, at its production width, in the stage of the shared switcher
  (../../state-switcher.js, mounted by main.js): Direction (Today and the
  three new directions from the designer's report), Where (Caw's thread at
  380, the empty board at 725, the phone at 390, and the phone with its
  keyboard up where the direction has it), Data (the direction's own
  states, the ones it hasn't hidden) and Theme. The switcher moves between
  them without a reload and `show` draws the state it names. A loading
  state holds still until the switcher moves.

  Every word a direction draws is the owner's own starters as the hub wrote
  them (starters.js), and the designer's own copy.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { drawsOf, noteOf, WHERE, writeState } from "./states.js";
  import CawStill from "./CawStill.svelte";
  import Drafts from "./directions/Drafts.svelte";
  import Ledger from "./directions/Ledger.svelte";
  import Today from "./directions/Today.svelte";
  import Tray from "./directions/Tray.svelte";

  type State = { direction: string; where: string; data: string; theme: string };

  const DRAWN = { today: Today, drafts: Drafts, ledger: Ledger, tray: Tray };

  let { initial }: { initial: State } = $props();
  let state = $state(untrack(() => initial));
  const key = $derived(writeState(state));
  const draws = $derived(drawsOf(state));
  const Direction = $derived(DRAWN[state.direction as keyof typeof DRAWN]);
  const where = $derived(WHERE[state.where as keyof typeof WHERE]);

  /** The state the switcher names, drawn. */
  export function show(next: State) {
    state = next;
  }

  /** The theme the state names, flipped with every transition off for the flip. */
  $effect(() => {
    const root = document.documentElement;
    root.dataset.flipping = "";
    root.classList.toggle("dark", state.theme === "dark");
    getComputedStyle(root).color;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => delete root.dataset.flipping)
    );
  });
</script>

{#if noteOf(state.direction)}
  <p class="note" data-slot="note">{noteOf(state.direction)}</p>
{/if}

<main
  aria-label="The state on show"
  class="stage"
  data-data={state.data}
  data-direction={state.direction}
  data-slot="stage"
  data-state={key}
  data-theme={state.theme}
  data-where={state.where}
>
  <!-- Keyed by the state: every state starts from its own first frame. -->
  {#key key}
    <article
      aria-label={where.label}
      class="frame"
      data-frame={state.where}
      style:--frame-w="{where.width}px"
    >
      {#if state.where !== "board"}
        <header class="panel-head">
          <CawStill class="panel-mark" size={28} />
          <span class="panel-words"><strong>Caw</strong><span>Cawco</span></span>
        </header>
      {/if}
      <div class="body">
        <Direction {draws} where={state.where} />
      </div>
      {#if state.where === "keyboard"}
        <div aria-hidden="true" class="keyboard" data-slot="keyboard">
          <span>Keyboard</span>
        </div>
      {/if}
    </article>
  {/key}
</main>
