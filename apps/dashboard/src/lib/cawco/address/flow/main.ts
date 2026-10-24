/**
 * The preview page's entry: the dashboard's stylesheet and theme, then the
 * page (vite.config.ts says how it is built).
 */
import "../../../../app.css";
import "#lib/theme.svelte.js";
import { mount } from "svelte";
import Page from "./Page.svelte";

const target = document.getElementById("preview");
if (target) {
  mount(Page, { target });
}
