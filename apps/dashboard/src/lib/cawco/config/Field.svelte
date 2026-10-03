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

<div class="field">
  <label class="label" for={id}>{label}</label>
  {@render children()}
  {#if problem || warn || hint}
    <div class="line" in:unfold out:unfold {@attach morph()}>
      {#if problem}
        <span class="error" in:crossIn out:crossOut>{problem}</span>
      {:else if warn}
        <span class="warn" in:crossIn out:crossOut>{@render warn()}</span>
      {:else if typeof hint === "string"}
        <span class="hint" in:crossIn out:crossOut>{hint}</span>
      {:else if hint}
        <span class="hint" in:crossIn out:crossOut>{@render hint()}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .label {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* The one box the messages take turns in: the one leaving is pinned in
     it (crossOut) while the one arriving sets its height. */
  .line {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .hint,
  .error,
  .warn {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .error {
    color: var(--status-fail-ink);
  }
  .warn {
    color: var(--status-attn-ink);
  }
</style>
