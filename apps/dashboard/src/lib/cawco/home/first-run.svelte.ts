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
 * Accounts to sign in, a pick of the fleet's helpers and step lists (saved
 * at once, as Configure › Helpers & step lists saves it), the answer to the
 * usability feedback question (as Configure › Feedback to CawCo saves it),
 * the relay's Set up (its journey, finished in
 * Settings › Browsers) or Later, and New project.
 */

import { harnessName } from "@cawco/core/harness/kinds";
import { machineLabel } from "@cawco/core/machine-names";
import { goto } from "$app/navigation";
import { connect } from "../connect/installs.svelte";
import { boardStore } from "../stores/board.svelte";
import { chooseOwnTool, ownToolsStore } from "../stores/own-tools.svelte";
import { projectsStore } from "../stores/projects.svelte";
import { actOnRelay, relayStore } from "../stores/relay.svelte";
import {
  chooseFeedback,
  feedbackStore,
} from "../stores/usability-feedback.svelte";
import type { FirstRunState } from "./FirstRun.svelte";
import { home } from "./home-state.svelte";

/** The first machine, online first: the one the row names. */
function machineOf(): FirstRunState["machine"] {
  const [online] = boardStore.onlineMachines;
  if (online) {
    return { state: "done", name: machineLabel(online.hostname) };
  }
  const [any] = boardStore.machines;
  return any
    ? { state: "offline", name: machineLabel(any.hostname) }
    : { state: "todo" };
}

/** A harness signed in on an online machine; else the reason one could not be. */
function harnessOf(): FirstRunState["harness"] {
  const reports = boardStore.onlineMachines.flatMap(
    (machine) => machine.harnesses ?? []
  );
  const signed = reports.find(
    (report) => report.installed && report.auth === "authenticated"
  );
  if (signed) {
    return { state: "done", harness: harnessName(signed.harness) };
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
  if (!(
    home.ready &&
    home.live &&
    projectsStore.projectsRead &&
    (ownToolsStore.read || ownToolsStore.unread) &&
    (feedbackStore.read || feedbackStore.unread)
  )) {
    return null;
  }
  if (projectsStore.projects.length > 0) {
    return null;
  }
  return {
    machine: machineOf(),
    harness: harnessOf(),
    ownTools: ownToolsStore.shown,
    // Unread, both say why, and a pick waits for a read that lands.
    ownToolsFaults: {
      helpers: ownToolsStore.faultOf("helpers") ?? ownToolsStore.unread,
      stepLists: ownToolsStore.faultOf("stepLists") ?? ownToolsStore.unread,
    },
    feedback: {
      consent: feedbackStore.shown,
      signedIn: feedbackStore.signedIn,
      // Unread, the step says why, and an answer waits for a read that lands.
      fault: feedbackStore.fault ?? feedbackStore.unread,
    },
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
  onchoose: chooseOwnTool,
  onfeedback: chooseFeedback,
};
