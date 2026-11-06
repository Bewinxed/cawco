<!--
  Planted Back and Close for house/back-close-symbol (scripts/lint/fixtures/expected.txt):
  a ghost Button in a page's head holding the chevron and a place's name,
  a BarItem handed the chevron with words as its children, an aliased
  close glyph with words in a `<button>` under a BarGlass, and a Button in a
  `<header>` whose words come from an expression; beside them the shapes the
  rule must leave alone: Back and Close as symbols, a chevron with words in a
  list's row, a word action in a bar.
-->
<script lang="ts">
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconChevronLeft,
    IconArrowLeft as Left,
    IconClose as Shut,
  } from "#lib/icons.js";

  const place = "Pantry rewrite";
  const noop = () => undefined;
</script>

<div data-slot="page-head">
  <Button onclick={noop} size="sm" variant="ghost"
    ><IconChevronLeft /><span>{place}</span></Button
  >
</div>
<BarItem icon={IconChevronLeft} label="Back to {place}">Back</BarItem>
<BarGlass form="group"><button type="button"><Shut />Close</button></BarGlass>
<header><Button variant="ghost"><Left />{place}</Button></header>

<BarGlass form="group">
  <BarItem icon={IconChevronLeft} label="Back to {place}" onclick={noop} />
  <BarItem icon={Shut} label="Close" onclick={noop} />
</BarGlass>
<ul>
  <li><button type="button"><Left /><span>Parent folder</span></button></li>
</ul>
<header><Button variant="ghost">Cancel</Button></header>
