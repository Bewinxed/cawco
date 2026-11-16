/**
 * A mark's SVG source, imported with Vite's `?raw` (marks.ts `Svg*`): a
 * string. unplugin-icons types every `~icons/*` import as a component,
 * query or not; of two matching patterns TypeScript takes the one with the
 * longer prefix, so a set's `?raw` imports read these. A package that reads
 * marks.ts names this file (`/// <reference types="@cawco/icons/raw" />`):
 * a project reference's declarations do not carry it.
 */
declare module "~icons/logos/*?raw" {
  const source: string;
  export default source;
}

declare module "~icons/thesvg-color/*?raw" {
  const source: string;
  export default source;
}
