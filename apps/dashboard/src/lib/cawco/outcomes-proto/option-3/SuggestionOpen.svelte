<script lang="ts">
  /**
   * Caw's suggested outcome opened, as an outcome opens: Back to outcomes,
   * the house badge, its sentence, and the lines he would be agreeing to,
   * set under it; then its three acts. Still a proposal, so it
   * keeps the dashed edge and no fill.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import BackButton from "./BackButton.svelte";
  import type { SuggestedOutcome } from "./outcomes";
  import SuggestionActs from "./SuggestionActs.svelte";
  import { words } from "./words";

  let {
    suggestion,
    offline,
    onback,
    ontake,
    onreword,
    ondismiss,
  }: {
    suggestion: SuggestedOutcome;
    offline: string | null;
    onback: () => void;
    ontake: () => void;
    onreword: () => void;
    ondismiss: () => void;
  } = $props();
</script>

<section
  aria-label="{words.suggests}: {suggestion.sentence}"
  class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-lg border border-dashed border-border-control p-space-5 @max-phone:p-space-4"
  data-slot="suggestion-open"
>
  <div
    class="mx-auto flex w-full max-w-task-frame min-w-0 flex-col gap-space-5"
  >
    <div class="flex min-w-0">
      <BackButton {onback} />
    </div>
    <header class="flex min-w-0 flex-col items-start gap-space-2">
      <Badge variant="raised"><span>{words.suggests}</span></Badge>
      <h2 class="type-title text-ink-strong">{suggestion.sentence}</h2>
    </header>
    <ul class="flex min-w-0 flex-col gap-space-2 ps-space-4">
      {#each suggestion.lines as line (line)}
        <li class="type-label text-ink-strong">{line}</li>
      {/each}
    </ul>
    <SuggestionActs {offline} {ondismiss} {onreword} {ontake} />
  </div>
</section>
