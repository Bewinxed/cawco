import { releaseEnvPath } from "../packages/core/src/paths";

/**
 * The release signing key arrives only through the environment, never as an
 * argument: Bun loads it from {@link releaseEnvPath}, in CawCo's config dir,
 * which every workspace boundary hides. A checkout's own `.env` is not read
 * (`--env-file` replaces it).
 */
export const KEY_VARIABLE = "CAWCO_RELEASE_SIGNING_KEY";

/** Set in the run {@link underSigningEnv} starts, so it does not start another. */
const LOADED_VARIABLE = "CAWCO_RELEASE_SIGNING_ENV";

/**
 * Runs `script` with `args` once more under `bun --env-file` of the release
 * env file and exits with its status, unless this is that run already.
 */
export async function underSigningEnv(
  script: string,
  args: string[]
): Promise<void> {
  if (process.env[LOADED_VARIABLE]) {
    return;
  }
  const run = Bun.spawn(
    [process.execPath, `--env-file=${releaseEnvPath()}`, script, ...args],
    {
      env: { ...process.env, [LOADED_VARIABLE]: "1" },
      stdio: ["inherit", "inherit", "inherit"],
    }
  );
  process.exit(await run.exited);
}

/** Reads the key once and removes it from the environment, so no child process inherits it. */
export function takeSigningKey(): string | undefined {
  const value = process.env[KEY_VARIABLE];
  delete process.env[KEY_VARIABLE];
  return value;
}

/** The PKCS8 PEM held by the variable, or the plain stop message. */
export function signingPem(value: string | undefined): string {
  if (!value) {
    throw new Error(
      `No release signing key: it is read from ${KEY_VARIABLE} in ${releaseEnvPath()}. Stopping before signed manifest publication; artifacts remain in local staging`
    );
  }
  return Buffer.from(value, "base64").toString("utf8");
}
