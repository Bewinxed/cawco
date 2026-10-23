<script lang="ts">
  import { Dialog as SheetPrimitive } from "bits-ui";
  import { presence } from "../root-presence.svelte.js";

  let { ...restProps }: SheetPrimitive.PortalProps = $props();

  // In the page only while its sheet is open or closing (root-presence).
  const root = presence();
</script>

{#if root.present}
  <SheetPrimitive.Portal {...restProps} />
{/if}
