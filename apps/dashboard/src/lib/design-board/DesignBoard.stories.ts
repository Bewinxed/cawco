/**
 * CawCo's design system board (Component Story Format 3, live components),
 * one story per section: each foundation and each kit family in the states
 * its own states file holds, in the light scheme and the dark side by side.
 * The meta's `pair` is every story's, so the font-pair dial sets them all.
 */
import DesignBoard from "./DesignBoard.svelte";
import { TODAY } from "./type-pairs/pairs.js";

export default {
  title: "Design system/Board",
  component: DesignBoard,
  args: { pair: TODAY },
};

/** A conversation as the transcript draws it, in the pair the board is set in. */
export const Transcript = { args: { section: "Transcript" } };

/** Colour, light beside dark. */
export const Colour = { args: { section: "Colour" } };

/** Typography, light beside dark. */
export const Typography = { args: { section: "Typography" } };

/** Spacing, light beside dark. */
export const Spacing = { args: { section: "Spacing" } };

/** Elevation, light beside dark. */
export const Elevation = { args: { section: "Elevation" } };

/** Motion, light beside dark. */
export const Motion = { args: { section: "Motion" } };

/** Layout and layers, light beside dark. */
export const LayoutAndLayers = { args: { section: "Layout and layers" } };

/** Button in its states, light beside dark. */
export const Button = { args: { section: "button/button.stories.ts" } };

/** Toggle in its states, light beside dark. */
export const Toggle = { args: { section: "toggle/toggle.stories.ts" } };

/** Toggle group in its states, light beside dark. */
export const ToggleGroup = {
  args: { section: "toggle-group/toggle-group.stories.ts" },
};

/** Icon toggle in its states, light beside dark. */
export const IconToggle = {
  args: { section: "icon-toggle/icon-toggle.stories.ts" },
};

/** Tabs in its states, light beside dark. */
export const Tabs = { args: { section: "tabs/tabs.stories.ts" } };

/** Input in its states, light beside dark. */
export const Input = { args: { section: "input/input.stories.ts" } };

/** Input group in its states, light beside dark. */
export const InputGroup = {
  args: { section: "input-group/input-group.stories.ts" },
};

/** Textarea in its states, light beside dark. */
export const Textarea = { args: { section: "textarea/textarea.stories.ts" } };

/** Checkbox in its states, light beside dark. */
export const Checkbox = { args: { section: "checkbox/checkbox.stories.ts" } };

/** Switch in its states, light beside dark. */
export const Switch = { args: { section: "switch/switch.stories.ts" } };

/** Select in its states, light beside dark. */
export const Select = { args: { section: "select/select.stories.ts" } };

/** Option group in its states, light beside dark. */
export const OptionGroup = {
  args: { section: "option-group/option-group.stories.ts" },
};

/** Badge in its states, light beside dark. */
export const Badge = { args: { section: "badge/badge.stories.ts" } };

/** Alert in its states, light beside dark. */
export const Alert = { args: { section: "alert/alert.stories.ts" } };

/** Live dot in its states, light beside dark. */
export const LiveDot = { args: { section: "live-dot/live-dot.stories.ts" } };

/** Spinner in its states, light beside dark. */
export const Spinner = { args: { section: "spinner/spinner.stories.ts" } };

/** Progress in its states, light beside dark. */
export const Progress = { args: { section: "progress/progress.stories.ts" } };

/** Skeleton in its states, light beside dark. */
export const Skeleton = { args: { section: "skeleton/skeleton.stories.ts" } };

/** Toast in its states, light beside dark. */
export const Toast = { args: { section: "sonner/sonner.stories.ts" } };

/** Empty state in its states, light beside dark. */
export const EmptyState = { args: { section: "empty/empty-state.stories.ts" } };

/** Popover in its states, light beside dark. */
export const Popover = { args: { section: "popover/popover.stories.ts" } };

/** Dropdown menu in its states, light beside dark. */
export const DropdownMenu = {
  args: { section: "dropdown-menu/dropdown-menu.stories.ts" },
};

/** Tooltip in its states, light beside dark. */
export const Tooltip = { args: { section: "tooltip/tooltip.stories.ts" } };

/** Command in its states, light beside dark. */
export const Command = { args: { section: "command/command.stories.ts" } };

/** Dialog in its states, light beside dark. */
export const Dialog = { args: { section: "dialog/dialog.stories.ts" } };

/** Sheet in its states, light beside dark. */
export const Sheet = { args: { section: "sheet/sheet.stories.ts" } };

/** Drawer in its states, light beside dark. */
export const Drawer = { args: { section: "drawer/drawer.stories.ts" } };

/** Table in its states, light beside dark. */
export const Table = { args: { section: "table/table.stories.ts" } };

/** Row in its states, light beside dark. */
export const Row = { args: { section: "row/row.stories.ts" } };

/** Kbd in its states, light beside dark. */
export const Kbd = { args: { section: "kbd/kbd.stories.ts" } };
