/**
 * COMPARISON ONLY, deleted once the owner picks (2026-11-25): the kit's
 * recipes for its boxes that lead with a glyph as they stood at
 * cawco/neon-design-system 5cecb35a9f, before the even-room rule, word for
 * word but for the button's padding: the theme's `btn-pad` utility is gone,
 * so its two cases are written out (`px-(--btn-pad)` beside the button's own
 * slot, `childrenPad` for a button drawn from its children with a glyph at
 * its start).
 */
const BUTTON =
  "group/button mark-line mark-cap hitbox pointer-coarse:hitbox:touch-area inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-sm control control-toggle glass-item:concentric-at font-medium type-body text-tx leading-none tracking-tight [--hit-edge:1px] [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0";

export const today = {
  button: BUTTON,
  buttonPrimary: "control-primary text-on-accent",
  buttonDefault:
    "h-9 px-(--btn-pad) gap-(--btn-gap) [--btn-pad:var(--spacing-space-3)] [--btn-word-pad:var(--spacing-space-1)] [--btn-gap:calc(var(--spacing)_*_2)] [--btn-icon:var(--spacing-icon-md)]",
  buttonXs:
    "h-6 px-(--btn-pad) gap-(--btn-gap) type-label [--btn-pad:calc(var(--spacing)_*_1.5)] [--btn-word-pad:calc(var(--spacing)_*_0.5)] [--btn-gap:var(--spacing-space-1)] [--btn-icon:var(--spacing-icon-sm)] [&_svg:not([class*='size-'])]:size-icon-sm",
  buttonSm:
    "h-control-sm px-(--btn-pad) gap-(--btn-gap) [--btn-pad:var(--spacing-space-2)] [--btn-word-pad:var(--spacing-space-1)] type-label [--btn-gap:var(--spacing-space-2)] [--btn-icon:var(--spacing-icon-md)]",
  buttonLg:
    "h-11 px-(--btn-pad) gap-(--btn-gap) [--btn-pad:var(--spacing-space-3)] [--btn-word-pad:var(--spacing-space-1)] [--btn-gap:calc(var(--spacing)_*_2)] [--btn-icon:var(--spacing-icon-md)]",
  childrenPad: "ps-(--btn-pad) pe-[calc(var(--btn-pad)+var(--btn-word-pad))]",
  toggle:
    "control control-toggle group/toggle mark-line hitbox pointer-coarse:hitbox:touch-area inline-flex items-center justify-center gap-space-1 whitespace-nowrap rounded-sm glass-item:concentric-at text-tx type-label [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0 control-outline [--hit-edge:1px]",
  toggleXs:
    "h-space-6 min-w-space-6 gap-1.5 px-2 type-meta has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-icon-sm",
  toggleLg:
    "h-control-lg min-w-control-lg px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
  badge:
    "group/badge mark-line mark-cap inline-flex h-icon-lg w-fit shrink-0 items-center justify-center gap-space-1 overflow-hidden whitespace-nowrap rounded-xs px-space-2 type-meta font-medium leading-none transition-colors has-data-[icon=inline-end]:pr-space-1 has-data-[icon=inline-start]:pl-space-1 [&>svg]:pointer-events-none [&>svg]:size-icon-sm bg-live-wash text-live",
  chip: "inline-flex items-center rounded-sm mark-line text-tx type-label control hitbox h-control-sm max-w-full gap-space-2 px-space-2 leading-none whitespace-nowrap hit-edge-hair pointer-coarse:hitbox:touch-area [&_[data-slot=chip-label]]:min-w-0 [&_[data-slot=chip-label]]:overflow-hidden [&_[data-slot=chip-label]]:text-ellipsis [&>svg]:flex-none [&>svg:not([data-slot=chevron])]:size-icon-md",
  chipCompact: "h-row-compact gap-space-1",
  option:
    "select-none inline-flex items-center rounded-sm mark-line text-tx type-label group/option control hitbox min-h-control-sm max-w-full gap-space-2 px-space-3 py-space-1 text-start hit-edge-hair pointer-coarse:hitbox:touch-area focus-inset grid min-w-0 grid-cols-auto-fluid content-center items-box-start",
  menuItem:
    "data-menu-first:sc-t-concentric-xs data-menu-last:sc-b-concentric-xs min-h-control-sm [border-radius:var(--radius-xs)] mark-line transition-control coarse:min-h-control-lg [&>:where(svg,.icon-swap):first-child]:text-tx-2 group/dropdown-menu-item relative flex cursor-default select-none items-center gap-2.5 type-label outline-hidden [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0 px-2.5",
  segment:
    "relative inline-flex h-(--item) items-center justify-center gap-1.5 rounded-(--shape) px-space-3 mark-line py-0 font-sans text-base leading-none font-medium whitespace-nowrap text-tx-2 transition-control not-data-[state=active]:not-data-[state=on]:press-tint hover:not-data-[state=active]:not-data-[state=on]:not-aria-expanded:bg-ui-2 data-[state=active]:text-tx data-[state=on]:text-tx focus-fill hitbox pointer-coarse:hitbox:touch-area shrink-0 [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0",
  alert:
    "group/alert relative grid w-full grid-cols-[1fr] gap-y-space-1 rounded-sm px-space-3 py-space-3 text-left type-body has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-space-2 [&>:not(svg,[data-slot=alert-action])]:col-start-[-2] [&>svg:not([class*='size-'])]:size-icon-md [&>svg]:row-span-2 [&>svg]:translate-y-0.5 [&>svg]:text-current bg-bg-2 text-tx",
  row: "row-cells min-h-row gap-y-space-1 py-space-2",
};
