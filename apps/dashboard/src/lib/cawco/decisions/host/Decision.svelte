<!--
  One decision: a raised card on the page's recessed ground (DESIGN.md, The
  Frame Recesses Rule; --radius-panel, a decision page's panels; the tile
  shadow, no border; 18px in, 14px under a finger). The card carries its id
  twice: `data-cawco-choice`, which the overlay's bridge picks on (a click
  on an option's `data-option` stores it, pick.ts), and `id="decision-<id>"`,
  which a pin's selector holds on to across revisions. Its head is its
  question; under it the writer's advice, its why after the option it
  recommends by name ("Recommended: Per machine. A machine is…"; the owner:
  "i don't know what the advisor's opinion are on these picks").

  A press picks, and the card stays open (the owner: "The done and continue
  are useless buttons that break the flow of how this form should work",
  and, asked whether a picked card folds or stays open, "Stays open"). Its
  options are the kit's option group (ui/option-group: one tab stop, the
  arrows and Home/End move focus and never pick; a click, Space or the
  option's digit picks; Enter never picks). The pick is kept at once (the
  hub's, and artifact_read's); the option takes its chosen look where it
  stands, a press on another moves the pick, a press on the chosen one lets
  it go (pick.ts writes the card with no option; the owner: "i have no way
  to deselect"), and a several-pick card toggles each. A stored pick on an
  option a revision took out is no pick here (core `pickOf`'s rule, as the
  graph and the count read it). Nothing folds: what the person picked
  stands where they picked it, and the page's own Send at its foot sends
  the page.

  "Add a note" folds into the note's field on one clock (open over
  `--dur-pop`, shut over `--dur-exit`, The Fast Exit Rule), inside the
  card's height tween; the note is kept as it is typed, and its field stays
  open while it holds words: emptied, it folds back into "Add a note" once
  focus leaves it. Its words name what the note is for when the program
  says (`note`). A note with no pick is the person talking to the agent
  (the owner: "Infer from the note or lack thereof, address first then
  reprompt"; the decision-page skill, steps 6-7).

  The page's one polite live region hears "Picked <option>" on a pick and
  "Cleared <option>" when the pick is let go. A pick made from the keyboard
  lands in one frame, with no colour fade (L690: "A choice made from the
  keyboard … is instant, as every keyboard action is").
-->
<script lang="ts">
  import { decisionsWords as words } from "@cawco/core/words/decisions";
  import { getContext, setContext, tick } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { OptionGroup } from "#lib/components/ui/option-group/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { frameObserver } from "../../frame-observer.js";
  import { dur, ease } from "../../motion/curves.svelte";
  import { fold, landFold } from "../../motion/fold.svelte";
  import { morph } from "../../motion/morph.svelte";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import {
    bridge,
    hearWidths,
    MEDIA_WIDTHS,
    type MediaWidths,
    picks,
  } from "./page.svelte.js";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    id: unknown;
    question: unknown;
    options: unknown[];
    why?: unknown;
    media?: unknown[];
    multiple?: unknown;
    note?: unknown;
  }> = $props();

  type OptionNode = {
    props?: {
      id?: unknown;
      label?: unknown;
      line?: unknown;
      cost?: unknown;
      builds?: unknown;
      recommended?: unknown;
      media?: unknown[];
    };
  } | null;

  const id = $derived(String(props.id ?? ""));
  const question = $derived(String(props.question ?? ""));
  const multiple = $derived(props.multiple === true);
  const options = $derived(
    (Array.isArray(props.options) ? props.options : []).map((option) => {
      const held = (option as OptionNode)?.props;
      const optionId = String(held?.id ?? "");
      return {
        id: optionId,
        label: String(held?.label ?? optionId),
        line: !!held?.line,
        cost: !!held?.cost,
        builds: !!held?.builds,
        recommended: held?.recommended === true,
        media: Array.isArray(held?.media) && held.media.length > 0,
      };
    })
  );
  /** The writer's advice: its why, after the option it recommends by name (the hub keeps only cards with exactly one); the why alone where it names none. */
  const advice = $derived.by(() => {
    const why = props.why ? String(props.why) : "";
    const recommended = options.find((option) => option.recommended);
    return why && recommended ? words.advice(recommended.label, why) : why;
  });
  /** Each option's id in order: an option's keycap is its place. */
  const order = $derived(options.map((option) => option.id));
  setContext("decision-options", () => order);
  /** Its id: each option's parts are named under it, ids that hold across revisions. */
  setContext("decision-id", () => id);
  /**
   * The rows every option of the card stands on (the chip, its line, its
   * cost, its builds, its media): one track each that any option fills,
   * shared across the columns, so every chip, line, cost, builds and media
   * starts on one line.
   */
  const rows = $derived.by(() => {
    let at = 1;
    const next = (any: boolean) => {
      if (!any) {
        return 0;
      }
      at += 1;
      return at;
    };
    const line = next(options.some((option) => option.line));
    const cost = next(options.some((option) => option.cost));
    const builds = next(options.some((option) => option.builds));
    const media = next(options.some((option) => option.media));
    return { line, cost, builds, media, span: at };
  });
  setContext("decision-rows", () => rows);

  /**
   * Its media's real widths, as their wells say them (Well.svelte `picture`:
   * a Preview's design, a drawing's, a picture's or a diagram's own, 1 CSS
   * px per px), each passed on to the page: the card's own media, and its
   * options' (Option.svelte hands its media this ear). The widest option's
   * sets the options' pitch: as many abreast as the card holds at that
   * width, one under another at the card's full width where one is wider
   * than a column (`grid-cols-fit-story`), each at its real size.
   */
  const pageWidths = getContext<MediaWidths | undefined>(MEDIA_WIDTHS);
  const cardMedia = hearWidths(pageWidths);
  const optionMedia = hearWidths(pageWidths);
  setContext(MEDIA_WIDTHS, cardMedia.hear);
  setContext("decision-option-widths", optionMedia.hear);
  const storyWidth = $derived(optionMedia.widest());
  /** The card's own media's widest real width: two pictures stand side by side only where both fit at it. */
  const mediaWidth = $derived(cardMedia.widest());
  /** The card's own media's columns: two pictures on their widest's pitch, or, saying no width, two equal columns once the body holds them; else one. */
  const mediaColumns = $derived.by(() => {
    if (!pictures) {
      return "grid-cols-1";
    }
    return mediaWidth > 0
      ? "grid-cols-fit-story max-phone:grid-cols-1"
      : "grid-cols-1 @media-split:grid-cols-2";
  });
  let optionsGrid = $state<HTMLDivElement>();
  /**
   * Its pictured options leave one alone on their last row: that one spans
   * the row (Option.svelte), so no empty cell stands beside it, its chip,
   * words and picture still on the first column's edge as every row's are
   * (a centred last row would stand them on no column's). Read from the
   * grid's own tracks as it mounts and as it resizes (`grid-cols-fit-story`:
   * every track its stories' pitch, as many as the row holds).
   */
  let lone = $state(false);
  $effect(() => {
    const grid = optionsGrid;
    const count = options.length;
    if (!(grid && storyWidth > 0)) {
      lone = false;
      return;
    }
    const read = () => {
      const columns = getComputedStyle(grid)
        .gridTemplateColumns.split(" ")
        .filter((track) => Number.parseFloat(track) > 0).length;
      lone = columns > 1 && count > columns && count % columns === 1;
    };
    read();
    const sizes = frameObserver(read);
    sizes.observe(grid);
    return () => sizes.disconnect();
  });

  /** The pieces drawn in a well (Well.svelte), by the library's names for them. */
  const WELLS = new Set(["Image", "Diagram", "Canvas", "Preview", "Dials"]);
  /** The card's media are two pictures: they may share the body's width. */
  const pictures = $derived(
    Array.isArray(props.media) &&
      props.media.length === 2 &&
      props.media.every((node) =>
        WELLS.has((node as { typeName?: unknown } | null)?.typeName as string)
      )
  );

  /** The options picked that the card still offers (core `pickOf`'s rule: one a revision took out is no pick). */
  const chosen = $derived(
    (picks.now[id]?.options ?? []).filter((one) => order.includes(one))
  );

  /**
   * A keyboard's pick under way: it lands in one frame, the chosen colour
   * with no fade (`data-instant`) and the card's height with no tween.
   */
  let instant = $state(false);
  /** The page's one polite live region (Decisions.svelte). */
  const page = getContext<{ say: (words: string) => void } | undefined>(
    "decision-page"
  );

  /** Lets go of `instant` once the frame it landed in has been drawn. */
  const afterInstant = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        instant = false;
      })
    );

  // Only the person's own press speaks: the overlay's other writes to the
  // page's doc (a pin re-anchored) and a pick from elsewhere say nothing.
  // The press is armed before its pick is written (the overlay writes on
  // the click at the window), and the change it makes is heard within
  // PRESS_HEARD_MS of it: the page hears its own write after the click's
  // task in WebKit (decision-unpick, a key's Space), so a press is not let
  // go at its click.
  /** When the person's press began (`performance.now()`); 0 with none under way. */
  let pressed = 0;
  /** How long after a press its pick is still its own, ms: the page's own write lands well inside it. Our call. */
  const PRESS_HEARD_MS = 1500;
  /** What the card held when the press began: a press on it lets it go. */
  let held: string[] = [];
  let seen = "";
  /** The options' labels, by id, joined as the page says them. */
  const labelsOf = (ids: readonly string[]) =>
    ids
      .map((one) => options.find((option) => option.id === one)?.label ?? one)
      .join(", ");
  $effect(() => {
    const now = chosen.join("\n");
    if (
      now !== seen &&
      pressed > 0 &&
      performance.now() - pressed < PRESS_HEARD_MS
    ) {
      pressed = 0;
      page?.say(
        chosen.length > 0
          ? `Picked ${labelsOf(chosen)}`
          : `Cleared ${labelsOf(held)}`
      );
    }
    seen = now;
  });
  /** A press on an option, by a key or a pointer, about to write its pick. */
  function arm(key: boolean) {
    pressed = performance.now();
    held = [...chosen];
    instant = key;
    if (key) {
      afterInstant();
    }
  }
  let body = $state<HTMLDivElement>();
  $effect(() => {
    const group = body;
    if (!group) {
      return;
    }
    const pointed = (event: Event) => {
      if (
        (event.target as Element | null)?.closest(
          "[data-option], [data-option-for]"
        )
      ) {
        arm(false);
      }
    };
    // Space and an option's digit pick (the group presses the option); armed
    // here, in capture, before the group's own keys run.
    const keyed = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !(event.target as Element | null)?.closest("[data-option]")
      ) {
        return;
      }
      if (event.key === " " || (event.key >= "1" && event.key <= "9")) {
        arm(true);
      }
    };
    group.addEventListener("pointerdown", pointed, true);
    group.addEventListener("keydown", keyed, true);
    return () => {
      group.removeEventListener("pointerdown", pointed, true);
      group.removeEventListener("keydown", keyed, true);
    };
  });

  const stored = $derived(picks.now[id]?.note ?? "");
  let note = $state("");
  let typing = false;
  $effect(() => {
    const next = stored;
    if (!typing) {
      note = next;
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The note as typed, kept once typing pauses: there is nothing to press. */
  function typed() {
    typing = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      typing = false;
      if (note !== stored) {
        bridge()
          ?.note(id, note)
          .catch(() => undefined);
      }
    }, 700);
  }

  /** What the note is for, in the program's words, else a note. */
  const noteFor = $derived(props.note ? String(props.note) : "a note");
  /** "Add a note" was pressed, and the field has not been left empty since. */
  let noteAsked = $state(false);
  /** The note stands open: asked for, or holding words. */
  const noteOpen = $derived(noteAsked || note !== "" || stored !== "");
  let noteAdd = $state<HTMLDivElement>();
  let noteField = $state<HTMLDivElement>();
  let field = $state<HTMLTextAreaElement | null>(null);
  let noteKey = false;
  let noteFirst = true;
  // "Add a note" and the field fold on one clock, the field opening over
  // --dur-pop and shutting over --dur-exit (The Fast Exit Rule), the card's
  // height tween following them (motion/morph); a key's press lands at once.
  $effect(() => {
    const shown = noteOpen;
    const add = noteAdd;
    const fieldBox = noteField;
    if (!(add && fieldBox)) {
      return;
    }
    if (noteFirst || noteKey) {
      noteFirst = false;
      noteKey = false;
      landFold(add, !shown, { fade: true });
      landFold(fieldBox, shown, { fade: true });
      return;
    }
    const clock = {
      ms: dur(shown ? "--dur-pop" : "--dur-exit"),
      easing: ease("--ease-out"),
      fade: true,
    };
    fold(add, !shown, clock);
    fold(fieldBox, shown, clock);
  });
  /** "Add a note": its field opens, focus in it (a key's press lands at once: a click's `detail` is 0 for a key). */
  async function askNote(event: MouseEvent) {
    noteKey = event.detail === 0;
    noteAsked = true;
    await tick();
    field?.focus({ preventScroll: true });
  }
  /** Focus left the field: what was typed is kept now, and an empty field folds back into "Add a note". */
  function leftNote() {
    typing = false;
    clearTimeout(timer);
    if (note !== stored) {
      bridge()
        ?.note(id, note)
        .catch(() => undefined);
    }
    if (note === "") {
      noteAsked = false;
    }
  }
</script>

<article
  {@attach morph({ still: () => instant })}
  class="group/card relative flex min-w-0 data-instant:**:transition-none scroll-mt-space-4 flex-col gap-space-5 rounded-panel bg-surface-raised p-(--card-in) shadow-tile"
  data-cawco-choice={id}
  data-cawco-multiple={multiple ? "" : undefined}
  data-instant={instant ? "" : undefined}
  data-slot="decision"
  id={`decision-${id}`}
>
  <header class="flex min-w-0" data-slot="decision-head">
    <h2
      class="type-title min-w-0 max-w-c-measure flex-1 text-balance text-ink-strong wrap-anywhere"
    >
      {question}
    </h2>
  </header>
  <div
    bind:this={body}
    class="@container flex min-w-0 flex-col gap-space-5"
    data-slot="decision-body"
  >
    {#if advice}
      <p
        class="type-body max-w-c-measure text-pretty text-ink-muted wrap-anywhere"
        data-slot="why"
      >
        {advice}
      </p>
    {/if}
    {#if Array.isArray(props.media) && props.media.length > 0}
      <!-- Two pictures side by side where the card's body holds both at their real width (each well its pictures' pitch, `grid-cols-fit-story`), or, where neither says its width (a page that takes the room it is given), in equal columns once the body holds two at a readable width; one, three and more, or words (a Row, a Text, a Badge) beside a picture, one under another, where a story's well reaches the screen's edges on a phone (`data-bleeds`, Well.svelte). -->
      <div
        class={["grid min-w-0 gap-space-3", mediaColumns]}
        data-bleeds={pictures ? undefined : ""}
        data-slot="decision-media"
        style:--story-w={pictures && mediaWidth > 0
          ? `${mediaWidth}px`
          : undefined}
      >
        {@render renderNode(props.media)}
      </div>
    {/if}
    <OptionGroup
      aria-label={question}
      bind:value={() => chosen, () => undefined}
      class="w-full"
      disabled={!bridge()}
      {multiple}
    >
      <!-- Options with pictures stand on their widest picture's pitch, each at its real size in a well that hugs it, as many abreast as the card holds, one under another at the card's full width where one is wider than a column (it scrolls sideways in its well), one left alone on the last row spanning it (`data-lone`); under the phone's line one under another, each well reaching the screen's edges as far as its picture does (`data-bleeds`, Well.svelte). Options of words stand at least 190px each. -->
      <div
        bind:this={optionsGrid}
        class={[
          "group/options grid w-full min-w-0 gap-space-3",
          storyWidth > 0
            ? "grid-cols-fit-story max-phone:grid-cols-1"
            : "grid-cols-fit-c-decision-option-min",
        ]}
        data-bleeds={storyWidth > 0 ? "" : undefined}
        data-lone={lone ? "" : undefined}
        data-slot="options"
        style:--story-w={storyWidth > 0 ? `${storyWidth}px` : undefined}
      >
        {@render renderNode(props.options)}
      </div>
    </OptionGroup>
    <div data-slot="note">
      <!-- A ghost's ink starts inside its box: it hangs back by its padding so its first letter stands on the card's text edge, as RelayJourney's ghosts do. -->
      <div bind:this={noteAdd}>
        <Button
          class="-ms-space-3"
          disabled={!bridge()}
          onclick={askNote}
          size="sm"
          variant="ghost">Add {noteFor}</Button
        >
      </div>
      <div bind:this={noteField}>
        <div class="flex flex-col gap-space-2">
          <!-- Its field has its id, as every field of a page does, and `data-cawco-unkept`: the overlay keeps a page's named fields as answers of their own (preview-overlay fields.ts `keyOf`), and the note is this card's, written through `cawco.note` alone. Named by this line. -->
          <span
            class="type-label text-ink-muted"
            id={`decision-${id}-note-label`}>Note</span
          >
          <Textarea
            bind:ref={field}
            bind:value={note}
            aria-labelledby={`decision-${id}-note-label`}
            data-cawco-unkept=""
            id={`decision-${id}-note`}
            disabled={!bridge()}
            onblur={leftNote}
            oninput={typed}
            placeholder={props.note ? String(props.note) : "Anything to add"}
            rows={1}
          />
        </div>
      </div>
    </div>
  </div>
</article>
