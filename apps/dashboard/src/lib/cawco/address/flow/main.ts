/**
 * The preview page's entry: the shared ResizeObserver delivery first (as
 * the app's hooks.client.ts), the dashboard's stylesheet and theme, then
 * the page (vite.config.ts says how it is built).
 */
import "#lib/platform/frame-observer.js";
import "../../../../app.css";
import "#lib/theme.svelte.js";
import { mount } from "svelte";
import Page from "./Page.svelte";

const target = document.getElementById("preview");
if (target) {
  mount(Page, { target });
}
