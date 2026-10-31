<script lang="ts">
  /**
   * What he picked, in his own message: each question in a line of meta,
   * his pick under it, so the record reads back with its question.
   */
  let { picks }: { picks: { question: string; label: string }[] } = $props();
</script>

<ul class="flex flex-col gap-space-2">
  {#each picks as p (p.question)}
    <li class="flex min-w-0 flex-col">
      <span class="type-meta line-clamp-1 text-ink-muted">{p.question}</span>
      <span class="type-label text-pretty text-ink-strong">{p.label}</span>
    </li>
  {/each}
</ul>
