<script lang="ts">
  /**
   * PROPOSED (pins 3, 4, 14, 15, 16): a blocking state with Caw. Caw at
   * 80 in the status that is his (needs-you when he can't start: the way
   * on is yours), over what happened (the title) and why in a few words
   * (the line), then the way out as the kit's primary and Show details:
   * the real reason as a list, one row per thing it is about, up to five,
   * then Show N more unfolding the rest in place. Caw, the title, the
   * line, the actions and the list share one start edge (the kit empty
   * state's); nothing is centred line by line. Text is earned: no hub
   * sentence stands in the line.
   *
   * In a thread with messages (`shell`) it stands on the composer's shell
   * where the composer stands, or over the one kept for you (the bypass:
   * your words still go in); the panel keeps its place clear of the
   * transcript (Panel's foot). On an empty thread the hero's own
   * EmptyState carries it.
   */
  import Caw, { type CawStatus } from "#lib/cawco/home/Caw.svelte";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import DetailsToggle from "./DetailsToggle.svelte";
  import Fold from "./Fold.svelte";

  let {
    title,
    line,
    act,
    rows,
    status,
    mono = false,
    shell = false,
    open = false,
  }: {
    title: string;
    line: string;
    act: string;
    /** Show details: one row each, a name then what is said of it. */
    rows: { name: string; said: string }[];
    status: CawStatus;
    /** The rows' names are ids (a machine's name), set in mono. */
    mono?: boolean;
    /** On the composer's shell, in a thread with messages. */
    shell?: boolean;
    open?: boolean;
  } = $props();

  const SHOWN = 5;
  let shown = $state(false);
  $effect.pre(() => {
    shown = open;
  });
  /** The rows past five, unfolded in place by Show N more. */
  let more = $state(false);
</script>

<div
  class={[
    "pointer-events-auto min-w-0",
    shell && "kit-dock-shell p-(--space-4)",
  ]}
  data-design-blocked
  role="status"
>
  {#snippet caw()}
    <div class="mb-(--space-2)" data-caw-status={status}>
      <Caw size={80} {status} />
    </div>
  {/snippet}
  {#snippet action()}
    <div class="flex min-w-0 flex-col items-start gap-(--space-2)">
      <div
        class="flex min-w-0 flex-wrap items-center gap-x-(--space-4) gap-y-(--space-2)"
      >
        <Button label={act} />
        <DetailsToggle bind:open={shown} />
      </div>
      <!-- Two columns shared by every row (subgrid), so each name starts
           on one x and each state on another; names keep one line and end
           in an ellipsis at their column's limit, states wrap under
           themselves. -->
      <div class="w-full min-w-0 self-stretch">
        <Fold open={shown}>
          <div
            class="flex w-full min-w-0 max-w-[60ch] flex-col items-start pt-(--space-2)"
            data-design-details
          >
            <ul
              class="m-0 grid w-full min-w-0 list-none grid-cols-[fit-content(50%)_minmax(0,1fr)] gap-x-(--space-3) p-0 text-meta"
            >
              {#each rows.slice(0, SHOWN) as one (one.name)}
                {@render row(one)}
              {/each}
              {#if more}
                {#each rows.slice(SHOWN) as one (one.name)}
                  {@render row(one, true)}
                {/each}
              {/if}
            </ul>
            {#if rows.length > SHOWN}
              <!-- Its words on the list's edge: the link's 1px edge and 8px
                   inset taken back. -->
              <Button
                aria-expanded={more}
                class="-ms-[9px]"
                label={more ? "Show fewer" : `Show ${rows.length - SHOWN} more`}
                onclick={() => {
                  more = !more;
                }}
                size="xs"
                variant="link"
              />
            {/if}
          </div>
        </Fold>
      </div>
    </div>
  {/snippet}
  {#snippet row(one: { name: string; said: string }, folds = false)}
    <li
      aria-label="{one.name}: {one.said}"
      class="col-span-full grid min-w-0 grid-cols-subgrid items-baseline border-[var(--border-hairline)] py-(--space-1) not-first:border-t"
      title={one.name}
      transition:unfold={{ ms: folds ? undefined : 0 }}
    >
      <span
        class={[
          "min-w-0 truncate text-[var(--ink-strong)]",
          mono && "font-mono [font-variant-ligatures:none]",
        ]}>{one.name}</span
      >
      <span
        class="min-w-0 text-[var(--ink-muted)] [overflow-wrap:anywhere] [text-wrap:pretty]"
        >{one.said}</span
      >
    </li>
  {/snippet}
  <EmptyState
    {action}
    class="min-w-0 py-0 [&_.kit-empty-action]:self-stretch [&_.kit-empty-title]:[overflow-wrap:anywhere]"
    {line}
    mark={caw}
    {title}
  />
</div>
