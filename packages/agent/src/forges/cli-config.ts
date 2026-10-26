/**
 * Where gh, glab and tea keep their files on the host, read as each CLI
 * reads them: under `$XDG_CONFIG_HOME`, else `$HOME/.config`
 * (docs/forge-adapters.md §3.4).
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/** The config dir gh, glab and tea keep their files under: `$XDG_CONFIG_HOME`, else `$HOME/.config`, as each CLI reads it. */
export const configHome = (): string =>
  process.env.XDG_CONFIG_HOME || join(process.env.HOME || homedir(), ".config");

/** A CLI's YAML config file, parsed; undefined when there is none or it does not read. */
export const readYamlConfig = async (
  file: string
): Promise<unknown | undefined> => {
  const text = await Bun.file(file)
    .text()
    .catch(() => undefined);
  if (text === undefined) {
    return;
  }
  try {
    return parseYaml(text) as unknown;
  } catch {
    // A config the CLI could not read either: no sign-in from it.
  }
};

const PORT = /:\d+$/u;

/**
 * Whether a CLI's login for `configured` (`gitea.local:3000`) is the one for
 * `asked`: the same host and port, or, asked by a project's remote, which
 * names no port (core normaliseRemote), the same hostname.
 */
export const sameHost = (configured: string, asked: string): boolean => {
  const login = configured.trim().toLowerCase();
  const wanted = asked.trim().toLowerCase();
  return (
    login === wanted ||
    (!PORT.test(wanted) && login.replace(PORT, "") === wanted)
  );
};
