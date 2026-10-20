// biome-ignore lint/performance/noBarrelFile: shadcn-svelte component barrel — this re-export surface is the public import path consumers use across the app
export { default as Root, default as Sheet } from "./sheet.svelte";
export { default as Close, default as SheetClose } from "./sheet-close.svelte";
export {
  default as Content,
  default as SheetContent,
} from "./sheet-content.svelte";
export {
  default as Footer,
  default as SheetFooter,
} from "./sheet-footer.svelte";
export {
  default as Header,
  default as SheetHeader,
} from "./sheet-header.svelte";
export {
  default as Overlay,
  default as SheetOverlay,
} from "./sheet-overlay.svelte";
export {
  default as Portal,
  default as SheetPortal,
} from "./sheet-portal.svelte";
export { default as Title, default as SheetTitle } from "./sheet-title.svelte";
export {
  default as Trigger,
  default as SheetTrigger,
} from "./sheet-trigger.svelte";
