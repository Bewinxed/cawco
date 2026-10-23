<script lang="ts">
  /**
   * A journey's card: a container at the reading measure, its title line
   * (JourneyHead), then everything under the title on the title's edge, on
   * the card's own edge in a narrow card. The faces of a journey (its step
   * list, its start, its done row) are this card with different words under
   * the title; `under` is how those stack (`gap-space-3`, `items-start`).
   */
  import type { Component, Snippet } from "svelte";
  import { cn } from "#lib/utils.js";
  import JourneyHead from "./JourneyHead.svelte";
  import { TITLE_EDGE, UNDER_TITLE } from "./journey";

  let {
    title,
    heading,
    icon,
    done = false,
    end,
    under,
    class: className,
    children,
    ...rest
  }: {
    title: string;
    /** The title as drawn, where part of it is set apart (a typed word in the mono face); `title` is its name. */
    heading?: Snippet;
    icon: Component<{ "aria-hidden"?: "true"; class?: string }>;
    done?: boolean;
    /** After the title on its line (a status badge). */
    end?: Snippet;
    /** How the words under the title stack. */
    under: string;
    class?: string;
    children: Snippet;
    [attribute: `data-${string}`]: unknown;
  } = $props();
</script>

<section
  aria-label={title}
  class={cn(
    "@container flex min-w-0 max-w-c-measure flex-col gap-space-2",
    className
  )}
  {...rest}
>
  <JourneyHead {done} {end} {icon} title={heading ?? title} />
  <div class="{UNDER_TITLE} {under}" style:--title-edge={TITLE_EDGE}>
    {@render children()}
  </div>
</section>
