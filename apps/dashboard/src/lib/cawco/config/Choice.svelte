<script lang="ts" generics="T extends string">
  /**
   * A choice between a few named options: the kit's segmented control, on one
   * line (DESIGN.md, Segmented: one groove, never two rows). Where the row is
   * narrower than its segments, the segments first give up the room at their
   * sides, down to their words (the kit item's `fit`), so a phone's row holds
   * six short options whole: Effort's Unset to max at 390. Only a row
   * narrower than the words alone scrolls sideways under the house edge
   * fade; the scroller pads into an equal negative margin, so every
   * segment's touch area stays whole (DESIGN.md, The 44 Touch Rule).
   */
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";

  let {
    label,
    value,
    options,
    onchange,
  }: {
    label: string;
    value: T;
    options: { value: T; label: string; disabled?: boolean }[];
    onchange: (next: T) => void;
  } = $props();

  /**
   * The chosen segment stands whole in the row, clear of the fades: when the
   * row scrolls, it is brought in by the least it takes whenever the choice
   * changes (sideways only; the page never moves for it).
   */
  function chosenInView(row: HTMLElement) {
    // Read so this runs again when the choice changes.
    if (!value) {
      return;
    }
    const item = row.querySelector<HTMLElement>(
      '[data-slot="toggle-group-item"][data-state="on"]'
    );
    if (!item || row.scrollWidth <= row.clientWidth) {
      return;
    }
    // The house fade's length on this row (edge-fade.css `--fade-len`).
    const fade =
      Number.parseFloat(getComputedStyle(row).getPropertyValue("--fade-len")) ||
      0;
    const box = item.getBoundingClientRect();
    const at = box.left - row.getBoundingClientRect().left + row.scrollLeft;
    const start = at - fade;
    const end = at + box.width + fade - row.clientWidth;
    if (start < row.scrollLeft) {
      row.scrollLeft = start;
    } else if (end > row.scrollLeft) {
      row.scrollLeft = end;
    }
  }
</script>

<div
  data-slot="choice"
  class="kit-edge-fade no-scrollbar -m-space-2 flex min-w-0 overflow-x-auto overscroll-x-contain p-space-2"
  {@attach chosenInView}
>
  <ToggleGroup.Root
    aria-label={label}
    class="min-w-0 flex-initial"
    onValueChange={(next) => {
      const picked = options.find((one) => one.value === next);
      if (picked) {
        onchange(picked.value);
      }
    }}
    type="single"
    {value}
  >
    {#each options as option (option.value)}
      <ToggleGroup.Item disabled={option.disabled} fit value={option.value}>
        {option.label}
      </ToggleGroup.Item>
    {/each}
  </ToggleGroup.Root>
</div>
