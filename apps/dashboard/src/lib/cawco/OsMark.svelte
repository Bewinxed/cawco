<script lang="ts">
  import type { SVGAttributes } from "svelte/elements";
  import { IconServer, IconServerLinear } from "#lib/icons.js";
  /**
   * The mark of the operating system itself, rather than the shape of a box —
   * a laptop glyph on a Mac and a monitor glyph on a Linux tower said which
   * furniture the machine is, which is the one thing nobody needed to know.
   *
   * Drawn here rather than fetched: no icon set the app carries has the three
   * marks, and a brand mark is worth authoring once. Each sits in a 16px box
   * on the same optical weight and fills with `currentColor`, so it takes the
   * ink of whatever row it lands in.
   *
   * In a bar (`face="linear"`: a BarItem's symbol, as the project head's
   * place) each is drawn in Solar's linear grammar instead, as the local
   * Close and Plus are: the 24px grid, a 1.5 stroke, round caps and joins,
   * no fill, so it stands in one face with the bar's linear symbols
   * (DESIGN.md, The Solar Duotone Rule; house/bar-symbol-linear).
   */
  import { cn } from "#lib/utils.js";

  interface Props extends Omit<SVGAttributes<SVGSVGElement>, "class"> {
    class?: string;
    /** Filled for a row (the default), or Solar's linear cut for a bar's symbol. */
    face?: "filled" | "linear";
    /** The daemon's `platform-arch` fingerprint, as `machineOs` reads it. */
    os: string;
  }

  let { os, class: className, face = "filled", ...rest }: Props = $props();

  /** Apple's mark on the 16px box: filled in a row, its outline in a bar. */
  const APPLE =
    "M11.9 8.6c0-1.4.8-2.3 1.5-2.8-.6-.9-1.6-1.4-2.7-1.4-1.1-.1-2.2.7-2.8.7-.6 0-1.5-.7-2.4-.6C4 4.5 2.9 5.2 2.3 6.3c-1.2 2.1-.3 5.3.9 7 .6.9 1.3 1.8 2.2 1.8.9 0 1.2-.6 2.3-.6s1.4.6 2.3.5c1-.1 1.6-.9 2.2-1.7.4-.6.7-1.2.9-1.9-1.4-.5-2.2-1.6-2.2-2.8ZM10.2 3.3c.5-.6.8-1.4.7-2.3-.7.1-1.6.5-2.1 1.1-.5.6-.9 1.4-.7 2.2.8.1 1.6-.4 2.1-1Z";

  const linear = $derived(face === "linear");
  const platform = $derived(os.trim().toLowerCase().split("-")[0]);
  const shape = $derived.by(() => {
    if (platform === "darwin") {
      return "apple";
    }
    if (platform === "linux") {
      return "tux";
    }
    if (platform === "win32" || platform === "windows") {
      return "windows";
    }
    return "unknown";
  });
</script>

{#if shape === "unknown"}
  {#if linear}
    <IconServerLinear
      {...rest}
      data-os-mark-class={className}
      class={className}
    />
  {:else}
    <IconServer
      data-os-mark-class={className}
      class={cn("size-icon-md shrink-0", className)}
    />
  {/if}
{:else}
  <svg
    {...rest}
    data-os-mark-class={className}
    aria-hidden="true"
    class={cn(!linear && "size-icon-md", "shrink-0", className)}
    fill={linear ? "none" : "currentColor"}
    height={linear ? "1.2em" : undefined}
    viewBox={linear ? "0 0 24 24" : "0 0 16 16"}
    width={linear ? "1.2em" : undefined}
  >
    {#if linear}
      <g
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      >
        {#if shape === "apple"}
          <!-- The filled mark's outline on the 24px grid: its 16px drawing
               at 1.25 from its centre, its stroke kept at 1.5. -->
          <path
            d={APPLE}
            stroke-width="1.2"
            transform="translate(12 12) scale(1.25) translate(-7.8 -8.05)"
          />
        {:else if shape === "tux"}
          <!-- The bird's silhouette as one line, head into body; the eyes
               and the beak as strokes, the belly an open curve, the feet two
               flat strokes under it. -->
          <path
            d="M12 2.75c-2.1 0-3.5 1.65-3.5 3.85v1.6c0 1-.5 1.9-1.2 2.8-1.1 1.4-1.8 3-1.8 4.7 0 2.5 2.9 4.05
               6.5 4.05s6.5-1.55 6.5-4.05c0-1.7-.7-3.3-1.8-4.7-.7-.9-1.2-1.8-1.2-2.8V6.6c0-2.2-1.4-3.85-3.5-3.85Z"
          />
          <path d="M10.6 6.4v.6M13.4 6.4v.6M11 8.6l1 .75 1-.75" />
          <path
            d="M9.4 18.6c-.7-1-.85-2.35-.45-3.65.5-1.6 1.65-2.7 3.05-2.7s2.55 1.1 3.05 2.7c.4 1.3.25 2.65-.45 3.65"
          />
          <path d="M6.75 21.25h3.5M13.75 21.25h3.5" />
        {:else}
          <!-- The window, four panes in one frame drawn in perspective. -->
          <path d="M4.75 6.3 19.25 4.4v15.2L4.75 17.7Z" />
          <path d="M11.5 5.4v13.2M4.75 12h14.5" />
        {/if}
      </g>
    {:else if shape === "apple"}
      <path d={APPLE} />
    {:else if shape === "tux"}
      <!-- Redrawn for 16px (user, 2026-08-08): the old mark's white belly inside
           a tall dark body rasterised as a padlock plate and its head as the
           shackle. The silhouette carries the bird instead — feet, flippers, a
           wide body and a head with two eyes far enough apart to survive one
           pixel each — and no belly is cut out of it at all. Nonzero winding:
           the eyes and the beak notch are the only holes. -->
      <path
        d="M1.8 14.6a2.4 1.25 0 0 1 4.8 0 2.4 1.25 0 0 1-4.8 0ZM9.4 14.6a2.4 1.25 0 0 1 4.8 0 2.4 1.25 0 0
           1-4.8 0ZM2.57 7.13a3.1 1.35 82 0 1 .86 6.14 3.1 1.35 82 0 1-.86-6.14ZM13.43 7.13a3.1 1.35 98 0 1
           -.86 6.14 3.1 1.35 98 0 1 .86-6.14ZM3.1 9.9a4.9 5.1 0 0 1 9.8 0 4.9 5.1 0 0 1-9.8 0ZM4.7 4.1a3.3
           3.4 0 0 1 6.6 0 3.3 3.4 0 0 1-6.6 0ZM5.55 3.9a.9 1.1 0 0 0 1.8 0 .9 1.1 0 0 0-1.8 0ZM8.65 3.9a.9
           1.1 0 0 0 1.8 0 .9 1.1 0 0 0-1.8 0ZM8 5.6 6.6 7h2.8Z"
      />
    {:else}
      <path
        d="M7.6 2.5 15 1.4v6.1H7.6ZM6.9 2.6v4.9H1V3.4ZM6.9 8.5v4.9L1 12.6V8.5ZM7.6 8.5H15v6.1L7.6 13.5Z"
      />
    {/if}
  </svg>
{/if}
