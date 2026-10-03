<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DialogPrimitive.DescriptionProps = $props();
</script>

<DialogPrimitive.Description
  class={cn("text-label text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground", className)}
  data-slot="dialog-description"
  bind:ref
  {...restProps}
/>
