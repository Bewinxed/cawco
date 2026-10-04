<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: AlertDialogPrimitive.TitleProps = $props();
</script>

<AlertDialogPrimitive.Title
  class={cn(
    "font-medium text-title sm:group-data-[size=default]/alert-dialog-content:[[data-slot=alert-dialog-media]~&]:col-start-2",
    className
  )}
  data-slot="alert-dialog-title"
  bind:ref
  {...restProps}
/>
