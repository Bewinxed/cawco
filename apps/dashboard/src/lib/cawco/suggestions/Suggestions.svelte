<script lang="ts" module>
  import type { StarterGlyph } from "#lib/cawco/project-tasks.js";

  /**
   * One thing to say to an agent: the sentence a press hands on, the glyph
   * for its kind of work, and why it is offered. A project's starters (hub
   * project-starters.ts) are this shape already.
   */
  export interface Suggestion {
    /** Its kind of work, drawn as that kind's Solar duotone glyph; none draws none. */
    glyph?: StarterGlyph;
    /** Why it is offered, one plain sentence (at most 120 characters from the hub). */
    reason?: string;
    /** The sentence the person would say; a press hands it on, nothing is sent. At most 90 characters from the hub. */
    text: string;
  }

  /**
   * How the suggestions are drawn, each from a shipping product (the
   * suggestions preview, design-previews/suggestions):
   * - `list`: ruled rows, the glyph in the row's lead column and the
   *   sentence in body type, no surface of their own (Lightfield's "Some
   *   ideas", Plane AI's Suggestions);
   * - `rows`: raised rows, the sentence over its reason (Cofounder's next
   *   steps in its chat);
   * - `chips`: the kit's option chips, each as wide as its words, wrapping
   *   whole, a long one's words wrapping inside it with its glyph on their
   *   first line (Langdock's and AirOps' chips under the field, Relevance
   *   AI's under its own).
   * - `row`: the same chips on one line that scrolls sideways (the project
   *   page options' S2, docked on a composer): each chip at most four fifths
   *   of the row, a long sentence wrapping inside it, so the next chip
   *   always peeks past the edge, and the house edge fade (`kit-edge-fade`)
   *   on whichever edge has more to scroll to.
   */
  export const SUGGESTION_LOOKS = ["list", "rows", "chips", "row"] as const;
  export type SuggestionLook = (typeof SUGGESTION_LOOKS)[number];

  /**
   * Where the suggestions stand:
   * - `thread`: under Caw in a thread nothing has been said in, on the
   *   composer's column;
   * - `panel`: an empty panel's one action (The Empty Starts Work Rule), as
   *   wide as the starters' measure, its items words alone: the empty
   *   state's mark is the block's one glyph (DESIGN.md, Empty);
   * - `composer`: standing on the composer, where only the sentences are
   *   shown and every reason is left out.
   */
  export const SUGGESTION_PLACEMENTS = ["thread", "panel", "composer"] as const;
  export type SuggestionPlacement = (typeof SUGGESTION_PLACEMENTS)[number];
</script>

