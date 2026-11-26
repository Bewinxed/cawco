/**
 * A project's browser's dashboard door: the one way that browser reaches
 * the hub's dashboard, signed in as the agents that drive it and never as
 * the person.
 *
 * A hub that trusts its network takes a request with no credential as the
 * person (hub hub-auth.ts `classify`), and an agent has its browser send
 * whatever it likes, credentials left out (`fetch(…, { credentials: "omit"
 * })`). So the pass is never the browser's to carry: every request the
 * browser makes to a dashboard origin goes through this door, which reads
 * it, drops whatever credential the page sent (an `Authorization`, the
 * person's device cookie, a forwarded word, a CawCo header), puts the
 * browser's pass on it (core `BROWSER_PASS_SCHEME`, hub browser-passes.ts)
 * and sends it on to that origin itself. The hub reads such a request as
 * the browser, an agent of its project (hub-auth.ts `browserReaches`),
 * refused only the person's own acts (hub person-acts.ts).
 *
 * The door is a forward proxy, per browser, on its slot's door port on
 * 127.0.0.1 (core `browserPorts`), and for a container on a native engine
 * also on a unix socket in a folder of the browser's own, bound into the
 * container ({@link doorBind}). Every target is one of three:
 * - a dashboard origin ({@link DoorPass.origins}, the hub's list, and this
 *   machine's loopback dashboard): read request by request, stamped, sent
 *   on. Over `CONNECT`, TLS is ended here with the machine's door
 *   certificate ({@link doorSpki}), which the browser's Chromium accepts by
 *   its key alone (`--ignore-certificate-errors-spki-list`), and plain bytes
 *   (Chromium tunnels `ws://` through a proxy too) are read as they come.
 *   No byte is ever spliced to a dashboard origin.
 * - any other host on the hub's ports (hub-ports.ts), and the cloud's
 *   instance metadata (hub-pac.ts `CLOSED_HOSTS`): refused;
 * - anything else: carried as it is (a tunnel, or a forward), which only the
 *   local host's Chromium sends here: a container's PAC sends nothing else
 *   (hub-pac.ts).
 */
import {
  createHash,
  createPublicKey,
  createSign,
  generateKeyPairSync,
} from "node:crypto";
import { chmod, readFile, rm } from "node:fs/promises";
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TLSSocket, connect as tlsConnect } from "node:tls";
import { errnoCode } from "@cawco/core/absent";
import { readWithin } from "@cawco/core/bounded";
import { type BrowserKey, browserSlug } from "@cawco/core/browser";
import { makeJoin } from "@cawco/core/effect/join";
import { makeFolder } from "@cawco/core/folders";
import {
  BROWSER_PASS_SCHEME,
  OWNER_COOKIE,
  OWNER_COOKIE_SECURE,
} from "@cawco/core/hub-auth";
import { makeKeyedLock } from "@cawco/core/keyed-lock";
import { machineId } from "@cawco/core/machine-id";
import { localDashboardPort } from "@cawco/core/ports";
import { HOP_BY_HOP_HEADERS } from "@cawco/core/preview/hop-headers";
import { writeStateFile } from "@cawco/core/state-file";
import { HOUR_MS } from "@cawco/core/time";
import { hubClient, unwrap } from "@cawco/hub/client";
import { AsnConvert } from "@peculiar/asn1-schema";
import {
  AlgorithmIdentifier,
  AttributeTypeAndValue,
  AttributeValue,
  Certificate,
  Name,
  RelativeDistinguishedName,
  SubjectPublicKeyInfo,
  TBSCertificate,
  Validity,
  Version,
} from "@peculiar/asn1-x509";
import { Cause, Effect, Exit, Scope } from "effect";
import { delegationHubUrl } from "../delegation";
import { hubPorts } from "../hub-ports";
import { provenFetch } from "../hub-proof";
import { CLOSED_HOSTS } from "./hub-pac";
import { browsersDir } from "./state";

/** Where a container's door socket is bound, and the socket's name in it. */
const CONTAINER_DOOR_DIR = "/run/cawco-door";
const DOOR_SOCKET = "door.sock";

/** What a browser's door holds of the hub: its pass, when it lapses, and the dashboard's origins. */
interface DoorPass {
  expiresAt: number;
  origins: ReadonlySet<string>;
  pass: string;
}

