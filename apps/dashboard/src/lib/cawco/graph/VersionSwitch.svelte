<script lang="ts">
  /**
   * The two whole versions of what he tuned on the graph, once he changed
   * anything (the owner's pick): As written | Yours, Yours counting what he
   * changed, on the house's segmented control. The Animation face's
   * timing and the Dials face's values each have one, in the same place
   * at their head.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { figureOf } from "./figures";

  let {
    label,
    version,
    changed,
    lang,
    onversion,
  }: {
    /** What the two versions are of, said to a reader ("Timing", "Values"). */
    label: string;
    version: "yours" | "written";
    /** How many things his version changes. */
    changed: number;
    lang: string | undefined;
    onversion: (version: "yours" | "written") => void;
  } = $props();
</script>

<ToggleGroup.Root
  aria-label={label}
  onValueChange={(next: string) => {
    if (next === "yours" || next === "written") {
      onversion(next);
    }
  }}
  type="single"
  value={version}
>
  <ToggleGroup.Item value="written">{words.written}</ToggleGroup.Item>
  <ToggleGroup.Item
    aria-label="{words.yours}, {words.changedCount(figureOf(changed, lang))}"
    value="yours"
  >
    <span>{words.yours}</span>
    <span class="type-meta text-ink-muted num" data-slot="changed-count"
      >{figureOf(changed, lang)}</span
    >
  </ToggleGroup.Item>
</ToggleGroup.Root>
