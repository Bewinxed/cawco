<!--
  Planted bar symbols for house/bar-symbol-linear (scripts/lint/fixtures/expected.txt):
  a BarItem handed a duotone icon, a ternary with a duotone arm, a
  duotone icon drawn as a bar's symbol, a duotone icon in a bar item's
  children outside the symbol slot, and an OsMark in its filled face in a
  bar item; beside them the shapes the rule must leave alone: linear twins,
  the local Close, an OsMark in its linear face in a bar item, a duotone
  icon and a filled OsMark in a row.
-->
<script lang="ts">
  import OsMark from "#lib/cawco/OsMark.svelte";
  import { BarItem } from "#lib/components/ui/bar-glass/index.js";
  import {
    IconChat,
    IconClose,
    IconMaximize,
    IconMinimizeLinear,
    IconMore,
    IconMoreLinear,
  } from "#lib/icons.js";

  let big = $state(false);
</script>

<BarItem icon={IconMore} label="More" />
<BarItem icon={big ? IconMinimizeLinear : IconMaximize} label="Size" />
<BarItem label="Comments"><IconChat data-slot="bar-symbol" /></BarItem>
<BarItem icon={IconMoreLinear} label="More" />
<BarItem icon={IconClose} label="Close" />
<BarItem label="Jump"><IconChat class="size-icon-md" /></BarItem>
<BarItem label="Place"><OsMark os="linux-x64" /></BarItem>
<BarItem label="Place"><OsMark face="linear" os="linux-x64" /></BarItem>
<p><IconChat /> A row keeps its duotone.</p>
<p><OsMark os="darwin-arm64" /> A row keeps its filled mark.</p>
