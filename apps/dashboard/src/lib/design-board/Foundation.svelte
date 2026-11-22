<script lang="ts">
  /**
   * One foundation group (foundations.ts) drawn in the scheme of the pane
   * it stands in: every token renders through `var()` and reports what the
   * browser computes for it there. No values are duplicated here.
   */
  import type { Foundation, Kind } from "./foundations.js";

  let { foundation }: { foundation: Foundation } = $props();

  /** What the page computed for each token, read once after layout. */
  let readings = $state.raw(new Map<string, string>());

  /** The CSS property each token kind probes and reads back. */
  const PROPERTY: Record<Kind, string> = {
    colour: "background-color",
    face: "font-family",
    size: "font-size",
    leading: "line-height",
    tracking: "letter-spacing",
    weight: "font-weight",
    type: "font",
    space: "width",
    measure: "width",
    radius: "border-top-left-radius",
    shadow: "box-shadow",
    duration: "transition-duration",
    ease: "transition-timing-function",
    breakpoint: "width",
    layer: "z-index",
  };

  /** Sets the token on its probe element so the single pass reads it back. */
  const probe = (kind: Kind, name: string) => (node: HTMLElement) => {
    node.style.setProperty(PROPERTY[kind], `var(${name})`);
    node.dataset.token = name;
    node.dataset.property = PROPERTY[kind];
  };

  /** Reads every probe in one animation frame to avoid interleaved reflows. */
  const readAll = (node: HTMLElement) => {
    const frame = requestAnimationFrame(() => {
      const read = new Map<string, string>();
      for (const one of node.querySelectorAll<HTMLElement>("[data-token]")) {
        const { token, property } = one.dataset;
        if (token && property) {
          read.set(token, getComputedStyle(one).getPropertyValue(property));
        }
      }
      readings = read;
    });
    return () => cancelAnimationFrame(frame);
  };

  /** Multi-shelf colour groups flow across two columns when roomy. */
  const flowing = $derived(foundation.shelves.length >= 4 && foundation.wide);

  /** A token's name past its kind prefix: `--color-surface-raised` -> "surface-raised". */
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
    /^--(?:color|font-weight|font|text|leading|tracking|type|spacing|radius|shadow|duration|ease|breakpoint|container|layer)-/u;

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

  /** The first family a face names. */
  const firstFace = (value: string | undefined) =>
    value?.split(",")[0]?.replaceAll('"', "").trim() ?? "";

  /** Sample sentence per type role. */
  const sampleFor = (name: string): string => {
    if (name === "--type-kpi") {
      return "14,280";
    }
    if (name === "--type-code") {
      return "bun run check --all";
    }
    if (name === "--type-caps") {
      return "RUNNING";
    }
    return "Move the session to studio-mac";
  };
</script>

<div
  class={flowing ? "columns-2 gap-space-5" : "flex flex-col gap-space-5"}
  {@attach readAll}
>
  {#each foundation.shelves.filter((one) => one.names.length > 0) as shelf (shelf.title)}
    <div
      class={[
        "flex flex-col gap-space-2",
        flowing && "mb-space-4 break-inside-avoid",
      ]}
    >
      <h4 class="text-ink-subtle type-meta">{shelf.title}</h4>
      {#if shelf.kind === "colour"}
        <ul class="flex flex-col gap-space-1">
          {#each shelf.names as name (name)}
            <li class="flex min-w-0 items-center gap-space-2">
              <span
                class="size-5 flex-none rounded-xs border border-border-hairline"
                {@attach probe(shelf.kind, name)}
              ></span>
              <span class="truncate type-meta">{short(name)}</span>
            </li>
          {/each}
        </ul>
      {:else if shelf.kind === "type"}
        <ul class="flex flex-col gap-space-3">
          {#each shelf.names as name (name)}
            <li class="flex min-w-0 flex-col gap-space-1">
              <span
                class={[
                  "min-w-0 text-ink-strong",
                  name === "--type-caps" && "tracking-caps uppercase",
                  name === "--type-title" && "tracking-title",
                  name === "--type-kpi" && "tabular-nums",
                  name === "--type-code" && "liga-none",
                ]}
                {@attach probe(shelf.kind, name)}
              >
                {sampleFor(name)}
              </span>
              <span class="text-ink-muted type-meta">
                type-{short(name)}
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
                  "min-w-0 text-ink-strong",
                  shelf.kind === "leading" && "max-w-48 type-body",
                ]}
                {@attach probe(shelf.kind, name)}
              >
                {shelf.kind === "leading"
                  ? "The session on obelisk-of-light finished its checks and waits for your review."
                  : "Move the session to studio-mac"}
              </span>
              <span class="text-ink-muted type-meta">
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
                <span class="text-ink-subtle tabular-nums"
                  >{readings.get(name)}</span
                >
              </span>
              <span class="min-w-0 flex-1 overflow-clip">
                <span
                  class={[
                    "block h-2 rounded-hair bg-brand-solid",
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
                <span class="text-ink-subtle tabular-nums"
                  >{readings.get(name)}</span
                >
              </span>
              <span class="min-w-0 flex-1 overflow-clip">
                <span
                  class="block h-2 origin-left scale-x-25 rounded-hair bg-brand-solid"
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
                <span class="text-ink-subtle tabular-nums">{z}</span>
              </span>
              <span class="min-w-0 flex-1 overflow-clip">
                <span
                  class="block h-2 w-(--bar) max-w-full rounded-hair bg-ink-muted"
                  style:--bar={`${Math.min(100, (z / 160) * 100)}%`}
                ></span>
              </span>
            </li>
          {/each}
        </ul>
      {:else if shelf.kind === "radius" || shelf.kind === "shadow"}
        <ul class="flex flex-wrap gap-space-5">
          {#each shelf.names as name (name)}
            <li class="flex w-24 flex-col gap-space-2">
              <span
                class={[
                  "block size-16 bg-surface-raised",
                  shelf.kind === "radius" && "border border-border-control",
                  shelf.kind === "shadow" && "rounded-md",
                ]}
                {@attach probe(shelf.kind, name)}
              ></span>
              <span class="truncate type-meta">{short(name)}</span>
              {#if shelf.kind === "radius"}
                <span class="text-ink-subtle type-meta"
                  >{readings.get(name)}</span
                >
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
                <span class="text-ink-subtle tabular-nums">{ms}ms</span>
              </span>
              <span class="min-w-0 flex-1 overflow-clip">
                <span
                  class="block h-2 w-(--bar) max-w-full rounded-hair bg-status-live-glyph"
                  style:--bar={`${Math.min(100, (ms / 2000) * 100)}%`}
                ></span>
              </span>
            </li>
          {/each}
        </ul>
      {:else if shelf.kind === "ease"}
        <ul class="flex flex-wrap gap-space-5">
          {#each shelf.names as name (name)}
            {@const path = curve(readings.get(name))}
            <li class="mark-line flex w-28 flex-col gap-space-2">
              <span
                class="block size-16 rounded-sm border border-border-hairline p-space-1"
                data-box
                {@attach probe(shelf.kind, name)}
              >
                {#if path}
                  <svg
                    class="size-full overflow-visible text-brand-solid"
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
