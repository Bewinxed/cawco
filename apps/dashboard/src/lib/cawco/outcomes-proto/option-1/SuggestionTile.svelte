<script lang="ts">
  /**
   * Caw's suggested outcome (shared part S7), after the outcomes that are
   * not met: advice, so it is drawn as an offer and never as an outcome, a
   * dashed edge on no fill with the house "Caw suggests" badge leading (as
   * option 2 draws it), never the Needs you mark; the suggested sentence
   * and its "Done when:" lines with no answers; three acts and the next
   * suggestion. The Room rule folds it first, to one dashed line whose
   * open control spells it out again.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import OpenControl from "../OpenControl.svelte";
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
  aria-label="{outcomesWords.cawSuggests}: {suggestion.sentence}"
  data-slot="suggestion"
  class={[
    "flex flex-col rounded-lg border border-dashed border-border-control",
    folded
      ? "gap-space-2 py-space-2 ps-space-3 pe-space-2 @max-phone/view:my-space-2"
      : "gap-space-3 p-space-4 @max-phone/view:my-space-2 @max-phone/view:gap-space-2 @max-phone/view:p-space-3",
  ]}
>
  <header class={["flex gap-space-2", folded ? "items-center" : "items-start"]}>
    <div
      class={[
        "flex min-w-0 flex-1 gap-space-2",
        folded ? "items-center" : "flex-col items-start",
      ]}
    >
      <span class="flex-none" data-box
        ><Badge variant="raised"><span>{outcomesWords.cawSuggests}</span></Badge
        ></span
      >
      <p
        class={[
          "m-0 min-w-0 font-medium text-pretty text-ink-strong",
          folded
            ? "overflow-clip text-ellipsis whitespace-nowrap type-label"
            : "type-row @max-phone/view:type-body",
        ]}
      >
        {suggestion.sentence}
      </p>
    </div>
    {#if folded}
      <OpenControl
        label={outcomesWords.open(
          `${outcomesWords.cawSuggests}: ${suggestion.sentence}`
        )}
        onopen={onunfold}
      />
    {/if}
  </header>
  {#if !folded}
    <div class="flex flex-col gap-space-1">
      <p class="m-0 type-meta text-ink-muted">{outcomesWords.doneWhen}</p>
      <ul class="m-0 flex list-none flex-col p-0">
        {#each suggestion.lines as line (line)}
          <li
            class="py-space-1 type-body text-pretty text-ink-row @max-phone/view:type-label"
          >
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
        class="-ms-space-2 self-start"
        fit="word"
        label={outcomesWords.suggestion.next(suggestion.more)}
        onclick={onnext}
        size="xs"
        tone="quiet"
        variant="ghost"
      />
    {/if}
  {/if}
</section>
