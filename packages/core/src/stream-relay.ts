/**
 * The fleet's stream relay (Projects spec §5.11, build item 5): one TURN
 * server, coturn, run by the agent of a machine the internet reaches, so a
 * browser's stream reaches any screen through any network. The hub keeps the
 * shared secret and mints short-lived credentials from it (the TURN REST API
 * scheme coturn's `use-auth-secret` reads); the relay's machine runs it on the
 * host network. These are the shapes every hop speaks: its ports, the
 * daemon's {@link RelayFrame}, the hub's commands, the guided journey that
 * brings a relay up ({@link RelayJourneyView}), and the words every place
 * that draws it says alike (WORDS.md `stream relay`): the dashboard's card,
 * Caw's setup card, and later the iOS app.
 */
import { getDomain } from "tldts";
import { CAWCO_ENV, readEnv } from "./index";

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

/** The port a certificate over HTTP is issued and renewed on (certbot standalone). */
export const RELAY_HTTP_PORT = 80;

/** The relay's UDP relay range, as `relay.start` carries it. */
export type RelayRange = readonly [first: number, last: number];

/** Whether `port` is one of the stream relay's, on either transport. */
export const isStreamRelayPort = (port: number): boolean =>
  (STREAM_RELAY_PORTS.tcp as readonly number[]).includes(port) ||
  (STREAM_RELAY_PORTS.udp as readonly number[]).includes(port) ||
  (port >= STREAM_RELAY_PORTS.relayRange[0] &&
    port <= STREAM_RELAY_PORTS.relayRange[1]);

/**
 * The STUN server a machine asks for the public address its router maps it
 * to, at start and on each network change (agent capabilities.ts): one
 * server, Cloudflare's ("Cloudflare STUN Server: `stun.cloudflare.com:3478`",
 * developers.cloudflare.com/realtime/sfu/https-api/). A scratch fleet names
 * its own stand-in (`CAWCO_STUN_SERVER`).
 */
export const STUN_SERVER = "stun:stun.cloudflare.com:3478";

/**
 * The STUN server this process names: a scratch fleet's stand-in where
 * `CAWCO_STUN_SERVER` names one, else {@link STUN_SERVER}. The one every reading of it goes
 * through: a machine's mapped address (agent relay-reach.ts), a browser's
 * own ICE servers (agent container-host.ts) and each viewer's (hub
 * browser-routes.ts), so all of them name the same server.
 */
export const stunServer = (): string =>
  readEnv(CAWCO_ENV.stunServer) ?? STUN_SERVER;

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
   * coturn's `external-ip`, where the address is not one of the machine's
   * own (behind a router, a cloud NAT): `<public>/<private>`.
   */
  externalIp?: string;
  /** A DNS name pointing at the machine whose certificate stands ({@link RELAY_CERTIFY}): TLS answers on 443. */
  hostname?: string;
  relayRange: RelayRange;
  /** The shared secret coturn checks each credential against (`static-auth-secret`). */
  secret: string;
}

/**
 * Hub → daemon: issue the relay's certificate for `hostname` (kept, when one
 * stands and is not due): by DNS at Cloudflare with the person's token, else
 * over HTTP on port 80. Answers {@link RelayCertified}.
 */
export const RELAY_CERTIFY = "relay.certify";
export interface RelayCertifyArgs {
  /** The person's Cloudflare API token (Zone · DNS · Edit): the DNS challenge, no port 80. */
  cloudflareToken?: string;
  hostname: string;
}
export interface RelayCertified {
  /** The certificate's end (ms epoch). */
  expiresAt: number;
}

/** Hub → daemon: stop the relay and remove its container; its certificate is kept, so a start again reuses it. */
export const RELAY_STOP = "relay.stop";

/** Hub → daemon: the relay gone from the machine: its container, then its certificate volume, then its router mappings (Remove relay, or the relay moved elsewhere). */
export const RELAY_REMOVE = "relay.remove";

/** Hub → daemon: renew the relay's certificate when its issuer says it is due, and restart coturn on a new one. Carries {@link RelayCertifyArgs}' token when it was issued by DNS. */
export const RELAY_RENEW = "relay.renew";

