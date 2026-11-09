import { machineCalled } from "@cawco/core/machine-names";
import type { DbShape } from "./db";

/** A machine as a line names it: its hostname as the fleet shows it (core `machineCalled`), never its id. */
export const machineName = (
  db: Pick<DbShape, "listAgents">,
  machineId: string
): string => machineCalled(machineId, db.listAgents());
