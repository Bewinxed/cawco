<!--
  The transcript before it has arrived (TranscriptSkeleton): the reader's
  turn, the agent's answer, its tool calls on the rail, what it said after,
  in the rows' own geometry. It stands on its bottom edge for a landing at
  the tail and on its top edge for a kept place, where the reader's row will
  be. Every bar pulses on one clock: each pulse's start is the document
  timeline's origin, so bars drawn at different moments pulse in step.
-->
<script>
  let { align, ref = $bindable() } = $props();

  const ANSWER = [["94%", "81%", "88%"], ["43%"]];
  const TOOLS = ["46%", "31%", "58%"];
  const AFTER = ["72%", "35%"];
  /** The pattern twice: enough to fill a tall pane from either edge. */
  const TURNS = [0, 1];

  /** Every pulse on the document timeline's origin. */
  const oneClock = (node) => {
    for (const run of node.getAnimations({ subtree: true })) {
      if (run instanceof CSSAnimation && run.playState === "running") {
        run.startTime = 0;
      }
    }
  };
</script>

<div class="veil" data-align={align} bind:this={ref} role="status" aria-busy="true" {@attach oneClock}>
  <span class="sr-only">Reading transcript…</span>
  {#each TURNS as turn (turn)}
    <div class="sk-block">
      <div class="who"><span class="sk mark"></span><span class="sk name"></span></div>
      <div class="well sk-well"><span class="sk line" style:inline-size="52%"></span></div>
    </div>
    <div class="sk-block">
      <div class="who"><span class="sk mark"></span><span class="sk name"></span></div>
      {#each ANSWER as lines, i (i)}
        <div class="sk-para">
          {#each lines as width (width)}
            <span class="sk line" style:inline-size={width}></span>
          {/each}
        </div>
      {/each}
    </div>
    <div class="sk-rail">
      {#each TOOLS as width (width)}
        <div class="rail-line">
          <span class="rail-cell"><span class="sk cell"></span></span>
          <span class="sk verb"></span>
          <span class="sk line" style:inline-size={width}></span>
        </div>
      {/each}
    </div>
    <div class="sk-block">
      <div class="who"><span class="sk mark"></span><span class="sk name"></span></div>
      <div class="sk-para">
        {#each AFTER as width (width)}
          <span class="sk line" style:inline-size={width}></span>
        {/each}
      </div>
    </div>
  {/each}
</div>