<script lang="ts">
  import { GLYPHS } from "#lib/cawco/starter-glyphs.js";
  import {
    chipsVariants,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";

  /**
   * Things to say to an agent, as one list of buttons: a press hands its
   * suggestion to `onpick` (the caller puts its words in the field under
   * them, the caret after them; nothing is sent). The look is the only
   * thing a surface picks; the words, their glyphs, their reasons and their
   * order are the caller's (a project's are the hub's, written for it).
   *
   * While the caller is still reading them (`loading`), skeletons stand at
   * each look's own size (The Claim Of Nothing Rule), `loading` of them: a
   * row's lines where its words and reason will stand (the hub's reasons
   * run one line or two in Caw's column, so every other row's stands two,
   * and every row's under `suggestion-rows-narrow`, where they wrap more;
   * one in a panel's measure), a chip as wide as a sentence. Every item is a button: a finger's 44px area on a
   * coarse pointer, the house ring on keyboard focus, a press that tints a
   * wide item and scales a compact chip (The Press Rule).
   */
  let {
    suggestions,
    onpick,
    label,
    look = "list",
    placement = "thread",
    loading = 0,
  }: {
    suggestions: readonly Suggestion[];
    /** A press: the suggestion pressed. */
    onpick: (suggestion: Suggestion) => void;
    /** The list's accessible name ("Things to ask Caw"). */
    label: string;
    look?: SuggestionLook;
    placement?: SuggestionPlacement;
    /** How many skeletons stand while the caller reads the suggestions; 0 draws the suggestions. */
    loading?: number;
  } = $props();

  const waiting = $derived(loading > 0);
  const slots = $derived(Array.from({ length: loading }, (_, i) => i));
  /** An empty panel's items are words alone: its empty state's mark is its one glyph. */
  const glyphed = $derived(placement !== "panel");
  const glyphOf = (suggestion: Suggestion) =>
    glyphed && suggestion.glyph ? GLYPHS[suggestion.glyph] : null;
</script>

<!-- A sentence's skeleton line in its type role, as long as sentences run, varied by its slot. -->
{#snippet sentenceBone(slot: number, line: "body" | "label")}
  {#if slot % 3 === 0}
    <Skeleton class="w-c-measure-meta max-w-full" {line} radius="line" />
  {:else if slot % 3 === 1}
    <Skeleton class="w-3/4" {line} radius="line" />
  {:else}
    <Skeleton class="w-2/3" {line} radius="line" />
  {/if}
{/snippet}

<div
  data-slot="suggestions"
  data-look={look}
  data-placement={placement}
  class="group/suggestions @container w-full min-w-0 data-[placement=panel]:max-w-c-starters-w"
>
  {#if look === "list"}
    <ul
      aria-busy={waiting || undefined}
      aria-label={label}
      class="m-0 flex list-none flex-col p-0"
    >
      {#if waiting}
        {#each slots as slot (slot)}
          <li
            class={[
              "grid min-h-c-row-h content-center items-center gap-x-space-1 not-last:border-b not-last:border-border-hairline",
              glyphed
                ? "grid-cols-lead-fluid pe-space-3"
                : "grid-cols-1 px-space-3",
            ]}
          >
            {#if glyphed}
              <span class="grid place-items-center"
                ><Skeleton cell="glyph" radius="text" /></span
              >
            {/if}
            {@render sentenceBone(slot, "body")}
          </li>
        {/each}
      {:else}
        {#each suggestions as suggestion, i (`${i}:${suggestion.text}`)}
          {@const Glyph = glyphOf(suggestion)}
          <li class="not-last:border-b not-last:border-border-hairline">
            <button
              data-slot="suggestion"
              class={[
                "group/item mark-line press-tint focus-inset grid w-full min-h-c-row-h content-center items-start gap-x-space-1 rounded-sm py-space-3 text-start type-body text-ink-strong select-none transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover",
                glyphed
                  ? "grid-cols-lead-fluid pe-space-3"
                  : "grid-cols-1 px-space-3",
              ]}
              onclick={() => onpick(suggestion)}
              type="button"
            >
              {#if glyphed}
                <span class="mark-cell"
                  >{#if Glyph}<Glyph
                      aria-hidden="true"
                      data-suggestion-glyph
                      class="size-icon-md text-ink-muted transition-[color] duration-(--dur-control) ease-out group-hover/item:text-ink-strong"
                    />{/if}</span
                >
              {/if}
              <span
                data-slot="suggestion-text"
                class="min-w-0 text-pretty wrap-anywhere"
                >{suggestion.text}</span
              >
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  {:else if look === "rows"}
    <ul
      aria-busy={waiting || undefined}
      aria-label={label}
      class="m-0 flex list-none flex-col gap-space-2 p-0"
    >
      {#if waiting}
        {#each slots as slot (slot)}
          <li
            class={[
              "grid min-h-c-row-h-two content-center items-start gap-x-space-3 rounded-md bg-surface-raised px-space-4 py-space-3 shadow-tile",
              glyphed ? "grid-cols-mark-fluid" : "grid-cols-1",
            ]}
          >
            {#if glyphed}
              <span class="mark-cell type-label"
                ><Skeleton cell="glyph" radius="text" /></span
              >
            {/if}
            <span class="flex min-w-0 flex-col gap-space-1">
              {@render sentenceBone(slot, "label")}
              <span
                class="flex flex-col group-data-[placement=composer]/suggestions:hidden"
              >
                <Skeleton class="w-full" line="meta" radius="line" />
                <span
                  class="contents group-data-[placement=panel]/suggestions:hidden"
                >
                  {#if slot % 2 === 1}
                    <span class="flex"
                      ><Skeleton
                        class="w-1/2"
                        line="meta"
                        radius="line"
                      /></span
                    >
                  {:else}
                    <span class="hidden @max-suggestion-rows-narrow:flex"
                      ><Skeleton
                        class="w-1/2"
                        line="meta"
                        radius="line"
                      /></span
                    >
                  {/if}
                </span>
              </span>
            </span>
          </li>
        {/each}
      {:else}
        {#each suggestions as suggestion, i (`${i}:${suggestion.text}`)}
          {@const Glyph = glyphOf(suggestion)}
          <li>
            <button
              data-slot="suggestion"
              class={[
                "mark-line press-tint grid w-full min-h-c-row-h-two content-center items-start gap-x-space-3 rounded-md bg-surface-raised px-space-4 py-space-3 text-start text-ink-strong shadow-tile select-none transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover",
                glyphed ? "grid-cols-mark-fluid" : "grid-cols-1",
              ]}
              onclick={() => onpick(suggestion)}
              type="button"
            >
              {#if glyphed}
                <span class="mark-cell type-label"
                  >{#if Glyph}<Glyph
                      aria-hidden="true"
                      data-suggestion-glyph
                      class="size-icon-md text-ink-strong"
                    />{/if}</span
                >
              {/if}
              <span class="flex min-w-0 flex-col gap-space-1" data-box>
                <span
                  data-slot="suggestion-text"
                  class="type-label text-pretty wrap-anywhere"
                  >{suggestion.text}</span
                >
                {#if suggestion.reason}
                  <span
                    data-slot="suggestion-reason"
                    class="type-meta text-pretty wrap-anywhere text-ink-muted group-data-[placement=composer]/suggestions:hidden"
                    >{suggestion.reason}</span
                  >
                {/if}
              </span>
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  {:else}
    <!-- The chips: a wrapping cloud, or (`row`) one line scrolling sideways
         under the house edge fade, each chip at most four fifths of the row
         so the next one peeks. -->
    <ul
      aria-busy={waiting || undefined}
      aria-label={label}
      data-row={look === "row" || undefined}
      class={chipsVariants({
        class:
          look === "row"
            ? "kit-edge-fade m-0 list-none flex-nowrap items-start overflow-x-auto overscroll-x-contain p-0 no-scrollbar"
            : "m-0 list-none p-0",
      })}
    >
      {#if waiting}
        {#each slots as slot (slot)}
          <li
            class={[
              "flex",
              look === "row" ? "max-w-4/5 flex-none" : "max-w-full",
            ]}
          >
            <Skeleton
              class="w-c-measure-meta max-w-full"
              height="control-sm"
              radius="chip"
              type="label"
            />
          </li>
        {/each}
      {:else}
        {#each suggestions as suggestion, i (`${i}:${suggestion.text}`)}
          {@const Glyph = glyphOf(suggestion)}
          <li
            class={[
              "flex",
              look === "row" ? "max-w-4/5 flex-none" : "max-w-full",
            ]}
          >
            <!-- The suggestion row's edge on the recess (DESIGN.md, Borders: border-row-outline holds 3:1 there), where the kit's quiet control edge does not. -->
            <button
              data-slot="suggestion"
              class={chipVariants({
                class:
                  "inline-grid min-w-c-touch-floor grid-cols-[auto_minmax(0,auto)] content-center items-start border-border-row-outline select-none motion-safe:transition-[border-color,background-color,transform] motion-safe:enabled:active:[transform:scale(var(--press-scale))] motion-safe:enabled:data-pressed:[transform:scale(var(--press-scale))]",
              })}
              onclick={() => onpick(suggestion)}
              type="button"
            >
              {#if Glyph}
                <span class="mark-cell"
                  ><Glyph
                    aria-hidden="true"
                    data-suggestion-glyph
                    class="size-icon-md text-ink-muted"
                  /></span
                >
              {/if}
              <span
                data-slot="suggestion-text"
                class="min-w-0 text-pretty wrap-anywhere"
                >{suggestion.text}</span
              >
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>
