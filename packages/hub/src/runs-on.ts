/**
 * Where a task's attempts run (`runs_on:`): one machine, by its hostname or
 * its machine id, or a capability that names every machine of a kind. A
 * capability is read from the OS each agent reports when it registers
 * (daemon.ts `os`, like `darwin-arm64`), never configured by hand: `apple`
 * is a Mac (Xcode, iOS builds, simulators), `linux` a Linux machine.
 *
 * The task's own `runs_on:` wins, else its project's (dispatch settings),
 * else neither is set and an attempt starts where it always did. One that
 * is set starts only on a machine it names that is online and has a
 * checkout of the project; with none, the start is refused with a sentence
 * saying what it needs, and nothing is placed elsewhere.
 */

/** Each capability, and the OS prefix (`os`'s part before `-`) whose machines have it. */
const CAPABILITY_OS = { apple: "darwin", linux: "linux" } as const;
export type RunsOnCapability = keyof typeof CAPABILITY_OS;
export const RUNS_ON_CAPABILITIES = Object.keys(
  CAPABILITY_OS
) as RunsOnCapability[];

/** What a capability needs, in a sentence's words. */
const CAPABILITY_WORDS: Record<RunsOnCapability, string> = {
  apple: "a Mac",
  linux: "a Linux machine",
};

/** What placement reads of a machine: the agents table's row. */
export interface MachineFacts {
  hostname: string;
  machineId: string;
  os: string;
}

const isCapability = (value: string): value is RunsOnCapability =>
  Object.hasOwn(CAPABILITY_OS, value);

/** The capabilities a machine has, by the OS it reported. */
export const capabilitiesOf = (os: string): RunsOnCapability[] =>
  RUNS_ON_CAPABILITIES.filter(
    (name) => os.split("-")[0] === CAPABILITY_OS[name]
  );

/** Whether `machine` is one `runsOn` names: it has the capability, or it is that machine. */
export const fits = (runsOn: string, machine: MachineFacts): boolean => {
  if (isCapability(runsOn)) {
    return capabilitiesOf(machine.os).includes(runsOn);
  }
  const named = runsOn.toLowerCase();
  const host = machine.hostname.toLowerCase();
  return (
    machine.machineId === runsOn ||
    host === named ||
    host.split(".")[0] === named
  );
};

/** What `runsOn` needs, in a sentence's words: `a Mac (apple)`, `the machine obelisk`. */
export const runsOnWords = (runsOn: string): string =>
  isCapability(runsOn)
    ? `${CAPABILITY_WORDS[runsOn]} (${runsOn})`
    : `the machine ${runsOn}`;

/**
 * A `runs_on` value as written: trimmed, and checked against the fleet.
 * Refused, in one sentence, when it names neither a capability nor a
 * machine the hub has ever seen.
 */
export const runsOnValue = (
  value: string,
  machines: MachineFacts[]
): { problem: string } | { value: string } => {
  const trimmed = value.trim();
  if (
    isCapability(trimmed) ||
    machines.some((machine) => fits(trimmed, machine))
  ) {
    return { value: trimmed };
  }
  return {
    problem: `runs_on “${trimmed}” is neither ${RUNS_ON_CAPABILITIES.join(" nor ")} nor a machine this hub knows (${
      machines.map((machine) => machine.hostname).join(", ") || "none yet"
    }).`,
  };
};

/**
 * Words a task's text or checks carry when its work needs a Mac: an
 * attempt cut on Linux cannot run them. Suggests `runs_on: apple` to the
 * session filing such a task without one; never applied on its own.
 */
const APPLE_WORK =
  /\bbuild-both\.sh\b|\bxcodebuild\b|\bxcrun\b|\bsimctl\b|\bsimulators?\b/i;

/** The suggestion for a task filed without `runs_on` whose words need a Mac; undefined otherwise. */
export const appleSuggestion = (
  texts: (string | undefined)[]
): string | undefined =>
  texts.some((text) => text && APPLE_WORK.test(text))
    ? "Its words need a Mac (build-both.sh, xcodebuild or a simulator), and it names no runs_on: set runs_on: apple with task_update, or its attempts may start on Linux."
    : undefined;
