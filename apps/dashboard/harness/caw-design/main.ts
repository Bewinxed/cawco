/**
 * Caw's panel: the owner's open decisions and what changed from his pins,
 * on the real components and fixture data, as one page (Page.svelte).
 */
// biome-ignore assist/source/organizeImports: ./assets keeps the browser's own fetch, so it loads before the guard
import { keepCawsFiles } from "./assets";
import "../guard";
import "./page.css";
import { mount } from "svelte";
import Page from "./Page.svelte";

keepCawsFiles();

// The app's theme, as its layout sets it: the OS's.
const dark = matchMedia("(prefers-color-scheme: dark)");
const themed = () =>
  document.documentElement.classList.toggle("dark", dark.matches);
themed();
dark.addEventListener("change", themed);

const target = document.getElementById("page");
if (!target) {
  throw new Error("index.html holds #page.");
}
mount(Page, { target });
