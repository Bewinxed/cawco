<script lang="ts">
  /**
   * A control drawn under 24px on a fine pointer (DESIGN.md, The 24 Pointer
   * Rule): the kit's checkbox, 16px, alone on the page, for the pointer-hit
   * probe to find its area's edges with `elementsFromPoint`.
   */
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
</script>

<main class="grid min-h-dvh place-items-center">
  <Checkbox aria-label="Pick" data-probe-hit />
</main>
