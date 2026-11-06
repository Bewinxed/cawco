<!--
  Planted bar symbols for house/bar-symbol-linear (scripts/lint/fixtures/expected.txt):
  a BarItem handed a duotone icon, a ternary with a duotone arm, and a
  duotone icon drawn as a bar's symbol; beside them the shapes the rule
  must leave alone: linear twins, the local Close, a duotone icon in a row.
-->
<script lang="ts">
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
<p><IconChat /> A row keeps its duotone.</p>