/** A pass is asked for again this long before it lapses. Our call: well inside the hub's day. */
const RENEW_BEFORE_MS = HOUR_MS;
/** How often an unknown target on the hub's ports may have the origins read again. Our call. */
const REREAD_MS = 30_000;
/** How long the hub has to hand a pass. Our call: a page's request waits on it. */
const PASS_MS = 5000;

const BRACKETS = /^\[|\]$/gu;

// ── The machine's door certificate ──────────────────────────────────────

/** ecdsa-with-SHA256 (RFC 5758 §3.2). */
const ECDSA_SHA256 = "1.2.840.10045.4.3.2";
/** id-at-commonName (X.520). */
const COMMON_NAME = "2.5.4.3";

interface DoorIdentity {
  cert: string;
  key: string;
  /** Its key's SHA-256 over the DER SubjectPublicKeyInfo, base64: what Chromium's SPKI list names. */
  spki: string;
}

const identityFiles = () => ({
  key: join(browsersDir(), "door-key.pem"),
  cert: join(browsersDir(), "door-cert.pem"),
});

/**
 * A self-signed certificate for a fresh P-256 key. Chromium trusts it by
 * its key alone, for any name (`--ignore-certificate-errors-spki-list`,
 * honoured with `--user-data-dir`), so it names nothing but itself.
 */
const makeIdentity = (): { cert: string; key: string } => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const name = new Name([
    new RelativeDistinguishedName([
      new AttributeTypeAndValue({
        type: COMMON_NAME,
        value: new AttributeValue({ utf8String: "CawCo dashboard door" }),
      }),
    ]),
  ]);
  const algorithm = new AlgorithmIdentifier({ algorithm: ECDSA_SHA256 });
  const now = Date.now();
  const tbs = new TBSCertificate({
    version: Version.v3,
    // Sixteen bytes of its key's hash, the first below 0x80 so the INTEGER
    // stays positive (RFC 5280 §4.1.2.2).
    // @limit external: an X.509 serial number is at most 20 octets (RFC 5280 section 4.1.2.2); 16 bytes of the certificate's SHA-256 are one
    serialNumber: new Uint8Array(createHash("sha256").update(spki).digest())
      .slice(0, 16)
      .map((byte, at) => (at === 0 ? byte % 0x80 : byte)).buffer,
    signature: algorithm,
    issuer: name,
    subject: name,
    validity: new Validity({
      notBefore: new Date(now - HOUR_MS),
      notAfter: new Date(now + 20 * 365 * 24 * HOUR_MS),
    }),
    subjectPublicKeyInfo: AsnConvert.parse(spki, SubjectPublicKeyInfo),
  });
  const signed = createSign("sha256")
    .update(Buffer.from(AsnConvert.serialize(tbs)))
    .sign(privateKey);
  const der = Buffer.from(
    AsnConvert.serialize(
      new Certificate({
        tbsCertificate: tbs,
        signatureAlgorithm: algorithm,
        signatureValue: new Uint8Array(signed).buffer,
      })
    )
  );
  const lines = der.toString("base64").match(/.{1,64}/gu) ?? [];
  return {
    key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    cert: `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`,
  };
};

let identity: Promise<DoorIdentity> | undefined;

/** The machine's door certificate: read from the browsers' folder, made there once (0600) when absent. */
const doorIdentity = (): Promise<DoorIdentity> => {
  identity ??= (async () => {
    const files = identityFiles();
    let pair: { cert: string; key: string };
    try {
      pair = {
        key: await readFile(files.key, "utf8"),
        cert: await readFile(files.cert, "utf8"),
      };
    } catch (error) {
      if (errnoCode(error) !== "ENOENT") {
        throw error;
      }
      pair = makeIdentity();
      await writeStateFile(files.key, pair.key, { mode: 0o600 });
      await writeStateFile(files.cert, pair.cert, { mode: 0o600 });
    }
    const spki = createPublicKey(pair.key).export({
      type: "spki",
      format: "der",
    });
    return {
      ...pair,
      spki: createHash("sha256").update(spki).digest("base64"),
    };
  })();
  // A failed read is read again at the next ask, never kept.
  identity.catch((error: unknown) => {
    identity = undefined;
    console.warn(
      `[browser] the dashboard door's certificate was not read or made: ${error instanceof Error ? error.message : String(error)}`
    );
  });
  return identity;
};

