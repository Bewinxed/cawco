<script lang="ts">
  import Colour from "./Colour.svelte";
  import Elevation from "./Elevation.svelte";
  /**
   * One foundation group (foundations.ts) drawn in the scheme of the pane
   * it stands in: every token renders through `var()` or its `type-*` utility
   * and reports what the browser computes for it there. No values are duplicated.
   */
  import type { Foundation, Kind } from "./foundations.js";
  import Layout from "./Layout.svelte";
  import Spacing from "./Spacing.svelte";

  let {
    foundation,
    pair,
  }: {
    foundation: Foundation;
    /** The font pair the board is set in: a new one reads the faces again. */
    pair?: string;
  } = $props();

  /** What the page computed for each specimen, read once after layout. */
  let readings = $state.raw(new Map<string, string>());

  /** The CSS property each token kind probes and reads back. */
  const PROPERTY: Record<Kind, string> = {
    colour: "background-color",
    face: "font-family",
    size: "font-size",
    leading: "line-height",
    tracking: "letter-spacing",
    weight: "font-weight",
    type: "font-size",
    space: "width",
    measure: "width",
    radius: "border-top-left-radius",
    shadow: "box-shadow",
    duration: "transition-duration",
    ease: "transition-timing-function",
    breakpoint: "width",
    layer: "z-index",
  };

  /** Static utility classes for each type role so Tailwind emits them. */
  const TYPE_CLASS: Record<string, string> = {
    "type-meta": "type-meta",
    "type-code": "type-code liga-none",
    "type-body": "type-body",
    "type-label": "type-label",
    "type-title": "type-title",
    "type-kpi": "type-kpi",
  };

  /** Sets the token on its probe element so the single pass reads it back. */
  const probe = (kind: Kind, name: string) => (node: HTMLElement) => {
    if (kind !== "type") {
      node.style.setProperty(PROPERTY[kind], `var(${name})`);
    }
    node.dataset.token = name;
    node.dataset.kind = kind;
    node.dataset.property = PROPERTY[kind];
  };

  /** Reads every probe in one animation frame to avoid interleaved reflows. */
  const readAll = (_pair: string | undefined) => (node: HTMLElement) => {
    const frame = requestAnimationFrame(() => {
      const read = new Map<string, string>();
      for (const one of node.querySelectorAll<HTMLElement>("[data-token]")) {
        const { token, kind, property } = one.dataset;
        if (!(token && property)) {
          continue;
        }
        const style = getComputedStyle(one);
        if (kind === "type") {
          read.set(
            token,
            `${style.fontSize} on ${style.lineHeight} · ${style.fontWeight} · ${firstFace(style.fontFamily)}`
          );
        } else {
          read.set(token, style.getPropertyValue(property));
        }
      }
      readings = read;
    });
    return () => cancelAnimationFrame(frame);
  };

  /** Multi-shelf wide groups flow across two columns when roomy. */
  const flowing = $derived(foundation.shelves.length >= 4 && foundation.wide);

  /** A token's name past its kind prefix: `--color-bg-2` -> "bg-2". */
  const short = (name: string) => name.replace(KIND_PREFIX, "");

  /** Seconds or milliseconds as a number of milliseconds. */
  function millis(value: string | undefined): number {
    const seconds = Number.parseFloat(value ?? "");
    if (Number.isNaN(seconds)) {
      return 0;
    }
    return value?.trim().endsWith("ms") ? seconds : seconds * 1000;
  }

  /** A token name's kind prefix stripped for display. */
  const KIND_PREFIX =
    /^--(?:color|font-weight|font|text|leading|tracking|spacing|radius|shadow|duration|ease|breakpoint|container|layer)-/u;

  const BEZIER = /cubic-bezier\(([^)]+)\)/u;
  /** A cubic-bezier's curve as an SVG path in a 100 by 100 box, y up. */
  function curve(value: string | undefined): string | null {
    const match = value?.match(BEZIER);
    if (!match) {
      return null;
    }
    const [x1, y1, x2, y2] = match[1].split(",").map(Number);
    return `M0 100 C${x1 * 100} ${100 - y1 * 100} ${x2 * 100} ${100 - y2 * 100} 100 0`;
  }

  /** The board's own names for a pair's faces (type-pairs.css). */
  const PAIR_PREFIX = /^Pair /u;
  /** The first family a face names. */
  const firstFace = (value: string | undefined) =>
    value?.split(",")[0]?.replaceAll('"', "").replace(PAIR_PREFIX, "").trim() ??
    "";

  /** Each type role: a line of what it sets in the product, and what it is for. */
  const ROLE: Record<string, { sample: string; use: string }> = {
    "type-kpi": { sample: "14,280", use: "A figure read at a glance" },
    "type-title": {
      sample: "Deploy the hub to obelisk-of-light",
      use: "The head of a screen, sheet or card",
    },
    "type-label": {
      sample: "Machine",
      use: "A control, a field's name, a row's name",
    },
    "type-body": {
      sample: "The session finished its checks and waits for your review.",
      use: "Reading text",
    },
    "type-meta": {
      sample: "2 min ago · studio-mac · 3 files",
      use: "Times, counts and facts beside a name",
    },
    "type-code": {
      sample: "bun run check --all",
      use: "Commands, paths and output",
    },
  };