/** What `relay.renew` did: renewed (coturn restarted on the new certificate), or kept the one standing. */
export interface RelayRenewed {
  /** The certificate's end (ms epoch), as it stands after. */
  expiresAt: number;
  renewed: boolean;
}

/**
 * Hub → daemon: whether the machine's container runtime may bind the relay's
 * lowest port now (read from `ip_unprivileged_port_start` on each ask; the
 * hub asks every 2 s while the journey's low-ports step stands).
 */
export const RELAY_LOW_PORTS = "relay.low-ports";
export interface RelayLowPorts {
  /** The runtime binds any port: a root one, or one whose unprivileged start is low enough. */
  allowed: boolean;
  /** The runtime runs rootless: the step applies to this machine. */
  rootless: boolean;
  /** `ip_unprivileged_port_start` as read, on a rootless runtime. */
  start: number | null;
}

/**
 * Hub → daemon: ask the machine's router to open the relay's ports to it
 * (UPnP, then NAT-PMP), and keep the leases renewed until `relay.remove`.
 * Answers {@link RelayMapped}.
 */
export const RELAY_MAP = "relay.map";
export interface RelayMapArgs {
  /** TCP 80 too: the certificate is issued and renewed over HTTP. */
  http: boolean;
  /** The machine's address on the router's network, the forwards' target. */
  lan: string;
}
export interface RelayMapped {
  /** How the router answered: UPnP or NAT-PMP; null when neither did. */
  how: RelayMapHow | null;
  /** UDP and TCP 443 (and TCP 80 with `http`) mapped. */
  listener: boolean;
  /** The whole UDP relay range mapped; false when the router capped its table. */
  range: boolean;
  /** Why nothing was mapped, in the router's or the library's words. */
  why?: string;
}
export type RelayMapHow = "UPnP" | "NAT-PMP";

/**
 * Hub → daemon: from a fleet machine on another network than the relay's,
 * one STUN binding through each of the relay's URLs, so the relay is proven
 * reached from outside without the person. Answers the URLs that answered.
 */
