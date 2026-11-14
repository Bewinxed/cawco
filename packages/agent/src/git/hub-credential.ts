/**
 * The credentials git runs on this machine carry, and text with them taken
 * out. The hub's git remote is reached with this machine's credential, which
 * the hub hands over in the register ack and which lives only in this
 * module's memory: git gets it per command through env-only config
 * (`GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`), so nothing is
 * written to disk, and it never reaches a session's environment. Anything a
 * git run says back has it removed first ({@link withoutCredential}).
 */

/** This machine's credential for the hub's git remote, from the last register ack. */
let hubCredential: { machineId: string; credential: string } | undefined;

/** Takes the credential a register ack carries; the one before it stops working at the hub. */
export const setHubCredential = (
  machineId: string,
  credential: string | undefined
): void => {
  hubCredential = credential ? { machineId, credential } : undefined;
};

/** This machine's id and credential for the hub's git remote, or undefined before the first register. */
export const hubGitLogin = ():
  { machineId: string; credential: string } | undefined => hubCredential;

export const basicOf = (): string => {
  if (!hubCredential) {
    throw new Error(
      "This machine has no credential for the hub's git remote yet: it gets one each time it registers."
    );
  }
  const { machineId, credential } = hubCredential;
  return Buffer.from(`${machineId}:${credential}`).toString("base64");
};

/**
 * An outside remote's credentials held by the steps running now
 * ({@link holdingRemote}), each with how many hold it: taken out of
 * anything a step says.
 */
const remoteSecrets = new Map<string, number>();

/**
 * Projects' declared LFS credentials this agent was handed (host-lfs.ts
 * `declaredLfs`): taken out of anything a step says for as long as it runs.
 */
const declaredSecrets = new Set<string>();

/** Every form a credential could take in text a tool printed. */
const secretsOf = (): string[] => [
  ...(hubCredential ? [hubCredential.credential, basicOf()] : []),
  ...remoteSecrets.keys(),
  ...declaredSecrets,
];

/**
 * How long a Basic credential's user part must be to be held. A token passed
 * as the user is long; the users that are not secrets ("git", "x", "oauth2")
 * are six characters or fewer, and scrubbing them out of everything git
 * prints would wreck it.
 */
const USER_HELD_MIN = 8;

/**
 * The parts of an HTTP Basic credential that are held besides the value
 * itself, as RFC 7617 splits it: the user-id is what comes before the first
 * colon (it has none), the password all that follows it (it may have some).
 * The password is held whole whenever it is not empty; the user only from
 * {@link USER_HELD_MIN} characters.
 */
const basicParts = (basic: string): string[] => {
  const decoded = Buffer.from(basic, "base64").toString();
  const colon = decoded.indexOf(":");
  const user = colon < 0 ? decoded : decoded.slice(0, colon);
  const password = colon < 0 ? "" : decoded.slice(colon + 1);
  return [
    ...(password === "" ? [] : [password]),
    ...(user.length >= USER_HELD_MIN ? [user] : []),
  ];
};

/** A declared LFS credential (HTTP Basic), and each part it decodes to ({@link basicParts}), taken out of what git says from now on. */
export const holdDeclaredSecret = (basic: string): void => {
  declaredSecrets.add(basic);
  for (const part of basicParts(basic)) {
    declaredSecrets.add(part);
  }
};

/**
 * `work` with an outside remote's credential taken out of all it says, for
 * as long as it runs: the Basic value and each part of what it decodes to
 * ({@link basicParts}).
 */
export const holdingRemote = async <T>(
  basic: string | undefined,
  work: () => Promise<T>
): Promise<T> => {
  if (!basic) {
    return await work();
  }
  const held = [basic, ...basicParts(basic)];
  for (const secret of held) {
    remoteSecrets.set(secret, (remoteSecrets.get(secret) ?? 0) + 1);
  }
  try {
    return await work();
  } finally {
    for (const secret of held) {
      const left = (remoteSecrets.get(secret) ?? 1) - 1;
      if (left > 0) {
        remoteSecrets.set(secret, left);
      } else {
        remoteSecrets.delete(secret);
      }
    }
  }
};

const AUTHORIZATION_VALUE = /(authorization:\s*\w+\s+)\S+/giu;

/** `text` with the credential and any `Authorization` value taken out. */
export const withoutCredential = (text: string): string => {
  let clean = text.replace(AUTHORIZATION_VALUE, "$1[hidden]");
  for (const secret of secretsOf()) {
    clean = clean.split(secret).join("[hidden]");
  }
  return clean;
};
