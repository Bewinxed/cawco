<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from "bits-ui";
  import { provideRootOpen } from "./opened";

  let {
    ref = $bindable(null),
    open = $bindable(false),
    ...restProps
  }: CollapsiblePrimitive.RootProps = $props();

  // Its Content builds its body the first time this is open (collapsible-content).
  provideRootOpen(() => open);
</script>

<CollapsiblePrimitive.Root
  data-slot="collapsible"
  bind:open
  bind:ref
  {...restProps}
/>