export const RELAY_PROVE = "relay.prove";
export interface RelayProveArgs {
  urls: string[];
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

/** A relay URL's chip words: `turns:` is TLS, else its transport on 443. */
export const portNameOf = (url: string): RelayPortName => {
  if (url.startsWith("turns:")) {
    return "tls";
  }
  return url.includes("transport=tcp") ? "tcp 443" : "udp 443";
};

/** One port's answer to the hub's STUN binding request. */
export interface RelayPortHealth {
  /** Why it did not answer, as the request failed. */
  error?: string;
  port: RelayPortName;
  up: boolean;
}

/** A machine that could run the relay: the internet reaches it on an interface's address, the hub's view of it, or its router's. */
export interface RelayCandidate {
  /** The address the relay would be reached at. */
  address: string;
  /** coturn's `external-ip`, when the address is not one of its interfaces'. */
  externalIp?: string;
  /** Behind a router: its address on the router's network, for the forwards. */
  lan: string | null;
  machineId: string;
  name: string;
  online: boolean;
}

/* ------------------------------------------------------------------ */
/* The journey                                                          */
/* ------------------------------------------------------------------ */

/** The machine the relay runs on, as step 1 found it. */
export interface RelayMachine {
  /** Its public address: an interface's, the hub's view of it, or STUN's. */
  address: string;
  /** Behind a router: its address on the router's network, for the forwards. */
  lan: string | null;
  name: string;
}

/** One machine step 1 offers when two or more could run the relay. */
export interface RelayChoice extends RelayMachine {
  machineId: string;
  online: boolean;
}

/** What the name check last found while the name stands. */
export type NameFinding = "unresolved" | "proxied" | "elsewhere";

/**
 * One step on the path, by what it is and where it stands. A step that does
 * not apply to this machine is not in the list (the router on a machine with
 * a public interface, the low ports on a root runtime, the certificate with
 * no name).
 */
export type RelayStep =
  | {
      step: "machine";
      /** `needs`: two or more machines could run it, `choices` the ask; `none`: no machine can. */
      state: "done" | "needs" | "none";
      choices?: RelayChoice[];
      /** `none` only: the machines the internet reaches that aren't Linux, so can't run it (hub stream-relay.ts `hostsRelay`). */
      notLinux?: string[];
    }
  | {
      step: "name";
      state: "waiting" | "checking" | "needs" | "done" | "skipped";
      /** The name suggested, or the one that stands; empty when none is known yet (the field asks for one). */
      name: string;
      /** When the hub last asked DNS (ms epoch), while it checks. */
      askedAt?: number;
      finding?: NameFinding;
      /** What the name answers instead, for `elsewhere`. */
      answers?: string;
      /** Cloudflare refused the token, or the record: its words, the token field open under "Let CawCo add it". */
      tokenWhy?: string;
    }
  | {
      step: "router";
      /**
       * `refused`: no UPnP or NAT-PMP answered; `partial`: the router opened
       * 443 and capped the relay range; `by-hand`: forwarded by hand, proven
       * only by the last step.
       */
      state:
        | "waiting"
        | "needs"
        | "asking"
        | "refused"
        | "partial"
        | "by-hand"
        | "done";
      how?: RelayMapHow;
      /** TCP 80 is forwarded too: the certificate is issued and renewed over HTTP. */
      http?: boolean;
    }
  | {
      step: "runtime";
      state: "waiting" | "checking" | "needs" | "done";
      /** The lowest port the relay will ever bind: 443, or 80 with a certificate over HTTP. */
      lowest: 443 | 80;
    }
  | {
      step: "certificate";
      state: "waiting" | "running" | "failed" | "done";
      /** Its failure, in the error formula's words. */
      why?: string;
      /** When the certificate ends (ms epoch). */
      endsAt?: number;
    }
  | {
      step: "start";
      state: "waiting" | "running" | "failed" | "done";
      /** "Pulling 3 of 7", while it runs. */
      progress?: string;
      why?: string;
      /** The command `why` names as its fix, word for word inside it. */
      command?: string;
    }
  | {
      step: "prove";
      /** `inside`: it answered from a screen on the relay's own network only; `checking`: this screen asks now (drawn by the screen itself). */
      state: "waiting" | "checking" | "inside" | "failed" | "done";
      /** The device that proved it, or failed it. */
      device?: string;
      /** When (ms epoch). */
      at?: number;
      /** The device that failed it was outside the relay's network. */
      outside?: boolean;
      /** The ports that answered it, "udp 443, tcp 443, tls". */
      ports?: string;
      /** It failed by a refused credential (a 401), not by no answer. */
      refused?: boolean;
    };

export type RelayStepKind = RelayStep["step"];

/** One port's last STUN answer, as Settings' chips show it. */
export interface RelayPortChip {
  error?: string;
  name: RelayPortName;
  up: boolean;
}

/** The relay once it has gone live: Settings' summary. */
export interface RelaySummary {
  /** When the certificate ends (ms epoch), with a name. */
  endsAt: number | null;
  machine: RelayMachine;
  /** Its name, or null when the name was skipped. */
  name: string | null;
  ports: RelayPortChip[];
  /** How far an image pull is, while it pulls. */
  progress?: string;
  /** Who proved it from outside and when, or null while nobody has. */
  proven: { device: string; at: number } | null;
  state: StreamRelayState;
  why: string | null;
  /** The command `why` names as its fix. */
  whyCommand: string | null;
}

/** What the person pressed on the card: the hub's to act on (Check again runs this screen's own proof first). */
export type RelayAct =
  | {
      act:
        | "set-up"
        | "later"
        | "skip-name"
        | "add-name"
        | "open-ports"
        | "retry"
        | "start-again"
        | "check-again"
        | "done-for-now"
        | "start"
        | "stop"
        | "remove";
    }
  | { act: "add-record"; token: string }
  | { act: "pick"; machineId: string }
  | { act: "name"; name: string };

/**
 * The journey as the hub holds it, whole: what `GET /api/stream-relay`
 * answers (with the asking page's {@link RelayAnswer.domain}) and every
 * `stream_relay.journey` frame carries, so every place that draws the card
 * shows the same ticks.
 */
export interface RelayJourneyView {
  /** Needs you holds its row: set up, not put away (Later, Done for now), and not yet live and proven from outside. */
  asks: boolean;
  /** How many machines could run it, for the row's meta before a pick. */
  candidates: number;
  /** Live and proven from outside: the row's tick. */
  done: boolean;
  /** The machine picked, or null before a pick. */
  machine: RelayMachine | null;
  /** Someone set it up (the setup card, Settings, a take-over through a domain); false before. */
  open: boolean;
  /** Every step that applies, in order, with where each stands. */
  steps: RelayStep[];
  /** The relay once it has gone live, as Settings shows it; null before. */
  summary: RelaySummary | null;
  /** The relay's URLs, for this screen's proof; empty while it is not live. */
  urls: string[];
}

/** What `GET /api/stream-relay` and every act answer. */
export interface RelayAnswer {
  /**
   * The domain the asking page reached CawCo through, seen through a proxy
   * (a tunnel, Cloudflare): the lead line, the name's suggestion and the
   * take-over's entry name it. Null by IP, the tailnet or a name of the hub's.
   */
  domain: string | null;
  journey: RelayJourneyView;
}

/** A credential for this screen's proof (`GET /api/stream-relay/try`): good for 60 s. */
export interface RelayTry {
  credential: string;
  urls: string[];
  username: string;
}

/**
 * What this screen's proof found (`POST /api/stream-relay/proof`): the URLs
 * that gave a relay candidate, those refused (a 401), and the public address
 * the relay's STUN answer saw this screen at (its server-reflexive
 * candidate), which tells inside from outside wherever the screen reached
 * the hub from (the tailnet, the LAN); null when no STUN answer came.
 */
export interface RelayProofReport {
  answered: string[];
  refused: string[];
  seenAs: string | null;
}

/** Hub-originated: the journey changed. */
export interface RelayJourneyFrame {
  instanceId?: undefined;
  journey: RelayJourneyView;
  kind: "stream_relay.journey";
}

/**
 * The registrable domain of a name (its zone at a DNS host), by the Public
 * Suffix List: `bewinxed.com` for outpost.bewinxed.com, `northwind.co.uk`
 * for relay.northwind.co.uk. Null for an address or a name under no public
 * suffix (localhost, a .local name), which no DNS host serves.
 */
export const zoneOf = (name: string): string | null => getDomain(name);

/** "turn.bewinxed.com" from "outpost.bewinxed.com": the name suggested under the domain the person came in by; null when it has no zone. */
export const suggestedName = (domain: string): string | null => {
  const zone = zoneOf(domain);
  return zone ? `turn.${zone}` : null;
};

/** A DNS name the relay's certificate is issued for: labels of letters, digits and hyphens, under a top label of letters. */
export const RELAY_DNS_NAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/i;

/** The ports the relay answers on, by whether a name stands: its chips' and its tick's words. */
export const portsWords = (named: boolean): string =>
  named ? "udp 443, tcp 443, tls" : "udp 443, tcp 443";

/** "17 Jan": a certificate's end, in this screen's zone. */
export const relayDay = (at: number): string =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    at
  );