/** What a browser's Chromium is started with to accept the door's certificate: its key's hash ({@link doorIdentity}). */
export const doorSpki = async (): Promise<string> =>
  (await doorIdentity()).spki;

// ── The pass ─────────────────────────────────────────────────────────────

/** This machine's own dashboard on its loopback (agent hub-loopback.ts, or the hub's own socket): a dashboard origin for the local host's browser. */
const loopbackOrigins = (): string[] => {
  const port = localDashboardPort();
  return ["localhost", "127.0.0.1", "[::1]"].map(
    (host) => `http://${host}:${port}`
  );
};

/** Each door's last pass read, or why its last ask failed. */
const passes = new Map<BrowserKey, { pass: DoorPass } | { failed: unknown }>();
/** Each door's pass being read now ({@link passOf}): a caller meanwhile shares its answer. */
const passReads = makeJoin<BrowserKey, DoorPass>();
/** The origins each door last read, kept past a pass that lapsed or a hub that is away. */
const knownOrigins = new Map<BrowserKey, ReadonlySet<string>>();
const readAt = new Map<BrowserKey, number>();

const askPass = async (key: BrowserKey): Promise<DoorPass> => {
  readAt.set(key, Date.now());
  // The hub signs the machine whose key proves the ask, and on a hub that
  // trusts its network, where no machine holds a key yet, the one named.
  const ownMachine = await machineId();
  const bounded = await readWithin(PASS_MS, (signal) =>
    hubClient(delegationHubUrl(), (url, init) =>
      provenFetch(url, { ...init, signal })
    )
      .api["browser-passes"]({ key })
      .get({ query: { machine: ownMachine } })
  );
  if (bounded.kind !== "answered") {
    throw new Error(
      `the hub did not hand this browser's pass within ${PASS_MS / 1000} s`
    );
  }
  const answer = bounded.value;
  const { pass, expiresAt, origins } = unwrap(
    answer,
    ({ status, value }) =>
      new Error(
        `the hub refused this browser's pass (HTTP ${status}): ${JSON.stringify(value)}`
      )
  );
  const read: DoorPass = {
    pass,
    expiresAt,
    origins: new Set([...origins, ...loopbackOrigins()]),
  };
  knownOrigins.set(key, read.origins);
  return read;
};

/**
 * Browser `key`'s pass, asked for when it has none, when it lapses within
 * {@link RENEW_BEFORE_MS}, or (`reread`) when the origins may have grown
 * since the last read; asked at most every {@link REREAD_MS} after a read
 * that failed, or for a reread, so a hub that is away is not asked on every
 * request.
 */
const passOf = (key: BrowserKey, reread = false): Promise<DoorPass> =>
  passReads.runPromise(key, () => passNow(key, reread));

/** {@link passOf} with no read under way: the pass held while it is fresh, else read now. */
const passNow = async (key: BrowserKey, reread: boolean): Promise<DoorPass> => {
  const held = passes.get(key);
  const now = Date.now();
  const recent = now - (readAt.get(key) ?? 0) <= REREAD_MS;
  if (held && "failed" in held) {
    if (recent) {
      throw held.failed;
    }
  } else if (
    held &&
    held.pass.expiresAt - now >= RENEW_BEFORE_MS &&
    !(reread && !recent)
  ) {
    return held.pass;
  }
  try {
    const pass = await askPass(key);
    passes.set(key, { pass });
    return pass;
  } catch (error) {
    passes.set(key, { failed: error });
    console.warn(
      `[browser] ${key}: its dashboard door has no pass: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
};

/**
 * The dashboard's origins as browser `key`'s door holds them: what a
 * container's PAC is made from (hub-pac.ts). Undefined while the hub
 * doesn't answer, said in one line.
 */
export const doorOrigins = async (
  key: BrowserKey
): Promise<string[] | undefined> => {
  try {
    return [...(await passOf(key)).origins];
  } catch (error) {
    console.warn(
      `[browser] ${key}: the dashboard's origins were not read (${error instanceof Error ? error.message : String(error)}): its PAC keeps the ones it was made with`
    );
  }
};

/** The local host's Chromium's `--proxy-server`: its door on its slot's door port. */
export const doorProxyUrl = (port: number): string =>
  `http://127.0.0.1:${port}`;

// ── Reading and stamping ────────────────────────────────────────────────

/** `scheme://host:port`, the port written out, as the hub lists origins. */
const originOf = (scheme: "http" | "https", host: string, port: number) =>
  `${scheme}://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${port}`;

