/**
 * The stream relay journey's sheet (Component Story Format 3, live
 * components): every state of the guided set-up from the journey design,
 * on the owner's own setup (obelisk at 37.211.158.28 behind a router at
 * 192.168.1.20, reached through outpost.bewinxed.com, the relay's name
 * turn.bewinxed.com). Each state stands twice: in Settings › Browsers at
 * 1440 and in Caw's panel or on a phone at 390. The meta's args are every
 * story's; a story's own args are what it changes. The model is core's
 * (stream-relay.ts), as the hub sends it.
 */
import {
  type RelayStep,
  type RelaySummary,
  suggestedName,
} from "@cawco/core/stream-relay";
import RelayJourney from "./RelayJourney.svelte";

const machine = {
  name: "obelisk",
  address: "37.211.158.28",
  lan: "192.168.1.20",
};
const name = "turn.bewinxed.com";
/** 17 Jan 2027, 10:00 UTC: the certificate's end. */
const ENDS = Date.UTC(2027, 0, 17, 10);
/** Today, 14:02: when the phone proved it. */
const PROVEN = (() => {
  const at = new Date();
  at.setHours(14, 2, 0, 0);
  return at.getTime();
})();

/** Steps 1 to 7 as they stand once the person picked obelisk. */
const path = (
  over: Partial<Record<RelayStep["step"], RelayStep>>
): RelayStep[] =>
  (
    [
      { step: "machine", state: "done" },
      { step: "name", state: "checking", name, askedAt: Date.now() - 4000 },
      { step: "router", state: "waiting" },
      { step: "runtime", state: "checking" },
      { step: "certificate", state: "waiting" },
      { step: "start", state: "waiting" },
      { step: "prove", state: "waiting" },
    ] satisfies RelayStep[]
  ).map((step) => over[step.step] ?? step);

const ticked = {
  name: { step: "name", state: "done", name },
  router: { step: "router", state: "done", how: "UPnP" },
  runtime: { step: "runtime", state: "done" },
  certificate: { step: "certificate", state: "done", endsAt: ENDS },
  start: { step: "start", state: "done" },
} satisfies Partial<Record<RelayStep["step"], RelayStep>>;

const proven: RelaySummary = {
  machine,
  name,
  ports: [
    { name: "udp 3478", up: true },
    { name: "tcp 3478", up: true },
    { name: "tls 5349", up: true },
  ],
  endsAt: ENDS,
  proven: { device: "CawCo on iPhone", at: PROVEN },
  state: "live",
  why: null,
  whyCommand: null,
};

export default {
  title: "Browsers/Stream relay journey",
  component: RelayJourney,
  args: {
    view: "journey",
    domain: "outpost.bewinxed.com",
    machine,
    candidates: 1,
    steps: path({}),
    summary: null,
  },
};

const start = { view: "start", machine: null, steps: [] };
/** Settings › Browsers before anyone set it up: why, and Set up. */
export const SetUp = { args: start, parameters: { viewport: 1440 } };
/** Settings › Browsers before anyone set it up, on a phone. */
export const SetUpPhone = { args: start, parameters: { viewport: 390 } };

const pick = {
  machine: null,
  candidates: 2,
  steps: [
    {
      step: "machine",
      state: "needs",
      choices: [
        { machineId: "m-obelisk", online: true, ...machine },
        {
          machineId: "m-vps",
          name: "falkenstein-vps",
          address: "2a01:4f8:c17:3b2a:0:0:0:1",
          lan: null,
          online: false,
        },
      ],
    },
    { step: "name", state: "waiting", name },
    { step: "certificate", state: "waiting" },
    { step: "start", state: "waiting" },
    { step: "prove", state: "waiting" },
  ] satisfies RelayStep[],
};
/** 1 · Two machines could run it: one row each, Run the relay here. */
export const PickMachine = { args: pick, parameters: { viewport: 1440 } };
/** 1 · The pick, as Caw's Needs you row: "2 machines can run it". */
export const PickMachinePhone = {
  args: { ...pick, row: true },
  parameters: { viewport: 390 },
};

const checking = { steps: path({}) };
/** A · Checking: just started through the domain; obelisk ticked, the name and the runtime being checked. */
export const Checking = { args: checking, parameters: { viewport: 1440 } };
/** A · Checking, in Caw's panel or on a phone. */
export const CheckingPhone = { args: checking, parameters: { viewport: 390 } };

