<script lang="ts">
  /**
   * The states file's seam (Suggestions.stories.ts): Suggestions on the
   * recess it stands on in Caw's thread and in an empty panel, with the
   * preview's words, and its first item held in one state: at rest, reached
   * by the keyboard (`focus`: focused with no pointer, so the house ring
   * shows), or held down (`pressed`: the `data-pressed` the press tint and
   * the chip's scale read, as a press held under the hand). A press here
   * goes nowhere; on its surface it puts the words in the composer.
   */
  import type { Attachment } from "svelte/attachments";
  import { DECISIONS, LONG, MANY, ONE, THREE } from "./examples.js";
  import Suggestions, {
    type Suggestion,
    type SuggestionLook,
    type SuggestionPlacement,
  } from "./Suggestions.svelte";

  const SETS = {
    three: THREE,
    one: ONE,
    many: MANY,
    long: LONG,
    decisions: DECISIONS,
  } as const;

  let {
    look = "list",
    placement = "thread",
    set = "three",
    loading = 0,
    state = "rest",
  }: {
    look?: SuggestionLook;
    placement?: SuggestionPlacement;
    set?: keyof typeof SETS;
    loading?: number;
    state?: "rest" | "focus" | "pressed";
  } = $props();

  const suggestions: readonly Suggestion[] = $derived(SETS[set]);
  const nowhere = () => undefined;

  /** The first item held in the story's state once it is drawn. */
  const hold: Attachment<HTMLElement> = (node) => {
    const first = node.querySelector<HTMLElement>('[data-slot="suggestion"]');
    if (!first) {
      return;
    }
    if (state === "focus") {
      first.focus();
    } else if (state === "pressed") {
      first.dataset.pressed = "";
    }
  };
</script>

<div class="w-full min-w-0 bg-surface-recess p-space-5" {@attach hold}>
  <Suggestions
    label={set === "decisions" ? "Choices to ask Caw for" : "Things to ask Caw"}
    {loading}
    {look}
    onpick={nowhere}
    {placement}
    {suggestions}
  />
</div>
