/** The stream relay's words. */

import {
  type RelayMachine,
  type RuntimeStep,
  STREAM_RELAY_PORT,
  STREAM_RELAY_TLS_PORT,
  zoneOf,
} from "../stream-relay";

/** The ports the relay answers on, by whether a name stands: its chips' and its tick's words. */
const portsWords = (named: boolean): string =>
  named ? "udp 3478, tcp 3478, tls 5349" : "udp 3478, tcp 3478";

/** "17 Jan": a certificate's end, in this screen's zone. */
const relayDay = (at: number): string =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    at
  );

/** "today 14:02", else "17 Jan, 14:02": when a proof landed, in this screen's zone. */
const relayWhen = (at: number, now = Date.now()): string => {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
  const same = new Date(at).toDateString() === new Date(now).toDateString();
  return same ? `today ${time}` : `${relayDay(at)}, ${time}`;
};

/** The forwards to make on a router, as one line to copy: the plain listener and the TLS one. */
const forwardsOf = (lan: string): string =>
  `UDP ${STREAM_RELAY_PORT} · TCP ${STREAM_RELAY_PORT} · TCP ${STREAM_RELAY_TLS_PORT} → ${lan}`;

/* ------------------------------------------------------------------ */
/* Words                                                                */
/* ------------------------------------------------------------------ */

/**
 * The stream relay's words: the journey's card wherever it is drawn (a
 * take-over's stream place, Caw's Needs you, Settings › Browsers), Caw's
 * setup card, and the summary, alike (DESIGN.md, Voice). From the
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
  none: `No machine of yours is reached from the internet yet. Add one (a small server at a host works), or forward UDP and TCP ${STREAM_RELAY_PORT} and TCP ${STREAM_RELAY_TLS_PORT} on your router to a machine here, then come back.`,
  runHere: "Run the stream relay here",
  behindRouter: "behind a router",
  offline: "offline",

  name: "Point a name at it (optional)",
  nameDone: (name: string) => `${name} points at it`,
  nameSkipped: `No name · plain on ${STREAM_RELAY_PORT}`,
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
    `${name} lets the stream relay answer over TLS on ${STREAM_RELAY_TLS_PORT} too, for networks that pass only encrypted traffic. Its certificate comes through Cloudflare's DNS, so ${zoneOf(name) ?? name} must be on Cloudflare. Without the name it answers plain on ${STREAM_RELAY_PORT}.`,
  /** The same line with no name known yet (reached by IP or the tailnet). */
  nameWhyNone: `A name pointing at this machine lets the stream relay answer over TLS on ${STREAM_RELAY_TLS_PORT} too, for networks that pass only encrypted traffic; its certificate comes through Cloudflare's DNS, so the name's zone must be on Cloudflare. Without one it answers plain on ${STREAM_RELAY_PORT}, which reaches most networks.`,
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

  router: "Forward the ports on the router",
  routerNote: "The last step proves they're open from outside.",
  forwards: forwardsOf,
  forwardsLabel: "The forwards to make",
  copyRecord: "Copy record",
  copyForwards: "Copy forwards",
  copyCommand: "Copy command",
  copied: "Copied",
  copyFailed: "Copy failed",
  routerDone: "Ports forwarded on the router · proven from outside",

  /** The runtime step's label while it stands: its VM's forwarder must carry UDP as well as TCP. */
  runtime: "Let the container runtime forward UDP and TCP",
  /** Above the step's command: what the forwarder is short of, then how the command runs. */
  runtimeNote: (step: RuntimeStep, machine: string) =>
    `${step.need ? `${step.need.why} ` : ""}Run it once in a terminal on ${machine}. It holds a reboot and ticks here by itself.`,
  runtimeCommand: (step: RuntimeStep) => step.need?.command ?? "",
  commandLabel: "The command",
  runtimeDone: "The container runtime forwards UDP and TCP",

  certificate: "Issue the certificate",
  /** The certificate step with no token: how it is issued, what the token needs, and the way out. */
  certificateToken: (name: string) => {
    const zone = zoneOf(name) ?? name;
    return `The certificate for ${name} is issued through Cloudflare's DNS, never over a port of this machine, so it needs ${zone} on Cloudflare and a Cloudflare API token that can edit its DNS. Paste one, or skip the name to run plain on ${STREAM_RELAY_PORT}.`;
  },
  useToken: "Use this token",
  checkingToken: "Checking…",
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
  noName: `No name · plain on ${STREAM_RELAY_PORT}. A name on Cloudflare lets it answer over TLS on ${STREAM_RELAY_TLS_PORT} too, for networks that pass only encrypted traffic.`,
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