const needsYou = {
  steps: path({
    name: { step: "name", state: "needs", name, finding: "unresolved" },
    certificate: { step: "certificate", state: "needs" },
  }),
};
/** B · Needs you: the name doesn't resolve yet and the certificate needs a token; the name, first, is the one open. */
export const NeedsYou = { args: needsYou, parameters: { viewport: 1440 } };
/** B · Needs you as Caw's Needs you row, with its onboarding meta line. */
export const NeedsYouPhone = {
  args: { ...needsYou, row: true },
  parameters: { viewport: 390 },
};

const noDomain = {
  domain: null,
  steps: path({
    name: { step: "name", state: "needs", name: "" },
  }),
};
/** B · Reached by IP or the tailnet: no name known, the field asks for one, Skip beside it. */
export const NameField = { args: noDomain, parameters: { viewport: 1440 } };
/** B · No name known, on a phone. */
export const NameFieldPhone = { args: noDomain, parameters: { viewport: 390 } };

const tokenRefused = {
  steps: path({
    name: {
      step: "name",
      state: "needs",
      name,
      finding: "proxied",
      tokenWhy:
        "Cloudflare refused the token (Invalid API Token, code 1000). Make one from the Edit zone DNS template for bewinxed.com, then paste it again.",
    },
  }),
};
/** B · The name proxied at Cloudflare, and Cloudflare refused the token: its words under the field. */
export const TokenRefused = {
  args: tokenRefused,
  parameters: { viewport: 1440 },
};
/** B · The token refused, on a phone. */
export const TokenRefusedPhone = {
  args: tokenRefused,
  parameters: { viewport: 390 },
};

const certificateToken = {
  steps: path({
    name: ticked.name,
    router: ticked.router,
    runtime: ticked.runtime,
    certificate: { step: "certificate", state: "needs" },
  }),
};
/** B · The name pointed by hand: the certificate is issued only through Cloudflare's DNS, so its step asks for the token, Skip the name beside it. */
export const CertificateToken = {
  args: certificateToken,
  parameters: { viewport: 1440 },
};
/** B · The certificate's token, on a phone. */
export const CertificateTokenPhone = {
  args: certificateToken,
  parameters: { viewport: 390 },
};

const certificateTokenRefused = {
  steps: path({
    name: ticked.name,
    router: ticked.router,
    runtime: ticked.runtime,
    certificate: {
      step: "certificate",
      state: "needs",
      tokenWhy:
        "Cloudflare has no zone bewinxed.com this token can reach. Make one from the Edit zone DNS template for bewinxed.com, then paste it again.",
    },
  }),
};
/** B · The certificate's token refused: Cloudflare's words under the field. */
export const CertificateTokenRefused = {
  args: certificateTokenRefused,
  parameters: { viewport: 1440 },
};

const forwarder = {
  steps: path({
    name: ticked.name,
    runtime: {
      step: "runtime",
      state: "needs",
      need: {
        why: "Colima forwards only TCP from its VM, and the stream relay needs UDP and TCP 3478: switch it to its forwarder that carries both.",
        command: "colima stop && colima start --port-forwarder grpc",
      },
    },
  }),
};
/** B · On a Mac with Colima: its ssh forwarder carries TCP alone; the grpc one to switch to, once, on obelisk. */
export const ColimaForwarder = {
  args: forwarder,
  parameters: { viewport: 1440 },
};
/** B · Colima's forwarder, on a phone. */
export const ColimaForwarderPhone = {
  args: forwarder,
  parameters: { viewport: 390 },
};

const routerAsks = {
  steps: path({
    name: ticked.name,
    router: { step: "router", state: "needs" },
    runtime: ticked.runtime,
  }),
};
/** B′ · The router step stands: CawCo asks the router only once Open the ports is pressed. */
export const RouterAsks = { args: routerAsks, parameters: { viewport: 1440 } };
/** B′ · The router step, in Caw's panel or on a phone. */
export const RouterAsksPhone = {
  args: routerAsks,
  parameters: { viewport: 390 },
};

const routerRefused = {
  steps: path({
    name: ticked.name,
    router: { step: "router", state: "refused" },
    runtime: ticked.runtime,
  }),
};
/** B′ · The router refused: the forwards to make by hand, proven by the last step. */
export const RouterRefused = {
  args: routerRefused,
  parameters: { viewport: 1440 },
};
/** B′ · The router refused, in Caw's panel or on a phone. */
export const RouterRefusedPhone = {
  args: routerRefused,
  parameters: { viewport: 390 },
};

