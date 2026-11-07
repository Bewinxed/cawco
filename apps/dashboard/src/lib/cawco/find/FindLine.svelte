<script lang="ts">
  /**
   * The find field, grown on the composer's top while find stands open
   * (conversation-find.svelte.ts): the words, the place ("3 of 9"),
   * Previous, Next and Close, on its own line over the message being
   * written, which stays where it is. Enter and Shift-Enter step; Escape
   * closes. Narrow (a phone, Caw's panel, a desk pane under the drawer
   * line) the place is a control that opens the places over the
   * conversation as the composer's layer.
   *
   * The composer unfolds it (`unfold`) as it grows its other rows: a press
   * plays it, a key lands it (The Frequency Rule, motion/keyed).
   */
  import { commonWords } from "@cawco/core/words/common";
  import { findInWords } from "@cawco/core/words/find-in";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconChevronDown,
    IconChevronUp,
    IconClose,
    IconSearch,
  } from "#lib/icons.js";
  import type { ConversationFind } from "./conversation-find.svelte";

  let {
    find,
    narrow = false,
  }: {
    find: ConversationFind;
    /** The places are the composer's layer, opened from the place. */
    narrow?: boolean;
  } = $props();

  let field = $state<HTMLInputElement | null>(null);

  // Command-F and Attach's Find hand the field the focus, its words chosen.
  $effect(() => {
    if (find.focusAsked > 0 && field) {
      field.focus();
      field.select();
    }
  });

  const total = $derived(find.places.length);
  /** Known to hold nothing: the hub answered (or cannot), and nothing loaded holds the words either. */
  const none = $derived(
    find.words.trim() !== "" && total === 0 && !find.asking
  );
  const count = $derived.by(() => {
    if (none) {
      return findInWords.none;
    }
    if (total === 0) {
      return "";
    }
    return findInWords.place(find.placeNo, total);
  });
  const spoken = $derived(
    none ? findInWords.noneSpoken : findInWords.placeSpoken(find.placeNo, total)
  );

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      find.step(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      find.close();
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "f" &&
      field &&
      field.value !== "" &&
      !(field.selectionStart === 0 && field.selectionEnd === field.value.length)
    ) {
      // Command-F in the field chooses its words; pressed again it closes find.
      event.preventDefault();
      field.select();
    }
  }
</script>

<!-- mark-line: the glyph leads a field, not words; the field sets its own line. -->
<div
  data-slot="find-line"
  class="flex items-center gap-space-1 min-w-0 ps-0 pb-(--cin-pad) mb-(--cin-pad) border-b border-b-border-hairline"
>
  <IconSearch
    class="flex-none size-icon-md me-space-1 text-ink-muted"
    aria-hidden="true"
  />
  <input
    class="flex-1 min-w-0 h-c-composer-field appearance-none border-none p-0 [&::-webkit-search-cancel-button]:hidden bg-transparent font-body text-(length:--text-field-floor) text-ink-strong caret-brand-solid placeholder:text-ink-subtle outline-none"
    aria-keyshortcuts="Enter Shift+Enter Escape"
    aria-label={findInWords.field}
    autocomplete="off"
    enterkeyhint="search"
    oninput={(event) => find.type(event.currentTarget.value)}
    {onkeydown}
    placeholder={findInWords.field}
    spellcheck="false"
    type="search"
    value={find.words}
    bind:this={field}
  />
  {#if narrow}
    <!-- Narrow, the place opens the places over the conversation. -->
    <Button
      aria-expanded={find.listOpen}
      aria-label={`${spoken}, ${find.listOpen ? findInWords.hidePlaces : findInWords.showPlaces}`}
      disabled={total === 0}
      onclick={() => {
        find.listOpen = !find.listOpen;
      }}
      size="sm"
      variant="ghost"><span class="num">{count}</span></Button
    >
  {:else if count}
    <output
      class="num flex-none px-space-2 type-label text-ink-muted tabular-nums"
      aria-live="polite">{count}</output
    >
  {/if}
  <Button
    aria-label={findInWords.previous}
    class="flex-none"
    disabled={total === 0}
    icon={IconChevronUp}
    onclick={() => find.step(-1)}
    size="icon-composer"
    title={findInWords.previous}
    variant="ghost"
  />
  <Button
    aria-label={findInWords.next}
    class="flex-none"
    disabled={total === 0}
    icon={IconChevronDown}
    onclick={() => find.step(1)}
    size="icon-composer"
    title={findInWords.next}
    variant="ghost"
  />
  <Button
    aria-keyshortcuts="Escape"
    aria-label={commonWords.close}
    class="flex-none"
    icon={IconClose}
    onclick={() => find.close()}
    size="icon-composer"
    title={commonWords.close}
    variant="ghost"
  />
</div>
