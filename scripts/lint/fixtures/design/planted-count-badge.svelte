<!--
  Planted counts for house/count-in-badge (scripts/lint/fixtures/expected.txt):
  a corner badge drawn by hand on a bar item's glyph and a row's count drawn
  by hand as a pill; beside them the shapes the rule must leave alone: the
  kit's Badge in both forms, and a count in plain figures with no pill.
-->
<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";

  let { count }: { count: number } = $props();
</script>

<span
  class="absolute start-0 top-0 h-icon-sm min-w-icon-sm rounded-pill bg-ink-strong text-on-ink num"
  >{count}</span
>
<span
  class="inline-grid h-space-5 min-w-space-5 rounded-xs bg-brand-wash text-brand-ink tabular-nums"
  >{count}</span
>
<Badge size="corner">{count}</Badge>
<Badge size="tally" variant="brand">{count}</Badge>
<span class="text-ink-muted num">{count}</span>
