<!--
  A stage's look, as items of the house menu it stands in: its glyph and its
  colour, each a submenu of radio items (stages.md `icon:` and `color:`).
-->
<script lang="ts">
  import type { StageColor, StageIcon } from "@cawco/core/views";
  import { STAGE_COLORS, STAGE_ICONS } from "@cawco/core/views";
  import {
    stageLookWords,
    setupPageWords as words,
  } from "@cawco/core/words/onboarding";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { STAGE_GLYPHS, STAGE_HUES } from "../../../tasks/stage-look";
  import type { Stage } from "./stage";

  let {
    stage,
    onlook,
  }: {
    stage: Stage;
    onlook: (patch: Pick<Stage, "icon" | "color">) => void;
  } = $props();
</script>

<DropdownMenu.Sub>
  <DropdownMenu.SubTrigger><span>{words.glyph}</span></DropdownMenu.SubTrigger>
  <DropdownMenu.SubContent>
    <DropdownMenu.RadioGroup
      onValueChange={(next) => onlook({ icon: next as StageIcon })}
      value={stage.icon ?? ""}
    >
      {#each STAGE_ICONS as icon (icon)}
        {@const Mark = STAGE_GLYPHS[icon]}
        <DropdownMenu.RadioItem value={icon}>
          <Mark />
          <span>{stageLookWords.icons[icon]}</span>
        </DropdownMenu.RadioItem>
      {/each}
    </DropdownMenu.RadioGroup>
  </DropdownMenu.SubContent>
</DropdownMenu.Sub>
<DropdownMenu.Sub>
  <DropdownMenu.SubTrigger><span>{words.color}</span></DropdownMenu.SubTrigger>
  <DropdownMenu.SubContent>
    <DropdownMenu.RadioGroup
      onValueChange={(next) =>
        onlook({ color: next ? (next as StageColor) : undefined })}
      value={stage.color ?? ""}
    >
      <DropdownMenu.RadioItem value="">
        <span>{words.noColor}</span>
      </DropdownMenu.RadioItem>
      {#each STAGE_COLORS as color (color)}
        <DropdownMenu.RadioItem value={color}>
          <span
            aria-hidden="true"
            class="size-icon-sm rounded-pill bg-(--swatch)"
            data-box
            style:--swatch={STAGE_HUES[color]}
          ></span>
          <span>{stageLookWords.colors[color]}</span>
        </DropdownMenu.RadioItem>
      {/each}
    </DropdownMenu.RadioGroup>
  </DropdownMenu.SubContent>
</DropdownMenu.Sub>
