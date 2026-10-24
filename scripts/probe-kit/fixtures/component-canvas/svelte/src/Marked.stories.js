import { markWords } from "@probe/marks";
import Badge from "./Badge.svelte";

export default { title: "Kit/Marked", component: Badge };

/** A mark in its workspace package's words. */
export const Marked = { args: { text: markWords("Bundled") } };