/** The host and port of a `CONNECT` target, `host:port` or `[v6]:port`. */
const authority = (target: string): { host: string; port: number } => {
  const at = target.lastIndexOf(":");
  return {
    host: target.slice(0, at).replace(BRACKETS, ""),
    port: Number(target.slice(at + 1)),
  };
};

/** The person's device cookies, which no request of the door carries on. */
const OWNER_COOKIES = new Set([OWNER_COOKIE, OWNER_COOKIE_SECURE]);

/** `cookie` without the person's device cookie; undefined when nothing is left. */
const withoutOwner = (cookie: string | undefined): string | undefined =>
  cookie
    ?.split(";")
    .map((part) => part.trim())
    .filter((part) => !OWNER_COOKIES.has(part.slice(0, part.indexOf("="))))
    .join("; ") || undefined;

/** A header the page may not send on: whatever names a credential, a hop or where the request came from. */
const UNSENT = new Set<string>([
  ...HOP_BY_HOP_HEADERS,
  "authorization",
  "cookie",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "cf-connecting-ip",
]);
/** CawCo's own headers, of which a page may send on only its tab's presence (core `PRESENCE_HEADER`). */
const CAWCO_HEADER = "x-cawco-";
const PRESENCE = "x-cawco-presence";

/**
 * The headers a request goes on with: the page's, less every credential,
 * hop and forwarded word ({@link UNSENT}, CawCo's own but presence), its
 * cookies less the person's, and the browser's pass. `upgrade` keeps the
 * socket's own handshake words.
 */
const stamped = (
  headers: IncomingHttpHeaders,
  pass: string,
  upgrade: boolean
): Record<string, string | string[]> => {
  const out: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (
      value === undefined ||
      UNSENT.has(name) ||
      (name.startsWith(CAWCO_HEADER) && name !== PRESENCE)
    ) {
      continue;
    }
    out[name] = value;
  }
  const cookie = withoutOwner(headers.cookie);
  if (cookie) {
    out.cookie = cookie;
  }
  if (upgrade) {
    out.connection = "Upgrade";
    if (typeof headers.upgrade === "string") {
      out.upgrade = headers.upgrade;
    }
  }
  out.authorization = `${BROWSER_PASS_SCHEME} ${pass}`;
  return out;
};

/**
 * Whether `origin` (a URL's origin, its port written or not) is one of the
 * hub's dashboard origins as browser `key`'s door last read them: the one
 * loopback address its gate lets the agent load (gate.ts `#closedAddress`).
 */
export const isDashboardOrigin = (key: BrowserKey, origin: string): boolean => {
  if (!URL.canParse(origin)) {
    return false;
  }
  const { protocol, hostname, port } = new URL(origin);
  const scheme = protocol === "https:" ? "https" : "http";
  const written = originOf(
    scheme,
    hostname.replace(BRACKETS, ""),
    Number(port || (scheme === "https" ? 443 : 80))
  );
  return knownOrigins.get(key)?.has(written) === true;
};

/** An answer's headers as they go back: every `Set-Cookie` but the person's device cookie. */
const answered = (headers: IncomingHttpHeaders): IncomingHttpHeaders => {
  const { "set-cookie": setCookie, ...out } = headers;
  const set = setCookie?.filter(
    (one) => !OWNER_COOKIES.has(one.slice(0, one.indexOf("=")).trim())
  );
  return set && set.length > 0 ? { ...out, "set-cookie": set } : out;
};

/** Why a step failed, in its own words. */
const why = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Two sockets joined: bytes both ways, and either's end or error ends the other. */
const splice = (client: Socket, upstream: Socket): void => {
  upstream.pipe(client);
  client.pipe(upstream);
  upstream.on("error", () => client.destroy());
  client.on("error", () => upstream.destroy());
  client.on("close", () => upstream.destroy());
  upstream.on("close", () => client.destroy());
};

const refuse = (socket: Socket, words: string): void => {
  socket.end(
    `HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(words)}\r\n\r\n${words}`
  );
};

const HUB_REFUSED =
  "CawCo's dashboard door: this browser reaches the hub only at its dashboard's own address, signed in as its agent.";
const CLOSED_REFUSED =
  "CawCo's dashboard door: this address is the cloud's instance metadata, which hands out the machine's cloud credentials: closed to an agent's browser.";

