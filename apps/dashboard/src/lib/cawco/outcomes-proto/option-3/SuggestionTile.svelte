<script lang="ts">
  /**
   * Caw's suggested outcome on the first view, drawn as a proposal until he
   * takes it: a dashed edge with no fill and the house badge leading, never
   * the Needs you mark and never coral (DESIGN.md, Advice wears a badge).
   * Its sentence, its two acts, and its open control, which opens it as
   * an outcome opens, with the lines he would be agreeing to. On a phone
   * the badge runs into the sentence and the acts wait inside it, so the
   * bento fits above the views' bar.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import OpenControl from "./OpenControl.svelte";
  import type { SuggestedOutcome } from "./outcomes";
  import SuggestionActs from "./SuggestionActs.svelte";
  import { words } from "./words";

  let {
    suggestion,
    offline,
    ontake,
    ondismiss,
    onopen,
  }: {
    suggestion: SuggestedOutcome;
    offline: string | null;
    ontake: () => void;
    ondismiss: () => void;
    onopen: () => void;
  } = $props();
</script>

<article
  aria-label="{words.suggests}: {suggestion.sentence}"
  class="flex h-full min-w-0 flex-col gap-space-2 rounded-lg border border-dashed border-border-control p-space-4 @max-phone:px-space-3 @max-phone:py-space-2"
  data-slot="suggestion"
>
  <div class="flex min-w-0 items-start gap-space-3">
    <div
      class="flex min-w-0 flex-1 flex-col items-start gap-space-2 @max-phone:flex-row @max-phone:flex-wrap @max-phone:items-baseline"
    >
      <Badge variant="raised"><span>{words.suggests}</span></Badge>
      <h2 class="min-w-0 type-row font-medium text-ink-strong">
        {suggestion.sentence}
      </h2>
    </div>
    <span class="-my-px flex-none">
      <OpenControl label={words.open(suggestion.sentence)} {onopen} />
    </span>
  </div>
  <div class="mt-auto pt-space-1 @max-phone:hidden">
    <SuggestionActs {offline} {ondismiss} {ontake} />
  </div>
</article>
