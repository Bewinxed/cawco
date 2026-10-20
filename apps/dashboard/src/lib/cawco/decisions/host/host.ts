/**
 * A decision page's host entry (core decision-host.ts bundles it; hub
 * decision-program.ts serves the page around it, linking host.css, the
 * house's tokens and utilities): the house faces, then the program drawn by
 * Host.svelte. The page follows the host's scheme (the overlay sets
 * `color-scheme` and `data-theme` from it).
 */

import { mount } from "svelte";
import { FACES } from "./faces.js";
import Host from "./Host.svelte";
import { bridge, picks, takeServed } from "./page.svelte.js";

const faces = document.createElement("style");
faces.textContent = FACES;
document.head.prepend(faces);

takeServed(document);
bridge()?.on("picks", (next) => {
  picks.now = next;
});

const target = document.getElementById("decision-root");
if (target) {
  mount(Host, { target });
}
