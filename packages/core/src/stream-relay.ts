/**
 * The fleet's stream relay (Projects spec §5.11, build item 5): one TURN
 * server, coturn, run by the agent of a machine with a public address, so a
 * browser's stream reaches any screen through any network. The hub keeps the
 * shared secret and mints short-lived credentials from it (the TURN REST API
 * scheme coturn's `use-auth-secret` reads); the relay's machine runs it on the
 * host network. These are the shapes every hop speaks: its ports, the
 * daemon's {@link RelayFrame}, the hub's commands, and the words the
 * onboarding card and Settings › Browsers say alike (WORDS.md `stream relay`).
 */

/**
 * The ports the relay listens on: UDP and TCP 3478 (`listening-port`), TCP
 * 443 as coturn's second plain port (`alt-listening-port`, which also takes
 * TLS once a certificate stands), TLS on 5349 (`tls-listening-port`) with a
 * DNS name, and the UDP range its allocations relay through. No preview, on
 * the hub or on any agent, ever takes one of these (hub preview.ts,
 * agent hub-loopback.ts).
 */
export const STREAM_RELAY_PORTS = {
  udp: [3478, 443],
  tcp: [3478, 443, 5349],
  relayRange: [49_152, 49_400],
} as const;

/** The relay's UDP relay range, as `relay.start` carries it. */
export type RelayRange = readonly [first: number, last: number];

/** Whether `port` is one of the stream relay's, on either transport. */
export const isStreamRelayPort = (port: number): boolean =>
  (STREAM_RELAY_PORTS.tcp as readonly number[]).includes(port) ||
  (STREAM_RELAY_PORTS.udp as readonly number[]).includes(port) ||
  (port >= STREAM_RELAY_PORTS.relayRange[0] &&
    port <= STREAM_RELAY_PORTS.relayRange[1]);

/** The relay as its machine runs it. */
export type StreamRelayState =
  "pulling" | "starting" | "live" | "stopped" | "failed";

/** What the relay's machine has bound: each listening port, and whether a certificate stands for TLS. */
export interface RelayPorts {
  tcp443: boolean;
  tcp3478: boolean;
  /** A certificate stands: 443 and 5349 answer TLS. */
  tls: boolean;
  udp3478: boolean;
}

/** Daemon-originated: the stream relay on this machine, whole, on each change. */
export interface RelayFrame {
  /** The DNS name its certificate is for, while one stands. */
  hostname?: string;
  kind: "stream_relay";
  machineId: string;
  ports: RelayPorts;
  /** How far an image pull is, while `state` is `pulling`. */
  progress?: { done: number; total: number };
  state: StreamRelayState;
  /** Why it is `failed`, one sentence with the fix. */
  why?: string;
}

/** Hub → daemon: run the relay with the hub's secret, answering its {@link RelayFrame} once live. */
export const RELAY_START = "relay.start";
export interface RelayStartArgs {
  /** The address the relay is reached at, as its URLs name it. */
  address: string;
  /**
   * coturn's `external-ip`, only where the address is not one of the
   * machine's own (a cloud NAT): `<public>` or `<public>/<private>`.
   */
  externalIp?: string;
  /** A DNS name pointing at the machine: a Let's Encrypt certificate is issued for it, and TLS answers on 443 and 5349. */
  hostname?: string;
  relayRange: RelayRange;
  /** The shared secret coturn checks each credential against (`static-auth-secret`). */
  secret: string;
}

/** Hub → daemon: stop the relay and remove its container; its certificate is kept, so a start again reuses it. */
export const RELAY_STOP = "relay.stop";

/** Hub → daemon: the relay gone from the machine: its container, then its certificate volume (Remove relay, or the relay moved elsewhere). */
export const RELAY_REMOVE = "relay.remove";

/** Hub → daemon: renew the relay's certificate when its issuer says it is due, and restart coturn on a new one. */
export const RELAY_RENEW = "relay.renew";

/** What `relay.renew` did: renewed (coturn restarted on the new certificate), or kept the one standing. */
export interface RelayRenewed {
  /** The certificate's end (ms epoch), as it stands after. */
  expiresAt: number;
  renewed: boolean;
}

