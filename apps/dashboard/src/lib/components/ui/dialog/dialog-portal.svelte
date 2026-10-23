<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { presence } from "../root-presence.svelte.js";

  let { ...restProps }: DialogPrimitive.PortalProps = $props();

  // In the page only while its dialog is open or closing (root-presence).
  const root = presence();
</script>

{#if root.present}
  <DialogPrimitive.Portal {...restProps} />
{/if}