/** "today 14:02", else "17 Jan, 14:02": when a proof landed, in this screen's zone. */
export const relayWhen = (at: number, now = Date.now()): string => {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
  const same = new Date(at).toDateString() === new Date(now).toDateString();
  return same ? `today ${time}` : `${relayDay(at)}, ${time}`;
};

/** The forwards to make on a router, as one line to copy: the listener and the relay range, TCP 80 for a certificate over HTTP. */
const forwardsOf = (lan: string, http: boolean): string =>
  `UDP 443 · TCP 443 · UDP 49152–49400${http ? " · TCP 80" : ""} → ${lan}`;

/* ------------------------------------------------------------------ */
/* Failures                                                             */
/* ------------------------------------------------------------------ */

/** A relay failure: its sentence, and the command inside it a person runs, when it names one. */
export interface RelayFailure {
  command?: string;
  why: string;
}

const couldNotStart = (machine: string): string =>
  `The stream relay could not start on ${machine}:`;
const notRenewed = (machine: string, name: string): string =>
  `The stream relay's certificate for ${name} on ${machine} was not renewed:`;
const renewNext =
  "The hub asks again tomorrow, and the certificate standing serves until it ends.";

/** The one-line fix for the low ports: the value set live and kept over a reboot. */
export const lowPortsCommand = (port: number): string => {
  const setting = `net.ipv4.ip_unprivileged_port_start=${port}`;
  return `sudo sh -c 'sysctl -w ${setting} && echo ${setting} > /etc/sysctl.d/90-cawco-relay.conf'`;
};

