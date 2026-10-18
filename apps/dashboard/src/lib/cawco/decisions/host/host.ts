/**
 * A decision page's host entry (core decision-host.ts bundles it; hub
 * decision-program.ts serves the page around it): the kit's tokens and card
 * recipe, then the program drawn by Host.svelte. The tokens go in as written:
 * Bun's CSS bundler lowers `light-dark()` into the OS's scheme, and the page
 * follows the host's (the overlay sets `color-scheme` from it).
 */

import { mount } from "svelte";
import pageCss from "../../../../../../../packages/hub/skills/decision-page/kit/page.css" with { type: "text" };
import tokensCss from "../../../../../../../packages/hub/skills/decision-page/kit/tokens.css" with { type: "text" };
import Host from "./Host.svelte";
import { bridge, picks, takeServed } from "./page.svelte.js";

const sheet = document.createElement("style");
// Bun's text loader gives each a string; the dashboard's types call a sheet a module.
sheet.textContent = String(tokensCss) + String(pageCss);
document.head.prepend(sheet);

takeServed(document);
bridge()?.on("picks", (next) => {
  picks.now = next;
});

const target = document.getElementById("decision-root");
if (target) {
  mount(Host, { target });
}
