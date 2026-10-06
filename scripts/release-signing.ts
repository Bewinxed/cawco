/** The release signing key arrives only through the environment, never a path or an argument. */
export const KEY_VARIABLE = "CAWCO_RELEASE_SIGNING_KEY";

/**
 * Reads the key once and removes it from the environment, so no child process
 * inherits it. Refuses outright when the `.env` it may have come from is tracked.
 */
export async function takeSigningKey(): Promise<string | undefined> {
  const value = process.env[KEY_VARIABLE];
  delete process.env[KEY_VARIABLE];
  if (value) {
    const tracked = Bun.spawn(["git", "ls-files", "--error-unmatch", ".env"], {
      cwd: process.cwd(),
      stdout: "ignore",
      stderr: "ignore",
    });
    if ((await tracked.exited) === 0) {
      throw new Error(
        ".env is tracked by git: refusing to sign. Untrack it with `git rm --cached .env` and keep it ignored."
      );
    }
  }
  return value;
}

/** The PKCS8 PEM held by the variable, or the plain stop message. */
export function signingPem(value: string | undefined): string {
  if (!value) {
    throw new Error(
      `No release signing key: it is read from ${KEY_VARIABLE} in an ignored .env at the root of the checkout this runs from. Stopping before signed manifest publication; artifacts remain in local staging`
    );
  }
  return Buffer.from(value, "base64").toString("utf8");
}
