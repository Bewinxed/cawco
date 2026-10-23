<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import { presence } from "../root-presence.svelte.js";

  let { ...restProps }: AlertDialogPrimitive.PortalProps = $props();

  // In the page only while its alert dialog is open or closing (root-presence).
  const root = presence();
</script>

{#if root.present}
  <AlertDialogPrimitive.Portal {...restProps} />
{/if}