</script>

{#if foundation.inUse === "colour"}
  <Colour />
{:else if foundation.inUse === "spacing"}
  <Spacing />
{:else if foundation.inUse === "elevation"}
  <Elevation />
{:else if foundation.inUse === "layout"}
  <Layout />
{:else}
  <div
    class={flowing ? "columns-2 gap-space-4" : "flex flex-col gap-space-4"}
    {@attach readAll(pair)}
  >
    {#each foundation.shelves.filter((one) => one.names.length > 0) as shelf (shelf.title)}
      <div
        class={[
          "flex flex-col gap-space-2",
          flowing && "mb-space-4 break-inside-avoid",
        ]}
      >
        {#if foundation.shelves.length > 1}
          <h4 class="text-tx-2 type-meta">{shelf.title}</h4>
        {/if}
        {#if shelf.kind === "colour"}
          <ul class="flex flex-col gap-space-1">
            {#each shelf.names as name (name)}
              <li class="flex min-w-0 items-center gap-space-2">
                <span
                  class="size-5 flex-none rounded-xs ring ring-ui"
                  {@attach probe(shelf.kind, name)}
                ></span>
                <span class="truncate type-meta">{short(name)}</span>
              </li>
            {/each}
          </ul>
        {:else if shelf.kind === "type"}
          <ul class="flex flex-col gap-space-4">
            {#each shelf.names as name (name)}
              <li class="flex items-baseline justify-between gap-space-6">
                <span
                  class={["min-w-0 text-tx", TYPE_CLASS[name]]}
                  {@attach probe(shelf.kind, name)}
                >
                  {ROLE[name]?.sample}
                </span>
                <span class="flex flex-col items-end text-right">
                  <span class="type-label">{name.replace("type-", "")}</span>
                  <span class="text-tx-2 type-meta">{ROLE[name]?.use}</span>
                  <span class="text-tx-2 tabular-nums type-meta"
                    >{readings.get(name)}</span
                  >
                </span>
              </li>
            {/each}
          </ul>
        {:else if shelf.kind === "face" || shelf.kind === "size" || shelf.kind === "leading" || shelf.kind === "tracking" || shelf.kind === "weight"}
          <ul class="flex flex-col gap-space-3">
            {#each shelf.names as name (name)}
              <li class="flex min-w-0 flex-col gap-space-1">
                <span
                  class={[
                    "min-w-0 text-tx",
                    shelf.kind === "leading" && "max-w-48 type-body",
                  ]}
                  {@attach probe(shelf.kind, name)}
                >
                  {shelf.kind === "leading"
                    ? "The session on obelisk-of-light finished its checks and waits for your review."
                    : "Move the session to studio-mac"}
                </span>
                <span class="text-tx-2 type-meta">
                  {short(name)} · {shelf.kind === "face"
                    ? firstFace(readings.get(name))
                    : readings.get(name)}
                </span>
              </li>
            {/each}
          </ul>
        {:else if shelf.kind === "space" || shelf.kind === "breakpoint"}
          <ul class="flex flex-col gap-space-2">
            {#each shelf.names as name (name)}
              <li class="flex items-center gap-space-3">
                <span class="w-32 flex-none truncate type-meta">
                  {name === "--spacing" ? "unit" : short(name)}
                  <span class="text-tx-2 tabular-nums"
                    >{readings.get(name)}</span
                  >
                </span>
                <span class="min-w-0 flex-1 overflow-clip">
                  <span
                    class={[
                      "block h-2 rounded-xs bg-accent",
                      shelf.kind === "space" && "max-w-full",
                      shelf.kind === "breakpoint" && "origin-left scale-x-25",
                    ]}
                    {@attach probe(shelf.kind, name)}
                  ></span>
                </span>
              </li>
            {/each}
          </ul>
        {:else if shelf.kind === "measure"}
          <ul class="flex flex-col gap-space-2">
            {#each shelf.names as name (name)}
              <li class="flex items-center gap-space-3">
                <span class="w-32 flex-none truncate type-meta">
                  {short(name)}
                  <span class="text-tx-2 tabular-nums"
                    >{readings.get(name)}</span
                  >
                </span>
                <span class="min-w-0 flex-1 overflow-clip">
                  <span
                    class="block h-2 origin-left scale-x-25 rounded-xs bg-accent"
                    {@attach probe(shelf.kind, name)}
                  ></span>
                </span>
              </li>
            {/each}
          </ul>
        {:else if shelf.kind === "layer"}
          <ul class="flex flex-col gap-space-2">
            {#each shelf.names as name (name)}
              {@const z = Number.parseInt(readings.get(name) ?? "0", 10) || 0}
              <li class="flex items-center gap-space-3">
                <span
                  class="w-32 flex-none truncate type-meta"
                  {@attach probe(shelf.kind, name)}
                >
                  {short(name)}
                  <span class="text-tx-2 tabular-nums">{z}</span>
                </span>
                <span class="min-w-0 flex-1 overflow-clip">
                  <span
                    class="block h-2 w-(--bar) max-w-full rounded-xs bg-tx-2"
                    style:--bar={`${Math.min(100, (z / 160) * 100)}%`}
                  ></span>
                </span>
              </li>
            {/each}
          </ul>
        {:else if shelf.kind === "radius" || shelf.kind === "shadow"}
          <ul class="flex flex-wrap gap-space-4">
            {#each shelf.names as name (name)}
              <li class="flex w-24 flex-col gap-space-2">
                <span
                  class={[
                    "block size-16 bg-bg",
                    shelf.kind === "radius" && "ring ring-ui-2",
                    shelf.kind === "shadow" && "rounded-sm",
                  ]}
                  {@attach probe(shelf.kind, name)}
                ></span>
                <span class="truncate type-meta">{short(name)}</span>
                {#if shelf.kind === "radius"}
                  <span class="text-tx-2 type-meta">{readings.get(name)}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {:else if shelf.kind === "duration"}
          <ul class="flex flex-col gap-space-2">
            {#each shelf.names as name (name)}
              {@const ms = millis(readings.get(name))}
              <li class="flex items-center gap-space-3">
                <span
                  class="w-32 flex-none truncate type-meta"
                  {@attach probe(shelf.kind, name)}
                >
                  {short(name)}
                  <span class="text-tx-2 tabular-nums">{ms}ms</span>
                </span>
                <span class="min-w-0 flex-1 overflow-clip">
                  <span
                    class="block h-2 w-(--bar) max-w-full rounded-xs bg-cyan"
                    style:--bar={`${Math.min(100, (ms / 1000) * 100)}%`}
                  ></span>
                </span>
              </li>
            {/each}
          </ul>
        {:else if shelf.kind === "ease"}
          <ul class="flex flex-wrap gap-space-4">
            {#each shelf.names as name (name)}
              {@const path = curve(readings.get(name))}
              <li class="mark-line flex w-28 flex-col gap-space-2">
                <span
                  class="block size-16 rounded-sm ring ring-ui p-space-1"
                  data-box
                  {@attach probe(shelf.kind, name)}
                >
                  {#if path}
                    <svg
                      class="size-full overflow-visible text-accent"
                      aria-hidden="true"
                      viewBox="0 0 100 100"
                    >
                      <path
                        d={path}
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        vector-effect="non-scaling-stroke"
                      />
                    </svg>
                  {/if}
                </span>
                <span
                  class="overflow-clip text-ellipsis whitespace-nowrap type-meta"
                  >{short(name)}</span
                >
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/each}
  </div>
{/if}
