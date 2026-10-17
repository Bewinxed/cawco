<script lang="ts">
  /**
   * Words in a passing "no machines" line that open Connect a machine: an
   * inline button in the link ink, so the line keeps its sentence.
   */
  import type { Snippet } from "svelte";
  import { addMachine } from "./join.svelte";

  let { children }: { children: Snippet } = $props();
</script>

<!-- literal: 3px -->
<button
  aria-haspopup="dialog"
  class="inline cursor-pointer rounded-xs border-none border-current bg-transparent p-0 text-link-ink underline decoration-transparent underline-offset-(--offset) transition-[text-decoration-color] dur-control ease-out hover:decoration-current focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-2"
  onclick={() => addMachine.show()}
  style:--offset="3px"
  type="button"
>
  {@render children()}
</button>

<style>
  /* residual: unmapped */
  button {
    font: inherit;
  }
</style>
