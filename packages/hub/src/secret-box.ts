/**
 * The hub's sealed secrets: AES-256-GCM under one key kept in a file of its
 * own beside the database (`secrets.key`, 32 random bytes, mode 0600). A copy
 * of the database alone opens nothing; the key file's folder is the
 * database's, which every workspace boundary hides (core `credentialStores`).
 *
 * Every secret column is a sealed column (db/schema.ts `sealedText`,
 * `sealedJson`): sealed on each write, opened on each read, and a value the
 * key does not open reads as no secret, so its feature asks for it again.
 * Values kept before sealing are sealed in place at start (db/seal-at-rest.ts).
 */
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeStateFileSync } from "@cawco/core/state-file";
import { DB_PATH } from "./config";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** A sealed value: version, then base64url of iv ‖ ciphertext ‖ tag. */
const PREFIX = "v1:";

export interface SecretBox {
  /**
   * A 32-byte key for one use, named by `label`, derived from the hub's key
   * (HKDF-SHA256): never stored, the same on every start while the key file
   * is, and no use's key tells anything of another's or of the hub's own.
   */
  readonly derive: (label: string) => Buffer;
  /** The plain text `sealed` was made from; throws when it was not sealed under this key. */
  readonly open: (sealed: string) => string;
  /** `plain`, sealed under the hub's key: what a row stores. */
  readonly seal: (plain: string) => string;
}

/**
 * The key file's 32 bytes, made once (exclusive create, 0600) when there is
 * none. A file of another size, or one others may read, is refused: a key
 * someone else could have written or read seals nothing.
 */
const loadKey = (path: string): Buffer => {
  try {
    // Whole or not at all: a key cut short by a crash would refuse every
    // start after it (the size check below), and seal nothing meanwhile.
    writeStateFileSync(path, randomBytes(KEY_BYTES), {
      exclusive: true,
      mode: 0o600,
    });
    console.info(`[secret-box] made the hub's secret key at ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: a file mode's permission bits are a mask, and the mask is the question
  const mode = statSync(path).mode & 0o777;
  // biome-ignore lint/suspicious/noBitwiseOperators: the group and other bits, tested as a mask
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `The hub's secret key ${path} is readable by others (mode ${mode.toString(8)}); make it 0600.`
    );
  }
  const key = readFileSync(path);
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `The hub's secret key ${path} holds ${key.length} bytes, not ${KEY_BYTES}.`
    );
  }
  return key;
};

/** Whether a stored value is one the hub sealed (it may still not open, under another key). */
export const isSealed = (value: string): boolean => value.startsWith(PREFIX);

export const makeSecretBox = (
  path = join(dirname(DB_PATH), "secrets.key")
): SecretBox => {
  // The key's first name, from when it sealed connections only.
  const first = join(dirname(path), "connections.key");
  if (!existsSync(path) && existsSync(first)) {
    renameSync(first, path);
    console.info(`[secret-box] the hub's secret key is now ${path}`);
  }
  const key = loadKey(path);
  return {
    derive: (label) =>
      Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), label, KEY_BYTES)),
    seal: (plain) => {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([
        cipher.update(plain, "utf8"),
        cipher.final(),
      ]);
      return `${PREFIX}${Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url")}`;
    },
    open: (sealed) => {
      if (!sealed.startsWith(PREFIX)) {
        throw new Error("This secret was not sealed by the hub.");
      }
      const raw = Buffer.from(sealed.slice(PREFIX.length), "base64url");
      if (raw.length < IV_BYTES + TAG_BYTES) {
        throw new Error("This secret is cut short.");
      }
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        raw.subarray(0, IV_BYTES)
      );
      decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
      return Buffer.concat([
        decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)),
        decipher.final(),
      ]).toString("utf8");
    },
  };
};

let hub: SecretBox | undefined;

/** The hub's one box, under the key beside its database; made on first use. */
export const hubSecrets = (): SecretBox => {
  hub ??= makeSecretBox();
  return hub;
};

/** Sealed values already said not to open, so each is said once. */
const unopened = new Set<string>();

/**
 * A sealed column's value opened, or null when the hub's key does not open
 * it (the key file was replaced): no secret, so its feature asks again.
 */
export const openOrNull = (sealed: string): string | null => {
  try {
    return hubSecrets().open(sealed);
  } catch {
    if (!unopened.has(sealed)) {
      unopened.add(sealed);
      console.warn(
        "[secret-box] a sealed value does not open with the hub's key; it reads as no secret until it is given again"
      );
    }
    return null;
  }
};
