// biome-ignore lint/performance/noBarrelFile: shadcn-svelte component barrel — this re-export surface is the public import path consumers use across the app
export { default as Root, default as Popover } from "./popover.svelte";
export {
  default as Close,
  default as PopoverClose,
} from "./popover-close.svelte";
export {
  default as Content,
  default as PopoverContent,
  floatingSurface,
} from "./popover-content.svelte";
export {
  default as Portal,
  default as PopoverPortal,
} from "./popover-portal.svelte";
export {
  default as Title,
  default as PopoverTitle,
} from "./popover-title.svelte";
export {
  default as Trigger,
  default as PopoverTrigger,
} from "./popover-trigger.svelte";
