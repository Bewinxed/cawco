/**
 * Colima, as the container runtime finds it on this machine: its home and the
 * profile a Docker socket belongs to. runtime.ts and media-forwarding.ts both
 * read these from here, so neither imports the other for them.
 */
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, dirname, join } from "node:path";

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
export interface ColimaProfile {
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
export const colimaProfileOf = async (
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
