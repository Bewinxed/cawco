// biome-ignore lint/performance/noBarrelFile: shadcn-svelte component barrel — every consumer imports the group from this index
export {
  default as Root,
  //
  default as Table,
} from "./table.svelte";
export { default as Body, default as TableBody } from "./table-body.svelte";
export { default as Cell, default as TableCell } from "./table-cell.svelte";
export { default as Head, default as TableHead } from "./table-head.svelte";
export {
  default as Header,
  default as TableHeader,
} from "./table-header.svelte";
export { default as Row, default as TableRow } from "./table-row.svelte";
