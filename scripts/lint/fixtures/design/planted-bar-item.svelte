<!--
  Planted bar items for house/bar-item-in-kit (scripts/lint/fixtures/expected.txt):
  a raw button carrying the kit's mark and writing its own pressed fill, and
  a selector naming the mark outside the kit; beside them the shapes the
  rule must leave alone: the kit's BarItem, pressed, and its BAR_ITEM.
-->
<script lang="ts">
  import { BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { BAR_ITEM } from "#lib/components/ui/bar-glass/marks.js";
  import { IconCompare } from "#lib/icons.js";

  let comparing = $state(false);
  const items = () => document.querySelectorAll("[data-bar-item]");
  const kept = () => document.querySelectorAll(BAR_ITEM);
</script>

<button
  data-bar-item
  aria-pressed={comparing}
  class="aria-pressed:bg-selected-bg"
  onclick={() => {
    comparing = !comparing;
  }}
  type="button"
>
  <IconCompare data-slot="bar-symbol" aria-hidden="true" />
</button>
<BarItem
  icon={IconCompare}
  label="Compare"
  onclick={() => {
    comparing = !comparing;
    items();
    kept();
  }}
  pressed={comparing}
/>
