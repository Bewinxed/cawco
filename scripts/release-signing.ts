import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { releaseEnvPath } from "../packages/core/src/paths/cawco";

/**
 * The release's secrets arrive only through the environment, never as
 * arguments: Bun loads them from {@link releaseEnvPath}, in CawCo's config
 * dir, which every workspace boundary hides. A checkout's own `.env` is not
 * read (`--env-file` replaces it). Each is base64, one line:
 * - `CAWCO_RELEASE_SIGNING_KEY`: the PKCS8 PEM that signs release manifests;
 * - `CAWCO_APPLE_DEVELOPER_ID`: a PEM of the team's Developer ID Application
 *   certificate and its private key, which signs the darwin bundles;
 * `bash scripts/release-setup.sh --import-secrets` writes them from their one
 * source of truth (release-setup.ts).
 */
export const SECRET_VARIABLES = {
  manifestKey: "CAWCO_RELEASE_SIGNING_KEY",
  developerId: "CAWCO_APPLE_DEVELOPER_ID",
} as const;

export type ReleaseSecrets = Partial<
  Record<keyof typeof SECRET_VARIABLES, string>
>;

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
  // A stop sent to this process (ship.sh hands the unit's SIGTERM to it alone) is the run's: it clears its own work
  // and ends, and this process ends with it.
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => run.kill(signal));
  }
  process.exit(await run.exited);
}

/**
 * Reads every secret once and removes it from `process.env`, so no child
 * started with `env: process.env` inherits one. `bun --env-file` puts them in
 * the environment the process started with, which Bun hands every
 * `Bun.spawn` or `Bun.spawnSync` given no `env` (oven-sh/bun#40846), so
 * every spawn of the release names its env.
 */
export function takeReleaseSecrets(): ReleaseSecrets {
  const secrets: ReleaseSecrets = {};
  for (const [name, variable] of Object.entries(SECRET_VARIABLES) as [
    keyof typeof SECRET_VARIABLES,
    string,
  ][]) {
    const value = process.env[variable]?.trim();
    delete process.env[variable];
    if (value) {
      secrets[name] = value;
    }
  }
  return secrets;
}

/** The variables `secrets` lacks, by name. */
export const missingSecrets = (secrets: ReleaseSecrets): string[] =>
  (Object.keys(SECRET_VARIABLES) as (keyof typeof SECRET_VARIABLES)[])
    .filter((name) => !secrets[name])
    .map((name) => SECRET_VARIABLES[name]);

/** The manifest key's PKCS8 PEM, or the plain stop message. */
export function signingPem(value: string | undefined): string {
  if (!value) {
    throw new Error(
      `No release signing key: it is read from ${SECRET_VARIABLES.manifestKey} in ${releaseEnvPath()}. Stopping before signed manifest publication; artifacts remain in local staging`
    );
  }
  return Buffer.from(value, "base64").toString("utf8");
}

/**
 * The Developer ID identity as the file rcodesign reads, in `dir` (made mode
 * 0700, the file 0600). The caller removes `dir` when signing ends.
 */
export async function writeAppleSecrets(
  dir: string,
  secrets: ReleaseSecrets
): Promise<{ identity: string }> {
  const { developerId } = secrets;
  if (!developerId) {
    throw new Error(
      `No Apple signing secret: ${SECRET_VARIABLES.developerId} is read from ${releaseEnvPath()}; bash scripts/release-setup.sh --import-secrets writes it`
    );
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const identity = join(dir, "developer-id.pem");
  await writeFile(identity, Buffer.from(developerId, "base64"), {
    mode: 0o600,
  });
  return { identity };
}
