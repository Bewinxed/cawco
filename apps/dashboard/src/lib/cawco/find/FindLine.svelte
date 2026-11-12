<script lang="ts">
  /**
   * The find field, grown on the composer's top while find stands open
   * (conversation-find.svelte.ts): the words, the place ("3 of 9"),
   * Previous, Next and Close, on its own line over the message being
   * written, which stays where it is. Enter and Shift-Enter step; Escape
   * closes. The place is a control that opens and folds the places,
   * which rise out of the composer as its layer (FindLayer). Every control
   * on it takes the pill's contour, as Attach and Send do (`inset`).
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
    IconListRows,
    IconSearch,
  } from "#lib/icons.js";
  import type { ConversationFind } from "./conversation-find.svelte";

  let { find }: { find: ConversationFind } = $props();

  let field = $state<HTMLInputElement | null>(null);

  // Command-F and Attach's Find hand the field the focus, its words chosen.
  $effect(() => {
    if (find.focusAsked > 0 && field) {
      // The caret at the words' end, not the words chosen: chosen, they
      // would wear the selection's coral, which reads as a match marked.
      // Command-F in the field chooses them (`onkeydown`).
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
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

<!-- The field takes the line's room: where the line is narrower than its
     words and the controls together (a phone, Caw's panel), the controls
     yield to a row of their own under the field, the place at its start and
     the steps and Close at its end. -->
<div
  data-slot="find-line"
  class="@container min-w-0 pb-(--cin-pad) mb-(--cin-pad) border-b border-b-border-hairline"
>
  <div class="flex flex-wrap items-center gap-x-space-1 gap-y-(--cin-pad)">
    <!-- mark-line: the glyph leads a field, not words; the field sets its own line. -->
    <div
      class="flex flex-auto basis-full min-w-0 items-center @find-line:basis-0"
    >
      <IconSearch
        class="flex-none size-icon-md me-space-2 text-ink-muted"
        aria-hidden="true"
      />
      <input
        class="flex-1 min-w-0 h-c-composer-field appearance-none border-none p-0 [&::-webkit-search-cancel-button]:hidden bg-transparent font-sans text-(length:--text-field-floor) text-ink-strong caret-brand-solid placeholder:text-ink-subtle outline-none"
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
    </div>
    <div
      class="flex flex-auto basis-full items-center gap-space-1 @find-line:flex-none @find-line:basis-auto"
    >
      <!-- The place, and the control that opens and folds the places
           rising out of the composer: the list's glyph says it opens
           something, and while they stand it stays pressed. -->
      <Button
        aria-expanded={find.listOpen}
        aria-label={`${spoken}, ${find.listOpen ? findInWords.hidePlaces : findInWords.showPlaces}`}
        disabled={find.words.trim() === ""}
        expanded="pressed"
        figures="tabular"
        icon={IconListRows}
        label={count}
        onclick={() => {
          find.listOpen = !find.listOpen;
        }}
        shape="inset"
        size="composer"
        title={find.listOpen ? findInWords.hidePlaces : findInWords.showPlaces}
        variant="ghost"
      />
      <span class="flex-auto @find-line:hidden" aria-hidden="true"></span>
      <Button
        aria-label={findInWords.previous}
        class="flex-none"
        disabled={total === 0}
        icon={IconChevronUp}
        onclick={() => find.step(-1)}
        shape="inset"
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
        shape="inset"
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
        shape="inset"
        size="icon-composer"
        title={commonWords.close}
        variant="ghost"
      />
    </div>
  </div>
</div>
