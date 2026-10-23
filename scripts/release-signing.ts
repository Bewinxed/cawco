import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { releaseEnvPath } from "../packages/core/src/paths";

/**
 * The release's secrets arrive only through the environment, never as
 * arguments: Bun loads them from {@link releaseEnvPath}, in CawCo's config
 * dir, which every workspace boundary hides. A checkout's own `.env` is not
 * read (`--env-file` replaces it). Each is base64, one line:
 * - `CAWCO_RELEASE_SIGNING_KEY`: the PKCS8 PEM that signs release manifests;
 * - `CAWCO_APPLE_DEVELOPER_ID`: a PEM of the team's Developer ID Application
 *   certificate and its private key, which signs the darwin bundles;
 * - `CAWCO_APP_STORE_CONNECT_KEY`: the App Store Connect API key as rcodesign's
 *   `encode-app-store-connect-api-key` writes it, which notarizes them.
 * `bash scripts/release-setup.sh --import-secrets` writes them from their one
 * source of truth (release-setup.ts).
 */
export const SECRET_VARIABLES = {
  manifestKey: "CAWCO_RELEASE_SIGNING_KEY",
  developerId: "CAWCO_APPLE_DEVELOPER_ID",
  appStoreConnectKey: "CAWCO_APP_STORE_CONNECT_KEY",
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

/** Reads every secret once and removes it from the environment, so no child process inherits one. */
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
 * The Apple secrets as the files rcodesign reads, in `dir` (made mode 0700,
 * each file 0600): the Developer ID identity PEM and the App Store Connect
 * key JSON. The caller removes `dir` when signing ends.
 */
export async function writeAppleSecrets(
  dir: string,
  secrets: ReleaseSecrets
): Promise<{ apiKey: string; identity: string }> {
  const { developerId, appStoreConnectKey } = secrets;
  if (!(developerId && appStoreConnectKey)) {
    throw new Error(
      `No Apple signing secrets: ${missingSecrets(secrets)
        .filter((name) => name !== SECRET_VARIABLES.manifestKey)
        .join(
          " and "
        )} are read from ${releaseEnvPath()}; bash scripts/release-setup.sh --import-secrets writes them`
    );
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const identity = join(dir, "developer-id.pem");
  const apiKey = join(dir, "app-store-connect-key.json");
  await writeFile(identity, Buffer.from(developerId, "base64"), {
    mode: 0o600,
  });
  await writeFile(apiKey, Buffer.from(appStoreConnectKey, "base64"), {
    mode: 0o600,
  });
  return { identity, apiKey };
}
