<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { UseClipboard } from "$lib/hooks/use-clipboard.svelte";
  import { IconCheck, IconClose, IconCopy } from "$lib/icons";
  import { cn } from "$lib/utils.js";
  import type { CopyButtonProps } from "./types";

  let {
    ref = $bindable(null),
    text,
    icon,
    variant = "ghost",
    size: sizeProp = "icon",
    onCopy,
    class: className,
    tabindex = 0,
    children,
    ...rest
  }: CopyButtonProps = $props();

  // this way if the user passes text then the button will be the default size
  const size = $derived(sizeProp === "icon" && children ? "default" : sizeProp);

  const clipboard = new UseClipboard();

  const label = $derived.by(() => {
    if (clipboard.status === "success") {
      return "Copied";
    }
    if (clipboard.status === "failure") {
      return "Failed to copy";
    }
    return "Copy";
  });
</script>

<Button
  {...rest}
  class={cn('flex items-center gap-2', className)}
  name="copy"
  onclick={async () => {
		const status = await clipboard.copy(text);

		onCopy?.(status);
	}}
  {size}
  {tabindex}
  type="button"
  {variant}
  bind:ref
>
  <!-- The icon cross-fades to the result over --dur-control, holds it for
       --dur-hold (the clipboard hook), then fades back. -->
  <span class="icon-swap" style="--icon-swap-dur: var(--dur-control)">
    <span data-active={clipboard.status === 'success'}
      ><IconCheck tabindex={-1} /></span
    >
    <span data-active={clipboard.status === 'failure'}
      ><IconClose tabindex={-1} /></span
    >
    <span data-active={clipboard.status === undefined}>
      {#if icon}
        {@render icon()}
      {:else}
        <IconCopy tabindex={-1} />
      {/if}
    </span>
  </span>
  <span class="sr-only">{label}</span>
  {@render children?.()}
</Button>
