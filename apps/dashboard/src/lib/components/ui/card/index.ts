// biome-ignore lint/performance/noBarrelFile: this is the component's public API surface, re-exporting its parts under the shadcn-svelte convention
export {
  default as Root,
  //
  default as Card,
} from "./card.svelte";
export {
  default as Content,
  default as CardContent,
} from "./card-content.svelte";
export { default as Footer, default as CardFooter } from "./card-footer.svelte";
export { default as Header, default as CardHeader } from "./card-header.svelte";
export { default as Title, default as CardTitle } from "./card-title.svelte";
