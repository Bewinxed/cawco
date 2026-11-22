<!--
  A one-of-many pick's mark: a ring, its dot growing in while the control it
  stands in is checked (any ancestor's `aria-checked`), so the pick is told by
  shape as well as colour. Accounts' routing cards (StrategyPicker) and the
  option tiles' marked look (OptionTiles `glide: "mark"`) draw it.
-->

<span
  aria-hidden="true"
  class="grid size-icon-md flex-none place-items-center rounded-pill border-2 border-neutral-8 transition-[border-color] duration-(--duration-fade) ease-out in-aria-checked:border-selected-icon"
  data-box
  data-slot="radio-mark"
>
  <span
    class="size-space-2 scale-50 rounded-pill bg-selected-icon opacity-0 transition-[scale,opacity] duration-(--duration-toggle) ease-out in-aria-checked:scale-100 in-aria-checked:opacity-100"
  ></span>
</span>
