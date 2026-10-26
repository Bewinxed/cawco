/**
 * The installer's wait for its machine to join (binary-install.ts
 * `setupBinary`, `rejoinBinary`): the hub asked, as this machine, until it
 * lists the machine online. Its own module, importing nothing of the
 * service manager's (service.ts reads where it runs from as it loads), so
 * whatever runs the wait, a probe's stand-in for an install included, runs
 * this very code.
 */
import { hostname } from "node:os";
import {
  type AgentRow,
  INSTALL_CODE_ENV,
  INSTALL_CODE_HEADER,
  INSTALL_LIST_LIMIT_MS,
  INSTALL_STEP_PREFIX,
  JOIN_WAIT_STEP,
} from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { machineId } from "@cawco/core/machine-id";
import {
  machineFetch,
  machineKeyPath,
  readMachineKey,
  refusalSince,
} from "@cawco/core/machine-key";

const JOIN_TIMEOUT_MS = INSTALL_LIST_LIMIT_MS;
const LOCAL_NETWORK_URL =
  /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/u;

/**
 * This machine's own row, as this machine (core machine-key.ts): a hub that
 * requires paired devices answers it to the admitted machine, and tells one
 * it has not admitted yet that it must pair. Within 5 s, body and all.
 * An install by a command names its one-time code on every read (the
 * installer hands it over in {@link INSTALL_CODE_ENV}): the hub ties this
 * machine to that install, and admits it, the command being the person's
 * say-so.
 */
const readOwnRow = (
  hubUrl: string,
  id: string
): Promise<Bounded<{ pairing: string | null; row?: AgentRow }>> =>
  readWithin(5000, async (signal) => {
    const code = process.env[INSTALL_CODE_ENV];
    const response = await machineFetch(
      `${hubUrl}/api/agents/${encodeURIComponent(id)}`,
      { signal, ...(code ? { headers: { [INSTALL_CODE_HEADER]: code } } : {}) }
    );
    const pairing = response.headers.get("x-cawco-pairing");
    if (!response.ok) {
      await response.body?.cancel();
      return { pairing };
    }
    try {
      return { pairing, row: (await response.json()) as AgentRow };
    } catch {
      return { pairing };
    }
  });

/**
 * Until the hub lists this machine online. A hub that holds it for the
 * person (it requires paired devices, and this machine holds no key it
 * admitted) is waited on for as long as the person takes: the wait says so
 * once, and ends when they admit the machine (it comes online) or refuse it
 * (the agent keeps the hub's words, core machine-key.ts `refusalSince`). A
 * machine that holds a key (an SSH add wrote it one) is no machine admission
 * applies to: a hub that will not take its key is said as that, after the
 * join's own deadline, never as a wait for an Admit nobody is shown.
 */
export async function awaitJoined(hubUrl: string): Promise<void> {
  const id = await machineId();
  // Its own step, so an add that fails here names this wait, never the
  // service step before it (hub installs.ts reads the last step).
  console.log(`${INSTALL_STEP_PREFIX}${JOIN_WAIT_STEP}`);
  const since = Date.now();
  const deadline = since + JOIN_TIMEOUT_MS;
  let waiting = false;
  let keyNotTaken = false;
  while (waiting || Date.now() < deadline) {
    const answer = await readOwnRow(hubUrl, id).catch(() => undefined);
    // Neither an unanswered read nor a refused one ends the wait: the poll asks again.
    switch (answer?.kind) {
      case undefined:
      case "unanswered":
        break;
      case "answered":
        if (answer.value.pairing === "required" && readMachineKey()) {
          keyNotTaken = true;
        } else if (answer.value.pairing === "required" && !waiting) {
          waiting = true;
          console.log(
            `${INSTALL_STEP_PREFIX}waiting to be admitted: this hub requires paired devices. Admit ${hostname()} on the dashboard's Machines list.`
          );
        }
        if (answer.value.row?.status === "online") {
          return;
        }
        break;
      default: {
        const unhandled: never = answer;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    const refused = refusalSince(since);
    if (refused) {
      throw new Error(
        `The agent started, and ${hubUrl} answered: ${refused} Nothing joined.`
      );
    }
    await Bun.sleep(1000);
  }
  if (keyNotTaken) {
    throw new Error(
      `The agent started, but ${hubUrl} did not take this machine's key (${machineKeyPath()}) and has not listed it online after ${JOIN_TIMEOUT_MS / 1000}s. Add the machine again from the hub's dashboard.`
    );
  }
  const lan = process.platform === "darwin" && LOCAL_NETWORK_URL.test(hubUrl);
  throw new Error(
    `The agent started, but ${hubUrl} has not listed this machine online after ${JOIN_TIMEOUT_MS / 1000}s.` +
      (lan
        ? " macOS does not let a background service reach local-network addresses (10.x, 172.16-31.x, 192.168.x). Join with the hub's Tailscale address instead."
        : "")
  );
}
