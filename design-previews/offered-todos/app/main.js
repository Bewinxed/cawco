/**
 * The offered to-dos preview's entry (build.ts): the page's clock fixed
 * first (fixed-now.js), then the dashboard's stylesheet, the page's own,
 * and the page (Preview.svelte), the dashboard's components live in it.
 */
import "./fixed-now.js";
import "../../../apps/dashboard/src/app.css";
import "./preview.css";
import { mount } from "svelte";
import Preview from "./Preview.svelte";

mount(Preview, { target: document.body });
