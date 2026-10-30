<script lang="ts">
  /**
   * The agent's dials (round 29: "what the agent put up for tuning on this
   * component"; the primitives spec §1.4): a CSS variable on every frame or
   * an arg through every frame's update, each its own control on one grid,
   * its figure Measured beside a number's slider. Two range over the kept
   * story's own records: a count, from 1 to the list's length, its figure
   * "12 of 60" (The Readable Labels rule, pin 27), and Longest names first.
   * A record dial whose arg is no list on the kept story stands disabled,
   * its reason its title. Under the graph they stand in a column; under the
   * step slider, a row that wraps past the bar's width. A change draws at
   * once on every frame, and the artifact keeps the values as `dials`.
   */
  import { type DialsModel, isCount } from "@cawco/core/design-graph";
  import type { CanvasDial } from "@cawco/core/stage";
  import { humanize } from "@cawco/core/tool-presentation";
  import { designGraphWords as words } from "@cawco/core/words/design-graph";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import type { DesignGraph } from "./design-graph.svelte";
  import { graphOptions } from "./options.svelte";

  let {
    graph,
    layout = "column",
  }: {
    graph: DesignGraph;
    /** Under the graph, a column; under the step slider, a row that wraps. */
    layout?: "column" | "row";
  } = $props();

  const isRecord = (dial: CanvasDial) =>
    dial.kind === "count" || dial.kind === "longest";
  /** Every dial: the record controls beside the agent's others (settled: Dessn's controls keep Data beside Layout). */
  const dials = $derived(graph.dials?.dials ?? []);
  const values = $derived<DialsModel["values"]>(graph.dials?.values ?? {});
  const numberOf = (dial: CanvasDial): number => {
    const value = values[dial.name];
    return typeof value === "number" ? value : (dial.min ?? 0);
  };
  /** A number's slider runs to the agent's max, else past its value. */
  const maxOf = (dial: CanvasDial): number =>
    dial.max ?? Math.max(1, numberOf(dial) * 4);
  /** A record dial's count of the kept story's list; `of: 0` where it holds none. */
  const countOf = (dial: CanvasDial) => {
    const value = values[dial.name];
    return isCount(value) ? value : { count: 0, of: 0 };
  };
  /** The list a record dial ranges over, by its arg: the count dial's figure says it. */
  const listOf = (dial: CanvasDial) => {
    const arg = "arg" in dial.target ? dial.target.arg : "";
    const counter = (graph.dials?.dials ?? []).find(
      (one) =>
        one.kind === "count" && "arg" in one.target && one.target.arg === arg
    );
    return counter ? countOf(counter) : null;
  };
  /** Why a record dial stands disabled: its arg is no list on the kept story. */
  const notAList = (dial: CanvasDial): string | null => {
    const list = dial.kind === "count" ? countOf(dial) : listOf(dial);
    return list && list.of > 0
      ? null
      : words.notAList(
          "arg" in dial.target ? dial.target.arg : dial.name,
          graph.keptHere ? humanize(graph.keptHere.story) : ""
        );
  };
  /** Call 3's first side (Dessn's controls): a count or a number as one field, its name and figure inside it. */
  const asField = (dial: CanvasDial) =>
    graphOptions.sides.countFigure === "field" &&
    (dial.kind === "count" || dial.kind === "number");
  /** A dial's name: the agent's label, else its name in words ("Rows", "Longest names"). */
  const nameOf = (dial: CanvasDial) =>
    dial.label ??
    (dial.kind === "longest" ? words.longestFirst : humanize(dial.name));
</script>

