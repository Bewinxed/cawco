/**
 * The pairing preview's entry (build.ts): the dashboard's stylesheet, the
 * page's own, Caw mounted through the dashboard's component, then the page.
 */
import "../../../apps/dashboard/src/app.css";
import "./preview.css";
import { mount } from "svelte";
import CawHost from "./CawHost.svelte";
import { start } from "./preview.js";

mount(CawHost, { target: document.querySelector('[data-slot="caw"]') });
start();
