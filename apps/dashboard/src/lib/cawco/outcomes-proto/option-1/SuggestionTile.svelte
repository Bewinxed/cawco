<script lang="ts">
  /**
   * Caw's suggested outcome (shared part S7), after the last outcome: the
   * advice badge, never the Needs you mark; the suggested sentence and its
   * "Done when:" lines with no answers; three acts and the next
   * suggestion. The Room rule folds it first, to one line whose open
   * control spells it out again.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconMaximize, IconSparkles } from "#lib/icons.js";
  import type { Suggestion } from "./outcomes";
  import { outcomesWords } from "./words";

  let {
    suggestion,
    folded = false,
    onunfold,
    ontake,
    onchange,
    ondismiss,
    onnext,
  }: {
    suggestion: Suggestion;
    folded?: boolean;
    onunfold: () => void;
    ontake: () => void;
    onchange: () => void;
    ondismiss: () => void;
    onnext: () => void;
  } = $props();
</script>

<section
  aria-label={outcomesWords.cawSuggests}
  class="flex flex-col gap-space-3 rounded-lg bg-surface-raised p-space-4 shadow-tile @max-phone/view:gap-space-2 @max-phone/view:rounded-none @max-phone/view:border-b @max-phone/view:border-border-hairline @max-phone/view:bg-transparent @max-phone/view:px-0 @max-phone/view:py-space-2 @max-phone/view:shadow-none"
>
  <header class={["flex gap-space-2", folded ? "items-center" : "items-start"]}>
    <div
      class={[
        "flex min-w-0 flex-1 gap-space-2",
        folded ? "items-center" : "flex-col items-start",
      ]}
    >
      <Badge variant="raised"
        ><IconSparkles aria-hidden="true" /><span
          >{outcomesWords.cawSuggests}</span
        ></Badge
      >
      <p
        class={[
          "m-0 min-w-0 font-medium text-pretty text-ink-strong",
          folded ? "line-clamp-1 type-body" : "type-row",
        ]}
      >
        {suggestion.sentence}
      </p>
    </div>
    {#if folded}
      <Button
        aria-label={outcomesWords.open(suggestion.sentence)}
        icon={IconMaximize}
        onclick={onunfold}
        size="icon-xs"
        title={outcomesWords.open(suggestion.sentence)}
        tone="quiet"
        variant="ghost"
      />
    {/if}
  </header>
  {#if !folded}
    <div class="flex flex-col gap-space-1">
      <p class="m-0 type-meta text-ink-muted">{outcomesWords.doneWhen}</p>
      <ul class="m-0 flex list-none flex-col p-0">
        {#each suggestion.lines as line (line)}
          <li class="py-space-1 type-body text-pretty text-ink-strong">
            {line}
          </li>
        {/each}
      </ul>
    </div>
    <div class="flex flex-wrap items-center gap-space-2">
      <Button
        label={outcomesWords.suggestion.take}
        onclick={ontake}
        size="sm"
        variant="outline"
      />
      <Button
        label={outcomesWords.suggestion.change}
        onclick={onchange}
        size="sm"
        variant="ghost"
      />
      <Button
        label={outcomesWords.dontSuggest}
        onclick={ondismiss}
        size="sm"
        variant="ghost"
      />
    </div>
    {#if suggestion.more > 0}
      <Button
        class="self-start"
        label={outcomesWords.suggestion.next(suggestion.more)}
        onclick={onnext}
        size="xs"
        variant="link"
      />
    {/if}
  {/if}
</section>
