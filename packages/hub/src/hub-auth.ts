/**
 * Who may call the hub (core hub-auth.ts names the two modes).
 *
 * Every request is one class: the **hub** itself (hub-self.ts), a **session**
 * (`Authorization: Bearer <its credential>`), the **owner** (a paired
 * device's token, `Authorization: Owner <token>` or the browser's cookie), a
 * **machine** (its key's proof, core machine-key.ts), or **anonymous**.
 * Every route is the owner's unless it is listed below ({@link RULES}): a
 * route that is added starts closed (hub-auth audit §3.1).
 *
 * - **trusted** (the default): anonymous is the owner, as it always was
 *   here: being on the network is enough for the person's own devices.
 * - **pairing** (the person's "Require paired devices"): anonymous reaches
 *   only the open routes. A machine is admitted with an Admit click, and
 *   proves its key at every connection with an HMAC over the hub's nonce
 *   (Tailscale's device approval: "a new device that accesses your network
 *   displays a notification that the device is awaiting approval",
 *   https://tailscale.com/kb/1099/device-approval). Each owner client pairs
 *   once, approved from a paired device or from Telegram, in RFC 8628's
 *   shape ("instructs the user to review the authorization request on a
 *   secondary device", https://www.rfc-editor.org/rfc/rfc8628 §1); the card
 *   shows the code the client shows, so a remote ask is told apart (§5.4).
 *   The hub keeps each token's sha256 alone (OWASP Session Management: "If
 *   read-only disclosure of the store is in your threat model, store a
 *   one-way verifier instead").
 *
 * In both, a request that presents a session credential is that session,
 * never the owner: it is refused on every route not listed for sessions,
 * however its other headers read. What decides is the credential presented,
 * not anything a session can change by leaving a header out.
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  type CallerKind,
  type DeviceKind,
  type HubAuthFrame,
  type HubAuthMode,
  type HubAuthState,
  MACHINE_PROOF_HEADER,
  MACHINE_PROOF_SKEW_MS,
  type OwnerDevice,
  ownerCookie,
  ownerTokenOf,
  PAIRING_REQUIRED,
  type PairingPoll,
  type PairingRequest,
  type PairingStart,
  type WaitingMachine,
} from "@cawco/core";
import { pageOrigin } from "@cawco/core/browser-gate";
import { httpProof, sameMac, socketProof } from "@cawco/core/machine-key";
import { Elysia, t } from "elysia";
import type { HubAuthDb } from "./db/hub-auth";
import { HUB_SELF_HEADER, isHubSelf } from "./hub-self";

/** What a request is, once its credential is read. */
export type Caller =
  | { kind: "hub" }
  | { kind: "owner"; device: { id: string; name: string } | null }
  /** `instanceId` null: a Bearer that names no session. Still a session: never the owner. */
  | { kind: "session"; instanceId: string | null }
  | { kind: "machine"; machineId: string }
  | { kind: "anonymous" };

/**
 * Who a route is for, besides the owner and the hub (who reach every route
 * but one):
 * - `open`: anyone. Public (`/health`, `/install.sh`), a pairing's start and
 *   poll, or a route that authenticates its own caller (the git remote, a
 *   tool call, a credential's ack, the machine socket).
 * - `tool`: a session, or a machine relaying its sessions' calls through
 *   its loopback gateway (agent mcp-oauth.ts), which signs each one.
 * - `session`: a session's own work-item calls.
 * - `machine`: what a machine's agent and CLI read and report over HTTP.
 * - `machine-proof`: a machine alone, once paired devices are required.
 */
type Access = "open" | "tool" | "session" | "machine" | "machine-proof";

