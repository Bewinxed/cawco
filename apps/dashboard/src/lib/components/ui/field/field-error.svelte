<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";
  import { dur } from "$lib/whiffle/motion/curves.svelte";
  import { unfold } from "$lib/whiffle/motion/fold.svelte";

  let {
    ref = $bindable(null),
    class: className,
    children,
    errors,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    children?: Snippet;
    errors?: { message?: string }[];
  } = $props();

  const hasContent = $derived.by(() => {
    // has slotted error
    if (children) {
      return true;
    }

    // no errors
    if (!errors || errors.length === 0) {
      return false;
    }

    // has an error but no message
    if (errors.length === 1 && !errors[0]?.message) {
      return false;
    }

    return true;
  });

  const isMultipleErrors = $derived(errors && errors.length > 1);
  const singleErrorMessage = $derived(
    errors && errors.length === 1 && errors[0]?.message
  );
</script>

<!-- An error fades in over --dur-fade while its height folds open, so the
     fields below slide down to make room instead of jumping; it folds shut
     the same way. Global: it plays when a parent's {#if} brings the error in
     as well as when the errors change. With reduced motion, a fade in place. -->
{#if hasContent}
  <div
    class={cn("font-normal text-destructive text-label", className)}
    data-slot="field-error"
    role="alert"
    bind:this={ref}
    in:unfold|global={{ ms: dur('--dur-fade') }}
    out:unfold|global
    {...restProps}
  >
    {#if children}
      {@render children()}
    {:else if singleErrorMessage}
      {singleErrorMessage}
    {:else if isMultipleErrors}
      <ul class="ml-4 flex list-disc flex-col gap-1">
        {#each errors ?? [] as err, index (index)}
          {#if err?.message}
            <li>{err.message}</li>
          {/if}
        {/each}
      </ul>
    {/if}
  </div>
{/if}
