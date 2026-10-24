<script lang="ts" module>
  import type { PlanNode } from "#lib/cawco/plan/PlanTree.svelte";

  /**
   * A plan row as PlanTree draws it, with the one thing PlanTree does not
   * read yet: the step's wait (`PlanStep.waitsOn`, PRD §5.2:243-244), the
   * decision card it links to.
   */
  export interface StepNode extends Omit<PlanNode, "children"> {
    children: StepNode[];
    waits?: { card: string; href: string };
  }
</script>

<script lang="ts">
  /**
   * PlanTree (lib/cawco/plan/PlanTree.svelte) as main draws it, the same
   * marks, classes and motion helpers, plus a waiting step's chip at the
   * end of its words. `still` draws rows that are being shown again, not
   * arriving: no tick drawing along its stroke and no branch building in,
   * so a finished step folded open does not read as one that just finished.
   */
  import { branch, nestFrom } from "#lib/cawco/motion/branch.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconTick } from "#lib/icons.js";

  let {
    nodes,
    still = false,
    waitWords = "Waiting on you",
  }: {
    nodes: StepNode[];
    still?: boolean;
    /** The chip's words: what a waiting step says, where nothing above says it. */
    waitWords?: string;
  } = $props();

  const listClass = (nested: boolean) =>
    nested
      ? "kit-nest flex flex-col gap-space-1 m-0 list-none pbs-space-1 pbe-0 ps-(--rows-pad-start) pe-0"
      : "flex flex-col gap-space-1 m-0 p-0 list-none";
</script>

{#snippet mark(status: StepNode["status"])}
  <span
    class="flex-none grid place-items-center w-icon-md h-lh"
    data-slot="plan-mark"
    data-status={status}
  >
    {#if status === "completed"}
      <IconTick
        class={[
          "size-icon-md text-status-done-glyph",
          !still && "motion-safe:animate-check-draw motion-safe:dash-unit",
        ]}
      />
    {:else if status === "in_progress"}
      <LiveDot data-plan-pane-live data-slot="dot" />
    {:else}
      <span
        data-slot="dot"
        class="size-(--status-dot-size) rounded-pill inset-ring inset-ring-ink-subtle"
      ></span>
    {/if}
  </span>
{/snippet}

{#snippet rows(nodes: StepNode[])}
  {#each nodes as node (node.id)}
    <li
      class="rounded-sm transition-[background-color] duration-(--dur-fade) ease-out data-linked:bg-selected-bg"
      data-flip
      data-plan-row={node.id}
      data-status={node.status}
      data-waits={node.waits ? "" : undefined}
    >
      <span
        data-slot="row"
        class="flex items-start gap-space-2 min-w-0 type-label text-ink-strong [--row-line:1.3]"
      >
        {@render mark(node.status)}
        <span
          data-slot="text"
          class={[
            "min-w-0 wrap-anywhere",
            node.status === "completed" && "text-ink-muted",
            node.status === "in_progress" && "font-medium",
          ]}
          >{node.text}{#if node.waits}
            {" "}<a
              data-slot="waits"
              aria-label="{waitWords}: {node.waits.card}"
              class={chipVariants({
                variant: "inline",
                class:
                  "bg-status-attn-bg text-status-attn-ink inset-ring-status-attn-bg no-underline can-hover:hover:inset-ring-status-attn-ink leading-(--row-line)",
              })}
              href={node.waits.href}
              title={node.waits.card}
              ><span data-slot="label">{waitWords}</span></a
            >
          {/if}</span
        >
      </span>
      {#if node.children.length > 0}
        {@render tree(node.children, true)}
      {/if}
    </li>
  {/each}
{/snippet}

{#snippet tree(nodes: StepNode[], nested: boolean)}
  {#if still}
    <ul
      data-slot="rows"
      data-nest={nested || undefined}
      class={listClass(nested)}
      style:--rows-pad-start={nested
        ? "var(--nest-pad, var(--space-5))"
        : undefined}
      {@attach nested ? nestFrom('[data-slot="plan-mark"]') : undefined}
    >
      {@render rows(nodes)}
    </ul>
  {:else}
    <ul
      data-slot="rows"
      data-nest={nested || undefined}
      class={listClass(nested)}
      style:--rows-pad-start={nested
        ? "var(--nest-pad, var(--space-5))"
        : undefined}
      in:branch={{ glyph: '[data-slot="plan-mark"]' }}
      {@attach reflow()}
      {@attach nested ? nestFrom('[data-slot="plan-mark"]') : undefined}
    >
      {@render rows(nodes)}
    </ul>
  {/if}
{/snippet}

{@render tree(nodes, false)}