/**
 * Every failure the relay's machine reports, in WORDS.md's error formula:
 * what happened, why, how to fix it, what happens next. The agent throws
 * these (agent browser/relay.ts) and the journey's steps say them, a
 * `command` in code type.
 */
export const RELAY_FAILURES = {
  notLinux: (machine: string): RelayFailure => ({
    why: `${couldNotStart(machine)} it runs on the host network, and on a Mac that is the container runtime's VM, which nothing outside reaches. Run the stream relay on a Linux machine.`,
  }),
  noRuntime: (machine: string, install: string): RelayFailure => ({
    why: `${couldNotStart(machine)} it runs in a container, and this machine has no container runtime. Install one with ${install}, then start the stream relay again.`,
    command: install,
  }),
  notDnsName: (machine: string, name: string): RelayFailure => ({
    why: `${couldNotStart(machine)} ${name} is not a DNS name. Give a name like turn.example.com, or skip the name, then start the stream relay again.`,
  }),
  lowPort: (machine: string, port: number): RelayFailure => {
    const command = lowPortsCommand(port);
    return {
      why: `${couldNotStart(machine)} port ${port} is below the range this machine lets a rootless container runtime bind. Run ${command} there once (it holds a reboot), or use a root container runtime, then start the stream relay again.`,
      command,
    };
  },
  held: (machine: string, held: readonly string[]): RelayFailure => ({
    why: `${couldNotStart(machine)} ${held.join("; ")}, and the stream relay listens there. Free ${held.length === 1 ? "it" : "them"}, then start the stream relay again.`,
  }),
  noCertificate: (machine: string, name: string): RelayFailure => ({
    why: `${couldNotStart(machine)} no certificate for ${name} stands there. Issue it in the journey's certificate step, then start the stream relay again.`,
  }),
  coturnExited: (
    machine: string,
    exit: string,
    said: string
  ): RelayFailure => ({
    why: `${couldNotStart(machine)} coturn stopped as it started (exit ${exit}${said ? `: ${said}` : ""}). Start the stream relay again; if it stops again, its words here say why.`,
  }),
  coturnUnbound: (
    machine: string,
    ports: readonly string[],
    seconds: number
  ): RelayFailure => ({
    why: `${couldNotStart(machine)} coturn did not bind ${ports.join(", ")} within ${seconds} s. Check that nothing else holds ${ports.length === 1 ? "it" : "them"}, then start the stream relay again.`,
  }),
  /** The certificate step's own failures: what Let's Encrypt or certbot said, and the step's verb, Retry. */
  certificateHttp: (name: string, said: string): RelayFailure => ({
    why: `Let's Encrypt did not issue a certificate for ${name} (${said}). Point ${name} at this machine and let TCP 80 reach it, then Retry.`,
  }),
  certificateDns: (name: string, said: string): RelayFailure => ({
    why: `Let's Encrypt did not issue a certificate for ${name} (${said}). Check the token can edit ${zoneOf(name) ?? name}'s DNS, then Retry.`,
  }),
  certificatePort80: (name: string, held: string): RelayFailure => ({
    why: `The certificate for ${name} was not issued: ${held}, and it is issued over port 80. Free it, then Retry.`,
  }),
  certbotSlow: (seconds: number, dns: boolean): RelayFailure => ({
    why: `certbot did not finish within ${seconds} s. ${dns ? "Check the token can edit the zone's DNS" : "Check that TCP 80 reaches this machine"}, then Retry.`,
  }),
  renewNone: (machine: string): RelayFailure => ({
    why: `The stream relay's certificate on ${machine} was not renewed: it has no certificate there. Add a name in Settings › Browsers to have one issued.`,
  }),
  renewPort80: (machine: string, name: string, held: string): RelayFailure => ({
    why: `${notRenewed(machine, name)} ${held}, and renewal runs over port 80. Free it. ${renewNext}`,
  }),
  renewRefused: (
    machine: string,
    name: string,
    said: string
  ): RelayFailure => ({
    why: `${notRenewed(machine, name)} Let's Encrypt refused (${said}). Check that ${name} points at this machine and port 80 reaches it, or that the token can still edit its zone's DNS. ${renewNext}`,
  }),
} as const;