/** The words a refused target is refused in. */
const refusedWords = (reach: Reach): string =>
  reach.kind === "closed" ? CLOSED_REFUSED : HUB_REFUSED;

/** One request to dashboard origin `origin`, stamped ({@link stamped}) and answered as the origin answers. */
const forwardStamped = (
  key: BrowserKey,
  origin: URL,
  req: IncomingMessage,
  res: ServerResponse
): void => {
  passOf(key).then(
    ({ pass }) => {
      const send = origin.protocol === "https:" ? httpsRequest : httpRequest;
      const out = send(
        {
          host: origin.hostname.replace(BRACKETS, ""),
          port: Number(origin.port),
          servername: origin.hostname,
          method: req.method,
          path: req.url,
          headers: stamped(req.headers, pass, false),
        },
        (answer) => {
          res.writeHead(answer.statusCode ?? 502, answered(answer.headers));
          answer.pipe(res);
        }
      );
      out.on("error", () => res.destroy());
      req.pipe(out);
    },
    (error: unknown) => {
      res
        .writeHead(502, { "content-type": "text/plain; charset=utf-8" })
        .end(
          `CawCo's dashboard door has no pass for this browser: ${why(error)}`
        );
    }
  );
};

/** A socket's upgrade to dashboard origin `origin`, its handshake stamped, then bytes both ways. */
const upgradeStamped = (
  key: BrowserKey,
  origin: URL,
  req: IncomingMessage,
  client: Socket,
  head: Buffer
): void => {
  passOf(key).then(
    ({ pass }) => {
      const host = origin.hostname.replace(BRACKETS, "");
      const port = Number(origin.port);
      const upstream: Socket =
        origin.protocol === "https:"
          ? tlsConnect({ host, port, servername: origin.hostname })
          : connect(port, host);
      const headers = stamped(req.headers, pass, true);
      const lines = Object.entries(headers).flatMap(([name, value]) =>
        (Array.isArray(value) ? value : [value]).map((one) => `${name}: ${one}`)
      );
      upstream.write(
        `${req.method} ${req.url} HTTP/1.1\r\n${lines.join("\r\n")}\r\n\r\n`
      );
      if (head.length > 0) {
        upstream.write(head);
      }
      splice(client, upstream);
    },
    (error: unknown) => {
      console.warn(
        `[browser] ${key}: a dashboard socket was not carried: ${why(error)}`
      );
      client.destroy();
    }
  );
};

/** Bytes carried as they are to a target no dashboard and on no hub port. */
const tunnel = (client: Socket, host: string, port: number, head: Buffer) => {
  const upstream = connect(port, host, () => {
    client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    upstream.write(head);
  });
  splice(client, upstream);
};

/** A plain forward to a target no dashboard and on no hub port. */
const forwardPlain = (url: URL, req: IncomingMessage, res: ServerResponse) => {
  const out = httpRequest(
    {
      host: url.hostname.replace(BRACKETS, ""),
      port: Number(url.port || 80),
      method: req.method,
      path: url.pathname + url.search,
      headers: req.headers,
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    }
  );
  out.on("error", () => res.destroy());
  req.pipe(out);
};

/** What a target is to the door. */
type Reach =
  | { kind: "dashboard"; origins: string[] }
  | { kind: "hub" }
  | { kind: "closed" }
  | { kind: "else" };

/**
 * Whether `host:port` is a dashboard origin (and which schemes of it), a
 * hub port elsewhere, or anything else. A hub port that is no origin the
 * door holds has the origins read again first: a dashboard address the hub
 * learned since.
 */
const reachOf = async (
  key: BrowserKey,
  host: string,
  port: number
): Promise<Reach> => {
  if (CLOSED_HOSTS.includes(host.includes(":") ? `[${host}]` : host)) {
    return { kind: "closed" };
  }
  const onHubPort = hubPorts().includes(port);
  const named = async (reread: boolean) => {
    let origins: ReadonlySet<string> | undefined;
    try {
      ({ origins } = await passOf(key, reread));
    } catch (error) {
      // The origins it last read, while the hub is away; none read yet
      // leaves a target on another port nobody's dashboard.
      origins = knownOrigins.get(key);
      if (!(origins || !onHubPort)) {
        throw error;
      }
    }
    return (["https", "http"] as const)
      .map((scheme) => originOf(scheme, host, port))
      .filter((origin) => origins?.has(origin));
  };
  let found = await named(false);
  if (found.length === 0 && onHubPort) {
    found = await named(true);
  }
  if (found.length > 0) {
    return { kind: "dashboard", origins: found };
  }
  return onHubPort ? { kind: "hub" } : { kind: "else" };
};

