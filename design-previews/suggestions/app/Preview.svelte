<!--
  The suggestions preview as a state machine (the owner: "just take the
  approach of the state machine and do it in a preview page"; "i need to
  judge BOTH" how they are arranged and how they look). One state on screen
  at a time, at its production width, beside a grouped switcher drawn in a
  look of its own, plainly not the product's: Direction (Today and the three
  new directions from the designer's report), Where (Caw's thread at 380,
  the empty board at 725, the phone at 390, and the phone with its keyboard
  up where the direction has it), Data (the direction's own states, the ones
  it hasn't hidden) and Theme. Every state is a link, `?__state=…`; the
  switcher moves between them without a reload, and the browser's back
  goes back. A loading state holds still until the switcher moves.

  Every word a direction draws is the owner's own starters as the hub wrote
  them (starters.js), and the designer's own copy.
-->
<script lang="ts">
  import {
    drawsOf,
    groupsOf,
    noteOf,
    readState,
    WHERE,
    writeState,
  } from "./states.js";
  import CawStill from "./CawStill.svelte";
  import Drafts from "./directions/Drafts.svelte";
  import Ledger from "./directions/Ledger.svelte";
  import Today from "./directions/Today.svelte";
  import Tray from "./directions/Tray.svelte";

  const DRAWN = { today: Today, drafts: Drafts, ledger: Ledger, tray: Tray };

  const read = () =>
    readState(new URLSearchParams(location.search).get("__state"));
  let state = $state(read());
  const key = $derived(writeState(state));
  const groups = $derived(groupsOf(state.direction));
  const draws = $derived(drawsOf(state));
  const Direction = $derived(DRAWN[state.direction as keyof typeof DRAWN]);
  const where = $derived(WHERE[state.where as keyof typeof WHERE]);

  const hrefOf = (group: string, value: string) =>
    `?__state=${writeState(readState(writeState({ ...state, [group]: value })))}`;

  /** A switcher link followed in place: the state moves, the page stays. */
  function follow(event: MouseEvent, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    history.pushState(null, "", href);
    state = read();
  }

  $effect(() => {
    const back = () => (state = read());
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  });

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

<nav aria-label="Suggestions states" class="switcher" data-slot="switcher">
  {#each groups as group (group.key)}
    <section aria-labelledby="group-{group.key}" class="group" data-group={group.key}>
      <h2 id="group-{group.key}">{group.label}</h2>
      <ul>
        {#each group.entries as entry (entry.value)}
          {@const href = hrefOf(group.key, entry.value)}
          <li>
            <a
              aria-current={state[group.key as keyof typeof state] === entry.value ? "page" : undefined}
              data-entry={entry.value}
              {href}
              onclick={(event) => follow(event, href)}>{entry.label}</a
            >
          </li>
        {/each}
      </ul>
    </section>
  {/each}
  {#if noteOf(state.direction)}
    <p class="note" data-slot="note">{noteOf(state.direction)}</p>
  {/if}
  <p class="key" data-slot="state-key">?__state={key}</p>
</nav>

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
