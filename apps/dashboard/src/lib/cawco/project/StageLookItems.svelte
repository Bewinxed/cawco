<!--
  A stage's look, as items of the house menu it stands in (stages.md `icon:`
  and `color:`): its glyph as a grid of glyph tiles, each in the stage's
  hue, then its colour as a row of swatches, No colour first, each under
  its head. They open in place in the menu, never as side flyouts: on a
  phone a flyout of twenty-seven rows covered the screen and its menu
  (cold review 3c75c466), and a glyph is chosen by its look, not its name,
  which each tile still says to a screen reader.
-->
<script lang="ts">
  import { STAGE_COLORS, STAGE_ICONS } from "@cawco/core/views";
  import {
    stageLookWords,
    setupPageWords as words,
  } from "@cawco/core/words/onboarding";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { STAGE_GLYPHS, STAGE_HUES } from "../tasks/stage-look";
  import type { Stage } from "./setup-stage";

  let {
    stage,
    onlook,
  }: {
    stage: Stage;
    onlook: (patch: Pick<Stage, "icon" | "color">) => void;
  } = $props();

  const hue = $derived(
    stage.color ? STAGE_HUES[stage.color] : "var(--ink-muted)"
  );
</script>

<DropdownMenu.Label>{words.glyph}</DropdownMenu.Label>
<DropdownMenu.RadioGroup
  aria-label={words.glyph}
  onValueChange={(next) =>
    onlook({ icon: STAGE_ICONS.find((one) => one === next) })}
  value={stage.icon ?? ""}
>
  <div
    class="grid grid-cols-7 gap-space-1 px-space-1 pb-space-1 coarse:phone:grid-cols-5"
  >
    {#each STAGE_ICONS as icon (icon)}
      {@const Mark = STAGE_GLYPHS[icon]}
      <DropdownMenu.RadioItem
        aria-label={stageLookWords.icons[icon]}
        closeOnSelect={false}
        tile
        value={icon}
      >
        <!-- In a box of its own: the item inks its first glyph muted. -->
        <span class="text-(--hue)" data-box style:--hue={hue}
          ><Mark class="size-icon-md" /></span
        >
      </DropdownMenu.RadioItem>
    {/each}
  </div>
</DropdownMenu.RadioGroup>
<DropdownMenu.Separator />
<DropdownMenu.Label>{words.color}</DropdownMenu.Label>
<DropdownMenu.RadioGroup
  aria-label={words.color}
  onValueChange={(next) =>
    onlook({ color: STAGE_COLORS.find((one) => one === next) })}
  value={stage.color ?? ""}
>
  <div class="flex gap-space-1 px-space-1 pb-space-1">
    <DropdownMenu.RadioItem
      aria-label={words.noColor}
      closeOnSelect={false}
      tile
      value=""
    >
      <span
        aria-hidden="true"
        class="size-icon-sm rounded-pill inset-ring inset-ring-border-control-strong"
        data-box
      ></span>
    </DropdownMenu.RadioItem>
    {#each STAGE_COLORS as color (color)}
      <DropdownMenu.RadioItem
        aria-label={stageLookWords.colors[color]}
        closeOnSelect={false}
        tile
        value={color}
      >
        <span
          aria-hidden="true"
          class="size-icon-sm rounded-pill bg-(--swatch)"
          data-box
          style:--swatch={STAGE_HUES[color]}
        ></span>
      </DropdownMenu.RadioItem>
    {/each}
  </div>
</DropdownMenu.RadioGroup>