{#if dials.length > 0}
  <fieldset
    aria-label={words.dials}
    class={[
      "m-0 border-0 p-0",
      layout === "column"
        ? "grid max-h-(--most) flex-none grid-cols-(--cols) items-center gap-x-space-3 gap-y-space-1 overflow-y-auto overscroll-contain pt-space-2"
        : "flex flex-wrap items-center gap-x-space-4 gap-y-space-1 self-start rounded-panel px-space-3 py-space-1 before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:rounded-inherit before:border before:border-border-hairline before:bg-material-panel before:shadow-tile before:glass-backdrop contrast-more:before:bg-surface-raised reduced-transparency:before:bg-surface-raised relative min-w-0 max-w-full",
    ]}
    data-dials={layout}
    style:--cols="max-content minmax(0, 1fr) max-content"
    style:--most={layout === "column" ? "calc(6 * var(--c-row-h))" : undefined}
  >
    {#each dials as dial (dial.name)}
      {@const name = nameOf(dial)}
      {@const disabled = isRecord(dial) ? notAList(dial) : null}
      <div
        class={[
          "items-center",
          layout === "column"
            ? "col-span-full grid grid-cols-subgrid"
            : "flex min-h-c-btn-h-sm min-w-0 gap-space-2",
        ]}
        data-dial={dial.kind}
        title={disabled ?? undefined}
      >
        {#if asField(dial)}
          {@const list = countOf(dial)}
          {@const count = dial.kind === "count"}
          {@render field(
            dial,
            name,
            count ? Math.max(1, list.count) : numberOf(dial),
            count ? 1 : (dial.min ?? 0),
            count ? Math.max(1, list.of) : maxOf(dial),
            disabled
          )}
        {:else}
          <!-- In the row, the name keeps its words and the control gives way first; a long name truncates past the graph labels' measure. -->
          <span
            class={[
              "min-w-0 truncate type-meta text-ink-row",
              layout === "row" && "max-w-c-graph-label-max-w flex-none",
            ]}
            title={disabled ?? name}>{name}</span
          >
          {#if dial.kind === "count"}
            {@const list = countOf(dial)}
            <span
              class={[
                "flex min-w-0 items-center gap-space-2",
                layout === "row" && "shrink grow-0 basis-c-graph-node-w",
              ]}
            >
              <input
                aria-label={name}
                aria-valuetext={words.countOf(list.count, list.of)}
                class="min-w-0 flex-1 accent-ink-strong disabled:opacity-50"
                disabled={!!disabled}
                max={Math.max(1, list.of)}
                min={1}
                oninput={(event) =>
                  graph.dial(dial.name, Number(event.currentTarget.value))}
                step={1}
                type="range"
                value={Math.max(1, list.count)}
              />
            </span>
            <!-- The Measured figure, never cut: tabular figures at a width that holds "999 of 999". -->
            <output
              class="min-w-c-count-figure-w whitespace-nowrap text-end type-code text-ink-strong tabular-nums"
              data-count>{words.countOf(list.count, list.of)}</output
            >
          {:else if dial.kind === "longest"}
            <Switch
              aria-label={name}
              checked={values[dial.name] === true}
              class={layout === "column" ? "col-span-2 justify-self-start" : ""}
              disabled={!!disabled}
              onCheckedChange={(on) => graph.dial(dial.name, on)}
              size="sm"
            />
          {:else if dial.kind === "number"}
            <input
              aria-label={name}
              class={[
                "min-w-0 accent-ink-strong",
                layout === "row" && "shrink grow-0 basis-c-graph-node-w",
              ]}
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
              checked={values[dial.name] === true ||
                values[dial.name] === "true"}
              class="col-span-2 size-icon-md justify-self-start accent-ink-strong"
              onchange={(event) =>
                graph.dial(dial.name, event.currentTarget.checked)}
              type="checkbox"
            />
          {/if}
        {/if}
      </div>
    {/each}
  </fieldset>
{/if}

{#snippet field(
  dial: CanvasDial,
  name: string,
  value: number,
  min: number,
  max: number,
  disabled: string | null
)}
  <!-- Dessn's field: its name at the start and its figure at the end, inside it, its fill up to the value; the range under it all takes the hand and the keys. -->
  <label
    class={[
      "relative flex h-c-btn-h-sm min-w-0 items-center overflow-hidden rounded-pill bg-surface-fill has-[input:focus-visible]:outline-(length:--focus-ring-width) has-[input:focus-visible]:outline-focus-ring has-[input:focus-visible]:outline-offset-(--focus-ring-offset) has-disabled:opacity-50",
      layout === "column" ? "col-span-full" : "grow basis-c-graph-node-w",
    ]}
    data-field={dial.kind}
  >
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 start-0 w-(--to) rounded-pill bg-surface-fill-strong"
      style:--to={`calc(var(--c-btn-h-sm) + (100% - var(--c-btn-h-sm)) * ${max > min ? (value - min) / (max - min) : 1})`}
    ></span>
    <span
      class="relative min-w-0 flex-1 truncate ps-space-3 type-meta text-ink-row"
      >{name}</span
    >
    <output
      class="relative flex-none pe-space-3 ps-space-2 type-code text-ink-strong tabular-nums"
      data-count={dial.kind === "count" || undefined}
      >{#if dial.kind === "count"}{words.countOf(
          countOf(dial).count,
          countOf(dial).of
        )}{:else}{value}<span class="type-meta text-ink-muted"
          >{dial.unit ?? ""}</span
        >{/if}</output
    >
    <input
      aria-label={name}
      aria-valuetext={dial.kind === "count"
        ? words.countOf(countOf(dial).count, countOf(dial).of)
        : undefined}
      class="absolute inset-0 size-full cursor-ew-resize opacity-0 disabled:cursor-not-allowed"
      disabled={!!disabled}
      {max}
      {min}
      oninput={(event) =>
        graph.dial(dial.name, Number(event.currentTarget.value))}
      step={dial.kind === "count" ? 1 : (dial.step ?? "any")}
      title={disabled ?? undefined}
      type="range"
      {value}
    />
  </label>
{/snippet}
