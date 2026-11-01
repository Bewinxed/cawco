<script lang="ts">
  /**
   * The map as a list (Outline): each state machine a section under its own
   * name, which stays at the list's top while its states scroll under it,
   * as a grouped list's section header does on iOS, so the part in view is
   * always named and never named twice. Each state is a row of its title and
   * its one line; the kept one stands on the selection's wash. A row
   * previews on hover and keeps on a press, as a node does.
   */
  import type { GraphComponent } from "./graph";

  let {
    graph,
    kept,
    onkeep,
    onpreview,
  }: {
    graph: GraphComponent;
    kept: string;
    onkeep: (id: string) => void;
    onpreview: (id: string | null) => void;
  } = $props();

  const sections = $derived(
    graph.machines
      .map((machine) => ({
        machine,
        states: graph.states.filter((one) => one.machine === machine),
      }))
      .filter((one) => one.states.length > 0)
  );
</script>

<div
  data-slot="state-outline"
  class="absolute inset-0 overflow-y-auto overscroll-contain px-space-3 pt-(--outline-top) pb-space-4"
>
  {#each sections as section (section.machine)}
    <section aria-label={section.machine} class="grid">
      <h3
        class="sticky top-0 z-1 m-0 bg-surface-well px-space-3 py-space-2 type-label text-ink-muted"
      >
        {section.machine}
      </h3>
      <ul class="m-0 grid list-none gap-space-1 p-0 pb-space-4">
        {#each section.states as state (state.id)}
          <li>
            <button
              class="grid w-full min-w-0 gap-space-row rounded-md px-space-3 py-space-2 text-start transition-control press-tint can-hover:hover:not-aria-current:bg-surface-hover aria-current:bg-selected-bg"
              aria-current={state.id === kept ? "true" : undefined}
              onclick={() => onkeep(state.id)}
              onpointerenter={(event) => {
                if (event.pointerType === "mouse") {
                  onpreview(state.id);
                }
              }}
              onpointerleave={() => onpreview(null)}
              type="button"
            >
              <span
                class="truncate type-label text-ink-row in-aria-current:text-selected-ink"
                >{state.title}</span
              >
              <span
                class="line-clamp-2 type-meta text-pretty text-ink-muted in-aria-current:text-selected-ink"
                >{state.line}</span
              >
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>