/**
 * The relay's ICE server URLs: TURN over UDP and TCP on 3478, plain TCP on
 * 443, and with a DNS name TURN over TLS on 443 and 5349. A browser whose
 * runtime forwards only TCP, or nothing, gathers relay candidates from the
 * TCP and TLS URLs alone (pion/ice `relayNetworkTypesForURL`), so each form
 * is listed.
 */
export const streamRelayUrls = (
  address: string,
  hostname?: string | null
): string[] => {
  const host = address.includes(":") ? `[${address}]` : address;
  return [
    `turn:${host}:3478?transport=udp`,
    `turn:${host}:3478?transport=tcp`,
    `turn:${host}:443?transport=tcp`,
    ...(hostname
      ? [
          `turns:${hostname}:443?transport=tcp`,
          `turns:${hostname}:5349?transport=tcp`,
        ]
      : []),
  ];
};

/** One port the hub's health check asks, by its chip's words. */
export type RelayPortName = "udp 3478" | "tcp 3478" | "tcp 443" | "tls";

/** One port's answer to the hub's STUN binding request. */
export interface RelayPortHealth {
  /** Why it did not answer, as the request failed. */
  error?: string;
  port: RelayPortName;
  up: boolean;
}

/** A machine that could run the relay: its capability report holds a public address. */
export interface RelayCandidate {
  /** The address the relay would be reached at: the hub's seen address where it is public and differs, else the first global IPv4. */
  address: string;
  /** Every global unicast address its interfaces hold (capability `public-address`). */
  addresses: string[];
  /** coturn's `external-ip`, when the address is not one of its interfaces'. */
  externalIp?: string;
  machineId: string;
  name: string;
  online: boolean;
  /** The public address the hub sees its agent connect from, when it differs from its own. */
  seen?: string;
}

/** The relay as Settings shows it: the record without its secret. */
export interface StreamRelayView {
  address: string;
  /** The certificate's end (ms epoch), while one stands. */
  certificateEndsAt: number | null;
  /** When the hub last asked each port (ms epoch); null before it has. */
  checkedAt: number | null;
  health: RelayPortHealth[];
  hostname: string | null;
  machineId: string;
  machineName: string;
  ports: RelayPorts | null;
  progress?: { done: number; total: number };
  state: StreamRelayState;
  urls: string[];
  why: string | null;
}

/** What `GET /api/stream-relay` answers. */
export interface StreamRelayAnswer {
  /** Every machine that could run it. */
  candidates: RelayCandidate[];
  relay: StreamRelayView | null;
}

/** The relay step's words: the onboarding card and Settings › Browsers say them alike (Readout register, WORDS.md). */
export const STREAM_RELAY_WORDS = {
  title: "Stream relay",
  lead: "A stream relay lets you take over a browser from anywhere: on cellular data, behind a strict firewall, through a web-only tunnel. It runs on one of your machines that has a public address.",
  none: "No machine of yours has a public address yet. Add one (a small server at a host works), or open UDP and TCP 3478, TCP 443 and UDP 49152–49400 on your router to a machine here, then come back.",
  runHere: "Run the relay here",
  /** The picked machine's button: its state in words. */
  picked: "Picked",
  hostnameLabel: "DNS name (optional)",
  hostnameHint:
    "A name pointing at this machine lets the relay answer over TLS on 443, which networks that inspect traffic need. Port 80 must reach it while the certificate is issued.",
  start: "Start relay",
  stop: "Stop relay",
  remove: "Remove relay",
  later: "Later",
  startTitle: (machine: string) => `Start the stream relay on ${machine}?`,
  startBody:
    "It listens on UDP and TCP 3478, TCP 443 and UDP 49152–49400 there.",
  stopTitle: (machine: string) => `Stop the stream relay on ${machine}?`,
  stopBody:
    "Streams that go through it stop connecting until it starts again; a screen on the same network as a browser's machine still connects directly.",
  removeTitle: (machine: string) => `Remove the stream relay on ${machine}?`,
  removeBody: (hostname: string | null) =>
    hostname
      ? `Streams from screens off the network of a browser's machine stop connecting, and the certificate for ${hostname} is deleted.`
      : "Streams from screens off the network of a browser's machine stop connecting.",
  seenAs: (seen: string) => `seen by the hub as ${seen}`,
} as const;
