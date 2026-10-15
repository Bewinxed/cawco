/**
 * A folder or file on a named machine as the fleet stores, sends and runs
 * in it: absolute and normalised. A project's places, a session's launch
 * directory, a workspace's clone and repository are each one.
 *
 * {@link machinePath} is its one constructor. Nothing else makes the brand:
 * `bun run machine-paths:check` fails on an `as MachinePath` anywhere but
 * here. So a value of this type has been through the rules below, and a
 * reader never expands `~` or wonders whether a path is relative.
 *
 * Browser-safe: no node built-ins, as the dashboard reads the type too.
 */

declare const MACHINE_PATH: unique symbol;

/**
 * An absolute, normalised path on one machine (see the module). On the wire
 * it is a plain string: the brand is the compiler's alone.
 * @TJS-type string
 */
export type MachinePath = string & { readonly [MACHINE_PATH]: true };

/** A path {@link machinePath} will not make, in the words its caller answers with. */
export class MachinePathRefused extends Error {}

/** `~` or `~/…`: under the machine's home. `~user` is not this. */
const UNDER_HOME = /^~(?=\/|$)/;

/**
 * `raw` as a path on `machine`: a leading `~` expanded against `home`, the
 * home folder that machine's daemon reported, then `.`, `..`, repeated and
 * trailing slashes normalised away. Refused, with a sentence naming the
 * machine, when it is under `~` and the home is unknown, or when it is still
 * not absolute. There is no guessing: a refusal is the answer.
 */
export const machinePath = (
  home: string | null | undefined,
  raw: string,
  machine: string
): MachinePath => {
  const asked = raw.trim();
  let path = asked;
  if (UNDER_HOME.test(asked)) {
    if (!home?.startsWith("/")) {
      throw new MachinePathRefused(
        `${asked} is under ~ on ${machine}, whose daemon has not said where its home folder is. Name the folder by its absolute path, or update cawco on ${machine}.`
      );
    }
    path = `${home}/${asked.slice(1)}`;
  }
  if (!path.startsWith("/")) {
    throw new MachinePathRefused(
      `${asked || "An empty path"} is not a folder on ${machine}: a path there starts with / (or ~/ for its home folder).`
    );
  }
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return `/${segments.join("/")}` as MachinePath;
};

/**
 * Whether `value` already is a {@link MachinePath}: absolute and exactly as
 * {@link machinePath} would make it. For a column that holds machine paths
 * beside other things (a project's places beside its hub folder), never to
 * bless a path someone named: that goes through {@link machinePath}.
 */
export const isMachinePath = (value: string): value is MachinePath =>
  value.startsWith("/") && machinePath(undefined, value, "") === value;
