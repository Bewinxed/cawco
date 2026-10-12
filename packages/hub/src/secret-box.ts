/**
 * The hub's sealed secrets (connections.ts): AES-256-GCM under one key kept
 * in a file of its own beside the database (`connections.key`, 32 random
 * bytes, mode 0600). A copy of the database alone opens nothing; the key
 * file's folder is the database's, which every workspace boundary hides
 * (core `credentialStores`).
 *
 * Until this, every secret the hub kept (the OpenRouter key, push pairing
 * secrets, fleet MCP OAuth tokens) sat in SQLite as plain text; connections
 * are the first rows sealed.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  openSync,
  readFileSync,
  statSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { DB_PATH } from "./config";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** A sealed value: version, then base64url of iv ‖ ciphertext ‖ tag. */
const PREFIX = "v1:";

export interface SecretBox {
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
    const fd = openSync(path, "wx", 0o600);
    try {
      writeSync(fd, randomBytes(KEY_BYTES));
    } finally {
      closeSync(fd);
    }
    chmodSync(path, 0o600);
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

export const makeSecretBox = (
  path = join(dirname(DB_PATH), "connections.key")
): SecretBox => {
  const key = loadKey(path);
  return {
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