/** The first byte of a TLS handshake record (RFC 8446 §5.1, `handshake`). */
const TLS_HANDSHAKE = 0x16;

/** The door's inner server: requests read off a dashboard origin's connection, whose origin it keeps. */
const innerServer = (key: BrowserKey, originOfSocket: WeakMap<Socket, URL>) => {
  const inner = createServer((req, res) => {
    const origin = originOfSocket.get(req.socket);
    if (!origin) {
      res.destroy();
      return;
    }
    forwardStamped(key, origin, req, res);
  });
  inner.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const origin = originOfSocket.get(socket);
    if (!origin) {
      socket.destroy();
      return;
    }
    upgradeStamped(key, origin, req, socket, head);
  });
  return inner;
};

/** Browser `key`'s door: a forward proxy whose dashboard origins are stamped (module doc). */
const doorServer = async (key: BrowserKey): Promise<Server> => {
  const { cert, key: tlsKey } = await doorIdentity();
  const originOfSocket = new WeakMap<Socket, URL>();
  const inner = innerServer(key, originOfSocket);
  const door = createServer((req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "");
    } catch {
      res.writeHead(400, { connection: "close" }).end();
      return;
    }
    if (url.protocol !== "http:") {
      res.writeHead(400, { connection: "close" }).end();
      return;
    }
    const port = Number(url.port || 80);
    reachOf(key, url.hostname.replace(BRACKETS, ""), port).then(
      (reach) => {
        if (
          reach.kind === "dashboard" &&
          reach.origins.some((one) => one.startsWith("http:"))
        ) {
          req.url = url.pathname + url.search;
          forwardStamped(
            key,
            new URL(originOf("http", url.hostname.replace(BRACKETS, ""), port)),
            req,
            res
          );
        } else if (reach.kind === "else") {
          forwardPlain(url, req, res);
        } else {
          res.writeHead(403, { connection: "close" }).end(refusedWords(reach));
        }
      },
      (error: unknown) =>
        res
          .writeHead(502, { connection: "close" })
          .end(`CawCo's dashboard door: ${why(error)}`)
    );
  });
  door.on("connect", (req: IncomingMessage, client: Socket, head: Buffer) => {
    const { host, port } = authority(req.url ?? "");
    if (!(host && Number.isInteger(port))) {
      refuse(client, HUB_REFUSED);
      return;
    }
    reachOf(key, host, port).then(
      (reach) => {
        if (reach.kind === "hub" || reach.kind === "closed") {
          refuse(client, refusedWords(reach));
          return;
        }
        if (reach.kind === "else") {
          tunnel(client, host, port, head);
          return;
        }
        const { origins } = reach;
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        const read = (first: Buffer) => {
          const tls = first[0] === TLS_HANDSHAKE;
          const scheme = tls ? "https" : "http";
          const origin = originOf(scheme, host, port);
          if (!origins.includes(origin)) {
            client.destroy();
            return;
          }
          client.pause();
          client.unshift(first);
          const socket: Socket = tls
            ? new TLSSocket(client, {
                isServer: true,
                key: tlsKey,
                cert,
                ALPNProtocols: ["http/1.1"],
              })
            : client;
          originOfSocket.set(socket, new URL(origin));
          inner.emit("connection", socket);
          client.resume();
        };
        if (head.length > 0) {
          read(head);
        } else {
          client.once("data", read);
        }
      },
      (error: unknown) => {
        refuse(client, `CawCo's dashboard door: ${why(error)}`);
      }
    );
  });
  door.on("clientError", (_error, socket: Socket) => socket.destroy());
  return door;
};

// ── Doors kept ──────────────────────────────────────────────────────────

/** Browser `key`'s door folder, bound into a container on a native engine: under the agent's runtime dir, else the temp dir. */
const doorDir = (key: BrowserKey): string =>
  join(
    process.env.XDG_RUNTIME_DIR ?? tmpdir(),
    "cawco",
    "door",
    browserSlug(key)
  );

