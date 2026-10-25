/**
 * The capture stage's entry, loaded by capture.ts into a page of the
 * dashboard's dev server: the dashboard's stylesheet with this folder's
 * classes (stage.css), then every option part mounted on the owner's real
 * task records (Stage.svelte).
 */
import "./stage.css";
import { mount, tick } from "svelte";
import Stage from "./Stage.svelte";

mount(Stage, { target: document.body });
await tick();
window.__staged = true;
