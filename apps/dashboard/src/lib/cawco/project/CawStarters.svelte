<script lang="ts">
  /**
   * An empty state that starts Caw's work on it (The Empty Starts Work
   * Rule): the project's starters (StarterCards), then the field to Caw
   * under them. A press puts the starter's sentence into the field and the
   * caret after it: nothing is sent. The words are written for Caw and
   * editable before they go; the field's own send sends them (CawField:
   * pending, the hub's refusal under it, the words flying to their row with
   * `flies`). Another press replaces the field's words with that card's.
   */
  import { tick } from "svelte";
  import type { Starter } from "#lib/cawco/project-tasks.js";
  import CawField from "./CawField.svelte";
  import StarterCards from "./StarterCards.svelte";

  let {
    starters,
    onsend,
    label = "Ask Caw",
    placeholder = "Message the project…",
    flies = false,
  }: {
    starters: Starter[];
    /** Sends the words to Caw as message `id`; a throw is the hub's refusal. */
    onsend: (text: string, id: string) => Promise<unknown>;
    /** The field's label, read out. */
    label?: string;
    placeholder?: string;
    /** The sent words fly to the row they become (CawField). */
    flies?: boolean;
  } = $props();

  /** The field's words: a starter's once pressed, then the person's. */
  let text = $state("");
  let root = $state<HTMLElement | null>(null);

  /** The starter's words go into the field, the caret after them; nothing is sent. */
  async function start(words: string) {
    text = words;
    await tick();
    const field = root?.querySelector<HTMLTextAreaElement>(
      "textarea:not([aria-hidden])"
    );
    if (field) {
      field.focus({ preventScroll: true });
      field.setSelectionRange(field.value.length, field.value.length);
    }
  }

  async function send(words: string, id: string) {
    await onsend(words, id);
  }
</script>

<div class="caw-starters" bind:this={root}>
  {#if starters.length > 0}
    <StarterCards onpick={start} {starters} />
  {/if}
  <CawField {flies} {label} onsend={send} {placeholder} bind:text />
</div>

<style>
  .caw-starters {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    inline-size: 100%;
  }
</style>
