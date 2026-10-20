<script lang="ts">
  /**
   * A step's body opening under it: transitions-dev's Accordion expand, the
   * fold the update notice already uses (DESIGN.md, Update notice). The
   * grid row goes 0fr to 1fr over --dur-panel and back over --dur-exit on
   * ease-out while the content fades; with reduced motion it only fades.
   * It does not cross-blur as the update notice does: a transitioned filter
   * can hang WebKit, so only the folds scripts/probe-kit/specs/web/
   * safari-blurs.ts drives on WebKit take one (tokens:
   * --transition-fold-fade). Shut, it is inert, so nothing in it takes
   * focus or a press.
   */
  import type { Snippet } from "svelte";

  let { open, id, children }: { open: boolean; id: string; children: Snippet } =
    $props();
</script>

<!-- No padding on the track: padding on a 0fr row leaves a strip. The
     clip is its content's containing block (`relative`): a box placed out
     of the flow inside a shut fold (a field's screen-reader label) stood
     at its place in the hidden content, past the clip, and the list
     scrolled on into blank paper by it. -->
<div
  class="group/fold grid grid-rows-shut transition-[grid-template-rows] duration-(--dur-exit) ease-out data-open:grid-rows-open motion-safe:data-open:duration-(--dur-panel) motion-reduce:transition-off"
  data-open={open || undefined}
  data-slot="fold-body"
  {id}
>
  <div class="relative min-h-0 overflow-hidden" inert={!open}>
    <div
      class="opacity-0 transition-[opacity] duration-(--dur-exit) ease-out group-data-open/fold:opacity-100 group-data-open/fold:duration-(--dur-panel)"
    >
      {@render children()}
    </div>
  </div>
</div>
