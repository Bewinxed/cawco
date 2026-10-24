/**
 * The capture stage's entry, loaded by capture.ts into a page of the
 * dashboard's dev server: the dashboard's own stylesheet, then the real
 * components mounted with the preview's fixtures (Stage.svelte).
 */
import "../../../apps/dashboard/src/app.css";
import { mount, tick } from "svelte";
import Stage from "./Stage.svelte";

mount(Stage, { target: document.body });
await tick();
window.__staged = true;
