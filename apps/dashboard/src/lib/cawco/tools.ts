/**
 * The dashboard's half of tool provisioning (NEW.md §10): the hub's policy
 * table over REST, and per-machine installs over the app socket. Nothing here
 * knows a tool by name — the catalog is data the hub hands over.
 */

import type { Bounded } from "@cawco/core/bounded";
import type { ToolPolicy, ToolStatus } from "@cawco/core/tools";
import { INSTALL_TIMEOUT_MS } from "#lib/config.js";
import { hub } from "#lib/platform/hub.js";
import {
  couldNot,
  hubData,
  hubRefusal,
  type Refused,
  unreachedAnswer,
} from "#lib/platform/hub-read.js";
import { machineControl } from "./stores/machines";

/**
 * A tool's policy, including one nobody has ever toggled: the hub keeps no row
 * until something is asked of a tool, and no row means nothing is asked.
 */
export const policyFor = (policies: ToolPolicy[], id: string): ToolPolicy =>
  policies.find((row) => row.id === id) ?? {
    id,
    required: false,
    pinnedVersion: null,
  };

/**
 * Writes a tool's policy. Turning `required` on is the whole one-click: the hub
 * installs it on every online machine that is missing it, so this never has to
 * fan the work out itself.
 */
export async function setPolicy(
  id: string,
  patch: { required?: boolean; pinnedVersion?: string | null }
) {
  return await hubData(hub.api.tools({ id }).put(patch), (refused) =>
    couldNot("save that policy", refused)
  );
}

/**
 * Puts one tool on one machine, answering with the status the attempt settled
 * on. A machine-scoped control, so the hub sees it go past,
 * marks the cell `installing` and publishes — which is how every other
 * dashboard follows an install nobody there clicked. The hub puts in the
 * fleet's pin, or the release to reach, as its own installs carry them
 * (hub server.ts `installAsk`): one install, one version, whoever pressed.
 */
export const installTool = (
  machineId: string,
  id: string
): Promise<Bounded<ToolStatus>> =>
  machineControl<ToolStatus>(
    machineId,
    "installTool",
    [id],
    INSTALL_TIMEOUT_MS
  );

/**
 * A tool sign-in's refusal, in the hub's words (hub routes/tools.ts, the
 * tool sign-in routes). `spent`: the machine answered with its failure, so
 * its sign-in is over and its link is dead (a `502`); a machine away
 * (`503`) or silent (`504`) may still hold it.
 */
export class ToolSigninRefusal extends Error {
  readonly spent: boolean;
  constructor(words: string, spent: boolean) {
    super(words);
    this.name = "ToolSigninRefusal";
    this.spent = spent;
  }
}

/** A tool sign-in route's refusal as the {@link ToolSigninRefusal} it throws. */
function signinRefusal(refused: Refused): ToolSigninRefusal {
  // Read first: a request that got no answer rejects here as it was thrown.
  const words = hubRefusal(refused).message;
  // The machine's failure, never the dashboard's own 502 for a hub that
  // didn't answer, which says nothing of the machine's sign-in.
  const spent =
    refused.response.status === 502 && !unreachedAnswer(refused.response);
  const said = refused.error.value;
  // The machine's own refusal, whole: its sentence, then the tool's screen
  // lines one per line (core words/tools `screenOf`), which the hub's
  // one-line refusal reading would cut to the first. No status after it: it
  // would read as one more line of the tool's screen.
  if (spent && typeof said === "string") {
    const whole = said.trim();
    if (whole && !whole.startsWith("{")) {
      return new ToolSigninRefusal(whole, true);
    }
  }
  return new ToolSigninRefusal(words, spent);
}

/**
 * Starts the tool's own sign-in on the machine (core `ToolSpec.signin`):
 * the link the person opens in their own browser, and until when the
 * machine waits for its code. One already waiting answers its kept link.
 */
export async function beginToolSignin(machineId: string, toolId: string) {
  return await hubData(
    hub.api.machines({ machineId }).tools({ toolId }).signin.post(),
    signinRefusal
  );
}

/** Types the pasted code into the machine's waiting sign-in: the tool's status there, its sign-in read again. */
export async function completeToolSignin(
  machineId: string,
  toolId: string,
  code: string
) {
  return await hubData(
    hub.api
      .machines({ machineId })
      .tools({ toolId })
      .signin.complete.post({ code }),
    signinRefusal
  );
}
