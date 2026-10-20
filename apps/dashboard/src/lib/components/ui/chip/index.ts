import type { VariantProps } from "tailwind-variants";
import { tv } from "#lib/utils.js";

/**
 * The kit's chip (DESIGN.md, Permission gate: "option chips (30px, 8px
 * radius, keycap digits)"; Typography: the label role for chips). A chip is
 * written on the element its caller already has (a button, a bits-ui toggle
 * item, a record's span), so the part is its recipe, applied as a class.
 *
 * - `option`: a choice, 30px tall including its edge under every pointer (a
 *   finger's 44px is `touch-hit` on the chip, never a taller chip), wrapping
 *   its label line by line. A pick is the element's own state: a toggle
 *   pressed (`aria-pressed`), a radio checked (`aria-checked`), or a record
 *   of what was picked (`data-chosen`). Picked, it takes the coral edge, a
 *   recessed fill and an inverted keycap, never a size or weight change (a
 *   pick never reflows the row) and never the attn hue: selection is not a
 *   warning. Only a chip that can be pressed (an enabled button) hovers.
 * - `tray`: a chip on the tray row standing on the composer (the delegate
 *   tray's, the plan's, a raised ask's), at the row's chip height, on the
 *   attachment chip's surface drawn as its own layer (`::before`), so a
 *   caller tints that layer (`before:bg-status-attn-bg`, by a state variant
 *   or outright) and the hover never paints over a tint: the hover only moves
 *   the layer's resting fill (`--tray-chip-fill`). A compact standalone
 *   control, it scales on press (DESIGN.md, The Press Rule).
 * - `setting`: a setting shown as a small trigger that opens its picker
 *   (DESIGN.md, New-session dialog: "Setting chips are 30px with an 8px
 *   radius, a 16px glyph and a 12px chevron. A setting that cannot be
 *   changed where it is shown is the same chip sunk into the surface:
 *   `surface-recess` fill, `border-hairline` edge, no chevron and no hover").
 *   The sunk chip is the element's state, `data-variant="static"`; a setting
 *   on offer but unavailable is `aria-disabled` and fades to 50% (DESIGN.md,
 *   Buttons: "Disabled: 50% opacity"). Its words truncate inside
 *   `data-slot="chip-label"`; its chevron is `data-slot="chevron"`. A button
 *   chip hovers and scales on press; a static one does neither.
 *
 * `size` (setting chips): `regular`, or `compact` for the session card's
 * settings group (DESIGN.md, Session card: "the four settings (model,
 * effort, permission, account) as one group of equal chips `--space-1`
 * apart"): a compact row's height, and on a phone a finger's 44px with the
 * chevron gone (an account chip, `data-account-chip`, keeps its own, the
 * only hint it opens anything).
 * `tone` (setting chips): `muted` (nothing chosen), `fail` (a pick that
 * fails), `grant` (a wider grant than asked, DESIGN.md, The Consequential
 * Grant Rule: "drawn in the warning tint with warning ink … and a real
 * edge", the same at rest, under the pointer and sunk).
 */
export const chipVariants = tv({
  base: "mark-line inline-flex items-center rounded-sm type-label text-ink-strong",
  variants: {
    variant: {
      option:
        "hit-edge-hair min-h-c-btn-h-sm max-w-full gap-space-2 border border-border-control bg-surface-raised px-space-3 py-space-1 text-start motion-safe:transition-[border-color,background-color] motion-safe:dur-control motion-safe:ease-out enabled:cursor-pointer enabled:not-aria-pressed:not-aria-checked:hover:bg-surface-hover aria-pressed:border-brand-solid aria-pressed:bg-surface-recess aria-checked:border-brand-solid aria-checked:bg-surface-recess data-chosen:border-brand-solid data-chosen:bg-surface-recess aria-pressed:[&_.kit-keycap]:bg-chip-chosen-bg aria-pressed:[&_.kit-keycap]:text-chip-chosen-ink aria-checked:[&_.kit-keycap]:bg-chip-chosen-bg aria-checked:[&_.kit-keycap]:text-chip-chosen-ink data-chosen:[&_.kit-keycap]:bg-chip-chosen-bg data-chosen:[&_.kit-keycap]:text-chip-chosen-ink",
      tray: "pointer-events-auto relative isolate h-c-tray-chip cursor-pointer touch-manipulation touch-callout-none select-none gap-c-pill-gap border-0 bg-transparent px-space-2 [--tray-chip-fill:var(--surface-raised)] transition-[color] dur-control ease-out motion-safe:transition-[color,transform] motion-safe:active:[transform:scale(var(--press-scale))] can-hover:hover:[--tray-chip-fill:var(--surface-hover)] before:absolute before:inset-0 before:-z-1 before:rounded-inherit before:border before:border-border-hairline before:bg-(color:--tray-chip-fill) before:shadow-tile before:transition-[background-color] before:dur-control before:ease-out *:[svg]:size-icon-md *:[svg]:flex-none",
      setting:
        "h-c-btn-h-sm max-w-full cursor-pointer gap-space-2 whitespace-nowrap border border-border-control bg-surface-raised px-space-2 leading-none transition-control motion-safe:transition-control-press motion-safe:enabled:not-aria-busy:pressed:[transform:scale(var(--press-scale))] can-hover:enabled:not-variant-static:hover:bg-surface-hover aria-disabled:opacity-50 variant-static:cursor-default variant-static:border-border-hairline variant-static:bg-surface-recess *:[svg]:flex-none *:[svg]:not-data-[slot=chevron]:size-icon-md *:data-[slot=chevron]:size-icon-sm *:data-[slot=chevron]:text-ink-subtle **:data-[slot=chip-label]:min-w-0 **:data-[slot=chip-label]:overflow-hidden **:data-[slot=chip-label]:text-ellipsis",
    },
    size: {
      regular: "",
      compact:
        "h-(--row-compact-h) gap-space-1 max-phone:h-c-btn-h-lg max-phone:not-data-account-chip:*:data-[slot=chevron]:hidden",
    },
    /** A setting chip's tone; its classes are the setting chip's own (below). */
    tone: { muted: "", fail: "", grant: "" },
  },
  compoundVariants: [
    { variant: "setting", tone: "muted", class: "text-ink-muted" },
    {
      variant: "setting",
      tone: "fail",
      class: "border-status-fail-ink text-status-fail-ink",
    },
    {
      variant: "setting",
      tone: "grant",
      class:
        "border-status-attn-ink bg-status-attn-bg text-status-attn-ink can-hover:enabled:not-variant-static:hover:bg-status-attn-bg variant-static:border-status-attn-ink variant-static:bg-status-attn-bg *:data-[slot=chevron]:text-status-attn-ink",
    },
  ],
  defaultVariants: { variant: "option" },
});

/**
 * A row of option chips, wrapping whole chips onto the next line. Under a
 * finger the rows stand 14px apart, so each chip's 44px `touch-hit` area
 * (30 drawn + 7 above + 7 below) meets its neighbour's at the midpoint
 * instead of overlapping it.
 */
export const chipsVariants = tv({
  base: "flex flex-wrap gap-space-2 hit-gap-x-space-2 hit-gap-y-(--space-2) coarse:gap-y-space-4 coarse:hit-gap-y-(--space-4)",
});

export type ChipVariant = VariantProps<typeof chipVariants>["variant"];
export type ChipSize = VariantProps<typeof chipVariants>["size"];
