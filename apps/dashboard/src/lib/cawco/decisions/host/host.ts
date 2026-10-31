/**
 * A decision page's host entry (core decision-host.ts bundles it; hub
 * decision-program.ts serves the page around it, linking faces.css, the
 * house faces, and host.css, the house's tokens and utilities): the program
 * drawn by Host.svelte. The page follows the host's scheme (the overlay sets
 * `color-scheme` and `data-theme` from it). Its errors go to the hub's
 * error log through its preview origin (core `PREVIEW_ERRORS_PATH`), as the
 * dashboard's do through its own.
 */

import { PREVIEW_ERRORS_PATH } from "@cawco/core/frames";
import { mount } from "svelte";
import { reportErrorsTo } from "../../error-report.js";
import { relayAway } from "./away";
import Host from "./Host.svelte";
import { bridge, picks, sent, takeServed } from "./page.svelte.js";

/** The commit the host was built from (core decision-host.ts `define`): its reports name it. */
declare const CAWCO_HOST_BUILD: string;

reportErrorsTo(PREVIEW_ERRORS_PATH, CAWCO_HOST_BUILD);
takeServed(document);
bridge()?.on("picks", (next) => {
  picks.now = next;
});
bridge()?.on("sent", (at) => {
  sent.at = at;
});
relayAway();

const target = document.getElementById("decision-root");
if (target) {
  mount(Host, { target });
}
