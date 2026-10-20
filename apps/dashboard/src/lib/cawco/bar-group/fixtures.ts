/**
 * The fleets the top bar's group is drawn over in its states files
 * (BarGroup*.stories.ts): two machines, as the owner's fleet is, at rest,
 * one down, and one needing a sign-in. The label and tooltip are worded as
 * MachinesButton words them from the live fleet (`label`, `tip`), so the
 * stories say what the product says.
 */
import { machineLabel } from "@cawco/core";

/** One machine, as the item and the sidebar's rows read it. */
export interface FleetMachine {
  /** What is wrong, in home-state `exceptionOf`'s words; none when it is well. */
  fault?: string;
  hostname: string;
  /** Its live sessions, the row's meta. */
  live: number;
  os: string;
  up: boolean;
}

const OBELISK: FleetMachine = {
  hostname: "obelisk-of-light",
  os: "linux-x64",
  up: true,
  live: 3,
};
const STUDIO: FleetMachine = {
  hostname: "studio.local",
  os: "darwin-arm64",
  up: true,
  live: 1,
};

/** Both machines online, nothing wrong. */
export const AT_REST: readonly FleetMachine[] = [OBELISK, STUDIO];
/** The Mac has stopped answering. */
export const ONE_DOWN: readonly FleetMachine[] = [
  OBELISK,
  { ...STUDIO, up: false, live: 0, fault: "unreachable" },
];
/** The Mac is up, but OpenCode on it needs signing in again. */
export const SIGN_IN: readonly FleetMachine[] = [
  OBELISK,
  { ...STUDIO, fault: "OpenCode needs signing in" },
];

/** A problem's ink: fail when a machine is down, attention otherwise (MachinesButton `tone`). */
export function toneOf(
  machines: readonly FleetMachine[]
): "fail" | "attn" | undefined {
  if (!machines.some((machine) => machine.fault)) {
    return;
  }
  return machines.some((machine) => !machine.up) ? "fail" : "attn";
}

/** The item's name, as MachinesButton `label` says it. */
export function label(machines: readonly FleetMachine[]): string {
  const count = machines.length;
  const words =
    count > 0 ? `${count} ${count === 1 ? "machine" : "machines"}` : "Machines";
  const stuck = machines.filter((machine) => machine.fault).length;
  return stuck > 0
    ? `${words}, ${stuck} ${stuck === 1 ? "needs" : "need"} attention`
    : words;
}

const names = new Intl.ListFormat("en", { type: "conjunction" });

/** The tooltip naming each machine in trouble, as MachinesButton `tip` says it. */
export function tip(machines: readonly FleetMachine[]): string {
  const stuck = machines.filter((machine) => machine.fault);
  if (stuck.length === 0) {
    return "Machines";
  }
  const byFault = Map.groupBy(stuck, ({ fault }) => fault ?? "");
  const clauses = [...byFault].map(
    ([fault, entries]) =>
      `${names.format(entries.map((one) => machineLabel(one.hostname)))} ${fault}`
  );
  return `Machines: ${clauses.join("; ")}`;
}
