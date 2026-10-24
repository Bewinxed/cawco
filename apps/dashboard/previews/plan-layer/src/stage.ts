import { mount } from "svelte";
import Stage from "./Stage.svelte";

// The scheme the shell asked for, else the reader's own.
const theme = new URLSearchParams(location.search).get("theme");
const dark =
  theme === "dark" ||
  (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.classList.toggle("dark", dark);

const target = document.getElementById("stage");
if (target) {
  mount(Stage, { target });
}
