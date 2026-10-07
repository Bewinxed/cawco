<script lang="ts">
  /**
   * Words in a passing "no machines" line that open Connect a machine: an
   * inline button in the link ink, so the line keeps its sentence.
   */
  import type { Snippet } from "svelte";
  import { addMachine } from "./join.svelte";

  let { children }: { children: Snippet } = $props();
</script>

<button
  aria-haspopup="dialog"
  class="add-link"
  onclick={() => addMachine.show()}
  type="button"
>
  {@render children()}
</button>

<style>
  .add-link {
    display: inline;
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--link-ink);
    font: inherit;
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 3px;
    cursor: pointer;
    transition: text-decoration-color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    .add-link:hover {
      text-decoration-color: currentColor;
    }
  }
  .add-link:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: 2px;
  }
</style>
