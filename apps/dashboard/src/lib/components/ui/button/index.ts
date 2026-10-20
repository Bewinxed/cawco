// biome-ignore lint/performance/noBarrelFile: this is the component's public API surface, re-exporting its parts under the shadcn-svelte convention
export {
  type ButtonProps as Props,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  buttonVariants,
  default as Root,
  //
  default as Button,
} from "./button.svelte";
export { pressVariants } from "./press.js";
export { sendVariants } from "./send.js";
