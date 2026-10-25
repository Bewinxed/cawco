/**
 * The dashboard's own parts the options are drawn from: its kit (Button,
 * Badge, Checkbox, Select, the chip and dock recipes, the bar's glass), its
 * icons, its OS mark, TaskRing and Markdown, imported where they live, so a
 * capture is their markup on the dashboard's stylesheet.
 */
// biome-ignore lint/performance/noBarrelFile: the capture stage's one door into the dashboard's parts
export { default as OsMark } from "../../../apps/dashboard/src/lib/cawco/OsMark.svelte";
export { default as TaskRing } from "../../../apps/dashboard/src/lib/cawco/TaskRing.svelte";
export { default as NewTaskForm } from "../../../apps/dashboard/src/lib/cawco/tasks/NewTaskForm.svelte";
export { default as BarGlass } from "../../../apps/dashboard/src/lib/components/ui/bar-glass/bar-glass.svelte";
export {
  Button,
  sendVariants,
} from "../../../apps/dashboard/src/lib/components/ui/button/index.js";
export { Checkbox } from "../../../apps/dashboard/src/lib/components/ui/checkbox/index.js";
export {
  chipsVariants,
  chipVariants,
} from "../../../apps/dashboard/src/lib/components/ui/chip/index.js";
export { dockShellVariants } from "../../../apps/dashboard/src/lib/components/ui/dock-shell/index.js";
export { Markdown } from "../../../apps/dashboard/src/lib/components/ui/markdown/index.js";
export { sectionHeadVariants } from "../../../apps/dashboard/src/lib/components/ui/section-header/index.js";
export {
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconError,
  IconFilter,
  IconListRows,
  IconMore,
  IconNeedsYou,
  IconPlus,
  IconRefresh,
  IconSidebar,
  IconStopped,
  IconTick,
  IconWindow,
} from "../../../apps/dashboard/src/lib/icons.js";
