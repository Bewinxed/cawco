<script lang="ts">
  import { Dialog as SheetPrimitive } from "bits-ui";
  import { presence } from "../root-presence.svelte.js";

  let {
    keep = false,
    ...restProps
  }: SheetPrimitive.PortalProps & { keep?: boolean } = $props();

  // In the page only while its sheet is open or closing (root-presence), or
  // always, for a sheet kept between opens (sheet-content `keep`).
  const root = presence();
</script>

{#if root.present || keep}
  <SheetPrimitive.Portal {...restProps} />
{/if}
