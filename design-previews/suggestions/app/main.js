/**
 * The suggestions preview's entry (build.ts): the dashboard's stylesheet,
 * the page's own, then the page (Preview.svelte), the dashboard's
 * components live in it. JavaScript, as the capture stages are: the
 * dashboard's sources it reaches are typed in the dashboard's own project.
 */
import "../../../apps/dashboard/src/app.css";
import "./preview.css";
import { mount } from "svelte";
import Preview from "./Preview.svelte";

mount(Preview, { target: document.body });
