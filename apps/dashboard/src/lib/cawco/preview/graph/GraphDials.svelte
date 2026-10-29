<script lang="ts">
  /**
   * The agent's dials under its graph (round 29: "what the agent put up for
   * tuning on this component"): a CSS variable on every frame or an arg
   * through every frame's update, each its own control on one grid, its
   * figure Measured beside a number's slider. A change draws at once on
   * every frame, and the artifact keeps the values as `dials`.
   */
  import type { CanvasDial } from "@cawco/core/stage";
  import { designGraphWords as words } from "@cawco/core/words/design-graph";
  import type { DesignGraph } from "./design-graph.svelte";

  let { graph }: { graph: DesignGraph } = $props();

  const dials = $derived(graph.dials?.dials ?? []);
  const values = $derived(graph.dials?.values ?? {});
  const numberOf = (dial: CanvasDial): number => {
    const value = values[dial.name];
    return typeof value === "number" ? value : (dial.min ?? 0);
  };
  /** A number's slider runs to the agent's max, else past its value. */
  const maxOf = (dial: CanvasDial): number =>
    dial.max ?? Math.max(1, numberOf(dial) * 4);
</script>

{#if dials.length > 0}
  <fieldset
    aria-label={words.dials}
    class="m-0 grid flex-none grid-cols-(--cols) items-center gap-x-space-3 gap-y-space-1 border-0 p-0 pt-space-2"
    data-dials
    style:--cols="max-content minmax(0, 1fr) max-content"
  >
    {#each dials as dial (dial.name)}
      {@const name = dial.label ?? dial.name}
      <div class="col-span-full grid grid-cols-subgrid items-center">
        <span class="min-w-0 truncate type-meta text-ink-row">{name}</span>
        {#if dial.kind === "number"}
          <input
            aria-label={name}
            class="min-w-0 accent-ink-strong"
            max={maxOf(dial)}
            min={dial.min ?? 0}
            oninput={(event) =>
              graph.dial(dial.name, Number(event.currentTarget.value))}
            step={dial.step ?? "any"}
            type="range"
            value={numberOf(dial)}
          />
          <output class="type-code text-ink-strong tabular-nums"
            >{numberOf(dial)}<span class="type-meta text-ink-muted"
              >{dial.unit ?? ""}</span
            ></output
          >
        {:else if dial.kind === "color"}
          <input
            aria-label={name}
            class="h-c-btn-h-xs w-full min-w-0 rounded-xs border border-border-control bg-transparent"
            oninput={(event) =>
              graph.dial(dial.name, event.currentTarget.value)}
            type="color"
            value={String(values[dial.name] ?? "#000000")}
          />
          <output class="type-code text-ink-muted"
            >{String(values[dial.name] ?? "")}</output
          >
        {:else if dial.kind === "select"}
          <select
            aria-label={name}
            class="col-span-2 h-c-btn-h-sm min-w-0 rounded-md border border-border-button-outline bg-surface-raised px-space-2 type-body text-ink-strong"
            onchange={(event) =>
              graph.dial(dial.name, event.currentTarget.value)}
            value={String(values[dial.name] ?? dial.options?.[0] ?? "")}
          >
            {#each dial.options ?? [] as option (option)}
              <option value={option}>{option}</option>
            {/each}
          </select>
        {:else}
          <input
            aria-label={name}
            checked={values[dial.name] === true || values[dial.name] === "true"}
            class="col-span-2 size-icon-md justify-self-start accent-ink-strong"
            onchange={(event) =>
              graph.dial(dial.name, event.currentTarget.checked)}
            type="checkbox"
          />
        {/if}
      </div>
    {/each}
  </fieldset>
{/if}