/** The bind a container on a native engine is made with: its door folder at {@link CONTAINER_DOOR_DIR}. */
export const doorBind = (key: BrowserKey): string =>
  `${doorDir(key)}:${CONTAINER_DOOR_DIR}`;

/** The socket a container's socat carries its proxy port to: its door's socket, or its door port on the machine as the container names it. */
export const doorTarget = (
  how: { socket: true } | { host: string; port: number }
): string =>
  "socket" in how
    ? `UNIX-CONNECT:${CONTAINER_DOOR_DIR}/${DOOR_SOCKET}`
    : `TCP:${how.host}:${how.port}`;

/** An open door: its slot's port, and the scope its listeners close with. */
interface Open {
  port: number;
  scope: Scope.Closeable;
}

const open = new Map<BrowserKey, Open>();
/** One door's open or close at a time, each in the order asked. */
const doorTurns = makeKeyedLock<BrowserKey>();

/** `server` listening at `at` (a loopback port or a socket's path), closed with the scope. */
const listening = (server: Server, at: number | string) =>
  Effect.acquireRelease(
    Effect.callback<void, Error>((resume) => {
      const failed = (error: Error) => resume(Effect.fail(error));
      server.once("error", failed);
      const done = () => {
        server.off("error", failed);
        resume(Effect.void);
      };
      if (typeof at === "number") {
        server.listen(at, "127.0.0.1", done);
      } else {
        server.listen(at, done);
      }
    }),
    () => Effect.sync(() => server.close())
  );

/** A promise step of opening a door, its rejection the open's failure. */
const step = <A>(work: () => Promise<A>) =>
  Effect.tryPromise({ try: work, catch: (error) => error });

/** Browser `key`'s listeners on `port` and on its folder's socket, each closed with the scope. */
const listeners = Effect.fnUntraced(function* (key: BrowserKey, port: number) {
  yield* listening(yield* step(() => doorServer(key)), port);
  const dir = doorDir(key);
  yield* step(() => makeFolder(dir, { mode: 0o755 }));
  // The container's user, another uid, reaches the socket through it.
  yield* step(() => chmod(dir, 0o755));
  const path = join(dir, DOOR_SOCKET);
  yield* step(() => rm(path, { force: true }));
  yield* listening(yield* step(() => doorServer(key)), path);
  yield* step(() => chmod(path, 0o666));
});

/** Browser `key`'s door closed: its listeners, its pass forgotten, its folder removed. */
const shut = Effect.fnUntraced(function* (key: BrowserKey) {
  const held = open.get(key);
  open.delete(key);
  passes.delete(key);
  readAt.delete(key);
  knownOrigins.delete(key);
  if (held) {
    yield* Scope.close(held.scope, Exit.void);
  }
  yield* Effect.promise(() =>
    rm(doorDir(key), { recursive: true, force: true })
  );
});

/**
 * Opens browser `key`'s door on `port` (its slot's) and on its folder's
 * socket, once for the agent's life; again on another port when its slot
 * moved. A port another process holds is said, and the browser's dashboard
 * stays shut until it is free: nothing else reaches the dashboard for it.
 */
export const openDoor = (key: BrowserKey, port: number): Promise<void> =>
  // The promise edge of a door's open, in its turn.
  Effect.runPromise(
    doorTurns.withLock(
      key,
      Effect.gen(function* () {
        const held = open.get(key);
        if (held?.port === port) {
          return;
        }
        if (held) {
          yield* shut(key);
        }
        // Its origins read now, so its gate knows the dashboard's loopback
        // ones before a page asks (gate.ts `#closedAddress`).
        doorOrigins(key).catch(() => undefined);
        const scope = yield* Scope.make();
        const opened = yield* listeners(key, port).pipe(
          Scope.provide(scope),
          Effect.exit
        );
        if (Exit.isSuccess(opened)) {
          open.set(key, { port, scope });
          return;
        }
        yield* Scope.close(scope, Exit.void);
        const error = Cause.squash(opened.cause);
        yield* Effect.logWarning(
          `[browser] ${key}: its dashboard door did not open on 127.0.0.1:${port}: ${error instanceof Error ? error.message : String(error)}`
        );
      })
    )
  );

/** Closes browser `key`'s door, its pass forgotten and its folder removed. */
export const closeDoor = (key: BrowserKey): Promise<void> =>
  // The promise edge of a door's close, in its turn.
  Effect.runPromise(doorTurns.withLock(key, shut(key)));
