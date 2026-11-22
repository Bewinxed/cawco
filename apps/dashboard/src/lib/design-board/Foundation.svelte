<script lang="ts">
  /**
   * One foundation of the theme (foundations.ts) in the scheme of the pane
   * it stands in: each token drawn by what it sets, through `var()`, and
   * labelled with its name and the value the page computes for it there.
   * Nothing here holds a value of its own: a swatch is its colour token, a
   * bar its length token, a curve the points its easing token computes to.
   */
  import type { Foundation, Kind } from "./foundations.js";

  let { foundation }: { foundation: Foundation } = $props();

  /** What the page computed for each token, by name: read once, in one pass, once the foundation is laid out. */
  let readings = $state.raw(new Map<string, string>());

  /** The property a token is drawn through, by its kind: what the probe sets and reads back. */
  const PROPERTY: Record<Kind, string> = {
    colour: "background-color",
    face: "font-family",
    size: "font-size",
    leading: "line-height",
    tracking: "letter-spacing",
    weight: "font-weight",
    space: "width",
    length: "width",
    radius: "border-top-left-radius",
    shadow: "box-shadow",
    drop: "filter",
    blur: "filter",
    saturate: "filter",
    duration: "transition-duration",
    ease: "transition-timing-function",
    breakpoint: "width",
  };

  /** The value a token is set as, through its kind's property. */
  function setAs(kind: Kind, name: string): string {
    const token = `var(${name})`;
    if (kind === "drop") {
      return `drop-shadow(${token})`;
    }
    if (kind === "blur") {
      return `blur(${token})`;
    }
    if (kind === "saturate") {
      return `saturate(${token})`;
    }
    return token;
  }

  /** Sets the token on its probe, which the foundation's one pass reads back. */
  const probe = (kind: Kind, name: string) => (node: HTMLElement) => {
    node.style.setProperty(PROPERTY[kind], setAs(kind, name));
    node.dataset.token = name;
    node.dataset.property = PROPERTY[kind];
  };

  /**
   * Every probe read in one pass, a frame after the foundation is laid out,
   * and the length tokens through one probe of its own set to each in turn:
   * a reading per probe as each mounted restyled the page once a token.
   */
  const readAll = (lengths: string[]) => (node: HTMLElement) => {
    const frame = requestAnimationFrame(() => {
      const read = new Map<string, string>();
      for (const one of node.querySelectorAll<HTMLElement>("[data-token]")) {
        const { token, property } = one.dataset;
        if (token && property) {
          read.set(token, getComputedStyle(one).getPropertyValue(property));
        }
      }
      const one = document.createElement("span");
      one.style.position = "absolute";
      one.style.visibility = "hidden";
      node.append(one);
      for (const name of lengths) {
        one.style.width = `var(${name})`;
        read.set(name, getComputedStyle(one).width);
      }
      one.remove();
      readings = read;
    });
    return () => cancelAnimationFrame(frame);
  };

  /** Many short shelves (the colour families) flow in columns. */
  const flowing = $derived(foundation.shelves.length > 8);

  const lengthNames = $derived(
    foundation.shelves
      .filter((one) => one.kind === "length")
      .flatMap((one) => one.names)
  );

  /** A token's name past its kind's own prefix: `--color-surface-raised` reads "surface-raised". */
  const short = (name: string) => name.replace(KIND_PREFIX, "");

  /** Seconds or milliseconds as a number of milliseconds. */
  function millis(value: string | undefined): number {
    const seconds = Number.parseFloat(value ?? "");
    if (Number.isNaN(seconds)) {
      return 0;
    }
    return value?.trim().endsWith("ms") ? seconds : seconds * 1000;
  }

  /** A token name's kind, the part `short` leaves off. */
  const KIND_PREFIX =
    /^--(?:color|font-weight|font|text|leading|tracking|spacing|radius|shadow|drop-shadow|material|duration|ease|breakpoint|container)-/u;

  const BEZIER = /cubic-bezier\(([^)]+)\)/u;
  /** A cubic-bezier's curve as an SVG path in a 100 by 100 box, y up; none for any other easing. */
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
</script>

<div
  class={flowing ? "columns-2 gap-space-5" : "flex flex-col gap-space-5"}
  {@attach readAll(lengthNames)}
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
              <span class="w-28 flex-none truncate type-meta">
                {short(name) || "base"}
                <span class="text-ink-subtle">{readings.get(name)}</span>
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
      {:else if shelf.kind === "length"}
        <!-- Many sizes, each one component's: one line of words, each
             read through the one probe beside it. -->
        <p class="text-ink-muted type-meta">
          {#each shelf.names as name, index (name)}
            <span class="text-ink-strong">{short(name)}</span>
            {readings.get(name)}{index < shelf.names.length - 1 ? " · " : ""}
          {/each}
        </p>
      {:else if shelf.kind === "radius" || shelf.kind === "shadow" || shelf.kind === "drop"}
        <ul class="flex flex-wrap gap-space-5">
          {#each shelf.names as name (name)}
            <li class="flex w-24 flex-col gap-space-2">
              <span
                class={[
                  "block size-16 bg-surface-raised",
                  shelf.kind === "radius" && "border border-border-control",
                  shelf.kind !== "radius" && "rounded-md",
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
      {:else if shelf.kind === "blur" || shelf.kind === "saturate"}
        <ul class="flex flex-wrap gap-space-5">
          {#each shelf.names as name (name)}
            <li class="flex flex-col gap-space-2">
              <span class="flex gap-space-1" {@attach probe(shelf.kind, name)}>
                <span class="size-6 rounded-pill bg-brand-solid"></span>
                <span class="size-6 rounded-pill bg-status-live-glyph"></span>
              </span>
              <span class="type-meta">
                {short(name)}
                <span class="text-ink-subtle">{readings.get(name)}</span>
              </span>
            </li>
          {/each}
        </ul>
      {:else if shelf.kind === "duration"}
        <ul class="flex flex-col gap-space-2">
          {#each shelf.names as name (name)}
            {@const ms = millis(readings.get(name))}
            <li class="flex items-center gap-space-3">
              <span
                class="w-36 flex-none truncate type-meta"
                {@attach probe(shelf.kind, name)}
              >
                {short(name)}
                <span class="text-ink-subtle tabular-nums">{ms}ms</span>
              </span>
              <span class="min-w-0 flex-1 overflow-clip">
                <span
                  class="block h-2 w-(--bar) max-w-full rounded-hair bg-status-live-glyph"
                  style:--bar={`${ms / 4}px`}
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
              {#if !path}
                <span
                  class="overflow-clip text-ellipsis whitespace-nowrap text-ink-subtle type-meta"
                  >{readings.get(name)}</span
                >
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/each}
</div>
