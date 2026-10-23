<script lang="ts">
  /**
   * Words that open Add machine, set in running text ("No machines yet —
   * this lands on the first one that registers."): a link-styled button,
   * its line's height its hit area, as a link's is.
   */
  import type { Snippet } from "svelte";
  import { connect } from "./installs.svelte";

  let { children }: { children: Snippet } = $props();
</script>

<button
  type="button"
  aria-haspopup="dialog"
  class="inline border-0 bg-transparent p-0 font-inherit text-link-ink underline-offset-4 hover:underline"
  onclick={(event) => connect.openNew(event.currentTarget)}
>
  {@render children()}
</button>