/** Every route that is not the owner's alone, by method (`*` any) and path. */
const RULES: readonly [string, RegExp, Access][] = [
  ["GET", /^\/health$/, "open"],
  ["GET", /^\/install\.sh$/, "open"],
  ["GET", /^\/api\/auth$/, "open"],
  ["POST", /^\/api\/pair$/, "open"],
  ["POST", /^\/api\/pair\/poll$/, "open"],
  ["GET", /^\/ws$/, "open"],
  ["*", /^\/git\//, "open"],
  ["POST", /^\/api\/delegation\/call\/[^/]+$/, "open"],
  ["POST", /^\/api\/session-identities\/ack$/, "open"],
  ["*", /^\/mcp\/cawco$/, "open"],
  ["*", /^\/mcp\/fleet\/[^/]+$/, "tool"],
  ["GET", /^\/api\/delegation\/tools$/, "tool"],
  ["GET", /^\/api\/instances$/, "tool"],
  ["POST", /^\/api\/workflow-steps\/[^/]+\/result$/, "tool"],
  ["*", /^\/api\/workflow-runs\/[^/]+\/state\/[^/]+$/, "tool"],
  ["*", /^\/api\/work-items(?:\/.*)?$/, "session"],
  [
    "GET",
    /^\/api\/binary-updates\/(?:settings|latest|release|hub-readiness)$/,
    "machine",
  ],
  ["GET", /^\/api\/binary-updates\/artifacts\/[^/]+\/[^/]+$/, "machine"],
  ["POST", /^\/api\/binary-updates\/hub-fence$/, "machine"],
  ["PUT", /^\/api\/binary-updates\/machines\/[^/]+\/state$/, "machine"],
  // A machine's own row and busy count; the fleet's list stays the person's.
  ["GET", /^\/api\/agents\/[^/]+$/, "machine"],
  ["GET", /^\/api\/agents\/[^/]+\/busy$/, "machine"],
  // A workspace's post held for the person (upstream-asks.ts), raised by its machine.
  ["POST", /^\/api\/upstream\/asks$/, "machine"],
  ["POST", /^\/api\/session-identities\/install$/, "machine-proof"],
];

/** Machine routes that name a machine: a machine reaches them for itself alone. */
const OWN_MACHINE: readonly RegExp[] = [
  /^\/api\/binary-updates\/machines\/([^/]+)\/state$/,
  /^\/api\/agents\/([^/]+)$/,
  /^\/api\/agents\/([^/]+)\/busy$/,
];

const namesAnother = (path: string, machineId: string): boolean =>
  OWN_MACHINE.some((pattern) => {
    const named = pattern.exec(path)?.[1];
    return named !== undefined && decodeURIComponent(named) !== machineId;
  });

const accessOf = (method: string, path: string): Access | "owner" => {
  const verb = method === "HEAD" ? "GET" : method;
  for (const [ruleMethod, pattern, access] of RULES) {
    if ((ruleMethod === "*" || ruleMethod === verb) && pattern.test(path)) {
      return access;
    }
  }
  return "owner";
};

const ALLOWED: Record<Access | "owner", ReadonlySet<CallerKind>> = {
  open: new Set(["owner", "session", "machine", "anonymous"]),
  tool: new Set(["owner", "session", "machine"]),
  session: new Set(["owner", "session"]),
  machine: new Set(["owner", "machine"]),
  "machine-proof": new Set(["machine"]),
  owner: new Set(["owner"]),
};

/** RFC 8628 §6.1's alphabet: base-20, no vowels, nothing read two ways. */
const CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
/** How long a pairing waits on the person (RFC 8628 §3.2 `expires_in`). */
const PAIRING_TTL_MS = 10 * 60_000;
/** How often its client polls (RFC 8628 §3.2 `interval`, the default 5 s). */
const POLL_INTERVAL_S = 5;
/** Pairings held at once; the oldest goes past it, so a flood of asks buries no real one for long. */
const PAIRINGS_HELD = 20;
/** How often a device's last use is written, at most. */
const TOUCH_EVERY_MS = 60_000;
/** How long one approved CLI run may act as the person. */
const CLI_RUN_MS = 15 * 60_000;

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const newToken = (): string => randomBytes(32).toString("base64url");

const userCode = (): string => {
  const pick = () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}`;
};

/** A user agent's browser, first match wins (Edge's says Chrome too, Chrome's says Safari). */
const BROWSERS: readonly [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];
/** Its system, first match wins (an iPhone's says Mac OS X). */
const SYSTEMS: readonly [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

/** "Chrome on Linux", from a browser's user agent; "A browser" when it says nothing known. */
export const browserName = (userAgent: string | null): string => {
  const ua = userAgent ?? "";
  const browser =
    BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? "A browser";
  const os = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  return os ? `${browser} on ${os}` : browser;
};

/** A client's own name for itself, kept short and on one line. */
const cleanName = (name: string | undefined, fallback: string): string =>
  name?.replace(/\s+/g, " ").trim().slice(0, 60) || fallback;

interface Pairing extends PairingRequest {
  /** Set once approved: the device made, and its token until the client takes it. */
  approved?: { device: { id: string; name: string }; token: string };
  denied?: true;
  deviceCode: string;
  expiresAt: number;
  polledAt: number;
}

interface Waiting extends WaitingMachine {
  admit: (key: string) => void;
  refuse: (reason: string) => void;
  /** Which connection holds this place, so a closing older one leaves a newer one be. */
  socket: string;
}

/** What the server does as the person changes the mode or a device. */
export interface HubAuthHooks {
  /** A pairing waits: Telegram's message, the app's push. */
  readonly asked: (request: PairingRequest) => void;
  /** Whatever every paired screen shows changed: the mode, a pairing, a waiting machine. */
  readonly changed: (frame: HubAuthFrame) => void;
  /** A device was removed: its open sockets close. */
  readonly deviceRemoved: (deviceId: string) => void;
  /**
   * Pairing was just turned on: every machine connected now is admitted and
   * handed its key, and every dashboard socket without a device closes, so
   * it opens again as what it is.
   */
  readonly pairingOn: () => void;
  /** A pairing was settled: its Telegram message says how. */
  readonly settled: (userCode: string, verdict: string) => void;
}

export interface HubAuthDeps {
  readonly db: HubAuthDb;
  readonly hubId: () => string;
  /** The session a Bearer names (session-identity.ts). */
  readonly session: (
    authorization: string
  ) => { instanceId: string } | undefined;
}

/** A header reader: a Request's, or a socket's plain record. */
type Headers = (name: string) => string | null | undefined;

/** The address a request came from, as Bun's server read it. */
export const addressOf = (
  server: {
    requestIP: (request: Request) => { address: string } | null;
  } | null,
  request: Request
): string | null => server?.requestIP(request)?.address ?? null;

export const createHubAuth = ({ db, hubId, session }: HubAuthDeps) => {
  let hooks: HubAuthHooks | undefined;
  const pairings = new Map<string, Pairing>();
  const waiting = new Map<string, Waiting>();
  const touched = new Map<string, number>();
  /** CLI runs the person approved, by their token's sha256, until they expire. */
  const runs = new Map<
    string,
    { expiresAt: number; id: string; name: string }
  >();
  /** Machine proofs taken within the skew window: each is taken once. */
  const spent = new Map<string, number>();

  const mode = (): HubAuthMode =>
    db.pairingRequired() ? "pairing" : "trusted";

  const sweep = () => {
    const now = Date.now();
    for (const [code, pairing] of pairings) {
      if (pairing.expiresAt <= now) {
        pairings.delete(code);
      }
    }
    for (const [mac, until] of spent) {
      if (until <= now) {
        spent.delete(mac);
      }
    }
  };

  const frame = (): HubAuthFrame => {
    sweep();
    return {
      kind: "hub_auth",
      mode: mode(),
      requests: [...pairings.values()]
        .filter((pairing) => !(pairing.approved || pairing.denied))
        .map(({ address, at, kind, name, userCode: code }) => ({
          address,
          at,
          kind,
          name,
          userCode: code,
        })),
      waiting: [...waiting.values()].map(
        ({ address, hostname, machineId, platform, since }) => ({
          address,
          hostname,
          machineId,
          platform,
          since,
        })
      ),
    };
  };

  const changed = () => hooks?.changed(frame());

  /** The machine whose proof this header carries, once; undefined for any other header. */
  const machineOf = (
    header: string,
    method: string,
    path: string
  ): string | undefined => {
    const [machineId, at, nonce, mac] = header.split(" ");
    const when = Number(at);
    if (
      !(machineId && nonce && mac && Number.isFinite(when)) ||
      Math.abs(Date.now() - when) > MACHINE_PROOF_SKEW_MS ||
      spent.has(mac)
    ) {
      return;
    }
    const key = db.machineKey(machineId);
    if (!(
      key &&
      sameMac(
        httpProof(key, {
          at: when,
          hubId: hubId(),
          machineId,
          method,
          nonce,
          path,
        }),
        mac
      )
    )) {
      return;
    }
    spent.set(mac, Date.now() + 2 * MACHINE_PROOF_SKEW_MS);
    return machineId;
  };

  const deviceOf = (
    token: string,
    address: string | null
  ): { id: string; name: string } | undefined => {
    const hash = sha256(token);
    const run = runs.get(hash);
    if (run) {
      if (run.expiresAt > Date.now()) {
        return { id: run.id, name: run.name };
      }
      runs.delete(hash);
    }
    const row = db.deviceByHash(hash);
    if (!row) {
      return;
    }
    const now = Date.now();
    if (now - (touched.get(row.id) ?? 0) > TOUCH_EVERY_MS) {
      touched.set(row.id, now);
      db.touchDevice(row.id, new Date(now), address);
    }
    return { id: row.id, name: row.name };
  };

  /**
   * What a request is, by what it presents, in this order: the hub's own
   * secret; a session's Bearer (whatever else it carries); a paired
   * device's token; a machine's proof; nothing. In trusted mode, nothing
   * (and a token no device holds) is the owner.
   */
  const classify = (
    header: Headers,
    method: string,
    path: string,
    address: string | null
  ): Caller => {
    if (isHubSelf(header(HUB_SELF_HEADER))) {
      return { kind: "hub" };
    }
    const authorization = header("authorization");
    if (authorization?.startsWith("Bearer ")) {
      return {
        kind: "session",
        instanceId: session(authorization)?.instanceId ?? null,
      };
    }
    const token = ownerTokenOf(authorization, header("cookie"));
    const device = token ? deviceOf(token, address) : undefined;
    if (device) {
      return { kind: "owner", device };
    }
    const proof = header(MACHINE_PROOF_HEADER);
    const machineId = proof ? machineOf(proof, method, path) : undefined;
    if (machineId) {
      return { kind: "machine", machineId };
    }
    return mode() === "trusted"
      ? { kind: "owner", device: null }
      : { kind: "anonymous" };
  };

  /** Whether `caller` may reach `method path` in the current mode. */
  const allows = (caller: Caller, method: string, path: string): boolean => {
    const access = accessOf(method, path);
    if (caller.kind === "hub") {
      return true;
    }
    if (caller.kind === "machine" && namesAnother(path, caller.machineId)) {
      return false;
    }
    if (access === "machine-proof" && mode() === "trusted") {
      return caller.kind === "owner" || caller.kind === "machine";
    }
    return ALLOWED[access].has(caller.kind);
  };

  /** The answer to a request its caller may not make, by what the caller is. */
  const refusal = (caller: Caller, method: string, path: string): Response => {
    if (caller.kind === "session") {
      return new Response(
        `A session's credential reaches its own tools and work items, never the person's routes: ${method} ${path} is the person's.`,
        { status: 403 }
      );
    }
    if (caller.kind === "machine") {
      return new Response(
        `A machine's proof reaches what machines read and report, never the person's routes: ${method} ${path} is the person's.`,
        { status: 403 }
      );
    }
    if (caller.kind === "owner") {
      return new Response(
        `${method} ${path} needs a machine's proof of its key: an admitted machine's agent makes this call.`,
        { status: 403 }
      );
    }
    // An MCP client told 401 starts OAuth discovery against the hub (fleet-mcp.ts):
    // a refused one is told the hub is unavailable to it instead.
    return new Response(PAIRING_REQUIRED, {
      status: path.startsWith("/mcp/") ? 503 : 401,
      headers: { "x-cawco-pairing": "required" },
    });
  };

  /**
   * The gate every request passes once it is no cross-site one: undefined to
   * go on, or the refusal. The address is the one the request came from, or
   * the one a dashboard relay says its page came from.
   */
  const gate = (request: Request, address: string | null) => {
    const path = new URL(request.url).pathname;
    const header: Headers = (name) => request.headers.get(name);
    const caller = classify(
      header,
      request.method,
      path,
      clientAddress(header, address)
    );
    if (allows(caller, request.method, path)) {
      return;
    }
    console.warn(
      `[hub-auth] refused ${caller.kind} ${request.method} ${path}${caller.kind === "session" ? ` (session ${caller.instanceId ?? "unknown"})` : ""}`
    );
    return refusal(caller, request.method, path);
  };

  const clientAddress = (header: Headers, address: string | null) =>
    header("x-cawco-client-address") ?? address;

  const state = (caller: Caller): HubAuthState => ({
    mode: mode(),
    caller: caller.kind === "hub" ? "owner" : caller.kind,
    device: caller.kind === "owner" ? caller.device : null,
  });

  const listDevices = (): OwnerDevice[] =>
    db.devices().map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      createdAt: row.createdAt.getTime(),
      lastUsedAt: row.lastUsedAt?.getTime() ?? null,
      lastAddress: row.lastAddress,
    }));

  /**
   * A device made now: its row, and its token, which leaves the hub this
   * once. A CLI command's is no device the person keeps: it is held in
   * memory for {@link CLI_RUN_MS}, one run's approval, and listed nowhere.
   */
  const addDevice = (
    name: string,
    kind: DeviceKind,
    address: string | null
  ): { device: { id: string; name: string }; token: string } => {
    const token = newToken();
    const id = crypto.randomUUID();
    if (kind === "cli") {
      runs.set(sha256(token), {
        id,
        name,
        expiresAt: Date.now() + CLI_RUN_MS,
      });
      console.log(`[hub-auth] approved one run of "${name}" (${id})`);
      return { device: { id, name }, token };
    }
    const now = new Date();
    db.addDevice({
      id,
      tokenHash: sha256(token),
      name,
      kind,
      createdAt: now,
      lastUsedAt: now,
      lastAddress: address,
    });
    console.log(`[hub-auth] paired ${kind} "${name}" (${id})`);
    return { device: { id, name }, token };
  };

  const start = (
    kind: DeviceKind,
    name: string,
    address: string | null
  ): PairingStart => {
    sweep();
    while (pairings.size >= PAIRINGS_HELD) {
      const oldest = pairings.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      pairings.delete(oldest);
    }
    const deviceCode = newToken();
    let code = userCode();
    while ([...pairings.values()].some((one) => one.userCode === code)) {
      code = userCode();
    }
    const now = Date.now();
    const pairing: Pairing = {
      deviceCode,
      userCode: code,
      kind,
      name,
      address,
      at: now,
      expiresAt: now + PAIRING_TTL_MS,
      polledAt: 0,
    };
    pairings.set(deviceCode, pairing);
    console.log(
      `[hub-auth] ${kind} "${name}" at ${address ?? "an unknown address"} asks to pair: ${code}`
    );
    hooks?.asked(pairing);
    changed();
    return {
      deviceCode,
      userCode: code,
      interval: POLL_INTERVAL_S,
      expiresIn: PAIRING_TTL_MS / 1000,
    };
  };

  /** The person's answer to the pairing showing `code`: whether one was waiting. */
  const answer = (code: string, approve: boolean, by: string): boolean => {
    sweep();
    const pairing = [...pairings.values()].find(
      (one) => one.userCode === code && !(one.approved || one.denied)
    );
    if (!pairing) {
      return false;
    }
    if (approve) {
      pairing.approved = addDevice(pairing.name, pairing.kind, pairing.address);
    } else {
      pairing.denied = true;
    }
    hooks?.settled(code, approve ? `✅ Approved ${by}` : `⛔ Denied ${by}`);
    changed();
    return true;
  };

  const poll = (
    deviceCode: string
  ): { answer: PairingPoll; token?: string; kind?: DeviceKind } => {
    sweep();
    const pairing = pairings.get(deviceCode);
    if (!pairing) {
      return { answer: { status: "expired_token" } };
    }
    if (pairing.denied) {
      pairings.delete(deviceCode);
      return { answer: { status: "access_denied" } };
    }
    if (pairing.approved) {
      pairings.delete(deviceCode);
      return {
        answer: { status: "approved", device: pairing.approved.device },
        token: pairing.approved.token,
        kind: pairing.kind,
      };
    }
    const now = Date.now();
    const early = now - pairing.polledAt < (POLL_INTERVAL_S * 1000) / 2;
    pairing.polledAt = now;
    return {
      answer: { status: early ? "slow_down" : "authorization_pending" },
    };
  };

  /** A new machine key, kept sealed for `machineId`; the one before it stops working. */
  const mintMachineKey = (machineId: string): string => {
    const key = randomBytes(32).toString("base64url");
    db.putMachineKey(machineId, key);
    return key;
  };

  /** What a machine's register proves: its key's answer to this socket's nonce, a wrong one, or no key on file. */
  const proveSocket = (
    machineId: string,
    nonce: string,
    proof: string | undefined
  ): "proven" | "wrong" | "unknown" => {
    const key = db.machineKey(machineId);
    if (!key) {
      return "unknown";
    }
    return proof && sameMac(socketProof(key, nonce, hubId(), machineId), proof)
      ? "proven"
      : "wrong";
  };

  /**
   * Whether a register as `machineId` answers this socket's nonce with the
   * key `former` was admitted with: the machine `former` was, re-joining
   * under a new id (its id follows its hostname) with the key it kept.
   */
  const provesFormer = (
    former: string,
    machineId: string,
    nonce: string,
    proof: string | undefined
  ): boolean => {
    const key = db.machineKey(former);
    return Boolean(
      key &&
      proof &&
      sameMac(socketProof(key, nonce, hubId(), machineId), proof)
    );
  };

  /** A connection that proved no key, held until the person admits or refuses its machine. */
  const hold = (entry: Waiting) => {
    const before = waiting.get(entry.machineId);
    if (before && before.socket !== entry.socket) {
      before.refuse("Another connection from this machine is waiting now.");
    }
    waiting.set(entry.machineId, entry);
    console.log(
      `[hub-auth] machine ${entry.machineId} (${entry.hostname ?? "no hostname"}, ${entry.address ?? "no address"}) waits to be admitted`
    );
    changed();
  };

  /** A held connection closed: its place goes, unless a newer connection holds it. */
  const released = (machineId: string, socket: string) => {
    if (waiting.get(machineId)?.socket === socket) {
      waiting.delete(machineId);
      changed();
    }
  };

  const admit = (machineId: string): boolean => {
    const entry = waiting.get(machineId);
    if (!entry) {
      return false;
    }
    waiting.delete(machineId);
    entry.admit(mintMachineKey(machineId));
    console.log(`[hub-auth] machine ${machineId} admitted`);
    changed();
    return true;
  };

  const refuse = (machineId: string): boolean => {
    const entry = waiting.get(machineId);
    if (!entry) {
      return false;
    }
    waiting.delete(machineId);
    entry.refuse("The person refused this machine.");
    console.log(`[hub-auth] machine ${machineId} refused`);
    changed();
    return true;
  };

  /** The caller of a route handler, read again from its request. */
  const callerOf = (request: Request, address: string | null): Caller => {
    const header: Headers = (name) => request.headers.get(name);
    return classify(
      header,
      request.method,
      new URL(request.url).pathname,
      clientAddress(header, address)
    );
  };

  /** Whether a page reached the hub over https: its cookie then carries `__Host-` and `Secure`. */
  const secureFor = (request: Request): boolean =>
    (
      pageOrigin(Object.fromEntries(request.headers)) ??
      request.headers.get("x-forwarded-proto") ??
      ""
    ).startsWith("https");

  const routes = () =>
    new Elysia()
      // What this request is to the hub, and the mode: every client reads it
      // to know whether to pair.
      .get("/api/auth", ({ request, server }): HubAuthState =>
        state(callerOf(request, addressOf(server, request)))
      )
      // A client asks to be paired. Only in pairing mode: a trusted hub has
      // nothing to pair.
      .post(
        "/api/pair",
        {
          body: t.Object({
            kind: t.Union([
              t.Literal("browser"),
              t.Literal("app"),
              t.Literal("cli"),
            ]),
            name: t.Optional(t.String({ maxLength: 200 })),
          }),
        },
        ({ body, request, server, status }) => {
          if (mode() === "trusted") {
            return status(
              409,
              "This hub trusts its network, so there is nothing to pair: every device on it reaches the fleet."
            );
          }
          const address = clientAddress(
            (header) => request.headers.get(header),
            addressOf(server, request)
          );
          const name =
            body.kind === "browser"
              ? browserName(request.headers.get("user-agent"))
              : cleanName(
                  body.name,
                  body.kind === "app" ? "The CawCo app" : "The cawco command"
                );
          return start(body.kind, name, address);
        }
      )
      // RFC 8628 §3.4: the client polls with its device code. Approved, a
      // browser gets its cookie on this answer and never sees the token.
      .post(
        "/api/pair/poll",
        { body: t.Object({ deviceCode: t.String({ minLength: 1 }) }) },
        ({ body, request, set }) => {
          const polled = poll(body.deviceCode);
          if (polled.token && polled.kind === "browser") {
            set.headers["set-cookie"] = ownerCookie(
              polled.token,
              secureFor(request)
            );
            return polled.answer;
          }
          return polled.token && polled.answer.status === "approved"
            ? { ...polled.answer, token: polled.token }
            : polled.answer;
        }
      )
      .get("/api/pair/requests", () => frame().requests)
      .post("/api/pair/requests/:userCode/approve", ({ params, status }) =>
        answer(params.userCode, true, "from a paired device")
          ? { ok: true }
          : status(
              404,
              "No pairing waits with that code: it was answered, or it expired."
            )
      )
      .post("/api/pair/requests/:userCode/deny", ({ params, status }) =>
        answer(params.userCode, false, "from a paired device")
          ? { ok: true }
          : status(
              404,
              "No pairing waits with that code: it was answered, or it expired."
            )
      )
      .get("/api/devices", ({ request, server }) => ({
        devices: listDevices(),
        current:
          state(callerOf(request, addressOf(server, request))).device?.id ??
          null,
      }))
      .delete("/api/devices/:id", ({ params, status }) => {
        const devices = db.devices();
        if (!devices.some((row) => row.id === params.id)) {
          return status(404, "No paired device has that id.");
        }
        if (mode() === "pairing" && devices.length === 1) {
          return status(
            409,
            "This is the only paired device. Pair another device, or turn off Require paired devices, before removing it."
          );
        }
        db.removeDevice(params.id);
        touched.delete(params.id);
        hooks?.deviceRemoved(params.id);
        console.log(`[hub-auth] device ${params.id} removed`);
        return { ok: true };
      })
      // The setting. On: the device that turns it on is the first paired
      // one (a browser gets its cookie on this answer, the app its token),
      // and every machine connected now is admitted. Off: the hub trusts its
      // network again, and every device and machine key is forgotten.
      .put(
        "/api/auth/pairing",
        {
          body: t.Object({
            required: t.Boolean(),
            kind: t.Optional(t.Union([t.Literal("browser"), t.Literal("app")])),
            name: t.Optional(t.String({ maxLength: 200 })),
          }),
        },
        ({ body, request, server, set }) => {
          const caller = callerOf(request, addressOf(server, request));
          if (!body.required) {
            if (mode() === "pairing") {
              db.setPairingRequired(false);
              runs.clear();
              touched.clear();
              console.log("[hub-auth] paired devices are no longer required");
              changed();
            }
            return { mode: mode(), device: null };
          }
          if (mode() === "pairing") {
            return state(caller);
          }
          const kind = body.kind ?? "browser";
          const address = clientAddress(
            (name) => request.headers.get(name),
            addressOf(server, request)
          );
          const made = addDevice(
            kind === "browser"
              ? browserName(request.headers.get("user-agent"))
              : cleanName(body.name, "The CawCo app"),
            kind,
            address
          );
          db.setPairingRequired(true);
          console.log(
            `[hub-auth] paired devices are required now; "${made.device.name}" is the first`
          );
          hooks?.pairingOn();
          changed();
          if (kind === "browser") {
            set.headers["set-cookie"] = ownerCookie(
              made.token,
              secureFor(request)
            );
            return { mode: mode(), device: made.device };
          }
          return { mode: mode(), device: made.device, token: made.token };
        }
      )
      .get("/api/machines/waiting", () => frame().waiting)
      .post("/api/machines/waiting/:machineId/admit", ({ params, status }) =>
        admit(params.machineId)
          ? { ok: true }
          : status(
              404,
              "That machine is not waiting: it left, or was answered."
            )
      )
      .post("/api/machines/waiting/:machineId/refuse", ({ params, status }) =>
        refuse(params.machineId)
          ? { ok: true }
          : status(
              404,
              "That machine is not waiting: it left, or was answered."
            )
      );

  return {
    answer,
    allows,
    callerOf,
    classify,
    frame,
    gate,
    hold,
    mintMachineKey,
    mode,
    provesFormer,
    proveSocket,
    released,
    routes,
    /** The server's side of a mode change or a device's removal, set once at start. */
    setHooks(next: HubAuthHooks) {
      hooks = next;
    },
  };
};

export type HubAuth = ReturnType<typeof createHubAuth>;
