/**
 * A bar control's count, the one badge recipe (BarItem's `count`, a head
 * control's count in its glyph form): it takes no room in the control, so
 * a counted control is its neighbours' size and shape with its glyph at
 * its centre, and stands on the control's top trailing corner (HIG, Tab
 * bars: "a badge — a red oval containing white text and either a number
 * or an exclamation point — on a tab"; SwiftUI `badge(_:)`: "Badges appear
 * in list rows, tab bars, toolbar items, and menus"), in ink-solid as the
 * house's inverted tiles are, never coral. Its foot stands on the glyph's
 * top line (`--count-foot`, the glyph's inset under the top of the box it
 * stands in: the item's, or none in a box the glyph's own size), so it
 * never lies on the glyph; its leading side a quarter of the glyph
 * (`--count-glyph`) past the control's centre, and it grows toward the
 * trailing side as its figures do, never widening the control. The
 * control is its containing block (`relative`).
 */
export const COUNT_BADGE =
  "pointer-events-none absolute bottom-[calc(100%_-_var(--count-foot,0%))] start-[calc(50%_+_var(--count-glyph)_/_4)] grid h-icon-sm min-w-icon-sm place-items-center rounded-pill bg-ink-solid px-space-row font-medium text-meta text-on-ink leading-none whitespace-nowrap num";
