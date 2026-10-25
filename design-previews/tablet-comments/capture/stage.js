/**
 * The capture stage's entry, loaded by capture.ts into a page of the
 * dashboard's dev server: the dashboard's own stylesheet, then the real
 * components mounted with the pins read from the hub (Stage.svelte).
 */
import "./now.js";
import "../../../apps/dashboard/src/app.css";
import { mount, tick } from "svelte";
import Stage from "./Stage.svelte";

mount(Stage, { target: document.body });
await tick();
window.__staged = true;
