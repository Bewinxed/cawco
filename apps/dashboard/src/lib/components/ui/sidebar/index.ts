// biome-ignore lint/performance/noBarrelFile: shadcn-svelte component barrel — every consumer imports the group from this index
export { useSidebar } from "./context.svelte.js";
export {
  default as Content,
  default as SidebarContent,
} from "./sidebar-content.svelte";
export {
  default as Footer,
  default as SidebarFooter,
} from "./sidebar-footer.svelte";
export {
  default as Group,
  default as SidebarGroup,
} from "./sidebar-group.svelte";
export {
  default as GroupLabel,
  default as SidebarGroupLabel,
} from "./sidebar-group-label.svelte";
export {
  default as Header,
  default as SidebarHeader,
} from "./sidebar-header.svelte";
export { default as Menu, default as SidebarMenu } from "./sidebar-menu.svelte";
export {
  default as MenuBadge,
  default as SidebarMenuBadge,
} from "./sidebar-menu-badge.svelte";
export {
  default as MenuButton,
  default as SidebarMenuButton,
} from "./sidebar-menu-button.svelte";
export {
  default as MenuItem,
  default as SidebarMenuItem,
} from "./sidebar-menu-item.svelte";
export {
  default as MenuSub,
  default as SidebarMenuSub,
} from "./sidebar-menu-sub.svelte";
export {
  default as MenuSubButton,
  default as SidebarMenuSubButton,
} from "./sidebar-menu-sub-button.svelte";
export {
  default as MenuSubItem,
  default as SidebarMenuSubItem,
} from "./sidebar-menu-sub-item.svelte";
