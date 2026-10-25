/**
 * A decision page's host entry (core decision-host.ts bundles it; hub
 * decision-program.ts serves the page around it, linking faces.css, the
 * house faces, and host.css, the house's tokens and utilities): the program
 * drawn by Host.svelte. The page follows the host's scheme (the overlay sets
 * `color-scheme` and `data-theme` from it).
 */

import { mount } from "svelte";
import { relayAway } from "./away";
import Host from "./Host.svelte";
import { bridge, picks, takeServed } from "./page.svelte.js";

takeServed(document);
bridge()?.on("picks", (next) => {
  picks.now = next;
});
relayAway();

const target = document.getElementById("decision-root");
if (target) {
  mount(Host, { target });
}