/* ------------------------------------------------------------------ */
/* Words                                                                */
/* ------------------------------------------------------------------ */

/**
 * The stream relay's words: the journey's card wherever it is drawn (a
 * take-over's stream place, Caw's Needs you, Settings › Browsers), Caw's
 * setup card, and the summary, alike (Readout register, WORDS.md). From the
 * journey design (relay-journey/journey-design.md) with the ports revision's
 * diff (journey-ports-revision.md).
 */
export const STREAM_RELAY_WORDS = {
  title: "Stream relay",

  leadDomain: (domain: string) =>
    `You reach CawCo through ${domain}, which carries pages, not streams. A stream relay on one of your machines carries them, from anywhere.`,
  leadPlain:
    "A stream relay lets you take over a browser from anywhere: on cellular data, behind a strict firewall, through a web-only tunnel.",
  /** The phone's lead (the design's 390 wireframe). */
  leadDomainShort: (domain: string) =>
    `You reach CawCo through ${domain}, which carries pages, not streams. A stream relay on one of your machines carries them.`,
  leadPlainShort: "A stream relay lets you take over a browser from anywhere.",

  machine: "Pick the machine",
  machineDone: (machine: RelayMachine) =>
    `Runs on ${machine.name} · ${machine.address}${machine.lan ? ", behind a router" : ""}`,
  none: "No machine of yours is reached from the internet yet. Add one (a small server at a host works), or open UDP and TCP 443 and UDP 49152–49400 on your router to a machine here, then come back.",
  /** No Linux machine is reached, only `machines` that aren't Linux. */
  noneNotLinux: (machines: string[]) =>
    `No machine of yours can run the stream relay: it runs only on Linux, and on ${machines.length === 1 ? machines[0] : `${machines.slice(0, -1).join(", ")} and ${machines.at(-1)}`} it would run inside the container runtime's VM, which nothing outside reaches. Add a Linux machine the internet reaches (a small server at a host works); this step picks it once it reports.`,
  runHere: "Run the stream relay here",
  behindRouter: "behind a router",
  offline: "offline",

  name: "Point a name at it (optional)",
  nameDone: (name: string) => `${name} points at it`,
  nameSkipped: "No name · plain on 443",
  nameChecking: (name: string, seconds?: number) =>
    seconds === undefined
      ? `Checking ${name}…`
      : `Checking ${name}… (asked ${seconds} s ago)`,
  nameUnresolved: (name: string) =>
    `${name} doesn't resolve yet. Add this record at your DNS host; it ticks once it answers (DNS can take a few minutes).`,
  nameProxied: (name: string, address: string) =>
    `${name} answers with Cloudflare's addresses, so it's proxied, and the proxy carries pages, not streams. Set it to DNS only at Cloudflare. It ticks once it answers with ${address}.`,
  nameElsewhere: (name: string, answers: string, machine: RelayMachine) =>
    `${name} points at ${answers}, not ${machine.name}'s ${machine.address}. Change its A record. It ticks once it answers with ${machine.address}.`,
  /** What a name gives, and what skipping it gives up: the step's one line beside Skip. */
  nameWhy: (name: string) =>
    `${name} lets the stream relay answer over TLS on 443, which networks that allow only real HTTPS need. Without the name it still answers plain on 443.`,
  /** The same line with no name known yet (reached by IP or the tailnet). */
  nameWhyNone:
    "A name pointing at this machine lets the stream relay answer over TLS on 443, which networks that allow only real HTTPS need. Without one it answers plain on 443, which reaches most networks.",
  nameLabel: "DNS name",
  namePlaceholder: "turn.example.com",
  useName: "Use this name",
  notDnsName: (name: string) =>
    `${name} is not a DNS name. Give one like turn.example.com, or skip the name.`,
  record: (name: string, address: string) =>
    `${name}  A  ${address}  (DNS only, no proxy)`,
  recordLabel: "The DNS record",
  letCawCoAdd: "Let CawCo add it",
  skipName: "Skip the name",
  tokenLabel: "Cloudflare API token",
  tokenHint: (zone: string) =>
    `Made from the Edit zone DNS template, for ${zone} only. CawCo keeps it sealed and uses it for the certificate too.`,
  addRecord: "Add the record",
  addingRecord: "Adding…",
  tokenRefused: (zone: string, said: string) =>
    `Cloudflare refused the token (${said}). Make one from the Edit zone DNS template for ${zone}, then paste it again.`,
  zoneMissing: (zone: string) =>
    `Cloudflare has no zone ${zone} this token can reach. Make one from the Edit zone DNS template for ${zone}, then paste it again.`,
  recordRefused: (name: string, said: string) =>
    `Cloudflare did not add ${name} (${said}). Add the record above by hand, or paste a token that can edit its zone.`,

  router: "Open the ports on the router",
  routerAsk:
    "CawCo asks the router to open the stream relay's ports (UPnP or NAT-PMP). If it refuses, the ports to forward show here.",
  openPorts: "Open the ports",
  openingPorts: "Asking the router…",
  routerRefused:
    "Your router didn't answer UPnP or NAT-PMP. Forward these on it, then come back; the last step proves they're open.",
  routerPartial: (how: RelayMapHow) =>
    `The router opened UDP and TCP 443 (${how}) but not UDP 49152–49400. Forward that range on the router by hand; the last step proves it.`,
  forwards: forwardsOf,
  rangeForward: (lan: string) => `UDP 49152–49400 → ${lan}`,
  forwardsLabel: "The forwards to make",
  copyRecord: "Copy record",
  copyForwards: "Copy forwards",
  copyCommand: "Copy command",
  copied: "Copied",
  copyFailed: "Copy failed",
  routerDone: (how: RelayMapHow | undefined) =>
    how
      ? `Ports open on the router (${how})`
      : "Ports open on the router (by hand, proven from outside)",
  routerByHand: (proveAt: number) =>
    `Forwarded by hand · proven in step ${proveAt}`,

  runtime: (lowest: 443 | 80) =>
    lowest === 80
      ? "Let the container runtime bind 80 and 443"
      : "Let the container runtime bind 443",
  runtimeNote: (machine: string) =>
    `Run it once in a terminal on ${machine}. It holds a reboot and ticks here by itself.`,
  runtimeCommand: (lowest: 443 | 80) => lowPortsCommand(lowest),
  commandLabel: "The command",
  runtimeDone: "Low ports allowed for the runtime",

  certificate: "Issue the certificate",
  certificateRunning: (name: string) => `Asking Let's Encrypt for ${name}…`,
  certificateDone: (name: string, endsAt: number) =>
    `Certificate for ${name} · ends ${relayDay(endsAt)}`,
  retry: "Retry",

  start: "Start the stream relay",
  starting: "Starting…",
  pulling: (done: number, total: number) => `Pulling ${done} of ${total}`,
  startDone: (machine: string, named: boolean) =>
    `Live on ${machine} · ${portsWords(named)}`,
  startAgain: "Start the stream relay again",
  stoppedStep:
    "The stream relay is stopped, so streams through it don't connect. Start it again to carry them.",
  /** The hub's word while the relay's machine is away: the steps wait for it. */
  machineAway: (machine: string) =>
    `${machine} is not connected. The steps continue when it connects again.`,

  prove: "Prove it from outside",
  proveChecking: "Checking from here…",
  proveInside: (device: string, machine: string, ports: string) =>
    `Works from here (${device}, on ${machine}'s network · ${ports}). Open this from a phone off Wi‑Fi to prove it from outside.`,
  proveFailedInside: (machine: string) =>
    `No answer from the stream relay reached this screen within 8 s. This screen is on ${machine}'s own network, and many routers don't answer their own public address from inside. Open this from a phone off Wi‑Fi; it ticks here when that proves it.`,
  proveFailedOutside: (machine: string) =>
    `No answer from the stream relay reached this screen within 8 s from outside. The ports aren't reaching ${machine}: check the router's forwards, then check the stream relay again.`,
  proveRefused:
    "The stream relay answered this screen and refused its credential (401), so it holds another secret than the hub's. Start it again to give it the hub's, then check it again.",
  proveDone: (device: string, at: number, ports: string) =>
    `Works from outside · ${device}, ${relayWhen(at)} (${ports})`,
  doneForNow: "Done for now",
  checkAgain: "Check the stream relay again",

  /** Step state words for a screen reader, before a step's label. */
  stepDone: "Done:",
  stepFailed: "Failed:",
  stepWorking: "In progress:",

  entry: (domain: string) =>
    `The stream didn't connect: this screen reaches CawCo through ${domain}, which carries pages, not streams. A stream relay carries them from anywhere.`,
  /** The phone's entry (the design's 390 wireframe): why, and nothing after it. */
  entryShort: (domain: string) =>
    `The stream didn't connect: this screen reaches CawCo through ${domain}, which carries pages, not streams.`,
  setUp: "Set up the stream relay",
  later: "Set up the stream relay later",
  /** Needs you's meta line under the row: the machine it runs on, or how many could before a pick. */
  rowMeta: (machine: string | null, candidates: number) => {
    if (machine) {
      return `Onboarding · ${machine}`;
    }
    return candidates === 1
      ? "Onboarding · 1 machine can run it"
      : `Onboarding · ${candidates} machines can run it`;
  },

  /** Caw's Needs you row once the relay is live and proven: its tick and where it is seen. */
  doneRow: (where: string) =>
    `The stream relay is live at ${where}. Streams reach you anywhere.`,
  openSettings: "Open Settings › Browsers",

  certificateEnds: (endsAt: number) => `Certificate ends ${relayDay(endsAt)}`,
  provenBy: (device: string, at: number) =>
    `Proven from outside by ${device}, ${relayWhen(at)}`,
  notProven: "Not yet proven from outside · Open this on a phone off Wi‑Fi",
  addName: "Add a name",
  noName:
    "No name · plain on 443. A name lets it answer over TLS on 443 too, which networks that allow only real HTTPS need.",
  portsLabel: "Each port's answer",
  live: "Live",
  portDown: "Live, a port is down",
  stopped: "Stopped",
  failed: "Failed",

  startRelay: "Start the stream relay",
  stop: "Stop the stream relay",
  remove: "Remove the stream relay",
  stopTitle: (machine: string) => `Stop the stream relay on ${machine}?`,
  /** Why Stop the stream relay waits while it pulls or starts. */
  stopWhileStarting: "It can be stopped once it has started.",
  stopBody:
    "Streams that go through it stop connecting until it starts again; a screen on the same network as a browser's machine still connects directly.",
  removeTitle: (machine: string) => `Remove the stream relay on ${machine}?`,
  removeBody: (hostname: string | null) =>
    hostname
      ? `Streams from screens off the network of a browser's machine stop connecting, and the certificate for ${hostname} is deleted.`
      : "Streams from screens off the network of a browser's machine stop connecting.",
} as const;
