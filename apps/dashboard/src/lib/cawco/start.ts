/**
 * The app's stores, started: every timer, listener, effect, read and
 * registration a store module holds, which importing the module never
 * starts (scripts/lint/store-starts-nothing.grit refuses one at a module's
 * top level). The app's layout starts them once, in the browser, as it
 * starts, before any page under it draws (routes/(app)/+layout.svelte), and
 * stops them as it goes. A page that never starts them (a component canvas,
 * a bare route, a worker) imports the stores and draws with none of it
 * running: what each reader sees then is said at each start.
 *
 * The order is the order the modules loaded in when each started itself on
 * import, dependencies first. What depends on it: the socket's upkeep and
 * the client's wiring of the stores to it stand before the layout opens the
 * hub (`ensureConnected`, on mount); the New Session form's keeping stands
 * before the parked starts', which close the form on a start no longer
 * kept; the drafts, the account sign-ins and the tool sign-ins came last,
 * as they loaded with the first page that drew them.
 */
import { startFlows } from "./accounts/flows.svelte";
import { startSwitch } from "./accounts/switch.svelte";
import { startClient } from "./client.svelte";
import { drafts } from "./config/drafts.svelte";
import { startContinue } from "./continue.svelte";
import { startFiles } from "./files/files.svelte";
import { startHarnessBlock } from "./harness-block.svelte";
import { startAreas } from "./home/areas.svelte";
import { startHome } from "./home/home-state.svelte";
import { startSocket } from "./hub/socket.svelte";
import { startReload } from "./reload.svelte";
import { startNewSession } from "./spawn/new-session.svelte";
import { startParked } from "./spawn/parked.svelte";
import { stopWork } from "./stop-work.svelte";
import { startMinute } from "./stores/clock.svelte";
import { startToolSignins } from "./tool-signin.svelte";
import { startConnectSignIns } from "./transcript/connect-sign-ins.svelte";
import { startUsageBench } from "./usage/forecast.svelte";
import { startWorkspace } from "./workspace/workspace.svelte";

/** Starts every store once, in order; returns the stop, which stops them in the reverse order. */
export function startApp(): () => void {
  const stops = [
    // The person's hand on the page, heard for the idle reload.
    startReload(),
    // The minute caps and ages turn on.
    startMinute(),
    // The socket's take channel, its presses and its wake listeners.
    startSocket(),
    // Every frame routed, the stores wired to the socket, the ledger plugged.
    startClient(),
    // The harnesses this tab follows, kept.
    startHarnessBlock(),
    // The tabs held open and followed, and the URLs a hidden page writes.
    startWorkspace(),
    // The home's clock, its waiting tasks and its marks.
    startHome(),
    // The New Session form's place, kept.
    startNewSession(),
    // The session the form continues, kept.
    startContinue(),
    // Files reads a session again when an artifact reached the person.
    startFiles(),
    // The usage bench's handle (dev only).
    startUsageBench(),
    // A move between accounts, said and settled.
    startSwitch(),
    // The stops a reload left under way, resumed.
    stopWork.start(),
    // The areas bench's handle (dev only).
    startAreas(),
    // The connect sign-ins a reload left waiting, timed again.
    startConnectSignIns(),
    // The parked starts, kept, settled and recovered.
    startParked(),
    // The editors' drafts, read back and kept.
    drafts.start(),
    // The account sign-ins under way, taking up each accounts read.
    startFlows(),
    // The tool sign-ins a reload kept, and their lapses.
    startToolSignins(),
  ];
  return () => {
    for (const stop of stops.reverse()) {
      stop();
    }
  };
}
