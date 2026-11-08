/**
 * How the fleet names its machines in words: a hostname as the dashboard
 * shows it, a machine among others in a sentence, why a machine could not
 * take a request, and whether an error says a machine fell silent. A module
 * of its own, so a reader of these words loads them alone.
 */

/** mDNS and router suffixes: they say "same network", which the fleet already implies. */
const LOCAL_SUFFIXES = [".local", ".lan", ".home"];

/**
 * How the fleet names a machine out loud: its hostname without a local-network
 * suffix ("Omars-MacBook-Pro.local" is "Omars-MacBook-Pro"). The dashboard
 * shows this name, and `start_session` takes it.
 */
export function machineLabel(hostname: string): string {
  const name = hostname.trim();
  const suffix = LOCAL_SUFFIXES.find((s) => name.toLowerCase().endsWith(s));
  return suffix ? name.slice(0, -suffix.length) : name;
}

/** What naming a machine reads of it: an agents row, or any row shaped like one. */
export interface NamedMachine {
  hostname: string;
  machineId: string;
}

/** Ordinals a sentence spells out; past them it says "machine number 11". */
const ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

/**
 * A machine as a sentence names it among `fleet`: its {@link machineLabel},
 * else words for a stranger, never its id. Machines that show the same name
 * (machines on one host do, a scratch fleet's all of them) are told apart by
 * their place among those in `fleet`, which the hub lists in join order: the
 * first is "obelisk-of-light", the next "obelisk-of-light (the second
 * machine with that name)". Before 2026-10-18 the next was
 * "obelisk-of-light · 2", which inside a sentence read like a count.
 */
export function machineCalled(
  machineId: string,
  fleet: readonly NamedMachine[]
): string {
  const machine = fleet.find((each) => each.machineId === machineId);
  if (!machine) {
    return "a machine this hub doesn't know";
  }
  const name = machineLabel(machine.hostname);
  const place = fleet
    .filter(
      (other) =>
        machineLabel(other.hostname).toLowerCase() === name.toLowerCase()
    )
    .findIndex((other) => other.machineId === machineId);
  if (place <= 0) {
    return name;
  }
  const nth = ORDINALS[place];
  return `${name} (${nth ? `the ${nth} machine` : `machine number ${place + 1}`} with that name)`;
}

/** Machines as a sentence lists them, each {@link machineCalled} among `fleet`, or `none`. */
export function machinesCalled(
  machines: readonly NamedMachine[],
  fleet: readonly NamedMachine[],
  none = "none"
): string {
  return (
    machines
      .map((machine) => machineCalled(machine.machineId, fleet))
      .join(", ") || none
  );
}

/** A machine's state that keeps a request from it. */
export type MachineFault = "offline" | "silent" | "unknown";

/** The causes {@link machineFaultWords} and {@link machineSilenceWords} say a machine's silence with. */
const MACHINE_SILENCE =
  /(?:didn't answer in time\.|isn't connected\.|did not answer within \d+ s\b|is not connected\b)/u;

/**
 * Whether an error carries CawCo's word that a machine didn't answer one
 * ask in time or isn't connected ({@link machineFaultWords},
 * {@link machineSilenceWords}): the machine's state, never what a session
 * did. Fleet watch counts no such error as a session's own (hub
 * fleet-watch.ts); a machine lost for good is said once, by the machine's
 * contact rule (words/contact.ts `MACHINE_LOST_MS`).
 */
export function isMachineSilence(text: string): boolean {
  return MACHINE_SILENCE.test(text);
}
