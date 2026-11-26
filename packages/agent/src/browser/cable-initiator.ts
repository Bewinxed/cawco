/**
 * The desktop ("initiator") side of the FIDO2 hybrid transport (caBLE v2):
 * the daemon draws a `FIDO:/` QR, the person's phone scans it and advertises
 * over BLE, the advert reaches the daemon (relayed by the person's Chrome
 * extension), and the daemon meets the phone on the caBLE tunnel server,
 * runs the Noise handshake and gets a signed assertion back.
 *
 * The phone is a real platform authenticator (iOS, Android), so every byte
 * here follows Chromium's initiator, the implementation phones are built to
 * meet: device/fido/cable/v2_handshake.cc (QR, advert, tunnel URLs,
 * handshake, framing), noise.cc (the Noise state) and fido_tunnel_device.cc
 * (the message flow). Where CTAP 2.2 §11.5 and Chromium differ in a detail,
 * Chromium's is what the phones answer.
 */
import {
  createCipheriv,
  createDecipheriv,
  createECDH,
  createHash,
  createHmac,
  type ECDH,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { decode, encode } from "cborg";
import { Effect, Queue } from "effect";
import { runPromise, runSync } from "../daemon-runtime";

export interface CableInitiatorOptions {
  allowCredentials?: Array<{ type: string; id: Buffer }>;
  /** SHA-256 of the clientDataJSON. */
  clientDataHash: Buffer;
  rpId: string;
  /** Aborting closes the tunnel and rejects the ceremony. */
  signal?: AbortSignal;
  /** `required` and `preferred` ask the phone for user verification; the default is `preferred`. */
  userVerification?: "required" | "preferred" | "discouraged";
}

export interface CableInitiatorResult {
  /** 64 bytes: AES-256 key, then HMAC-SHA-256 key, for the phone's advert. */
  eidKey: Buffer;
  /** The `FIDO:/` URI the QR carries, for the dashboard to draw. */
  fidoUri: string;
  /** The QR's P-256 private key (32 bytes); the handshake's `se` needs it. */
  identityKey: Buffer;
  /** 16 random bytes: the root every other key is derived from. */
  qrSecret: Buffer;
  /** 16 bytes: names this ceremony on the tunnel server. */
  tunnelId: Buffer;
}

export interface CableAssertionResponse {
  authenticatorData: Buffer;
  credentialId: Buffer;
  signature: Buffer;
  userHandle?: Buffer;
}

/** What a phone's 20-byte advert says, once decrypted. */
interface CableAdvert {
  /** The tunnel server the phone chose. */
  domain: string;
  /** The 16-byte plaintext: the PSK's salt. */
  plaintext: Buffer;
  /** 3 bytes: the phone's connection on the tunnel server. */
  routingId: Buffer;
}

/** The tunnel servers a QR names by index (v2_handshake.cc `kAssignedDomains`). */
const ASSIGNED_DOMAINS = ["cable.ua5v.com", "cable.auth.com"] as const;

/** HKDF info values (v2_handshake.h `DerivedValueType`), as LE32. */
const DERIVED = { eidKey: 1, tunnelId: 2, psk: 3 } as const;

/** The first byte of a message after the handshake (v2_constants.h `MessageType`). */
const MESSAGE = { shutdown: 0, ctap: 1, update: 2 } as const;

const CTAP_GET_ASSERTION = 0x02;
const CTAP_SUCCESS = 0x00;

const P256_X962_LENGTH = 65;
const GCM_TAG_LENGTH = 16;
const ADVERT_LENGTH = 20;
const EMPTY: Buffer = Buffer.alloc(0);

const bytes = (data: Uint8Array): Buffer =>
  Buffer.from(data.buffer, data.byteOffset, data.byteLength);

const sha256 = (...parts: Buffer[]): Buffer => {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest();
};

const hmac = (key: Buffer, data: Buffer): Buffer =>
  createHmac("sha256", key).update(data).digest();

/** RFC 5869 HKDF-SHA-256. */
const hkdf = (
  ikm: Buffer,
  salt: Buffer,
  info: Buffer,
  length: number
): Buffer => bytes(new Uint8Array(hkdfSync("sha256", ikm, salt, info, length)));

/** HKDF with `info` = LE32(`type`) (v2_handshake.cc `Derive`). */
const derive = (
  secret: Buffer,
  salt: Buffer,
  type: number,
  length: number
): Buffer => {
  const info = Buffer.alloc(4);
  info.writeUInt32LE(type);
  return hkdf(secret, salt, info, length);
};

// ---------------------------------------------------------------------------
// QR

/** Digits for a chunk of n bytes, n = 0..7 (v2_handshake.cc `BytesToDigits`). */
const CHUNK_DIGITS = [0, 3, 5, 8, 10, 13, 15, 17] as const;
const CHUNK_BYTES = 7;

/**
 * The QR's bytes as decimal digits: each 7-byte chunk read as a
 * little-endian integer and written zero-padded to 17 digits, a shorter last
 * chunk to its own width.
 */
const bytesToDigits = (data: Buffer): string => {
  let digits = "";
  for (let at = 0; at < data.length; at += CHUNK_BYTES) {
    const chunk = data.subarray(at, at + CHUNK_BYTES);
    let value = 0n;
    for (let index = chunk.length - 1; index >= 0; index -= 1) {
      value = value * 256n + BigInt(chunk[index] ?? 0);
    }
    digits += value
      .toString()
      .padStart(CHUNK_DIGITS[chunk.length] ?? CHUNK_DIGITS[CHUNK_BYTES], "0");
  }
  return digits;
};

/** Step 1: a fresh identity key and QR secret, and the `FIDO:/` URI that carries them. */
export function generateQr(): CableInitiatorResult {
  const identity = createECDH("prime256v1");
  identity.generateKeys();
  const qrSecret = randomBytes(16);
  // v2_handshake.cc `qr::Encode`: 0 public key, 1 secret, 2 how many
  // assigned tunnel domains the client knows, 3 now (epoch seconds),
  // 4 whether linking is offered, 5 the request type.
  const contents = new Map<number, unknown>([
    [0, identity.getPublicKey(undefined, "compressed")],
    [1, qrSecret],
    [2, ASSIGNED_DOMAINS.length],
    [3, Math.floor(Date.now() / 1000)],
    [4, false],
    [5, "ga"],
  ]);
  return {
    fidoUri: `FIDO:/${bytesToDigits(bytes(encode(contents)))}`,
    qrSecret,
    eidKey: derive(qrSecret, EMPTY, DERIVED.eidKey, 64),
    tunnelId: derive(qrSecret, EMPTY, DERIVED.tunnelId, 16),
    identityKey: identity.getPrivateKey(),
  };
}

// ---------------------------------------------------------------------------
// Advert

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
const TLDS = ["com", "org", "net", "info"] as const;
const DOMAIN_PREFIX = "caBLEv2 tunnel server domain";

/**
 * The tunnel server an advert names (v2_handshake.cc `DecodeDomain`): below
 * 256 an index into {@link ASSIGNED_DOMAINS}, from 256 a name hashed from the
 * number; undefined for an index no server holds.
 */
const tunnelDomain = (id: number): string | undefined => {
  if (id < 256) {
    return ASSIGNED_DOMAINS[id];
  }
  // The prefix, the id as LE16, and a trailing NUL: 31 bytes hashed.
  const template = Buffer.alloc(DOMAIN_PREFIX.length + 3);
  template.write(DOMAIN_PREFIX, "latin1");
  template.writeUInt16LE(id, DOMAIN_PREFIX.length);
  let value = sha256(template).readBigUInt64LE(0);
  const tld = TLDS[Number(value % 4n)];
  value /= 4n;
  let domain = "cable.";
  while (value !== 0n) {
    domain += BASE32[Number(value % 32n)];
    value /= 32n;
  }
  return `${domain}.${tld}`;
};

/**
 * A phone's advert decrypted with this QR's EID key (v2_handshake.cc
 * `eid::Decrypt`): the HMAC tag checked first, the block decrypted, its
 * reserved byte and tunnel server checked. Undefined for an advert of another
 * ceremony or phone.
 */
const decryptAdvert = (
  eidKey: Buffer,
  advert: Buffer
): CableAdvert | undefined => {
  if (advert.length !== ADVERT_LENGTH) {
    return;
  }
  const ciphertext = advert.subarray(0, 16);
  const tag = hmac(eidKey.subarray(32), ciphertext).subarray(0, 4);
  if (!timingSafeEqual(tag, advert.subarray(16))) {
    return;
  }
  const decipher = createDecipheriv(
    "aes-256-ecb",
    eidKey.subarray(0, 32),
    null
  ).setAutoPadding(false);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  // flags(1) nonce(10) routing id(3) tunnel server(2, LE)
  const domain = tunnelDomain(plaintext.readUInt16LE(14));
  if (plaintext[0] !== 0 || !domain) {
    return;
  }
  return { plaintext, routingId: plaintext.subarray(11, 14), domain };
};

/** Whether `advertServiceData` is this QR's phone: the cheap test before {@link completeCeremony}. */
export const isOwnAdvert = (
  init: CableInitiatorResult,
  advertServiceData: Buffer
): boolean => decryptAdvert(init.eidKey, advertServiceData) !== undefined;

// ---------------------------------------------------------------------------
// Noise (noise.cc)

/** 12-byte GCM nonce with `counter` as BE32 at `at`, the rest zero. */
const nonceOf = (counter: number, at: number): Buffer => {
  const nonce = Buffer.alloc(12);
  nonce.writeUInt32BE(counter, at);
  return nonce;
};

const seal = (
  key: Buffer,
  nonce: Buffer,
  ad: Buffer,
  plaintext: Buffer
): Buffer => {
  const cipher = createCipheriv("aes-256-gcm", key, nonce).setAAD(ad);
  return Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
};

const open = (
  key: Buffer,
  nonce: Buffer,
  ad: Buffer,
  sealed: Buffer
): Buffer => {
  if (sealed.length < GCM_TAG_LENGTH) {
    throw new Error("caBLE: message shorter than its tag");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, nonce)
    .setAAD(ad)
    .setAuthTag(sealed.subarray(sealed.length - GCM_TAG_LENGTH));
  return Buffer.concat([
    decipher.update(sealed.subarray(0, sealed.length - GCM_TAG_LENGTH)),
    decipher.final(),
  ]);
};

/** The Noise symmetric state, its HKDF RFC 5869's with the chaining key as salt. */
class NoiseState {
  #h: Buffer;
  #ck: Buffer;
  #k = EMPTY;
  #n = 0;

  constructor(protocolName: string) {
    this.#h = Buffer.alloc(32);
    this.#h.write(protocolName, "latin1");
    this.#ck = Buffer.from(this.#h);
  }

  #hkdf(ikm: Buffer, outputs: number): Buffer[] {
    const out = hkdf(ikm, this.#ck, EMPTY, 32 * outputs);
    return Array.from({ length: outputs }, (_, index) =>
      out.subarray(32 * index, 32 * (index + 1))
    );
  }

  mixHash(data: Buffer): void {
    this.#h = sha256(this.#h, data);
  }

  mixKey(ikm: Buffer): void {
    [this.#ck = EMPTY, this.#k = EMPTY] = this.#hkdf(ikm, 2);
    this.#n = 0;
  }

  mixKeyAndHash(ikm: Buffer): void {
    const [ck = EMPTY, hash = EMPTY, key = EMPTY] = this.#hkdf(ikm, 3);
    this.#ck = ck;
    this.mixHash(hash);
    this.#k = key;
    this.#n = 0;
  }

  encryptAndHash(plaintext: Buffer): Buffer {
    const ciphertext = seal(this.#k, nonceOf(this.#n, 0), this.#h, plaintext);
    this.#n += 1;
    this.mixHash(ciphertext);
    return ciphertext;
  }

  decryptAndHash(ciphertext: Buffer): Buffer {
    const plaintext = open(this.#k, nonceOf(this.#n, 0), this.#h, ciphertext);
    this.#n += 1;
    this.mixHash(ciphertext);
    return plaintext;
  }

  /** Split: the initiator writes with the first key and reads with the second. */
  trafficKeys(): { write: Buffer; read: Buffer } {
    const [write = EMPTY, read = EMPTY] = this.#hkdf(EMPTY, 2);
    return { write, read };
  }
}

/**
 * `Noise_KNpsk0_P256_AESGCM_SHA256` as the initiator (v2_handshake.cc
 * `HandshakeInitiator`, its QR case): prologue byte 1, the identity's
 * uncompressed point, the PSK, then `-> e` with an empty payload. Points on
 * the wire are uncompressed X9.62; `e` is mixed into the key as well as the
 * hash, as psk handshakes do.
 */
const initialMessage = (
  identity: ECDH,
  psk: Buffer
): { message: Buffer; noise: NoiseState; ephemeral: ECDH } => {
  const noise = new NoiseState("Noise_KNpsk0_P256_AESGCM_SHA256");
  noise.mixHash(Buffer.from([1]));
  noise.mixHash(identity.getPublicKey());
  noise.mixKeyAndHash(psk);
  const ephemeral = createECDH("prime256v1");
  const ephemeralPublic = ephemeral.generateKeys();
  noise.mixHash(ephemeralPublic);
  noise.mixKey(ephemeralPublic);
  const message = Buffer.concat([ephemeralPublic, noise.encryptAndHash(EMPTY)]);
  return { message, noise, ephemeral };
};

/** `<- e, ee, se`: the phone's point and an empty payload, then the traffic keys. */
const processResponse = (
  response: Buffer,
  noise: NoiseState,
  ephemeral: ECDH,
  identity: ECDH
): { write: Buffer; read: Buffer } => {
  if (response.length !== P256_X962_LENGTH + GCM_TAG_LENGTH) {
    throw new Error(`caBLE: handshake response of ${response.length} bytes`);
  }
  const peer = response.subarray(0, P256_X962_LENGTH);
  const shared = ephemeral.computeSecret(peer);
  noise.mixHash(peer);
  noise.mixKey(peer);
  noise.mixKey(shared);
  noise.mixKey(identity.computeSecret(peer));
  if (noise.decryptAndHash(response.subarray(P256_X962_LENGTH)).length > 0) {
    throw new Error("caBLE: handshake response carried a payload");
  }
  return noise.trafficKeys();
};

/**
 * Messages after the handshake (v2_handshake.cc `Crypter`): padded to a
 * multiple of 32 with zeros and a last byte counting them, sealed with
 * AES-256-GCM, no associated data, the nonce a BE32 sequence number in its
 * last four bytes.
 */
class Crypter {
  readonly #write: Buffer;
  readonly #read: Buffer;
  #writeSequence = 0;
  #readSequence = 0;

  constructor(keys: { write: Buffer; read: Buffer }) {
    this.#write = keys.write;
    this.#read = keys.read;
  }

  encrypt(message: Buffer): Buffer {
    const padded = Buffer.alloc(Math.ceil((message.length + 1) / 32) * 32);
    message.copy(padded);
    padded[padded.length - 1] = padded.length - message.length - 1;
    const nonce = nonceOf(this.#writeSequence, 8);
    this.#writeSequence += 1;
    return seal(this.#write, nonce, EMPTY, padded);
  }

  decrypt(sealed: Buffer): Buffer {
    const padded = open(
      this.#read,
      nonceOf(this.#readSequence, 8),
      EMPTY,
      sealed
    );
    this.#readSequence += 1;
    const zeros = padded.at(-1);
    if (zeros === undefined || zeros + 1 > padded.length) {
      throw new Error("caBLE: message with bad padding");
    }
    return padded.subarray(0, padded.length - zeros - 1);
  }
}

// ---------------------------------------------------------------------------
// Tunnel

type CborMap = Map<unknown, unknown>;

/** `data` as one CBOR map, or undefined when it is anything else. */
const readMap = (data: Buffer): CborMap | undefined => {
  try {
    const value: unknown = decode(data, { useMaps: true });
    return value instanceof Map ? value : undefined;
  } catch {
    return undefined;
  }
};

const decodeMap = (data: Buffer): CborMap => {
  const map = readMap(data);
  if (!map) {
    throw new Error("caBLE: expected a CBOR map");
  }
  return map;
};

const byteField = (
  map: CborMap | undefined,
  key: unknown
): Buffer | undefined => {
  const value = map?.get(key);
  return value instanceof Uint8Array ? bytes(value) : undefined;
};

/**
 * A revision-0 post-handshake message (v2_handshake.cc
 * `DecodePaddedCBORMap`): its padding counted by a trailing LE16, or by one
 * trailing byte.
 */
const decodePaddedMap = (data: Buffer): CborMap => {
  for (const width of [2, 1]) {
    if (data.length < width) {
      continue;
    }
    const zeros =
      width === 2 ? data.readUInt16LE(data.length - 2) : (data.at(-1) ?? 0);
    const map =
      zeros + width <= data.length
        ? readMap(data.subarray(0, data.length - zeros - width))
        : undefined;
    if (map) {
      return map;
    }
  }
  throw new Error("caBLE: unreadable post-handshake message");
};

/** One WebSocket to the tunnel server, read a message at a time. */
class TunnelLink {
  readonly #socket: WebSocket;
  /** Each message as it came, until the tunnel ends: then why, after every message before it. */
  readonly #messages = runSync(Queue.unbounded<Buffer, Error>());

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.binaryType = "arraybuffer";
    socket.addEventListener("message", (event) => {
      Queue.offerUnsafe(
        this.#messages,
        event.data instanceof ArrayBuffer
          ? Buffer.from(event.data)
          : Buffer.from(String(event.data))
      );
    });
    socket.addEventListener("close", (event) => {
      this.#end(
        new Error(`caBLE: tunnel closed (${event.code} ${event.reason})`)
      );
    });
  }

  /** The tunnel at `url` once it opens on the caBLE subprotocol; an abort of `signal` ends it. */
  static readonly opened = Effect.fnUntraced(function* (
    url: string,
    signal: AbortSignal | undefined
  ) {
    return yield* Effect.callback<TunnelLink, Error>((resume) => {
      const socket = new WebSocket(url, ["fido.cable"]);
      const link = new TunnelLink(socket);
      const abort = (): void => {
        const aborted = new Error("caBLE: ceremony aborted");
        link.close(aborted);
        resume(Effect.fail(aborted));
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
      socket.addEventListener("open", () => {
        // websocket_adapter.cc: the server must pick the caBLE subprotocol.
        if (socket.protocol === "fido.cable") {
          resume(Effect.succeed(link));
        } else {
          link.close();
          resume(
            Effect.fail(
              new Error(`caBLE: tunnel server picked "${socket.protocol}"`)
            )
          );
        }
      });
      socket.addEventListener("error", () => {
        resume(
          Effect.fail(new Error(`caBLE: tunnel at ${url} failed to connect`))
        );
      });
      return Effect.sync(() => link.close());
    });
  });

  /** The promise edge of {@link TunnelLink.opened}, for the ceremony. */
  static open(
    url: string,
    signal: AbortSignal | undefined
  ): Promise<TunnelLink> {
    return runPromise(TunnelLink.opened(url, signal));
  }

  /** The next message, or why the tunnel ended once none is left. */
  next(): Promise<Buffer> {
    return runPromise(Queue.take(this.#messages));
  }

  send(data: Buffer): void {
    this.#socket.send(data);
  }

  close(error = new Error("caBLE: tunnel closed")): void {
    this.#end(error);
    this.#socket.close();
  }

  /** Ends the tunnel with `error`, its first end kept. */
  #end(error: Error): void {
    runSync(Queue.fail(this.#messages, error));
  }
}

/** The CTAP2 `authenticatorGetAssertion` parameters (CTAP 2.2 §6.2.1). */
const getAssertionParams = (options: CableInitiatorOptions): Buffer => {
  const params = new Map<number, unknown>([
    [1, options.rpId],
    [2, options.clientDataHash],
  ]);
  if (options.allowCredentials?.length) {
    params.set(
      3,
      options.allowCredentials.map(({ type, id }) => ({ type, id }))
    );
  }
  params.set(5, { uv: options.userVerification !== "discouraged" });
  return bytes(encode(params));
};

/** The assertion in a CTAP2 response map (CTAP 2.2 §6.2.2). */
const assertionOf = (
  response: CborMap,
  options: CableInitiatorOptions
): CableAssertionResponse => {
  const credential = response.get(1);
  // The credential may be left out when the allow list held exactly one.
  const credentialId =
    byteField(credential instanceof Map ? credential : undefined, "id") ??
    (options.allowCredentials?.length === 1
      ? options.allowCredentials[0]?.id
      : undefined);
  const authenticatorData = byteField(response, 2);
  const signature = byteField(response, 3);
  if (!(credentialId && authenticatorData && signature)) {
    throw new Error(
      "caBLE: assertion missing its credential, data or signature"
    );
  }
  const user = response.get(4);
  const userHandle = byteField(user instanceof Map ? user : undefined, "id");
  return {
    credentialId,
    authenticatorData,
    signature,
    ...(userHandle ? { userHandle } : {}),
  };
};

/**
 * Step 2: with an advert from this QR's phone, meets the phone on its tunnel
 * server, runs the handshake, sends `authenticatorGetAssertion` and returns
 * the phone's assertion. Rejects for an advert that is not this QR's
 * ({@link isOwnAdvert}), a failed handshake, a CTAP error status, the tunnel
 * closing, or `options.signal` aborting.
 */
export async function completeCeremony(
  init: CableInitiatorResult,
  advertServiceData: Buffer,
  options: CableInitiatorOptions
): Promise<CableAssertionResponse> {
  const advert = decryptAdvert(init.eidKey, advertServiceData);
  if (!advert) {
    throw new Error("caBLE: the advert is not this QR's phone");
  }
  const identity = createECDH("prime256v1");
  identity.setPrivateKey(init.identityKey);
  const psk = derive(init.qrSecret, advert.plaintext, DERIVED.psk, 32);

  const link = await TunnelLink.open(
    `wss://${advert.domain}/cable/connect/${advert.routingId.toString("hex").toUpperCase()}/${init.tunnelId.toString("hex").toUpperCase()}`,
    options.signal
  );
  try {
    const { message, noise, ephemeral } = initialMessage(identity, psk);
    link.send(message);
    let response = await link.next();
    // fido_tunnel_device.cc `ProcessConnectSignal`: a server may first say
    // the phone joined with one zero byte.
    if (response.length === 1 && response[0] === 0) {
      response = await link.next();
    }
    const crypter = new Crypter(
      processResponse(response, noise, ephemeral, identity)
    );

    // The post-handshake message: a CBOR map (revision 1), or a padded one
    // (revision 0, whose messages carry no type byte).
    const postHandshake = crypter.decrypt(await link.next());
    const plain = readMap(postHandshake);
    const revision = plain ? 1 : 0;
    const info = plain ?? decodePaddedMap(postHandshake);
    const features = info.get(3);
    if (Array.isArray(features) && !features.includes("ctap")) {
      throw new Error("caBLE: the phone does not offer CTAP");
    }
    const getInfo = byteField(info, 1);
    if (!getInfo) {
      throw new Error("caBLE: post-handshake message without getInfo");
    }
    const versions = decodeMap(getInfo).get(1);
    console.info(
      `[passkey] caBLE v2.${revision} to ${advert.domain}; authenticator versions ${JSON.stringify(versions)}`
    );

    const command = Buffer.concat([
      Buffer.from([CTAP_GET_ASSERTION]),
      getAssertionParams(options),
    ]);
    link.send(
      crypter.encrypt(
        revision >= 1
          ? Buffer.concat([Buffer.from([MESSAGE.ctap]), command])
          : command
      )
    );

    let reply = crypter.decrypt(await link.next());
    // Revision 1 frames each message with its type; updates (linking
    // information) may come before the reply and are passed over.
    while (revision >= 1 && reply[0] === MESSAGE.update) {
      reply = crypter.decrypt(await link.next());
    }
    if (revision >= 1) {
      if (reply[0] !== MESSAGE.ctap) {
        throw new Error(
          `caBLE: phone sent message type ${reply[0]} for the reply`
        );
      }
      reply = reply.subarray(1);
    }
    if (reply[0] !== CTAP_SUCCESS) {
      throw new Error(
        `caBLE: phone answered CTAP status 0x${(reply[0] ?? 0).toString(16).padStart(2, "0")}`
      );
    }
    const assertion = assertionOf(decodeMap(reply.subarray(1)), options);
    if (revision >= 1) {
      link.send(crypter.encrypt(Buffer.from([MESSAGE.shutdown])));
    }
    return assertion;
  } finally {
    link.close();
  }
}
