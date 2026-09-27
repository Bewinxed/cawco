<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";
  import ChartStyle from "./chart-style.svelte";
  import { type ChartConfig, setChartContext } from "./chart-utils.js";

  const uid = $props.id();

  let {
    ref = $bindable(null),
    id = uid,
    class: className,
    children,
    config,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> & {
    config: ChartConfig;
  } = $props();

  const chartId = $derived(`chart-${id || uid.replace(/:/g, "")}`);

  setChartContext({
    get config() {
      return config;
    },
  });
</script>

<div
  class={cn(
		"flex aspect-video justify-center overflow-visible text-meta",
		// Overrides
		//
		// Stroke around dots/marks when hovering
		"[&_.lc-highlight-point]:stroke-transparent",
		// override the default stroke color of lines
		"[&_.lc-line]:stroke-border-a50",

		// by default, layerchart shows a line intersecting the point when hovering, this hides that
		"[&_.lc-highlight-line]:stroke-0",

		// by default, when you hover a point on a stacked series chart, it will drop the opacity
		// of the other series, this overrides that
		"[&_.lc-area-path]:opacity-100 [&_.lc-highlight-line]:opacity-100 [&_.lc-highlight-point]:opacity-100 [&_.lc-spline-path]:opacity-100 [&_.lc-text-svg]:overflow-visible [&_.lc-text]:text-meta",

		// We don't want the little tick lines between the axis labels and the chart, so we remove
		// the stroke. The alternative is to manually disable `tickMarks` on the x/y axis of every
		// chart.
		"[&_.lc-axis-tick]:stroke-0",

		// We don't want to display the rule on the x/y axis, as there is already going to be
		// a grid line there and rule ends up overlapping the marks because it is rendered after
		// the marks
		"[&_.lc-rule-x-line:not(.lc-grid-x-rule)]:stroke-0 [&_.lc-rule-y-line:not(.lc-grid-y-rule)]:stroke-0",
		"[&_.lc-grid-x-radial-circle]:stroke-border [&_.lc-grid-x-radial-line]:stroke-border",
		"[&_.lc-grid-y-radial-circle]:stroke-border [&_.lc-grid-y-radial-line]:stroke-border",

		// Legend adjustments
		"[&_.lc-legend-swatch-button]:items-center [&_.lc-legend-swatch-button]:gap-1.5",
		"[&_.lc-legend-swatch-group]:items-center [&_.lc-legend-swatch-group]:gap-4",
		"[&_.lc-legend-swatch]:size-2.5 [&_.lc-legend-swatch]:rounded-[2px]",

		// Labels
		"[&_.lc-labels-text:not([fill])]:fill-foreground [&_text]:stroke-transparent",

		// Tick labels on th x/y axes
		"[&_.lc-axis-tick-label]:fill-muted-foreground [&_.lc-axis-tick-label]:font-normal",
		"[&_.lc-tooltip-rects-g]:fill-transparent",
		"[&_.lc-layout-svg-g]:fill-transparent",
		"[&_.lc-root-container]:w-full",
		className
	)}
  data-chart={chartId}
  data-slot="chart"
  bind:this={ref}
  {...restProps}
>
  <ChartStyle {config} id={chartId} />
  {@render children?.()}
</div>

<style>
  /* layerchart tints its lines and surfaces by mixing the chart ink with
     transparent, which Safari 15.6 cannot do. The chart ink here is
     --ink-strong (layerchart falls back to currentColor), so these are the
     same tints as app alpha steps. layerchart's selectors are all :where(),
     so one class wins. Its .debug styles are left alone: no chart here sets
     `debug`. */
  [data-slot="chart"] :global(:is(.lc-axis-rule, .lc-axis-tick)) {
    --stroke-color: var(--ink-strong-a50);
  }
  [data-slot="chart"]
    :global(
      :is(
        .lc-rule-x-line,
        .lc-rule-y-line,
        .lc-rule-x-radial-line,
        .lc-rule-y-radial-circle
      ):not([class*="lc-axis"], [class*="lc-grid"])
    ) {
    --stroke-color: var(--ink-strong-a50);
  }
  [data-slot="chart"]
    :global(
      :is(
        .lc-axis-grid,
        .lc-grid-x-rule,
        .lc-grid-x-end-rule,
        .lc-grid-x-radial-line,
        .lc-grid-y-rule,
        .lc-grid-y-end-rule,
        .lc-grid-y-radial-line,
        .lc-grid-y-radial-circle
      )
    ) {
    --stroke-color: var(--ink-strong-a10);
  }
  [data-slot="chart"] :global(.lc-highlight-area) {
    --fill-color: var(--ink-strong-a5);
  }
  [data-slot="chart"] :global(.lc-highlight-line) {
    --stroke-color: var(--ink-strong-a20);
  }
  [data-slot="chart"] :global(.lc-brush-range) {
    background: var(--ink-strong-a10);
  }
  [data-slot="chart"] :global(.lc-tooltip-header) {
    border-bottom-color: var(--ink-strong-a20);
  }
  [data-slot="chart"] :global(.lc-tooltip-separator) {
    background-color: var(--ink-strong-a20);
  }
  [data-slot="chart"] :global(.lc-tooltip-container[data-variant="default"]) {
    background-color: var(--surface-raised-a90);
  }
  [data-slot="chart"]
    :global(.lc-tooltip-container[data-variant="default"] .label) {
    color: var(--ink-strong-a75);
  }
  [data-slot="chart"] :global(.lc-tooltip-container[data-variant="invert"]) {
    background-color: var(--ink-strong-a90);
  }
  [data-slot="chart"]
    :global(.lc-tooltip-container[data-variant="invert"] .label) {
    color: var(--surface-raised-a50);
  }
</style>