const nameSkipped = {
  steps: path({
    name: { step: "name", state: "skipped", name },
    router: ticked.router,
    runtime: ticked.runtime,
    start: { step: "start", state: "running", progress: "Pulling 3 of 7" },
  }).filter((step) => step.step !== "certificate"),
};
/** B″ · The name skipped: no certificate step, the relay plain on 3478, pulling. */
export const NameSkipped = {
  args: nameSkipped,
  parameters: { viewport: 1440 },
};
/** B″ · The name skipped, in Caw's panel or on a phone. */
export const NameSkippedPhone = {
  args: nameSkipped,
  parameters: { viewport: 390 },
};

const certificateFailed = {
  steps: path({
    ...ticked,
    certificate: {
      step: "certificate",
      state: "failed",
      why: "Let's Encrypt did not issue a certificate for turn.bewinxed.com (DNS problem: NXDOMAIN looking up TXT). Check the token can edit bewinxed.com's DNS, then Retry.",
    },
    start: { step: "start", state: "waiting" },
  }),
};
/** C · Failed: Let's Encrypt refused the certificate; it stands in place with Retry. */
export const CertificateFailed = {
  args: certificateFailed,
  parameters: { viewport: 1440 },
};
/** C · Failed, in Caw's panel or on a phone. */
export const CertificateFailedPhone = {
  args: certificateFailed,
  parameters: { viewport: 390 },
};

const provenInside = {
  steps: path({
    ...ticked,
    prove: {
      step: "prove",
      state: "inside",
      device: "Chrome on Linux",
      ports: "udp 3478, tcp 3478, tls 5349",
    },
  }),
};
/** D · Live, proven only from inside: open it from a phone off Wi‑Fi. */
export const ProvenInside = {
  args: provenInside,
  parameters: { viewport: 1440 },
};
/** D · Proven only from inside, in Caw's panel or on a phone. */
export const ProvenInsidePhone = {
  args: provenInside,
  parameters: { viewport: 390 },
};

const proveRefused = {
  steps: path({
    ...ticked,
    prove: { step: "prove", state: "failed", outside: true, refused: true },
  }),
};
/** D · The relay refused this screen's credential (a 401): not unreachable, and Check again. */
export const ProveRefused = {
  args: proveRefused,
  parameters: { viewport: 1440 },
};

const live = { view: "summary", summary: proven };
/** D · Proven from outside: the card becomes the live relay's summary. */
export const Live = { args: live, parameters: { viewport: 1440 } };
/** D · The summary, on a phone. */
export const LivePhone = { args: live, parameters: { viewport: 390 } };

const stopped = {
  view: "summary",
  summary: { ...proven, state: "stopped", ports: [] },
};
/** D · Stopped by the person: Start relay in Stop's place, Remove beside it. */
export const Stopped = { args: stopped, parameters: { viewport: 1440 } };

const entry = { view: "entry" };
/** E · The take-over's stream failed through the domain: why, and Set up, which unfolds the journey here. */
export const StreamFailed = { args: entry, parameters: { viewport: 1440 } };
/** E · The stream failed, on a phone. */
export const StreamFailedPhone = { args: entry, parameters: { viewport: 390 } };

const noName = {
  view: "summary",
  summary: {
    ...proven,
    name: null,
    endsAt: null,
    ports: proven.ports.slice(0, 2),
  },
};
/** F · Settings › Browsers with no name: plain on 3478, and Add a name. */
export const NoName = { args: noName, parameters: { viewport: 1440 } };
/** F · No name, on a phone. */
export const NoNamePhone = { args: noName, parameters: { viewport: 390 } };

/** Needs you's ticked row, in Caw's panel: live at turn.bewinxed.com, and Settings › Browsers to open. */
export const DonePhone = {
  args: { view: "done", summary: proven, row: true },
  parameters: { viewport: 390 },
};

/** Reached through a .co.uk domain: the name and the token's zone under northwind-logistics.co.uk, not co.uk. */
const coUk = "relay.northwind-logistics.co.uk";

/** B · Needs you through a .co.uk domain, with a long machine name and an IPv6 address, the token field open, at 390. */
export const LongNamesPhone = {
  args: {
    domain: coUk,
    row: true,
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
        tokenWhy:
          "Cloudflare has no zone northwind-logistics.co.uk this token can reach. Make one from the Edit zone DNS template for northwind-logistics.co.uk, then paste it again.",
      },
      router: { step: "router", state: "refused" },
      certificate: { step: "certificate", state: "needs" },
    }),
  },
  parameters: { viewport: 390 },
};
