<script lang="ts">
  /**
   * One state in the states list (spec, The states), the app's list row
   * (DESIGN.md, The Row Dress Rule): its name in label, its own note under
   * it in meta, two lines at most, the whole note in its tooltip. One
   * press keeps it, so the stage shows it; while comparing, a press
   * compares the kept state with it instead. Resting the pointer on it
   * lights the row and nothing else.
   *
   * The state on the stage is the list's selection, as the app's own lists
   * mark their current row (the sidebar, the Comments rail; DESIGN.md,
   * Colors: Selected): the selection pill under it (Journey's `highlight`)
   * with every word in `selected-ink`; the hover ghost is the list's too.
   * Only it shows its
   * record sets, as the kit's toggle group under its name: the state as
   * written is the one with none picked. The state it is compared with
   * wears the change ring's edge, the stage's mark for what differs.
   *
   * A pin on it is named by its name ("Failed save"), its note its
   * description.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import type { GraphState } from "./model";

  let {
    state,
    kept = false,
    keptVariant = null,
    against = false,
    onpress,
  }: {
    state: GraphState;
    /** It is the state on the stage. */
    kept?: boolean;
    /** The record set the stage shows, when it is this state's. */
    keptVariant?: string | null;
    /** It is the state the kept one is compared with. */
    against?: boolean;
    /** It, or one of its record sets (null: as written), was pressed. */
    onpress: (variant: string | null) => void;
  } = $props();

  const uid = $props.id();
  const noteId = `${uid}-note`;
</script>

<div
  data-slot="state-item"
  data-kept={kept ? "" : undefined}
  data-against={against ? "" : undefined}
  class={[
    "relative flex min-w-0 flex-col rounded-sm",
    against &&
      "outline-solid outline-(length:--c-change-ring-width) outline-c-change-ring",
  ]}
>
  <!-- The row's press: the name's button reaches over the whole row (its
       ::before), so a press anywhere on it is the button's and a pin on it
       is named by the name alone. -->
  <div
    class="relative flex min-h-c-touch-floor min-w-0 flex-col justify-center gap-space-row rounded-sm px-space-3 py-space-2"
  >
    <button
      type="button"
      aria-current={kept ? "true" : undefined}
      aria-describedby={state.note ? noteId : undefined}
      title={state.note ?? undefined}
      class={[
        "min-w-0 text-start type-label wrap-anywhere outline-none before:absolute before:inset-0 before:rounded-sm focus-visible:before:outline-(length:--focus-ring-width) focus-visible:before:outline-solid focus-visible:before:outline-focus-ring focus-visible:before:-outline-offset-2",
        kept ? "text-selected-ink" : "text-ink-row",
      ]}
      onclick={() => onpress(null)}
    >
      {state.name}{#if against}<span class="sr-only"
          >, {words.comparedWith(state.name)}</span
        >{/if}
    </button>
    {#if state.note}
      <span
        id={noteId}
        class={[
          "line-clamp-2 min-w-0 type-meta text-pretty wrap-anywhere",
          kept ? "text-selected-ink" : "text-ink-muted",
        ]}>{state.note}</span
      >
    {/if}
  </div>

  {#if kept && state.variants.length > 0}
    <!-- Its record sets, on the stage's state alone: none picked is the state as written. -->
    <div class="min-w-0 overflow-x-auto px-space-3 pb-space-2">
      <ToggleGroup.Root
        aria-label={words.variants(state.name)}
        onValueChange={(next: string) => onpress(next || null)}
        type="single"
        value={keptVariant ?? ""}
      >
        {#each state.variants as variant (variant.id)}
          <ToggleGroup.Item value={variant.id}>
            <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
              ><span class="sr-only">{words.variantOf(state.name)}</span
              >{variant.name}</span
            >
          </ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
    </div>
  {/if}
</div>
