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
 * The ports the relay takes. It listens on one, 443 (`listening-port`), plain
 * UDP and TCP always, and TLS on the same listener once a certificate stands
 * (turnserver.conf: "TLS & DTLS sessions can connect to the 'plain' TCP & UDP
 * port(s), too"). coturn opens the rest itself on one listening IP: the alt
 * UDP side on 444, and with a certificate its TLS listener on 5349 and 5350,
 * never forwarded and never minted. Its allocations relay through the UDP
 * range. No preview, on the hub or on any agent, ever takes one of these (hub
 * preview.ts, agent hub-loopback.ts).
 */
export const STREAM_RELAY_PORTS = {
  udp: [443, 444],
  tcp: [443, 5349, 5350],
  relayRange: [49_152, 49_400],
} as const;

/** The one port the relay listens on and its URLs name, UDP and TCP, plain and TLS. */
export const STREAM_RELAY_PORT = 443;

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

/** What the relay's machine has bound: its listener on UDP and TCP 443, and whether a certificate stands for TLS on it. */
export interface RelayPorts {
  tcp443: boolean;
  /** A certificate stands and TCP 443 is bound: the listener answers TLS. */
  tls: boolean;
  udp443: boolean;
}

/** Daemon-originated: the stream relay on this machine, whole, on each change. */
export interface RelayFrame {
  /** The command `why` names as its fix, word for word inside it: shown as code. */
  command?: string;
  /** The DNS name its certificate is for, while one stands. */
  hostname?: string;
  kind: "stream_relay";
  machineId: string;
  ports: RelayPorts;
  /** How far an image pull is, while `state` is `pulling`. */
  progress?: { done: number; total: number };
  state: StreamRelayState;
  /** Why it is `failed`, in WORDS.md's error formula ({@link RELAY_FAILURES}). */
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
  /** A DNS name pointing at the machine: a Let's Encrypt certificate is issued for it, and TLS answers on 443. */
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
 * The relay's ICE server URLs, every one on 443: TURN over UDP and TCP, and
 * with a DNS name TURN over TLS. A browser whose runtime forwards only TCP,
 * or nothing, gathers relay candidates from the TCP and TLS URLs alone
 * (pion/ice `relayNetworkTypesForURL`), so each form is listed.
 */
export const streamRelayUrls = (
  address: string,
  hostname?: string | null
): string[] => {
  const host = address.includes(":") ? `[${address}]` : address;
  return [
    `turn:${host}:${STREAM_RELAY_PORT}?transport=udp`,
    `turn:${host}:${STREAM_RELAY_PORT}?transport=tcp`,
    ...(hostname
      ? [`turns:${hostname}:${STREAM_RELAY_PORT}?transport=tcp`]
      : []),
  ];
};

/** One port the hub's health check asks, by its chip's words. */
export type RelayPortName = "udp 443" | "tcp 443" | "tls";

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
  /** The command `why` names as its fix, word for word inside it: shown as code. */
  whyCommand: string | null;
}

/** What `GET /api/stream-relay` answers. */
export interface StreamRelayAnswer {
  /** Every machine that could run it. */
  candidates: RelayCandidate[];
  relay: StreamRelayView | null;
}

/** A relay failure: its sentence, and the command inside it a person runs, when it names one. */
export interface RelayFailure {
  command?: string;
  why: string;
}

const couldNotStart = (machine: string): string =>
  `The relay could not start on ${machine}:`;
const notRenewed = (machine: string, name: string): string =>
  `The relay's certificate for ${name} on ${machine} was not renewed:`;
const renewNext =
  "The hub asks again tomorrow, and the certificate standing serves until it ends.";

/**
 * Every failure the relay's machine reports, in WORDS.md's error formula:
 * what happened, why, how to fix it, what happens next. The agent throws
 * these (agent browser/relay.ts) and Settings › Browsers shows them, a
 * `command` in code type.
 */
export const RELAY_FAILURES = {
  notLinux: (machine: string): RelayFailure => ({
    why: `${couldNotStart(machine)} it runs on the host network, and on a Mac that is the container runtime's VM, which nothing outside reaches. Run the relay on a Linux machine with a public address.`,
  }),
  noRuntime: (machine: string, install: string): RelayFailure => ({
    why: `${couldNotStart(machine)} it runs in a container, and this machine has no container runtime. Install one with ${install}, then start the relay again.`,
    command: install,
  }),
  notDnsName: (machine: string, name: string): RelayFailure => ({
    why: `${couldNotStart(machine)} ${name} is not a DNS name. Give a name like relay.example.com, or none, then start the relay again.`,
  }),
  lowPort: (machine: string, port: number): RelayFailure => {
    const setting = `net.ipv4.ip_unprivileged_port_start=${port}`;
    const command = `sudo sh -c 'sysctl -w ${setting} && echo ${setting} > /etc/sysctl.d/90-cawco-relay.conf'`;
    return {
      why: `${couldNotStart(machine)} port ${port} is below the range this machine lets a rootless container runtime bind. Run ${command} there once (it holds a reboot), or use a root container runtime, then start the relay again.`,
      command,
    };
  },
  held: (machine: string, held: readonly string[]): RelayFailure => ({
    why: `${couldNotStart(machine)} ${held.join("; ")}, and the relay listens there. Free ${held.length === 1 ? "it" : "them"}, then start the relay again.`,
  }),
  port80: (machine: string, held: string): RelayFailure => ({
    why: `${couldNotStart(machine)} ${held}, and its certificate is issued over port 80. Free it, then start the relay again.`,
  }),
  certificate: (machine: string, name: string, said: string): RelayFailure => ({
    why: `${couldNotStart(machine)} Let's Encrypt did not issue a certificate for ${name} (${said}). Point ${name} at this machine and let port 80 reach it, then start the relay again.`,
  }),
  certbotSlow: (machine: string, seconds: number): RelayFailure => ({
    why: `${couldNotStart(machine)} certbot did not finish within ${seconds} s. Check that port 80 reaches this machine, then start the relay again.`,
  }),
  coturnExited: (
    machine: string,
    exit: string,
    said: string
  ): RelayFailure => ({
    why: `${couldNotStart(machine)} coturn stopped as it started (exit ${exit}${said ? `: ${said}` : ""}). Start the relay again; if it stops again, its words here say why.`,
  }),
  coturnUnbound: (
    machine: string,
    ports: readonly string[],
    seconds: number
  ): RelayFailure => ({
    why: `${couldNotStart(machine)} coturn did not bind ${ports.join(", ")} within ${seconds} s. Check that nothing else holds ${ports.length === 1 ? "it" : "them"}, then start the relay again.`,
  }),
  renewNone: (machine: string): RelayFailure => ({
    why: `The relay's certificate on ${machine} was not renewed: the relay there has no certificate. Give it a DNS name in Settings › Browsers to have one issued.`,
  }),
  renewPort80: (machine: string, name: string, held: string): RelayFailure => ({
    why: `${notRenewed(machine, name)} ${held}, and renewal runs over port 80. Free it. ${renewNext}`,
  }),
  renewRefused: (
    machine: string,
    name: string,
    said: string
  ): RelayFailure => ({
    why: `${notRenewed(machine, name)} Let's Encrypt refused (${said}). Check that ${name} points at this machine and port 80 reaches it. ${renewNext}`,
  }),
} as const;

/** The relay step's words: the onboarding card and Settings › Browsers say them alike (Readout register, WORDS.md). */
export const STREAM_RELAY_WORDS = {
  title: "Stream relay",
  lead: "A stream relay lets you take over a browser from anywhere: on cellular data, behind a strict firewall, through a web-only tunnel. It runs on one of your machines that has a public address.",
  none: "No machine of yours has a public address yet. Add one (a small server at a host works), or open UDP and TCP 443 and UDP 49152–49400 on your router to a machine here, then come back.",
  runHere: "Run the relay here",
  /** The picked machine's button: its state in words. */
  picked: "Picked",
  hostnameLabel: "DNS name (optional)",
  hostnameHint:
    "A name pointing at this machine lets the relay answer over TLS on 443, which networks that allow only real HTTPS need. Without one it answers plain on 443. Port 80 must reach it while the certificate is issued and renewed.",
  start: "Start relay",
  stop: "Stop relay",
  remove: "Remove relay",
  later: "Later",
  startTitle: (machine: string) => `Start the stream relay on ${machine}?`,
  startBody: "It listens on UDP and TCP 443 and UDP 49152–49400 there.",
  stopTitle: (machine: string) => `Stop the stream relay on ${machine}?`,
  /** Why Stop relay waits while the relay pulls or starts. */
  stopWhileStarting: "It can be stopped once it has started.",
  stopBody:
    "Streams that go through it stop connecting until it starts again; a screen on the same network as a browser's machine still connects directly.",
  removeTitle: (machine: string) => `Remove the stream relay on ${machine}?`,
  removeBody: (hostname: string | null) =>
    hostname
      ? `Streams from screens off the network of a browser's machine stop connecting, and the certificate for ${hostname} is deleted.`
      : "Streams from screens off the network of a browser's machine stop connecting.",
  seenAs: (seen: string) => `seen by the hub as ${seen}`,
} as const;
