<script lang="ts">
  /**
   * The journey (spec, Two ways of seeing the states): one machine's states
   * in its path's order, the kept one marked, and a step to the previous and
   * the next, which keeps that state so the stage shows it; where he stands
   * is said in words ("3 of 5, Saving"). Down the room where it is tall, or
   * across it in a strip where it is wide (`axis`).
   */
  import { holesOf, type Review } from "./model";
  import StateItem from "./StateItem.svelte";
  import Stepper from "./Stepper.svelte";

  let {
    review,
    machine,
    kept,
    keptVariant,
    compared,
    axis = "column",
    stepper = true,
    onpreview,
    onpress,
  }: {
    review: Review;
    /** The machine whose path it walks. */
    machine: string;
    kept: string;
    keptVariant: string | null;
    compared: string | null;
    axis?: "column" | "row";
    /** It draws its own step controls (none where the stage's head holds them). */
    stepper?: boolean;
    onpreview: (state: string, variant: string | null) => void;
    onpress: (state: string, variant: string) => void;
  } = $props();

  const path = $derived(
    review.machines.find((one) => one.name === machine)?.path ?? []
  );
  const at = $derived(path.indexOf(kept));
</script>

<div data-slot="journey" class="flex min-h-0 min-w-0 flex-1 flex-col">
  <ol
    class={[
      "m-0 flex min-h-0 min-w-0 flex-1 list-none gap-space-1 p-0",
      axis === "column"
        ? "flex-col overflow-y-auto"
        : "flex-row items-start overflow-x-auto pb-space-2",
    ]}
  >
    {#each path as id (id)}
      {@const state = review.states[id]}
      {#if state}
        <li class={["min-w-0", axis === "row" && "w-c-graph-node-w flex-none"]}>
          <StateItem
            compared={id === compared}
            holes={holesOf(review, id)}
            kept={id === kept}
            keptVariant={id === kept ? keptVariant : null}
            onpreview={(variant) => onpreview(id, variant)}
            onpress={(variant) => onpress(id, variant)}
            {state}
          />
        </li>
      {/if}
    {/each}
  </ol>

  {#if stepper}
    <div class="border-t border-border-hairline pt-space-2">
      <Stepper
        {at}
        {machine}
        name={review.states[kept]?.name ?? ""}
        onstep={(next) => onpress(next, next)}
        {path}
      />
    </div>
  {/if}
</div>
