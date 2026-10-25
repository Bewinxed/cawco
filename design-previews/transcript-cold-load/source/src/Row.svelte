<!--
  One block of the conversation, drawn in the transcript's geometry: a
  speaker's first block carries the who line (the 18px mark and the name);
  the reader's words sit in the sunken well; the agent's prose stands in the
  72ch measure, its code in the house code block; tool calls and thinking
  are 26px lines on the rail, one block a line.
-->
<script>
  let { row } = $props();
  const NAMES = { you: "You", agent: "Claude" };
</script>

<div class="row" data-key={row.key} data-kind={row.kind} data-rail-start={row.railStart || undefined}>
  {#if row.kind === "tool" || row.kind === "thinking"}
    <div class="rail-line">
      <span class="rail-cell" aria-hidden="true"><span class="glyph"></span></span>
      <span class="verb">{row.verb}</span>
      <span class="arg">{row.arg}</span>
    </div>
  {:else}
    {#if row.who}
      <div class="who">
        <span class="mark" data-who={row.who} aria-hidden="true"></span>
        <span class="name">{NAMES[row.who]}</span>
      </div>
    {/if}
    {#if row.kind === "user"}
      <div class="well"><p>{@html row.html}</p></div>
    {:else}
      <div class="prose">{@html row.html}</div>
    {/if}
  {/if}
</div>
