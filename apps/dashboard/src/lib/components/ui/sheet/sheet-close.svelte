<script lang="ts" module>
  /**
   * A sheet's Close drawn in a row of the content's own, on a sheet whose
   * content names it from that first row (Sheet Content `titleHidden`): that
   * row's icon button's twin, the nav row's height and its 20px glyph. A
   * sheet with a header gets the kit's Close from Sheet Content, a bare
   * symbol in its glass group (The Title Bars Follow Liquid Glass Rule).
   */
  const SHEET_CLOSE =
    "touch-hit focus-inset inline-flex size-c-nav-h flex-none items-center justify-center rounded-sm bg-transparent text-ink-muted [--hit-edge:1px] transition-control hover:bg-surface-hover hover:text-ink-strong [&_svg]:size-space-5";
</script>

<script lang="ts">
  import { commonWords } from "@cawco/core/words/common";
  import { Dialog as SheetPrimitive } from "bits-ui";
  import { IconClose } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: Omit<SheetPrimitive.CloseProps, "children" | "child"> = $props();
</script>

<SheetPrimitive.Close
  aria-label={commonWords.close}
  bind:ref
  class={cn(SHEET_CLOSE, className)}
  data-slot="sheet-close"
  title={commonWords.close}
  {...restProps}
>
  <IconClose aria-hidden="true" />
</SheetPrimitive.Close>
