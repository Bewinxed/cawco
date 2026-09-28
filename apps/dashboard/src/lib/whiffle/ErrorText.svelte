<script lang="ts">
  /**
   * An error said inline where there is room for one line. The line is a
   * button: it opens {@link ErrorDialog} with the whole text, selectable and
   * copyable, so nothing a failure said is lost to an ellipsis.
   */
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";
  import ErrorDialog from "./ErrorDialog.svelte";

  let {
    message,
    title,
    class: className,
    children,
  }: {
    message: string;
    /** The dialog's title: what failed. */
    title: string;
    class?: string;
    /** What the line shows; the message itself when absent. */
    children?: Snippet;
  } = $props();

  let reading = $state(false);
</script>

<span class="flex min-w-0" role="alert">
  <button
    class={cn(
      "min-w-0 cursor-pointer truncate text-start underline-offset-2 hover:underline",
      className
    )}
    onclick={() => {
      reading = true;
    }}
    title="Show the whole error"
    type="button"
  >
    {#if children}
      {@render children()}
    {:else}
      {message}
    {/if}
  </button>
</span>

<ErrorDialog {message} {title} bind:open={reading} />
