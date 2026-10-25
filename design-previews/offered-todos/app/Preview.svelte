<!--
  Offered to-dos as a state machine: one state on screen at a time, at its
  production width, beside a grouped switcher drawn in a look of its own,
  plainly not the product's. Today (his live build and main, the list and
  the card) and Design (the designer's one option, built in the real
  TodoList.svelte and TaskCard.svelte) both name what is on show; Where is
  the desk's task pane at 462 or the phone at 390; Theme is light or dark.
  Every state is a link, `?__state=…`; the switcher moves between them
  without a reload, and the browser's back goes back.

  Every word drawn is tsk-16's own, as the hub holds it (tsk16.js), and
  the designer's copy.
-->
<script lang="ts">
  import Card from "./Card.svelte";
  import List from "./List.svelte";
  import { GROUPS, readState, viewOf, WHERE, writeState } from "./states.js";

  const read = () =>
    readState(new URLSearchParams(location.search).get("__state"));
  let state = $state(read());
  const key = $derived(writeState(state));
  const view = $derived(viewOf(state.view));
  const where = $derived(WHERE[state.where as keyof typeof WHERE]);
  const draws = $derived(view.draws as {
    list?: "live" | "main" | "design";
    data?: "today" | "offered" | "kept-one";
    press?: "drop-second" | "keep-all" | "keep-first-refused";
    card?: { done: number; total: number; offered?: number };
  });

  const hrefOf = (group: string, value: string) =>
    `?__state=${writeState({ ...state, [group]: value })}`;

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

<nav aria-label="Offered to-dos states" class="switcher" data-slot="switcher">
  {#each GROUPS as group (group.id)}
    <section aria-labelledby="group-{group.id}" class="group" data-group={group.id}>
      <h2 id="group-{group.id}">{group.label}</h2>
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
  <p class="key" data-slot="state-key">?__state={key}</p>
  <p class="caption" data-slot="caption">{view.caption}</p>
</nav>

<main
  aria-label="The state on show"
  class="stage"
  data-slot="stage"
  data-state={key}
  data-theme={state.theme}
  data-view={state.view}
  data-where={state.where}
>
  <!-- Keyed by the state: every state starts from its own first frame. -->
  {#key key}
    <article
      aria-label={where.label}
      class="frame"
      data-frame={state.where}
      data-kind={draws.card ? "card" : "list"}
      style:--frame-w="{where.width}px"
      style:--pane-inline={where.inline}
    >
      {#if draws.card}
        <div class="board" data-slot="region">
          <Card todos={draws.card} />
        </div>
      {:else}
        <header class="pane-head">
          <span class="pane-id">tsk-16</span>
          <h1 class="pane-title">Make the webkit-caw probe pass on obelisk</h1>
        </header>
        <div class="pane-body">
          <div data-slot="region">
            <List data={draws.data ?? "offered"} list={draws.list ?? "design"} press={draws.press} />
          </div>
        </div>
      {/if}
    </article>
  {/key}
</main>
