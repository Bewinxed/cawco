/**
 * The capture stage's entry, loaded by capture.ts into a page of the
 * dashboard's dev server: the dashboard's own stylesheet, the client's
 * stores seeded with the hub's real records (seed.js) for this pass, then
 * the real components mounted (Stage.svelte). The pass is capture.ts's
 * (`window.__pass`): which of the records' states the stores hold.
 */
import "../../../apps/dashboard/src/app.css";
import { mount, tick } from "svelte";
import { seed } from "./seed.js";
import Stage from "./Stage.svelte";

const pass = window.__pass ?? "moves";
const data = seed(pass);
mount(Stage, { target: document.body, props: { pass, ...data } });
await tick();
window.__staged = true;
