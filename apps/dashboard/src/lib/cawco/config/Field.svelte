<script lang="ts">
  /**
   * A labelled control: the label above, then one line under it that says
   * the hint, a caution, or the problem. The three share that line's box and
   * cross-fade in it over --dur-control as they take turns, its height
   * following the words; the line folds open and shut when there is
   * something, or nothing, to say.
   */
  import type { Snippet } from "svelte";
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";

  let {
    id,
    label,
    hint,
    problem,
    warn,
    children,
  }: {
    /** The control's id; the label points at it. */
    id: string;
    label: string;
    hint?: Snippet | string;
    problem?: string;
    /** A caution that is not a refusal. */
    warn?: Snippet;
    children: Snippet;
  } = $props();
</script>

<div data-slot="field-field" class="flex flex-col gap-space-2 min-w-0">
  <label data-field-label class="type-meta text-ink-muted" for={id}
    >{label}</label
  >
  {@render children()}
  {#if problem || warn || hint}
    <div class="relative flex flex-col" in:unfold out:unfold {@attach morph()}>
      {#if problem}
        <span
          class="max-w-c-measure type-meta text-status-fail-ink"
          in:crossIn
          out:crossOut>{problem}</span
        >
      {:else if warn}
        <span
          class="max-w-c-measure type-meta text-status-attn-ink"
          in:crossIn
          out:crossOut>{@render warn()}</span
        >
      {:else if typeof hint === "string"}
        <span
          data-slot="hint"
          class="max-w-c-measure type-meta text-pretty text-ink-muted"
          in:crossIn
          out:crossOut>{hint}</span
        >
      {:else if hint}
        <span
          data-slot="hint"
          class="max-w-c-measure type-meta text-pretty text-ink-muted"
          in:crossIn
          out:crossOut>{@render hint()}</span
        >
      {/if}
    </div>
  {/if}
</div>
