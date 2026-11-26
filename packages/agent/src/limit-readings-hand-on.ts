/**
 * What a short-lived process on a machine (a CLI verb, the update's helper,
 * a release script, the dashboard's build) read of the bounds still waiting
 * on data (core limit-readings.ts), handed to the hub its installation names
 * as it ends, as this machine ({@link machineFetch}, through the hub's Eden
 * client: `POST /api/limit-readings/:machine`, hub limit-readings.ts). A
 * machine with no installation naming a hub, or a hub that says nothing
 * within one hand-off's interval, keeps nothing of them: the process is
 * ending.
 */

import { readInstallation } from "@cawco/core/binary-installation";
import { readWithin } from "@cawco/core/bounded";
import {
  handOnLimitReadings,
  READINGS_HANDED_EVERY_MS,
} from "@cawco/core/limit-readings";
import { machineId } from "@cawco/core/machine-id";
import { hubClient } from "@cawco/hub/client";
import { machineFetch } from "./machine-fetch";

/** Hands this process's readings to its machine's hub, when it took any; never throws. */
export const handOnAsMachine = (): Promise<void> =>
  handOnLimitReadings(async (body) => {
    const hubUrl = (await readInstallation().catch(() => undefined))?.hubUrl;
    const machine = await machineId().catch(() => undefined);
    if (!(hubUrl && machine)) {
      return false;
    }
    const sent = await readWithin(READINGS_HANDED_EVERY_MS, (signal) =>
      hubClient(hubUrl, (url, init) => machineFetch(url, { ...init, signal }))
        .api["limit-readings"]({ machine })
        .post(body)
    );
    return sent.kind === "answered" && sent.value.error === null;
  });
