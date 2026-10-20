// biome-ignore lint/performance/noBarrelFile: shadcn-svelte component barrel — every consumer imports the group from this index
export {
  default as OptionGroup,
  default as Root,
  type OptionGroupLayout,
  optionGroupVariants,
} from "./option-group.svelte";
export {
  default as Item,
  default as OptionGroupItem,
} from "./option-group-item.svelte";
