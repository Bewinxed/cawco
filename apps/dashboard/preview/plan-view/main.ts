/**
 * The plan-view preview's entry: the app's global CSS, the theme the
 * address names (`?theme=light|dark`) or the OS's, and the page.
 */
import "../../src/app.css";
import { mount } from "svelte";
import Page from "./Page.svelte";

const asked = new URLSearchParams(location.search).get("theme");
const dark = matchMedia("(prefers-color-scheme: dark)");
const themed = () => {
  const isDark = asked ? asked === "dark" : dark.matches;
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
};
themed();
dark.addEventListener("change", themed);

const target = document.getElementById("page");
if (!target) {
  throw new Error("index.html has no #page to mount on.");
}
mount(Page, { target });
