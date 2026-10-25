<!--
  The transcript before it has arrived, generated: transitions.dev's UI
  generation skeleton (generate.js), drawn over the transcript's own shape.
  The shape is TranscriptSkeleton's blocks (the reader's turn in its well,
  the agent's answer, its tool calls on the rail, what it said after) laid
  out unseen; the drawing traces it. It stands on its bottom edge for a
  landing at the tail and on its top edge for a kept place, where the
  reader's row will be. The drawing starts in the frame the shell is first
  drawn; `run` hands the list in over it (`run.reveal`).
-->
<script>
  import { onMount } from "svelte";
  import { generate, motionOk } from "./generate.js";

  let { align, run = $bindable() } = $props();

  const ANSWER = [["94%", "81%", "88%"], ["43%"]];
  const TOOLS = ["46%", "31%", "58%"];
  const AFTER = ["72%", "35%"];
  /** The pattern twice: enough to fill a tall pane from either edge. */
  const TURNS = [0, 1];

  let host = $state();
  let shape = $state();

  onMount(() => {
    if (!motionOk()) {
      return;
    }
    run = generate(host, shape);
    run.layer.dataset.genRun = "veil";
    return () => run?.stop();
  });
</script>

<div class="veil" data-align={align} bind:this={host} role="status" aria-busy="true">
  <span class="sr-only">Reading transcript…</span>
  <div class="gen-shape" bind:this={shape} aria-hidden="true">
    {#each TURNS as turn (turn)}
      <div class="sk-block">
        <div class="who"><span class="sk mark" data-gen-name="mark"></span><span class="sk name" data-gen-name="name"></span></div>
        <div class="well sk-well" data-gen-name="well" data-gen-key>
          <span class="sk line" data-gen-name="text" style:inline-size="52%"></span>
        </div>
      </div>
      <div class="sk-block">
        <div class="who"><span class="sk mark" data-gen-name="mark"></span><span class="sk name" data-gen-name="name"></span></div>
        {#each ANSWER as lines, i (i)}
          <div class="sk-para">
            {#each lines as width (width)}
              <span class="sk line" data-gen-name="text" style:inline-size={width}></span>
            {/each}
          </div>
        {/each}
      </div>
      <div class="sk-rail">
        {#each TOOLS as width (width)}
          <div class="rail-line">
            <span class="rail-cell"><span class="sk cell" data-gen-name="tool"></span></span>
            <span class="sk verb" data-gen-name="verb"></span>
            <span class="sk line" data-gen-name="arg" style:inline-size={width}></span>
          </div>
        {/each}
      </div>
      <div class="sk-block">
        <div class="who"><span class="sk mark" data-gen-name="mark"></span><span class="sk name" data-gen-name="name"></span></div>
        <div class="sk-para">
          {#each AFTER as width (width)}
            <span class="sk line" data-gen-name="text" style:inline-size={width}></span>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
