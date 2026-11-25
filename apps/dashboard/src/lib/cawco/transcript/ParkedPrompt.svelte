<script lang="ts">
  /**
   * A pick a session put to the person outside a tool call, parked in its
   * composer (core parked.ts), held in the composer's grown shape as a
   * question is (Prompt, grown-ask.svelte.ts), and answered here as it is
   * where it lives:
   *
   * - **A design's directions** (its design graph's): the graph's ask, then
   *   each direction side by side, its live drawing over its name and the
   *   agent's line on where in the product its value shows; stacked one
   *   under another where the composer is narrow (its container, `@container`
   *   on the card). The drawing is the graph's own stage (`drawing`,
   *   DirectionStage). Each name is an option chip with its digit: a press,
   *   Space or the digit picks, writing the graph's `picked` as the graph
   *   head's Pick does. Open graph brings the graph to the front of the
   *   panel.
   * - **A decision card** (its page's): the page's own card (decisions/host
   *   Decision and Option), its question, its options with Recommended and
   *   its why, Add a note, each option's digit, drawn bare on the composer's
   *   surface. A press picks; a several-pick card picks until Answer. Its
   *   note goes with a pick, never alone. Open page opens its page in the
   *   panel at the card.
   *
   * Either is answered as a question is (Prompt): its Other chip opens a
   * line for an answer in the person's own words, which Answer or Enter
   * sends, kept on its artifact as his answer with no pick (parked-queue
   * `answerInWords`); Dismiss puts it down without a word (parked-queue
   * `dismiss`). Its session hears either as it hears a pick. A pick made
   * after the line opened is the answer, and the line goes back to
   * waiting, its words unsent.
   *
   * Picked where it lives meanwhile, the chosen option is drawn chosen and
   * the line says where, before the composer folds back. Its title, body and
   * foot come up with the shape one after another and sink back as it folds,
   * as the question's do (Prompt).
   */
  import type { ChoiceEntry } from "@cawco/core/choices";
  import type {
    ParkedDirection,
    ParkedItem,
    ParkedPick,
  } from "@cawco/core/parked";
  import { askWords } from "@cawco/core/words/asks";
  import { parkedWords as words } from "@cawco/core/words/parked";
  import { type Snippet, setContext, tick, untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import {
    IconCheck,
    IconChevronDown,
    IconCompare,
    IconDecisions,
  } from "#lib/icons.js";
  import Decision from "../decisions/host/Decision.svelte";
  import Option from "../decisions/host/Option.svelte";
  import {
    DECISION_HOST,
    type DecisionHost,
  } from "../decisions/host/page.svelte";

  let {
    item,
    asker = "the agent",
    place = null,
    shown = false,
    choices,
    elsewhere = null,
    drawing,
    onpick,
    onchoose,
    onwords,
    ondismiss,
    onanswered,
    onopen,
    onminimize,
  }: {
    /** The item, as the hub listed it. */
    item: ParkedItem;
    asker?: string;
    /** Where it stands among the asks waiting ("2 of 3"); none when it is alone. */
    place?: { at: number; of: number } | null;
    /** Whether what stands in the shape is up. */
    shown?: boolean;
    /** Its artifact's choices as its doc holds them now: a pick or note made where it lives shows here at once. */
    choices: Record<string, ChoiceEntry>;
    /** It was answered where it lives while it stood here: what was picked there, said before the composer folds. */
    elsewhere?: string | null;
    /** A direction of the pick, drawn live (DirectionStage). */
    drawing: Snippet<[ParkedPick, ParkedDirection]>;
    /** A direction picked: the graph's `picked`; a sentence when it was not kept. */
    onpick: (file: string) => string | null;
    /** A card's options picked, or its note: kept on its page; a sentence when it was not. */
    onchoose: (
      card: string,
      change: { options: string[] } | { note: string }
    ) => string | null;
    /** Answered here in the person's own words, with no pick: kept on its artifact; a sentence when it was not. */
    onwords: (words: string) => string | null;
    /** Put down here without a pick or a word: kept on its artifact; a sentence when it was not. */
    ondismiss: () => string | null;
    /** Answered or dismissed here: the composer folds back and the next comes in. */
    onanswered: () => void;
    /** Where it lives, opened in the panel. */
    onopen: () => void;
    /** Folds it down to its bar over the composer, answering nothing. */
    onminimize?: () => void;
  } = $props();

  let card = $state<HTMLElement>();
  let body = $state<HTMLElement>();
  /** Why the last write wasn't kept; null once one was. */
  let refused = $state<string | null>(null);
  /** What the last write was, for what its refusal says: a pick, his own words, or a dismissal. */
  let writing = $state<keyof typeof NOT_KEPT>("pick");
  /** What a refusal says, by what was written. */
  const NOT_KEPT = {
    pick: words.notKept,
    words: words.wordsNotKept,
    dismiss: words.dismissNotKept,
  };

  /** A direction's pick, as its graph keeps it. */
  const pickedFile = $derived.by(() => {
    if (item.kind !== "directions") {
      return null;
    }
    const kept = choices.picked?.value;
    return typeof kept === "string" &&
      item.directions.some((one) => one.file === kept)
      ? kept
      : item.picked;
  });

  function pick(file: string) {
    otherOpen = false;
    writing = "pick";
    refused = onpick(file);
    if (refused === null) {
      onanswered();
    }
  }

  /* ---- an answer in his own words, or none --------------------------- */

  /** The Other chip's value: no option of the pick's. */
  const OTHER = "\u0000other";
  /** The line for his own words stands open (Other pressed). */
  let otherOpen = $state(false);
  /** What is written on it, kept while it is closed: opened again, it is there. */
  let own = $state("");
  let otherField = $state<HTMLInputElement | null>(null);
  /** What the pick asks, as the line's name says it. */
  const asked = $derived(
    item.kind === "directions" ? item.ask : item.card.question
  );
  /** His own words are the answer: the line is open and holds some. */
  const ownAnswer = $derived(otherOpen && own.trim() !== "");

  /** Other: the line opens for his own words, the keys on it. */
  async function openOther(event: MouseEvent) {
    event.preventDefault();
    otherOpen = true;
    await tick();
    otherField?.focus();
  }

  /** Answered in his own words, the line's: the pick folds away and its session hears it. */
  function answerInWords() {
    writing = "words";
    refused = onwords(own.trim());
    if (refused === null) {
      onanswered();
    }
  }

  /** Put down without a pick or a word: the pick folds away and its session hears it. */
  function dismiss() {
    writing = "dismiss";
    refused = ondismiss();
    if (refused === null) {
      onanswered();
    }
  }

  /** Enter sends the line's words; Esc puts the line down, the keys back on Other. */
  function otherKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      otherOpen = false;
      card
        ?.querySelector<HTMLElement>('[data-slot="other"] [data-slot="option"]')
        ?.focus();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (ownAnswer) {
      answerInWords();
    }
  }

  /* ---- a decision card --------------------------------------------- */

  /** The note typed here, kept with the pick; the page's own until then. Never sent alone: words without a pick are the Other line's. */
  let note = $state("");
  const cardId = $derived(item.kind === "card" ? item.card.id : "");
  /** The card's entry as its page keeps it, the note typed here over its own. */
  const cardEntry = $derived.by((): ChoiceEntry | undefined => {
    const kept = choices[cardId];
    return note === ""
      ? kept
      : {
          options: kept?.options ?? [],
          note,
          value: null,
          pageHash: kept?.pageHash ?? "",
          at: kept?.at ?? "",
        };
  });
  const chosen = $derived(cardEntry?.options ?? []);

  /** The card stands on this host: its picks and note are the composer's, written to its page. */
  setContext<DecisionHost>(DECISION_HOST, {
    bare: true,
    picks: () => (cardEntry ? { [cardId]: cardEntry } : {}),
    bridge: () => ({
      note: (_choice, text) => {
        note = text;
        return Promise.resolve();
      },
    }),
    pick: (choice, options) => {
      // A pick is the answer: the line's words go back to waiting, unsent.
      otherOpen = false;
      writing = "pick";
      refused = onchoose(choice, { options });
      if (refused !== null) {
        return;
      }
      if (note.trim() !== "") {
        refused = onchoose(choice, { note });
      }
      // One pick answers the card; several wait for Answer.
      if (
        refused === null &&
        item.kind === "card" &&
        !item.card.multiple &&
        options.length > 0
      ) {
        onanswered();
      }
    },
  });

  /** Answer: his own words when the line holds them; else a several-pick card's picks, its note with them. */
  function answer() {
    if (ownAnswer) {
      answerInWords();
      return;
    }
    writing = "pick";
    if (note.trim() !== "") {
      refused = onchoose(cardId, { note });
    }
    if (refused === null) {
      onanswered();
    }
  }

  /** An option as the card's program names it. */
  interface OptionNode {
    props: {
      builds?: string;
      cost?: string;
      id: string;
      label: string;
      line?: string;
      recommended: boolean;
    };
    typeName: "Option";
  }
  const isOptionNode = (value: unknown): value is OptionNode =>
    typeof value === "object" &&
    value !== null &&
    "typeName" in value &&
    value.typeName === "Option";

  /** The card as the page's program would hand it its Decision. */
  const decisionProps = $derived(
    item.kind === "card"
      ? {
          id: item.card.id,
          question: item.card.question,
          why: item.card.why || undefined,
          multiple: item.card.multiple,
          options: item.card.options.map((option): OptionNode => ({
            typeName: "Option",
            props: {
              id: option.id,
              label: option.label,
              line: option.line || undefined,
              cost: option.cost || undefined,
              builds: option.builds,
              recommended: option.recommended,
            },
          })),
        }
      : null
  );

  // Once it stands, and nothing else holds the keys (the composer's field
  // let them go as it grew), the keys go to its options: a digit picks.
  $effect(() => {
    if (!shown) {
      return;
    }
    untrack(async () => {
      await tick();
      const active = document.activeElement;
      // Under a finger there are no digits to press, and no ring is drawn.
      if (
        (active === null || active === document.body) &&
        matchMedia("(pointer: fine)").matches
      ) {
        card
          ?.querySelector<HTMLElement>('[data-slot="option"][tabindex="0"]')
          ?.focus({ preventScroll: true });
        // What it asks stays in view: the body opens at its top.
        body?.scrollTo({ top: 0 });
      }
    });
  });

  const title = $derived(
    item.kind === "directions"
      ? words.pickFrom(asker)
      : words.decisionFrom(asker)
  );
  /** The part classes every part of the card comes up with (Prompt's). */
  const PART =
    "opacity-0 blur-(length:--spacing-space-1) transition-fade-blur motion-safe:translate-y-space-2 group-data-prompt-shown/hitl:opacity-100 group-data-prompt-shown/hitl:translate-none group-data-prompt-shown/hitl:filter-none motion-safe:transition-fade-slide-blur group-data-prompt-shown/hitl:delay-(--part-delay)";
