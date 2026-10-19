/**
 * The stream relay's guided journey, as the hub will hold it: the machine it
 * runs on, every step that applies in order with where each stands, and,
 * once it is live, its summary. The card (RelayJourney.svelte) draws it from
 * these alone, so every place that shows it (the browser panel's stream,
 * Caw's Needs you, Settings › Browsers) shows the same ticks.
 *
 * The words are the journey design's (relay-journey/journey-design.md, with
 * journey-ports-revision.md's diff), held here until the real build moves
 * them into core's `STREAM_RELAY_WORDS`.
 */

/** The machine the relay runs on, as step 1 found it. */
export interface RelayMachine {
  /** Its public address: an interface's, the hub's view of it, or STUN's. */
  address: string;
  /** Behind a router: its address on the router's network, for the forwards. */
  lan: string | null;
  name: string;
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
  | { step: "machine"; state: "done" }
  | {
      step: "name";
      state: "checking" | "needs" | "done" | "skipped";
      /** The name suggested, or the one that stands. */
      name: string;
      /** Seconds since the hub last asked DNS, while it checks. */
      askedAgo?: number;
      finding?: NameFinding;
      /** What the name answers instead, for `elsewhere`. */
      answers?: string;
      /** The Cloudflare token field stands open under "Let CawCo add it". */
      tokenOpen?: boolean;
    }
  | {
      step: "router";
      /** `refused`: no UPnP or NAT-PMP answered; `by-hand`: forwarded, proven only by step 7. */
      state: "waiting" | "needs" | "asking" | "refused" | "by-hand" | "done";
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
      /** The issuer's words, when it failed. */
      why?: string;
      /** When the certificate ends, "17 Jan". */
      ends?: string;
    }
  | {
      step: "start";
      state: "waiting" | "running" | "failed" | "done";
      /** "Pulling 3 of 7", while it runs. */
      progress?: string;
      why?: string;
    }
  | {
      step: "prove";
      /** `inside`: it answered from this screen, on the relay's own network. */
      state: "waiting" | "checking" | "inside" | "failed" | "done";
      /** The device that proved it and how, "iPhone on cellular". */
      device?: string;
      /** "today 14:02". */
      at?: string;
      /** The device that failed it was outside the relay's network. */
      outside?: boolean;
    };

export type RelayStepKind = RelayStep["step"];

/** One port's last STUN answer, as Settings' chips show it. */
export interface RelayPortChip {
  name: string;
  up: boolean;
}

/** The relay once it is live: Settings' summary. */
export interface RelaySummary {
  /** When the certificate ends, with a name. */
  ends: string | null;
  machine: RelayMachine;
  /** Its name, or null when the name was skipped. */
  name: string | null;
  ports: RelayPortChip[];
  /** Who proved it from outside and when, or null while nobody has. */
  proven: { device: string; at: string } | null;
}

/** What the person pressed on the card: the hub's to act on. */
export type RelayAct =
  | {
      act:
        | "set-up"
        | "later"
        | "skip-name"
        | "open-ports"
        | "retry"
        | "start-again"
        | "check-again"
        | "done-for-now"
        | "stop"
        | "remove"
        | "add-name";
    }
  | { act: "add-record"; token: string };

/** "turn.bewinxed.com" from "outpost.bewinxed.com": the name suggested under the domain the person came in by. */
export const suggestedName = (domain: string): string =>
  `turn.${domain.split(".").slice(-2).join(".")}`;

/** The registrable domain of a name, for the Cloudflare token's zone. */
export const zoneOf = (name: string): string =>
  name.split(".").slice(-2).join(".");

/** The ports the relay answers on, by whether a name stands: its chips' and its tick's words. */
export const portsWords = (named: boolean): string =>
  named ? "udp 443, tcp 443, tls" : "udp 443, tcp 443";

export const JOURNEY_WORDS = {
  leadDomain: (domain: string) =>
    `You reach CawCo through ${domain}, which carries pages, not streams. A stream relay on one of your machines carries them, from anywhere. Each step ticks by itself; the ones that need you say so.`,
  leadPlain:
    "A stream relay lets you take over a browser from anywhere: on cellular data, behind a strict firewall, through a web-only tunnel. Each step ticks by itself; the ones that need you say so.",

  machine: "Pick the machine",
  machineDone: (machine: RelayMachine) =>
    `Runs on ${machine.name} · ${machine.address}${machine.lan ? ", behind a router" : ""}`,

  name: "Point a name at it (optional)",
  nameDone: (name: string) => `${name} points at it`,
  nameSkipped: "No name · plain on 443",
  nameChecking: (name: string, askedAgo?: number) =>
    askedAgo === undefined
      ? `Checking ${name}…`
      : `Checking ${name}… (asked ${askedAgo} s ago)`,
  nameUnresolved: (name: string, address: string) =>
    `${name} doesn't resolve yet. Add an A record for it at your DNS host, DNS only (no proxy), pointing at ${address}. It ticks here once it answers; DNS can take a few minutes.`,
  nameProxied: (name: string, address: string) =>
    `${name} answers with Cloudflare's addresses, so it's proxied, and the proxy carries pages, not streams. Set it to DNS only at Cloudflare. It ticks once it answers with ${address}.`,
  nameElsewhere: (name: string, answers: string, machine: RelayMachine) =>
    `${name} points at ${answers}, not ${machine.name}'s ${machine.address}. Change its A record. It ticks once it answers with ${machine.address}.`,
  /** What a name gives, and what skipping it gives up: the step's one line beside Skip. */
  nameWhy: (name: string) =>
    `${name} lets the relay answer over TLS on 443, which networks that allow only real HTTPS need. Without it the relay still answers plain on 443.`,
  record: (name: string, address: string) =>
    `${name}  A  ${address}  (DNS only, no proxy)`,
  recordLabel: "The DNS record",
  letCawCoAdd: "Let CawCo add it",
  skipName: "Skip the name",
  tokenLabel: "Cloudflare API token",
  tokenHint: (zone: string) =>
    `Made from the Edit zone DNS template, for ${zone} only. CawCo keeps it sealed and uses it for the certificate too.`,
  addRecord: "Add the record",

  router: "Open the ports on the router",
  routerAsk: (machine: string) =>
    `${machine} is behind a router. CawCo asks it to open the relay's ports (UPnP or NAT-PMP); a router that refuses shows them here.`,
  openPorts: "Open the ports",
  openingPorts: "Asking the router…",
  routerRefused: (machine: RelayMachine) =>
    `The router didn't open the ports (no UPnP or NAT-PMP answered). Forward these on it to ${machine.name} at ${machine.lan ?? machine.address}, then come back; the last step proves they're open.`,
  forwards: (lan: string) => `UDP 443 · TCP 443 · UDP 49152–49400 → ${lan}`,
  forwardsLabel: "The forwards to make",
  routerDone: "Ports open on the router (UPnP)",
  routerByHand: (proveAt: number) =>
    `Forwarded by hand · proven in step ${proveAt}`,

  runtime: (lowest: 443 | 80) =>
    lowest === 80
      ? "Let the container runtime bind 80 and 443"
      : "Let the container runtime bind 443",
  runtimeChecking: "Checking…",
  runtimeNote: (machine: string) =>
    `Run it once in a terminal on ${machine}. It holds a reboot and ticks here by itself.`,
  runtimeCommand: (lowest: 443 | 80) =>
    `sudo sh -c 'sysctl -w net.ipv4.ip_unprivileged_port_start=${lowest} && echo net.ipv4.ip_unprivileged_port_start=${lowest} > /etc/sysctl.d/90-cawco-relay.conf'`,
  commandLabel: "The command",
  runtimeDone: "Low ports allowed for the runtime",

  certificate: "Issue the certificate",
  certificateRunning: (name: string) => `Asking Let's Encrypt for ${name}…`,
  certificateFailed: (name: string, why: string) =>
    `Let's Encrypt did not issue a certificate for ${name} (${why}). Check the token can edit ${zoneOf(name)}'s DNS, then Retry.`,
  certificateDone: (name: string, ends: string) =>
    `Certificate for ${name} · ends ${ends}`,
  retry: "Retry",

  start: "Start the relay",
  startDone: (machine: string, named: boolean) =>
    `Live on ${machine} · ${portsWords(named)}`,
  startAgain: "Start again",

  prove: "Prove it from outside",
  proveChecking: "Checking from here…",
  proveInside: (machine: string, named: boolean) =>
    `Works from here (Chrome on ${machine}'s network · ${portsWords(named)}). Open this from a phone off Wi‑Fi to prove it from outside.`,
  proveFailedInside: (machine: string) =>
    `No relay answer reached this screen within 8 s. This screen is on ${machine}'s own network, and many routers don't answer their own public address from inside. Open this from a phone off Wi‑Fi; it ticks here when that proves it.`,
  proveFailedOutside: (machine: string) =>
    `No relay answer reached this screen within 8 s from outside. The ports aren't reaching ${machine}: check the router's forwards, then press Check again.`,
  proveDone: (device: string, at: string, named: boolean) =>
    `Works from outside · ${device}, ${at} (${portsWords(named)})`,
  doneForNow: "Done for now",
  checkAgain: "Check again",

  /** Step state words for a screen reader, before a step's label. */
  stepDone: "Done:",
  stepFailed: "Failed:",
  stepWorking: "In progress:",

  entry: (domain: string) =>
    `The stream didn't connect: this screen reaches CawCo through ${domain}, which carries pages, not streams. A stream relay carries them from anywhere.`,
  setUp: "Set up the stream relay",

  summaryLine: (summary: RelaySummary) =>
    summary.name
      ? `${summary.machine.address} · ${summary.name}`
      : summary.machine.address,
  certificateEnds: (ends: string) => `Certificate ends ${ends}`,
  provenBy: (device: string, at: string) =>
    `Proven from outside by ${device}, ${at}`,
  notProven: "Not yet proven from outside · Open this on a phone off Wi‑Fi",
  addName: "Add a name",
  noName:
    "No name · plain on 443. A name lets it answer over TLS on 443 too, which networks that allow only real HTTPS need.",
  portsLabel: "Each port's answer",
  live: "Live",
  portDown: "Live, a port is down",
} as const;
