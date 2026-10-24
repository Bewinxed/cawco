import { mount } from "svelte";
import Shell from "./Shell.svelte";

const dark = matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.classList.toggle("dark", dark);

const target = document.getElementById("shell");
if (target) {
  mount(Shell, { target });
}
