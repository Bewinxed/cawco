<script lang="ts">
  /**
   * A design graph's direction as its stage draws it, standing in for the
   * live stage page in a states fixture (parked-prompt-live,
   * home/chat-asks-live): the real controls a hover grey reaches (a bar's
   * ghost buttons, a menu's rows, a field), in the direction's grey at
   * night, in the graph's own well.
   */
  import type { ParkedDirection } from "@cawco/core/parked";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Command from "#lib/components/ui/command/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconArchive, IconCopy, IconFolder, IconPen } from "#lib/icons.js";
  import DirectionWell, {
    type DirectionDrawing,
  } from "../graph/DirectionWell.svelte";
  import { DIRECTION_GREYS } from "./parked-fixtures";

  let {
    direction,
    drawing = { state: "drawn" },
    onretry = () => undefined,
  }: {
    direction: ParkedDirection;
    /** How the stage draws it: drawn, on its way, or failed. */
    drawing?: DirectionDrawing;
    onretry?: () => void;
  } = $props();
</script>

<DirectionWell {drawing} name={direction.name} {onretry}>
  <div
    class="flex flex-col gap-space-3 p-space-4"
    style:--color-surface-hover={DIRECTION_GREYS[direction.file]}
  >
    <div class="flex flex-wrap items-center gap-space-1">
      <!-- Its menu open: the ghost's look under the pointer. -->
      <Button
        aria-expanded={true}
        icon={IconArchive}
        label="Archive"
        size="sm"
        variant="ghost"
      />
      <Button icon={IconPen} label="Rename" size="sm" variant="ghost" />
    </div>
    <Command.Root value="move">
      <Command.List>
        <Command.Item value="move"
          ><IconFolder /><span>Move to project</span></Command.Item
        >
        <Command.Item value="copy"
          ><IconCopy /><span>Duplicate</span></Command.Item
        >
      </Command.List>
    </Command.Root>
    <Input aria-label="Session name" value="Nightly release notes" />
  </div>
</DirectionWell>
