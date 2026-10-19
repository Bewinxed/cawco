/**
 * The stream relay journey's sheet (Component Story Format 3, live
 * components): every state of the guided set-up from the journey design,
 * on the owner's own setup (obelisk at 37.211.158.28 behind a router at
 * 192.168.1.20, reached through outpost.bewinxed.com, the relay's name
 * turn.bewinxed.com). Each state stands twice: in Settings › Browsers at
 * 1440 and in Caw's panel or on a phone at 390. The meta's args are every
 * story's; a story's own args are what it changes.
 */
import { type RelayStep, type RelaySummary, suggestedName } from "./journey.js";
import RelayJourney from "./RelayJourney.svelte";

const machine = {
  name: "obelisk",
  address: "37.211.158.28",
  lan: "192.168.1.20",
};
const name = "turn.bewinxed.com";

/** Steps 1 to 7 as they stand once the person picked obelisk. */
const path = (
  over: Partial<Record<RelayStep["step"], RelayStep>>
): RelayStep[] =>
  (
    [
      { step: "machine", state: "done" },
      { step: "name", state: "checking", name, askedAgo: 4 },
      { step: "router", state: "waiting" },
      { step: "runtime", state: "checking", lowest: 443 },
      { step: "certificate", state: "waiting" },
      { step: "start", state: "waiting" },
      { step: "prove", state: "waiting" },
    ] satisfies RelayStep[]
  ).map((step) => over[step.step] ?? step);

const ticked = {
  name: { step: "name", state: "done", name },
  router: { step: "router", state: "done" },
  runtime: { step: "runtime", state: "done", lowest: 443 },
  certificate: { step: "certificate", state: "done", ends: "17 Jan" },
  start: { step: "start", state: "done" },
} satisfies Partial<Record<RelayStep["step"], RelayStep>>;

const proven: RelaySummary = {
  machine,
  name,
  ports: [
    { name: "udp 443", up: true },
    { name: "tcp 443", up: true },
    { name: "tls", up: true },
  ],
  ends: "17 Jan",
  proven: { device: "iPhone on cellular", at: "today 14:02" },
};

const desk = { viewport: 1440 };
const phone = { viewport: 390 };

export default {
  title: "Browsers/Stream relay journey",
  component: RelayJourney,
  args: {
    view: "journey",
    domain: "outpost.bewinxed.com",
    machine,
    steps: path({}),
    summary: null,
  },
};

const checking = { steps: path({}) };
/** A · Checking: just started through the domain; obelisk ticked, the name and the low ports being checked. */
export const Checking = { args: checking, parameters: desk };
/** A · Checking, in Caw's panel or on a phone. */
export const CheckingPhone = { args: checking, parameters: phone };

const needsYou = {
  steps: path({
    name: { step: "name", state: "needs", name, finding: "unresolved" },
    runtime: { step: "runtime", state: "needs", lowest: 443 },
  }),
};
/** B · Needs you: the name doesn't resolve yet and the low ports need the command; the name, first, is the one open. */
export const NeedsYou = { args: needsYou, parameters: desk };
/** B · Needs you as Caw's Needs you row, with its onboarding meta line. */
export const NeedsYouPhone = {
  args: { ...needsYou, row: true },
  parameters: phone,
};

const lowPorts = {
  steps: path({
    name: ticked.name,
    runtime: { step: "runtime", state: "needs", lowest: 443 },
  }),
};
/** B · The name ticked; the low ports stand: the command to run once on obelisk. */
export const LowPorts = { args: lowPorts, parameters: desk };
/** B · The low ports, on a phone: the command clamped to two lines, Copy command takes it whole. */
export const LowPortsPhone = { args: lowPorts, parameters: phone };

const routerAsks = {
  steps: path({
    name: ticked.name,
    router: { step: "router", state: "needs" },
    runtime: ticked.runtime,
  }),
};
/** B′ · The router step stands: CawCo asks the router only once Open the ports is pressed. */
export const RouterAsks = { args: routerAsks, parameters: desk };
/** B′ · The router step, in Caw's panel or on a phone. */
export const RouterAsksPhone = { args: routerAsks, parameters: phone };

