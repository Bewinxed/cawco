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
   * - `tiles`: raised tiles, the glyph over the sentence and its reason, as
   *   many across as fit (Linear's "Get started with some examples");
   * - `chips`: the kit's option chips, each as wide as its words, wrapping
   *   whole, a long one's words wrapping inside it with its glyph on their
   *   first line (Langdock's and AirOps' chips under the field, Relevance
   *   AI's under its own).
   */
  export const SUGGESTION_LOOKS = ["list", "rows", "tiles", "chips"] as const;
  export type SuggestionLook = (typeof SUGGESTION_LOOKS)[number];

  /**
   * Where the suggestions stand:
   * - `thread`: under Caw in a thread nothing has been said in, on the
   *   composer's column;
   * - `panel`: an empty panel's one action (The Empty Starts Work Rule), as
   *   wide as the starters' measure, so tiles stand four across;
   * - `composer`: standing on the composer, where only the sentences are
   *   shown and every reason is left out.
   */
  export const SUGGESTION_PLACEMENTS = ["thread", "panel", "composer"] as const;
  export type SuggestionPlacement = (typeof SUGGESTION_PLACEMENTS)[number];
</script>

<script lang="ts">
  import { GLYPHS } from "#lib/cawco/project/StarterCards.svelte";
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
   * each look's own size (The Claim Of Nothing Rule), `loading` of them.
   * Every item is a button: a finger's 44px area on a coarse pointer, the
   * house ring on keyboard focus, a press that tints a wide item and scales
   * a compact chip (The Press Rule).
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
  /** The skeleton lines' widths, varied so they read as sentences. */
  const LINE_WIDTHS = ["title", "name", "label"] as const;
</script>

<div
  data-slot="suggestions"
  data-look={look}
  data-placement={placement}
  class="group/suggestions @container w-full min-w-0 data-[placement=panel]:max-w-c-starters-w data-[placement=thread]:max-w-c-composer-w"
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
            class="grid min-h-c-row-h grid-cols-lead-fluid content-center items-center gap-x-space-1 not-last:border-b not-last:border-border-hairline"
          >
            <span class="grid place-items-center"
              ><Skeleton cell="glyph" radius="text" /></span
            >
            <Skeleton
              line="body"
              radius="line"
              width={LINE_WIDTHS[slot % LINE_WIDTHS.length]}
            />
          </li>
        {/each}
      {:else}
        {#each suggestions as suggestion (suggestion.text)}
          {@const Glyph = suggestion.glyph ? GLYPHS[suggestion.glyph] : null}
          <li class="not-last:border-b not-last:border-border-hairline">
            <button
              data-slot="suggestion"
              class="group/item mark-line press-tint focus-inset grid w-full min-h-c-row-h grid-cols-lead-fluid content-center items-start gap-x-space-1 rounded-sm py-space-3 pe-space-3 text-start type-body text-ink-strong select-none transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover"
              onclick={() => onpick(suggestion)}
              type="button"
            >
              <span class="mark-cell"
                >{#if Glyph}<Glyph
                    aria-hidden="true"
                    data-suggestion-glyph
                    class="size-icon-md text-ink-muted transition-[color] duration-(--dur-control) ease-out group-hover/item:text-ink-strong"
                  />{/if}</span
              >
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
          <li><Skeleton class="w-full" height="row" radius="tile" /></li>
        {/each}
      {:else}
        {#each suggestions as suggestion (suggestion.text)}
          {@const Glyph = suggestion.glyph ? GLYPHS[suggestion.glyph] : null}
          <li>
            <button
              data-slot="suggestion"
              class="mark-line press-tint grid w-full min-h-c-row-h-two grid-cols-lead-fluid content-center items-start gap-x-space-1 rounded-md bg-surface-raised py-space-3 pe-space-4 text-start text-ink-strong shadow-tile select-none transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover"
              onclick={() => onpick(suggestion)}
              type="button"
            >
              <span class="mark-cell type-label"
                >{#if Glyph}<Glyph
                    aria-hidden="true"
                    data-suggestion-glyph
                    class="size-icon-md text-ink-strong"
                  />{/if}</span
              >
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
  {:else if look === "tiles"}
    <ul
      aria-busy={waiting || undefined}
      aria-label={label}
      class="m-0 grid list-none auto-rows-fr grid-cols-(--tiles-cols) gap-space-2 p-0"
      style:--tiles-cols={"repeat(auto-fill, minmax(min(100%, var(--c-starter-w)), 1fr))"}
    >
      {#if waiting}
        {#each slots as slot (slot)}
          <li><Skeleton class="w-full" height="plot" radius="card" /></li>
        {/each}
      {:else}
        {#each suggestions as suggestion (suggestion.text)}
          {@const Glyph = suggestion.glyph ? GLYPHS[suggestion.glyph] : null}
          <li class="min-w-0">
            <button
              data-slot="suggestion"
              class="press-tint flex size-full flex-col items-start gap-space-3 rounded-lg bg-surface-raised p-space-4 text-start text-ink-strong shadow-tile select-none transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover"
              onclick={() => onpick(suggestion)}
              type="button"
            >
              {#if Glyph}
                <!-- mark-line: the glyph stands above the words, as Linear's examples set it -->
                <Glyph
                  aria-hidden="true"
                  data-suggestion-glyph
                  class="size-icon-md flex-none text-ink-strong"
                />
              {/if}
              <span class="flex min-w-0 flex-col gap-space-1">
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
    <ul
      aria-busy={waiting || undefined}
      aria-label={label}
      class={chipsVariants({ class: "m-0 list-none p-0" })}
    >
      {#if waiting}
        {#each slots as slot (slot)}
          <li>
            <Skeleton
              height="control-sm"
              radius="chip"
              width={LINE_WIDTHS[slot % LINE_WIDTHS.length]}
            />
          </li>
        {/each}
      {:else}
        {#each suggestions as suggestion (suggestion.text)}
          {@const Glyph = suggestion.glyph ? GLYPHS[suggestion.glyph] : null}
          <li class="flex max-w-full">
            <button
              data-slot="suggestion"
              class={chipVariants({
                class:
                  "inline-grid min-w-c-touch-floor grid-cols-[auto_minmax(0,auto)] content-center items-start select-none motion-safe:transition-[border-color,background-color,transform] motion-safe:enabled:active:[transform:scale(var(--press-scale))] motion-safe:enabled:data-pressed:[transform:scale(var(--press-scale))]",
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