</script>

<!-- What the card hands its options to draw: each Option node, as the page's renderer draws it. -->
{#snippet option(value: unknown)}
  {#if Array.isArray(value)}
    {#each value as one, at (at)}
      {@render option(one)}
    {/each}
  {:else if isOptionNode(value)}
    <Option props={value.props} renderNode={option} />
  {/if}
{/snippet}

<!-- The grown shape is the surface (Composer draws it): the card is what
     stands in it, its title on top, its foot on the pill's top edge, and
     what it asks scrolls between the two, as tall as the room over the pill
     allows (`--ask-max`). -->
<section
  aria-label={title}
  class="group/hitl @container/parked flex max-h-(--ask-max) flex-col px-space-3 pt-space-3 pb-space-2"
  data-prompt-shown={shown || undefined}
  data-slot="hitl"
  data-parked={item.kind}
  bind:this={card}
>
  <h2
    class={[
      "mb-space-2 flex items-center gap-space-2 mark-line text-base font-medium text-tx",
      PART,
    ]}
    style:--part="0"
    style:--part-delay="calc(var(--part) * calc(var(--duration-fast) / 2))"
  >
    <span
      aria-hidden="true"
      class="inline-grid flex-none place-items-center"
      data-box
      data-slot="glyph"
    >
      {#if item.kind === "directions"}
        <IconCompare class="size-icon-lg" />
      {:else}
        <IconDecisions class="size-icon-lg" />
      {/if}
    </span>
    <span
      class="min-w-0 shrink-100 overflow-clip text-ellipsis whitespace-nowrap"
      data-slot="title">{title}</span
    >
    {#if place && place.of > 1}
      <Kbd class="ms-auto flex-none" data-box data-num figures="tabular"
        >{place.at} of {place.of}</Kbd
      >
    {/if}
    {#if onminimize}
      <Button
        aria-label="Minimize"
        class={[
          "touch-hit -my-space-1 flex-none",
          !(place && place.of > 1) && "ms-auto",
        ]}
        data-box
        margin="beside-num"
        onclick={onminimize}
        size="icon-xs"
        title="Minimize"
        tone="muted"
        variant="ghost"
      >
        <IconChevronDown />
      </Button>
    {/if}
  </h2>

  <div
    class={[
      "kit-edge-fade-block relative min-h-0 min-w-0 flex-auto overflow-y-auto overscroll-contain",
      PART,
    ]}
    data-slot="body"
    bind:this={body}
    style:--part="1"
    style:--part-delay="calc(var(--part) * calc(var(--duration-fast) / 2))"
  >
    {#if item.kind === "directions"}
      <p
        class="mb-space-3 max-w-measure text-pretty wrap-anywhere text-tx type-body"
        data-slot="lede"
        id="parked-{item.artifact.id}-ask"
      >
        {item.ask}
      </p>
      <!-- Each direction a column: its live drawing on top, so the drawings
           start on one line whatever their words, then its name's chip and
           the agent's line on where it shows, each on the row every column
           shares (a subgrid). Side by side once each column holds the
           narrowest drawing worth comparing; one under another below. -->
      <OptionGroup
        aria-labelledby="parked-{item.artifact.id}-ask"
        class="w-full"
        bind:value={
          () => (pickedFile ? [pickedFile] : []),
          (next) => {
            const [file] = next;
            if (file && file !== pickedFile) {
              pick(file);
            }
          }
        }
      >
        <div
          class="grid w-full min-w-0 grid-cols-1 gap-x-space-3 gap-y-space-4 @min-[34rem]/parked:grid-cols-(--directions) @min-[34rem]/parked:gap-y-space-2"
          data-slot="directions"
          style:--directions="repeat({item.directions.length}, minmax(0, 1fr))"
        >
          {#each item.directions as direction, at (direction.file)}
            <div
              class="row-span-3 grid min-w-0 grid-rows-subgrid gap-y-space-2"
              data-slot="direction"
            >
              {@render drawing(item, direction)}
              <div class="flex min-w-0 flex-wrap items-center gap-space-2">
                <OptionGroupItem
                  aria-describedby="parked-{item.artifact.id}-{at}-line"
                  digit={at < 9 ? at + 1 : undefined}
                  id="parked-{item.artifact.id}-{at}"
                  value={direction.file}
                >
                  {#if at < 9}<Kbd
                      aria-hidden="true"
                      data-box
                      look="keycap"
                      reach="keyboard">{at + 1}</Kbd
                    >{/if}<span class="min-w-0 text-pretty wrap-anywhere"
                    >{direction.name}</span
                  >
                </OptionGroupItem>
              </div>
              <label
                class="max-w-measure min-w-0 text-pretty wrap-anywhere text-tx-2 type-meta"
                for="parked-{item.artifact.id}-{at}"
                id="parked-{item.artifact.id}-{at}-line">{direction.line}</label
              >
            </div>
          {/each}
        </div>
      </OptionGroup>
    {:else if decisionProps}
      <Decision props={decisionProps} renderNode={option} />
    {/if}
    <!-- His own words in place of a pick: the question card's Other, its
         chip and its line side by side in one row of a fixed height, so
         nothing under the thumb moves as the line opens (Prompt's browser
         ask). -->
    <div
      class="mt-space-3 flex h-control-md min-w-0 items-center gap-space-2"
      data-slot="other"
    >
      <OptionGroup
        aria-label={askWords.yourAnswerTo(asked)}
        class="flex-none"
        value={otherOpen ? [OTHER] : []}
      >
        <OptionGroupItem onclick={openOther} value={OTHER}>
          <span class="min-w-0 text-pretty wrap-anywhere" data-slot="opt-label"
            >{words.other}</span
          >
        </OptionGroupItem>
      </OptionGroup>
      {#if otherOpen}
        <Input
          aria-label={askWords.yourAnswerTo(asked)}
          class="flex-1"
          data-other
          oninput={(event) => {
            own = event.currentTarget.value;
          }}
          onkeydown={otherKey}
          placeholder={askWords.yourAnswer}
          value={own}
          bind:ref={otherField}
        />
      {/if}
    </div>
  </div>

  <div
    class={["flex-none pt-space-2", PART]}
    data-slot="foot"
    style:--part="2"
    style:--part-delay="calc(var(--part) * calc(var(--duration-fast) / 2))"
  >
    {#if elsewhere}
      <p
        class="mb-space-2 text-tx-2 type-meta"
        data-slot="elsewhere"
        role="status"
      >
        {elsewhere}
      </p>
    {:else if refused}
      <p class="mb-space-2 text-red type-meta" role="alert">
        {NOT_KEPT[writing](refused)}
      </p>
    {/if}
    <div class="flex flex-wrap items-center gap-space-2">
      {#if ownAnswer || (item.kind === "card" && item.card.multiple && chosen.length > 0)}
        <Button
          fit="prompt"
          icon={IconCheck}
          label={words.answer}
          onclick={answer}
          size="sm"
        />
      {/if}
      <!-- Puts it down without a word, as a question's Dismiss does. -->
      <Button
        fit="prompt"
        label={words.dismiss}
        onclick={dismiss}
        size="sm"
        variant="outline"
      />
      <Button
        fit="prompt"
        label={item.kind === "directions" ? words.openGraph : words.openPage}
        onclick={onopen}
        size="sm"
        variant="outline"
      />
    </div>
  </div>
</section>
