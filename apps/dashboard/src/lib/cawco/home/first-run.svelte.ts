/**
 * The first-run row's facts (FirstRun; decision page `onboarding-design`,
 * card `first-run`, "Looks right"), read from what the dashboard already
 * holds of the hub: its machines and what each harness on them reported,
 * the stream relay's journey, and the projects. The row stands while the
 * fleet has no project, once the hub is live and has listed them: its last
 * step is the first project, and with it done the row is gone for good
 * (nothing claims a step while it is still being read).
 *
 * Its acts are the product's own: Add machine's window, Configure ›
 * Accounts to sign in, the relay's Set up (its journey, finished in
 * Settings › Browsers) or Later, and New project.
 */

import { machineLabel } from "@cawco/core/machine-names";
import { accountsWords } from "@cawco/core/words/accounts";
import { goto } from "$app/navigation";
import { cawco } from "../client.svelte";
import { connect } from "../connect/installs.svelte";
import { actOnRelay, relayStore } from "../stores/relay.svelte";
import type { FirstRunState } from "./FirstRun.svelte";
import { home } from "./home-state.svelte";

/** The first machine, online first: the one the row names. */
function machineOf(): FirstRunState["machine"] {
  const [online] = cawco.onlineMachines;
  if (online) {
    return { state: "done", name: machineLabel(online.hostname) };
  }
  const [any] = cawco.machines;
  return any
    ? { state: "offline", name: machineLabel(any.hostname) }
    : { state: "todo" };
}

/** A harness signed in on an online machine; else the reason one could not be. */
function harnessOf(): FirstRunState["harness"] {
  const reports = cawco.onlineMachines.flatMap(
    (machine) => machine.harnesses ?? []
  );
  const signed = reports.find(
    (report) => report.installed && report.auth === "authenticated"
  );
  if (signed) {
    return { state: "done", harness: accountsWords.harnesses[signed.harness] };
  }
  const refused = reports.find(
    (report) =>
      report.installed &&
      (report.auth === "unreadable-credentials" || report.authReason)
  );
  return refused?.authReason
    ? { state: "failed", reason: refused.authReason }
    : { state: "todo" };
}

/** The relay offered and answered (Set up, or Later), or set up and live. */
function relayOf(): FirstRunState["relay"] {
  const journey = relayStore.relayJourney;
  if (journey?.done) {
    return "done";
  }
  return journey?.open || journey?.answered ? "later" : "todo";
}

/** The row's steps while it stands; null once there is a project, or before the hub is read. */
export function firstRunSteps(): FirstRunState | null {
  if (!(home.ready && home.live && cawco.projectsRead)) {
    return null;
  }
  if (cawco.projects.length > 0) {
    return null;
  }
  return {
    machine: machineOf(),
    harness: harnessOf(),
    relay: relayOf(),
    project: false,
  };
}

/** What the row's controls do: the product's own ways to each step. */
export const firstRunActs = {
  onaddmachine: (anchor: HTMLElement) => connect.openNew(anchor, "ssh"),
  onsignin: () => goto("/config/accounts"),
  onrelay: async () => {
    await actOnRelay({ act: "set-up" });
    await goto("/config/browsers");
  },
  onlater: () => actOnRelay({ act: "later" }),
  onnewproject: () => goto("/project/new"),
};
