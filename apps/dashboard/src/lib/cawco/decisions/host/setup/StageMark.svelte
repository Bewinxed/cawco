<!--
  A stage's mark: the house icon tile (DESIGN.md, Identity marks and tiles:
  "a raised 26px square at 8px radius with the tile shadow, holding a 16px
  duotone glyph in its section … hue"), the stage's glyph in its colour,
  or the muted ink when it has none, as the board's column head draws it.
  One family (Solar bold-duotone), one size, one treatment on every row; a
  stage of the `you` kind wears the Needs-you glyph, as its column does.
-->
<script lang="ts">
  import { iconTileVariants } from "#lib/components/ui/icon-tile/index.js";
  import { IconNeedsYou, IconNotYet } from "#lib/icons.js";
  import { STAGE_GLYPHS, STAGE_HUES } from "../../../tasks/stage-look";
  import type { Stage } from "./stage";

  let {
    stage,
    trigger,
  }: {
    stage: Stage;
    /** A menu trigger's props, when the mark is the button that opens its look (its accessible name among them). */
    trigger?: Record<string, unknown>;
  } = $props();
  const Glyph = $derived(stage.icon ? STAGE_GLYPHS[stage.icon] : null);
  const hue = $derived.by(() => {
    if (stage.kind === "you") {
      return "var(--status-attn-glyph)";
    }
    return stage.color ? STAGE_HUES[stage.color] : "var(--ink-muted)";
  });
</script>

{#snippet glyph()}
  {#if stage.kind === "you"}
    <IconNeedsYou class="size-icon-md" />
  {:else if Glyph}
    <Glyph class="size-icon-md" />
  {:else}
    <IconNotYet class="size-icon-md" />
  {/if}
{/snippet}

{#if trigger}
  <button
    {...trigger}
    class={iconTileVariants({
      class:
        "press-tint touch-hit border-0 p-0 text-(--stage-hue) focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)",
    })}
    data-box
    style:--stage-hue={hue}
    type="button"
  >
    {@render glyph()}
  </button>
{:else}
  <span
    aria-hidden="true"
    class={iconTileVariants({ class: "text-(--stage-hue)" })}
    data-box
    style:--stage-hue={hue}
  >
    {@render glyph()}
  </span>
{/if}
