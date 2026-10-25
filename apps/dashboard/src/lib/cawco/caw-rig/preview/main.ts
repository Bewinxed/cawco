/**
 * The rig preview's entry: the dashboard's stylesheet and theme, then the
 * page (apps/dashboard/scripts/caw-rig-preview.vite.ts builds it).
 */
import "../../../../app.css";
import "#lib/theme.svelte.js";
import { mount } from "svelte";
import Page from "./Page.svelte";

const target = document.getElementById("preview");
if (target) {
  mount(Page, { target });
}
