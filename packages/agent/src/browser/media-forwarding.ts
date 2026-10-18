/**
 * Whether the machine's container runtime forwards UDP from the host to a
 * container's published port, which decides what a browser's media port is
 * published and advertised for. Docker Engine, rootless Podman (pasta),
 * Docker Desktop and OrbStack forward UDP and TCP. Colima forwards what its
 * VM's port forwarder carries (colima.yaml: "ssh is more stable but supports
 * only TCP. grpc supports both TCP and UDP, but is experimental.",
 * "Default: ssh").
 *
 * Read fresh where it is used (each container start, each capability probe),
 * never kept: `colima restart` changes it under a runtime already found.
 * Colima's facts below are from its source, abiosoft/colima.
 */
import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, dirname, join } from "node:path";
import { parse } from "yaml";

/** What the runtime forwards to a browser's media port. */
export type MediaForwarding =
  | { udp: true }
  | {
      udp: false;
      /** What the browser streams over instead, and how to get UDP back: shown to the person. */
      advice: string;
    };

/**
 * Colima's home, found as Colima finds it (config/files.go `configBaseDir`):
 * `$COLIMA_HOME` when it exists, then `~/.colima` when it exists, then
 * `$XDG_CONFIG_HOME/colima` when that is set, then `~/.config/colima` when it
 * exists, then `~/.colima` on a Mac and `~/.config/colima` elsewhere.
 */
export const colimaHome = (): string => {
  const home = homedir();
  const explicit = process.env.COLIMA_HOME;
  const dotColima = join(home, ".colima");
  const xdg = process.env.XDG_CONFIG_HOME;
  const xdgColima = join(xdg || join(home, ".config"), "colima");
  if (explicit && existsSync(explicit)) {
    return explicit;
  }
  if (existsSync(dotColima)) {
    return dotColima;
  }
  if (xdg || existsSync(xdgColima)) {
    return xdgColima;
  }
  return platform() === "darwin" ? dotColima : xdgColima;
};

/** A Colima profile an Engine API socket belongs to. */
interface ColimaProfile {
  home: string;
  /** The profile's short name: `default`, or what `--profile` named. */
  name: string;
}

/**
 * The Colima profile whose Docker socket `socket` is, if any: its real path
 * is `<home>/<profile>/docker.sock` (docker.HostSocketFile), or the default
 * profile's `<home>/docker.sock` (LegacyDefaultHostSocketFile, forwarded "for
 * backward compatibility"). A home is Colima's when it is the one this
 * machine's Colima uses, or it holds Colima's `_lima` (a daemon started
 * without the shell's `COLIMA_HOME` still knows the socket it names).
 */
const colimaProfileOf = async (
  socket: string
): Promise<ColimaProfile | undefined> => {
  // A socket that went between the ping and this read is judged by its name.
  const real = await realpath(socket).catch(() => socket);
  if (basename(real) !== "docker.sock") {
    return;
  }
  const machines = colimaHome();
  const isHome = (dir: string): boolean =>
    dir === machines || existsSync(join(dir, "_lima"));
  const profileDir = dirname(real);
  if (isHome(dirname(profileDir))) {
    return { home: dirname(profileDir), name: basename(profileDir) };
  }
  if (isHome(profileDir)) {
    return { home: profileDir, name: "default" };
  }
};

/** `~/…` for a path under the home directory, as the person would type it. */
const tilde = (path: string): string => {
  const home = homedir();
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
};

/**
 * What the Colima profile's running VM forwards. Its settings as started are
 * the instance's state file, `<lima dir>/<instance>/colima.yaml`
 * (Profile.StateFile, written at every start: "preserve state"); the
 * profile's own colima.yaml is only what the next start reads. The Lima dir
 * is `$LIMA_HOME`, else `<home>/_lima`; the instance is `colima`, or
 * `colima-<profile>`. Colima starts Lima's ssh forwarder for every value but
 * grpc (`useSSHPortForwarder := conf.PortForwarder != "grpc"`), an empty one
 * is ssh, and `none` ignores every port.
 */
const colimaForwarding = async (
  profile: ColimaProfile
): Promise<MediaForwarding> => {
  const instance =
    profile.name === "default" ? "colima" : `colima-${profile.name}`;
  const state = join(
    process.env.LIMA_HOME || join(profile.home, "_lima"),
    instance,
    "colima.yaml"
  );
  const config = tilde(join(profile.home, profile.name, "colima.yaml"));
  const fix = `To stream over UDP, set \`portForwarder: grpc\` in ${config}, then run \`colima restart\`.`;
  let forwarder: unknown;
  try {
    const settings = parse(await readFile(state, "utf8")) as {
      portForwarder?: unknown;
    } | null;
    forwarder = settings?.portForwarder || "ssh";
  } catch (error) {
    const why =
      (error as NodeJS.ErrnoException).code ??
      (error instanceof Error ? error.message : String(error));
    return {
      udp: false,
      advice: `Colima's running settings at ${tilde(state)} could not be read (${why}), so this machine's browser streams over TCP alone. ${fix}`,
    };
  }
  if (forwarder === "grpc") {
    return { udp: true };
  }
  if (forwarder === "none") {
    return {
      udp: false,
      advice: `Colima forwards no ports (\`portForwarder: none\`), so no screen reaches this machine's browser directly. ${fix}`,
    };
  }
  return {
    udp: false,
    advice: `Colima forwards only TCP, so this machine's browser streams over TCP, which stutters on weak networks. ${fix}`,
  };
};

/** What the runtime answering on `endpoint` forwards to a browser's media port, read now. */
export const mediaForwarding = async (
  endpoint: string
): Promise<MediaForwarding> => {
  const profile = await colimaProfileOf(endpoint);
  return profile ? colimaForwarding(profile) : { udp: true };
};
