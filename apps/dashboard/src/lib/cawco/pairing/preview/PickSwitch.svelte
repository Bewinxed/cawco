<script lang="ts" generics="T extends string">
  /**
   * One of the owner's choices on the pairing sheet: its question, then its
   * options as a switch. Pressing one plays it on the sheet and records it
   * as the pick (the overlay reads `data-cawco-choice` and `data-option`).
   */
  import { Button } from "#lib/components/ui/button/index.js";

  let {
    choice,
    question,
    options,
    value,
    onchange,
  }: {
    choice: string;
    question: string;
    options: { label: string; value: T }[];
    value: T;
    onchange: (value: T) => void;
  } = $props();
</script>

<fieldset class="pick" data-cawco-choice={choice}>
  <legend class="question">{question}</legend>
  <div class="options">
    {#each options as option (option.value)}
      <Button
        data-option={option.value}
        label={option.label}
        onclick={() => onchange(option.value)}
        size="xs"
        variant={value === option.value ? "secondary" : "ghost"}
      />
    {/each}
  </div>
</fieldset>

<style>
  .pick {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    border: 0;
    min-inline-size: 0;
  }
  .question {
    padding: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
</style>
