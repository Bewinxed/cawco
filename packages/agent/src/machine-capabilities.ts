/**
 * The machine's capabilities, every registered harness's CLI among them: the
 * one probe the daemon and the CLI run. Apart from capabilities.ts, which
 * the browser and the boundary read for the browser's executable alone and
 * which so never loads the adapters.
 */
import type { MachineCapabilities } from "@cawco/core/capabilities";
import { probeCapabilities } from "./capabilities";
import { harnesses } from "./harnesses";

/** What this machine can do, read fresh: on registration and every explicit probe. */
export const probeMachineCapabilities = (): Promise<MachineCapabilities> =>
  probeCapabilities(harnesses());
