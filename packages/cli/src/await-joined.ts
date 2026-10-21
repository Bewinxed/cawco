/**
 * The installer's wait for its machine to join (binary-install.ts
 * `setupBinary`, `rejoinBinary`): the hub asked, as this machine, until it
 * lists the machine online. Its own module, importing nothing of the
 * service manager's (service.ts reads where it runs from as it loads), so
 * whatever runs the wait, a probe's stand-in for an install included, runs
 * this very code.
 */
import { hostname } from "node:os";
import { type AgentRow, INSTALL_STEP_PREFIX } from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { machineId } from "@cawco/core/machine-id";
import { machineFetch, refusalSince } from "@cawco/core/machine-key";

const JOIN_TIMEOUT_MS = 90_000;
const LOCAL_NETWORK_URL =
  /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * This machine's own row, as this machine (core machine-key.ts): a hub that
 * requires paired devices answers it to the admitted machine, and tells one
 * it has not admitted yet that it must pair. Within 5 s, body and all.
 */
const readOwnRow = (
  hubUrl: string,
  id: string
): Promise<Bounded<{ pairing: string | null; row?: AgentRow }>> =>
  readWithin(5000, async (signal) => {
    const response = await machineFetch(
      `${hubUrl}/api/agents/${encodeURIComponent(id)}`,
      { signal }
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
 * machine the hub added over SSH holds the key its add gave it, and is
 * never held.
 */
export async function awaitJoined(hubUrl: string): Promise<void> {
  const id = await machineId();
  const since = Date.now();
  const deadline = since + JOIN_TIMEOUT_MS;
  let waiting = false;
  while (waiting || Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll; each read must see the hub after the previous one
    const answer = await readOwnRow(hubUrl, id).catch(() => undefined);
    // Neither an unanswered read nor a refused one ends the wait: the poll asks again.
    switch (answer?.kind) {
      case undefined:
      case "unanswered":
        break;
      case "answered":
        if (answer.value.pairing === "required" && !waiting) {
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
  const lan = process.platform === "darwin" && LOCAL_NETWORK_URL.test(hubUrl);
  throw new Error(
    `The agent started, but ${hubUrl} has not listed this machine online after ${JOIN_TIMEOUT_MS / 1000}s.` +
      (lan
        ? " macOS does not let a background service reach local-network addresses (10.x, 172.16-31.x, 192.168.x). Join with the hub's Tailscale address instead."
        : "")
  );
}
