<script lang="ts">
  /**
   * Why a setting's pick didn't hold, under the options it was made in,
   * unfolding and brought into view once it has. Models › Images and
   * Helpers & step lists draw it.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { motionOk } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";

  let { fault }: { fault: string | null } = $props();
</script>

{#if fault}
  <p
    class="m-0 type-meta text-pretty text-status-fail-ink"
    onintroend={(event) =>
      bringIntoView(event.currentTarget, {
        behavior: motionOk.current ? "smooth" : "auto",
      })}
    role="alert"
    transition:unfold
  >
    {fault}
  </p>
{/if}
