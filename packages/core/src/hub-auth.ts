/**
 * Who calls the hub, as both ends name it (hub hub-auth.ts holds the rules).
 *
 * The hub runs in one of two modes, one fleet setting ("Require paired
 * devices", off unless the person turns it on):
 *
 * - **trusted**: being on the network is enough for the person's own
 *   devices. A request with no credential is the person.
 * - **pairing**: every request is the person only with a paired device's
 *   token, a session only with its credential, a machine only with its key's
 *   proof; anything else is anonymous and reaches only the routes listed for
 *   it.
 *
 * In both, a request that presents a session credential is that session and
 * never the person.
 *
 * A machine proves its key without sending it (machine-key.ts). Nothing here
 * reads a file or a key: the dashboard's pages import it.
 */

/** Which way the hub admits callers. */
export type HubAuthMode = "trusted" | "pairing";

/** What a request is to the hub. */
export type CallerKind = "owner" | "session" | "machine" | "anonymous";

/**
 * What `GET /api/auth` answers: the mode, what this request is, and, for a
 * paired device, which one. Any client reads it to know whether it must pair.
 */
export interface HubAuthState {
  caller: CallerKind;
  /** The paired device this request came from; null for anything else. */
  device: { id: string; name: string } | null;
  mode: HubAuthMode;
}

/** The kind of client a pairing is for. */
export type DeviceKind = "browser" | "app" | "cli";

/** A paired device, as `GET /api/devices` lists it. Its token never leaves the hub but once. */
export interface OwnerDevice {
  createdAt: number;
  id: string;
  kind: DeviceKind;
  lastAddress: string | null;
  lastUsedAt: number | null;
  name: string;
}

/**
 * A client waiting to be paired (RFC 8628 §3.2's device authorization
 * response): what it shows (`userCode`), what it polls with (`deviceCode`,
 * kept by that client alone), how often, and for how long, and where the
 * person approves it.
 */
export interface PairingStart {
  deviceCode: string;
  expiresIn: number;
  /** The hub asked (its `/health` `hubId`): a device that scans the code knows it is its own hub's. */
  hubId: string;
  interval: number;
  userCode: string;
  /** Where the person approves it (§3.2 `verification_uri`): the dashboard's Configure › Devices. */
  verificationUri: string;
  /**
   * The same with the code and the hub in its query (§3.2
   * `verification_uri_complete`: "includes the user_code ... designed for
   * non-textual transmission"): what a QR beside the code carries, so a
   * paired device's camera names the hub and the pairing in one scan.
   */
  verificationUriComplete: string;
}

/**
 * A poll's answer. RFC 8628 §3.5's error codes, by name: still waiting, asked
 * too fast, denied, or expired. Approved, a browser has its cookie set and no
 * token here; any other client takes the token, once.
 */
export type PairingPoll =
  | { status: "authorization_pending" | "slow_down" }
  | { status: "access_denied" | "expired_token" }
  | {
      status: "approved";
      device: { id: string; name: string };
      token?: string;
    };

/** A pairing waiting on the person, as every paired screen shows it. */
export interface PairingRequest {
  address: string | null;
  at: number;
  kind: DeviceKind;
  /** "Chrome on Linux", "CawCo on iPhone", "cawco relay". */
  name: string;
  userCode: string;
}

/** A machine that dialled the hub without a key's proof and waits for the person. */
export interface WaitingMachine {
  address: string | null;
  hostname: string | null;
  machineId: string;
  platform: string | null;
  since: number;
}

/**
 * What every paired screen keeps current (`verb: "frames"` from the hub):
 * the mode, the pairings waiting on the person, and the machines waiting to
 * be admitted. Sent whenever any of them changes.
 */
export interface HubAuthFrame {
  /** The hub's, of no session. */
  instanceId?: undefined;
  kind: "hub_auth";
  mode: HubAuthMode;
  requests: PairingRequest[];
  waiting: WaitingMachine[];
}

/** The person's own credential on a request: `Authorization: Owner <token>`. */
export const OWNER_SCHEME = "Owner";

/**
 * The browser's copy of it: HttpOnly, SameSite=Lax, Path=/. On an https
 * origin it carries the `__Host-` prefix and `Secure`; on plain http (a
 * tailnet name on :3000) that prefix cannot be set, so the plain name is
 * used. Both start `cawco-`, which every previewed app's request is
 * stripped of (core frames.ts `DASHBOARD_COOKIE`).
 *
 * Lax, not Strict: a link from another site (a push's, a chat's) opens
 * the dashboard as this device, where Strict drew the pairing screen first.
 * OWASP Session Management: "`SameSite=Lax` permits top-level cross-site
 * navigations that use safe HTTP methods. Treat `SameSite` as defense in
 * depth against CSRF" (cheatsheetseries.owasp.org, Session Management
 * Cheat Sheet, SameSite Attribute). A cross-site write is refused before
 * any cookie is read: by its fetch metadata at the dashboard and the hub
 * (core browser-gate.ts `crossSiteRefusal`).
 */
export const OWNER_COOKIE = "cawco-owner";
export const OWNER_COOKIE_SECURE = `__Host-${OWNER_COOKIE}`;

/** A machine's proof over HTTP: `<machineId> <unix ms> <nonce> <mac>`. */
export const MACHINE_PROOF_HEADER = "x-cawco-machine-proof";

/** How far a proof's clock may stand from the hub's, either way. */
export const MACHINE_PROOF_SKEW_MS = 120_000;

/** Why the hub refuses a request in pairing mode: one sentence each client shows. */
export const PAIRING_REQUIRED =
  "This hub requires paired devices. Pair this device: it shows a code to approve from a paired device.";

/** The token, from `Authorization: Owner <token>` or the browser's cookie. */
export const ownerTokenOf = (
  authorization: string | null | undefined,
  cookie: string | null | undefined
): string | undefined => {
  if (authorization?.startsWith(`${OWNER_SCHEME} `)) {
    return authorization.slice(OWNER_SCHEME.length + 1).trim() || undefined;
  }
  if (!cookie) {
    return;
  }
  for (const part of cookie.split(";")) {
    const at = part.indexOf("=");
    if (at === -1) {
      continue;
    }
    const name = part.slice(0, at).trim();
    if (name === OWNER_COOKIE_SECURE || name === OWNER_COOKIE) {
      const value = part.slice(at + 1).trim();
      if (value) {
        return value;
      }
    }
  }
};

/** The owner cookie as one `Set-Cookie` value, for a page on `origin`. */
export const ownerCookie = (token: string, secure: boolean): string =>
  secure
    ? `${OWNER_COOKIE_SECURE}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure`
    : `${OWNER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`;
