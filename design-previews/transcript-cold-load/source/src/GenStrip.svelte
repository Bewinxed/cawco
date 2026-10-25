<!--
  The strip at an end of the list while there are turns past it: the same
  generation drawing as the veil (generate.js), over one tool line's shape,
  holding its finished pose, its dots flowing, until the page comes in. The
  reader sees it only at the very end of the rows held; a page is asked for
  a screen before that.
-->
<script>
  import { onMount } from "svelte";
  import { generate, motionOk } from "./generate.js";

  let host = $state();
  let shape = $state();

  onMount(() => {
    if (!motionOk()) {
      return;
    }
    const run = generate(host, shape, { margin: 10, keys: 1, id: "generate-strip" });
    run.layer.dataset.genRun = "strip";
    return () => run.stop();
  });
</script>

<div class="gen-strip" bind:this={host} role="status">
  <span class="sr-only">Loading transcript…</span>
  <div class="gen-shape" bind:this={shape} aria-hidden="true">
    <div class="rail-line">
      <span class="rail-cell"><span class="sk cell" data-gen-name="tool"></span></span>
      <span class="sk verb" data-gen-name="verb"></span>
      <span class="sk line" data-gen-name="arg" style:inline-size="38%"></span>
    </div>
  </div>
</div>
