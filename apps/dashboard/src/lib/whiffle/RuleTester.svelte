<script lang="ts">
  import type { RuleDraft } from "@whiffle/core";
  import { ruleHits } from "@whiffle/core";
  import { Textarea } from "$lib/components/ui/textarea";
  import { crossIn, crossOut } from "$lib/whiffle/motion/curves.svelte";

  /**
   * The part of the editor that tells the truth. A pattern is a guess until it
   * is run against something, and "does this fire?" is the only question the
   * person writing a rule actually has — so the answer is on the page rather
   * than discovered later on a live session.
   *
   * It calls the same {@link ruleHits} the hub's engine decides with. If this
   * box and the fleet ever disagree, one of them is wrong, and it would not be
   * this one.
   */
  let { draft, sample = $bindable("") }: { draft: RuleDraft; sample?: string } =
    $props();

  const hits = $derived(sample ? ruleHits(draft, sample) : []);

  /**
   * The sample cut into alternating plain and matched runs, so the preview can
   * mark hits without `{@html}` — the text is the model's, and interpolating it
   * into markup would be a script tag waiting to happen.
   */
  const segments = $derived.by(() => {
    const parts: { text: string; hit: boolean }[] = [];
    let at = 0;
    for (const hit of hits) {
      if (hit.start > at) {
        parts.push({ text: sample.slice(at, hit.start), hit: false });
      }
      parts.push({ text: sample.slice(hit.start, hit.end), hit: true });
      at = hit.end;
    }
    if (at < sample.length) {
      parts.push({ text: sample.slice(at), hit: false });
    }
    return parts;
  });

  const verdict = $derived.by(() => {
    if (!draft.pattern.trim()) {
      return "Write something to watch for and this will tell you if it fires.";
    }
    if (!sample.trim()) {
      return "Paste something a session might say, and see whether this rule catches it.";
    }
    if (hits.length === 0) {
      return "No match — this rule would stay quiet.";
    }
    return hits.length === 1
      ? "Matched once. This rule fires."
      : `Matched ${hits.length} times. This rule fires.`;
  });

  const firing = $derived(hits.length > 0);

  /** Where the hits are: a new set of marks cross-fades over the old. */
  const marked = $derived(hits.map((hit) => `${hit.start}-${hit.end}`).join());
</script>

<div
  class="flex flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--surface-recess)] p-3"
>
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <span class="text-label text-foreground">Try it</span>
    <span
      aria-live="polite"
      class="text-meta transition-colors duration-240 ease-[var(--ease-out)] {firing
        ? 'text-success'
        : 'text-muted-foreground'}"
      role="status"
    >
      {verdict}
    </span>
  </div>

  <Textarea
    aria-label="Sample text to test this rule against"
    class="resize-y bg-background font-mono text-label md:text-label"
    placeholder="I've fixed the parser. One honest caveat: the error path is still untested."
    rows={3}
    spellcheck="false"
    bind:value={sample}
  />

  {#if sample.trim() && draft.pattern.trim()}
    <!-- The text, and over it the marks alone (their text transparent), in
         one cell: when the hits move, the new marks cross-fade over the old
         over --dur-control while the words stay put. -->
    <div
      class="preview relative grid max-h-40 overflow-y-auto rounded-[var(--radius-sm)] bg-background font-mono text-label leading-relaxed"
    >
      <p class="layer">{sample}</p>
      {#key marked}
        <p aria-hidden="true" class="layer marks" in:crossIn out:crossOut>
          {#each segments as segment, index (index)}
            {#if segment.hit}
              <mark class="rounded-[var(--radius-xs)] bg-success/25"
                >{segment.text}</mark
              >
            {:else}
              {segment.text}
            {/if}
          {/each}
        </p>
      {/key}
    </div>
  {/if}
</div>

<style>
  .layer {
    grid-area: 1 / 1;
    padding: 12px;
    overflow-wrap: break-word;
    white-space: pre-wrap;
  }
  /* Only the marks' fill shows: the words are the ones drawn under them,
     which is why a mark takes no padding of its own. */
  .marks,
  .marks mark {
    color: transparent;
  }
</style>
