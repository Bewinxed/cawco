<script lang="ts">
  /**
   * A journey once it is done, as Settings shows it: one grid. Who and
   * where (its name, its state as a badge in words, its line under them),
   * with its actions at the trailing edge (last, under everything, in a
   * narrow card, so its state reads before a destructive control); then
   * every line under them across the card (`children`).
   */
  import type { Snippet } from "svelte";
  import { Badge, type BadgeVariant } from "#lib/components/ui/badge/index.js";

  let {
    hook,
    label,
    name,
    badge,
    line,
    actions,
    children,
    ...rest
  }: {
    /** The probe kit's hooks: `data-<hook>-name`, `-state`, `-line`. */
    hook: string;
    /** The card's name, for a screen reader. */
    label: string;
    name: string;
    /** Its state, in words, and its tint. */
    badge: { said: string; tint: BadgeVariant };
    /** The line under the name. */
    line: Snippet;
    actions: Snippet;
    children?: Snippet;
    [attribute: `data-${string}`]: unknown;
  } = $props();
</script>

<section
  aria-label={label}
  class="@container min-w-0 max-w-c-measure"
  {...rest}
>
  <div
    class="grid min-w-0 grid-cols-fluid-auto items-center gap-x-space-3 gap-y-space-2 @max-field-group:grid-cols-1"
  >
    <div class="flex min-w-0 flex-col gap-space-1">
      <div class="flex min-w-0 flex-wrap items-center gap-space-2">
        <span
          class="min-w-0 text-label text-ink-strong wrap-anywhere"
          {...{ [`data-${hook}-name`]: "" }}>{name}</span
        >
        <Badge {...{ [`data-${hook}-state`]: "" }} variant={badge.tint}
          ><span>{badge.said}</span></Badge
        >
      </div>
      <p
        class="min-w-0 text-meta text-ink-muted wrap-anywhere"
        {...{ [`data-${hook}-line`]: "" }}
      >
        {@render line()}
      </p>
    </div>
    <div
      class="flex flex-wrap items-center gap-space-4 @max-field-group:order-last @max-field-group:justify-self-start"
    >
      {@render actions()}
    </div>
    {@render children?.()}
  </div>
</section>