const routerRefused = {
  steps: path({
    name: ticked.name,
    router: { step: "router", state: "refused" },
    runtime: ticked.runtime,
  }),
};
/** B′ · The router refused: the forwards to make by hand, proven by the last step. */
export const RouterRefused = { args: routerRefused, parameters: desk };
/** B′ · The router refused, in Caw's panel or on a phone. */
export const RouterRefusedPhone = { args: routerRefused, parameters: phone };

const nameSkipped = {
  steps: path({
    name: { step: "name", state: "skipped", name },
    router: ticked.router,
    runtime: ticked.runtime,
    start: { step: "start", state: "running", progress: "Pulling 3 of 7" },
  }).filter((step) => step.step !== "certificate"),
};
/** B″ · The name skipped: no certificate step, the relay plain on 443, pulling. */
export const NameSkipped = { args: nameSkipped, parameters: desk };
/** B″ · The name skipped, in Caw's panel or on a phone. */
export const NameSkippedPhone = { args: nameSkipped, parameters: phone };

const certificateFailed = {
  steps: path({
    ...ticked,
    certificate: {
      step: "certificate",
      state: "failed",
      why: "DNS problem: NXDOMAIN looking up TXT",
    },
    start: { step: "start", state: "waiting" },
  }),
};
/** C · Failed: Let's Encrypt refused the certificate; it stands in place with Retry. */
export const CertificateFailed = { args: certificateFailed, parameters: desk };
/** C · Failed, in Caw's panel or on a phone. */
export const CertificateFailedPhone = {
  args: certificateFailed,
  parameters: phone,
};

const provenInside = {
  steps: path({
    ...ticked,
    prove: { step: "prove", state: "inside" },
  }),
};
/** D · Live, proven only from inside: open it from a phone off Wi‑Fi. */
export const ProvenInside = { args: provenInside, parameters: desk };
/** D · Proven only from inside, in Caw's panel or on a phone. */
export const ProvenInsidePhone = { args: provenInside, parameters: phone };

const live = { view: "summary", summary: proven };
/** D · Proven from outside: the card becomes the live relay's summary. */
export const Live = { args: live, parameters: desk };
/** D · The summary, on a phone. */
export const LivePhone = { args: live, parameters: phone };

const entry = { view: "entry" };
/** E · The take-over's stream failed through the domain: why, and Set up, which unfolds the journey here. */
export const StreamFailed = { args: entry, parameters: desk };
/** E · The stream failed, on a phone. */
export const StreamFailedPhone = { args: entry, parameters: phone };

const noName = {
  view: "summary",
  summary: {
    ...proven,
    name: null,
    ends: null,
    ports: proven.ports.slice(0, 2),
  },
};
/** F · Settings › Browsers with no name: plain on 443, and Add a name. */
export const NoName = { args: noName, parameters: desk };
/** F · No name, on a phone. */
export const NoNamePhone = { args: noName, parameters: phone };

/** Needs you's ticked row, in Caw's panel: live at turn.bewinxed.com, and Settings › Browsers to open. */
export const DonePhone = {
  args: { view: "done", summary: proven, row: true },
  parameters: phone,
};

/** Reached through a .co.uk domain: the name and the token's zone under northwind-logistics.co.uk, not co.uk. */
const coUk = "relay.northwind-logistics.co.uk";

/** B · Needs you through a .co.uk domain, with a long machine name and an IPv6 address, the token field open, at 390. */
export const LongNamesPhone = {
  args: {
    domain: coUk,
    machine: {
      name: "build-runner-eu-west-02-obelisk-backup",
      address: "2a01:4f8:c17:3b2a:0:0:0:1",
      lan: "192.168.100.200",
    },
    steps: path({
      name: {
        step: "name",
        state: "needs",
        name: suggestedName(coUk) ?? "",
        finding: "elsewhere",
        answers: "203.0.113.9",
        tokenOpen: true,
      },
      router: { step: "router", state: "refused" },
      runtime: { step: "runtime", state: "needs", lowest: 443 },
    }),
  },
  parameters: phone,
};
