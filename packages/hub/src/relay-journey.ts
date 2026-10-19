/**
 * The stream relay's guided journey (relay-journey/journey-design.md, with
 * journey-ports-revision.md's ports): the path that brings a relay up so a
 * browser's take-over stream reaches a person on any network, through a
 * web-only domain tunnel included. One record (`stream_relay_journey`), every
 * step computed from it, the fleet and the relay as the hub has them now, and
 * pushed to every dashboard (`stream_relay.journey`), so every place that
 * draws the card (a take-over's stream, Caw's Needs you, Settings › Browsers)
 * shows the same ticks.
 *
 * Every step ticks by itself; the person acts only where a step asks:
 * 1. the machine: an interface's public address, the hub's view of it, or its
 *    router's by STUN ("behind a router"); one is picked by itself, two or
 *    more are asked;
 * 2. a name (optional): checked with `dns.resolve4` every 30 s while it
 *    stands; "Let CawCo add it" makes the record at Cloudflare with the
 *    person's token; Skip leaves the relay plain on 443;
 * 3. the router (behind one): asked to open the ports on the person's press
 *    (agent relay-router.ts); a refusal shows the forwards, ticked only by an
 *    outside proof;
 * 4. the low ports (a rootless runtime): read every 2 s while it stands;
 * 5. the certificate (with a name): by DNS with the token, else over HTTP;
 * 6. the start: the relay set up on all of it (stream-relay.ts);
 * 7. the proof: each screen proves it itself (`/api/stream-relay/try`, then
 *    `/proof`), classed inside or outside the relay's network by its public
 *    address; a fleet machine on another network proves it without the
 *    person.
 *
 * The hub never acts on a machine before one is picked.
 */
import { createHash } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import { CAWCO_ENV, readEnv } from "@cawco/core";
import { pageOrigin } from "@cawco/core/browser-gate";
import { isPublicAddress, plainAddress } from "@cawco/core/public-address";
import {
  type NameFinding,
  portNameOf,
  RELAY_DNS_NAME,
  RELAY_LOW_PORTS,
  RELAY_MAP,
  RELAY_PROVE,
  type RelayAct,
  type RelayAnswer,
  type RelayCandidate,
  type RelayChoice,
  type RelayJourneyView,
  type RelayLowPorts,
  type RelayMachine,
  type RelayMapped,
  type RelayProofReport,
  type RelayStep,
  type RelaySummary,
  type RelayTry,
  STREAM_RELAY_WORDS,
  streamRelayUrls,
  suggestedName,
  zoneOf,
} from "@cawco/core/stream-relay";
import { Elysia, t } from "elysia";
import {
  addRecord,
  isCloudflareAddress,
  verifyToken,
  zoneId,
} from "./cloudflare";
import type { StoredJourney, StoredProof, StreamRelayDb } from "./db/stream-relay";
import {
  candidateOf,
  type RelayCall,
  type RelayFleetMachine,
  RelayRefusal,
  type StreamRelay,
} from "./stream-relay";

/** How often the journey looks again at everything it checks by itself. */
const TICK_MS = 2000;
/** How often the name is asked of DNS while its step stands. */
const NAME_MS = 30_000;
/** How long a proof's credential is good. */
const TRY_MS = 60_000;
/** How long the router has to open every port: the listener, then the range port by port. */
const MAP_MS = 180_000;
/** How long a low-ports read, and a fleet machine's proof, may take. */
const READ_MS = 8000;
/** How often a fleet machine on another network is asked to prove the relay, until one has. */
const FLEET_PROOF_MS = 60_000;
/** How long a certificate's issue waits before it is tried again after its machine was away. */
const AWAY_MS = 30_000;

/** Who asked: a device and the public address it asked from, when it had one. */
export interface RelayAsker {
  /** The public address the request came from: Cloudflare's word for it through a proxy, else the socket's. */
  address: string | null;
  /** The domain the page reached CawCo through, through a proxy; null by IP, the tailnet or a name of the hub's. */
  domain: string | null;
  device: { id: string; name: string };
}

export interface RelayJourneyDeps {
  call: RelayCall;
  db: StreamRelayDb;
  /** The hub's own machine, listed first when two or more machines could run the relay. */
  hubMachineId: () => string | null;
  machines: () => RelayFleetMachine[];
  /** The view changed: every dashboard hears it. */
  publish: (view: RelayJourneyView) => void;
  relay: StreamRelay;
}

export interface RelayJourney {
  act: (act: RelayAct, asker: RelayAsker) => Promise<void>;
  /** The machine connected: a router mapping it held is asked for again (its leases lived in its agent). */
  connected: (machineId: string) => void;
  /** Something the journey reads changed (the relay's record, a machine's report): looked at again now. */
  changed: () => void;
  proof: (report: RelayProofReport, asker: RelayAsker) => void;
  /** The person's Cloudflare token, for a renewal by DNS. */
  token: () => string | null;
  /** A credential for this screen's proof; a refusal while the relay is not live. */
  try: (asker: RelayAsker) => RelayTry;
  view: () => RelayJourneyView;
  /** The tick; the returned function ends it. */
  watch: () => () => void;
}

/** A DNS answer the name check reads: the addresses, or none. */
const resolve4 = async (name: string): Promise<string[]> => {
  const resolver = new Resolver({ timeout: 5000, tries: 2 });
  const server = readEnv(CAWCO_ENV.relayDns);
  if (server) {
    resolver.setServers([server]);
  }
  try {
    return await resolver.resolve4(name);
  } catch {
    return [];
  }
};

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** A step's own entry, by kind. */
type StepOf<K extends RelayStep["step"]> = Extract<RelayStep, { step: K }>;

export const createRelayJourney = (deps: RelayJourneyDeps): RelayJourney => {
  const { db, relay, call } = deps;

  /** What the name check last found, for the name it asked. */
  let nameCheck: {
    name: string;
    askedAt: number;
    finding: NameFinding;
    answers?: string;
  } | null = null;
  let nameAsking = false;
  /** Cloudflare's refusal of the token or the record, in its words. */
  let tokenWhy: string | undefined;
  let routerAsking = false;
  /** The machine's last low-ports read, for the machine and the port it was read for; `failed` when the machine refused the read (no runtime, not Linux). */
  let lowRead:
    | { machineId: string; lowest: number; read: RelayLowPorts | "failed" }
    | null = null;
  let lowAsking = false;
  let certifying = false;
  /** When a certificate's issue last found its machine away. */
  let certAwayAt = 0;
  let starting = false;
  let fleetProving = false;
  let fleetProvedAt = 0;
  let published = "";
  let refreshing = false;

  const machineName = (machineId: string): string =>
    deps.machines().find((one) => one.machineId === machineId)?.name ??
    machineId;

  const candidates = (): RelayCandidate[] => {
    const hub = deps.hubMachineId();
    return deps
      .machines()
      .flatMap((one) => candidateOf(one) ?? [])
      .sort((a, b) => Number(b.machineId === hub) - Number(a.machineId === hub));
  };

  /** The machine picked, its address as the fleet reaches it now (as last found when it reports none). */
  const machineOf = (
    journey: StoredJourney,
    found: RelayCandidate[]
  ): { machine: RelayMachine; candidate: RelayCandidate | undefined } | null => {
    if (!journey.machineId) {
      return null;
    }
    const candidate = found.find((one) => one.machineId === journey.machineId);
    return {
      candidate,
      machine: {
        name: machineName(journey.machineId),
        address: candidate?.address ?? journey.address ?? "",
        lan: candidate ? candidate.lan : journey.lan,
      },
    };
  };

  /** The relay's record, when it is the one this journey's settings make. */
  const relayFor = (journey: StoredJourney, named: boolean) => {
    const stored = relay.read();
    return stored &&
      stored.machineId === journey.machineId &&
      stored.hostname === (named ? journey.name : null)
      ? stored
      : null;
  };

  const outsideProofs = (proofs: StoredProof[]): StoredProof[] =>
    proofs
      .filter((one) => one.outside && one.ports.length > 0)
      .sort((a, b) => b.at - a.at);

  /** Every step that applies, in order, and what the journey can do next by itself. */
  const compute = (
    journey: StoredJourney
  ): {
    steps: RelayStep[];
    machine: RelayMachine | null;
    candidate: RelayCandidate | undefined;
    found: RelayCandidate[];
    eligibleCert: boolean;
    eligibleStart: boolean;
    lowest: 443 | 80;
    named: boolean;
    startDone: boolean;
    proved: boolean;
  } => {
    const found = candidates();
    const picked = machineOf(journey, found);
    const machine = picked?.machine ?? null;
    const named = journey.nameState !== "skipped";
    const name = journey.name ?? "";
    const dns = !!journey.cloudflareToken;
    const http = named && !dns;
    const lowest: 443 | 80 = http ? 80 : 443;
    const proofs = db.proofs();
    const outside = outsideProofs(proofs);
    const steps: RelayStep[] = [];

    // 1 · The machine.
    if (machine) {
      steps.push({ step: "machine", state: "done" });
    } else if (found.length === 0) {
      steps.push({ step: "machine", state: "none" });
    } else {
      steps.push({
        step: "machine",
        state: "needs",
        choices: found.map(
          (one): RelayChoice => ({
            machineId: one.machineId,
            name: one.name,
            address: one.address,
            lan: one.lan,
            online: one.online,
          })
        ),
      });
    }

    // 2 · The name.
    const nameStep = ((): StepOf<"name"> => {
      if (!machine) {
        return { step: "name", state: "waiting", name };
      }
      if (journey.nameState === "skipped") {
        return { step: "name", state: "skipped", name };
      }
      if (journey.nameState === "pointed") {
        return { step: "name", state: "done", name };
      }
      if (!name) {
        return {
          step: "name",
          state: "needs",
          name,
          ...(tokenWhy ? { tokenWhy } : {}),
        };
      }
      if (nameCheck?.name !== name) {
        return { step: "name", state: "checking", name };
      }
      return {
        step: "name",
        state: "needs",
        name,
        askedAt: nameCheck.askedAt,
        finding: nameCheck.finding,
        ...(nameCheck.answers ? { answers: nameCheck.answers } : {}),
        ...(tokenWhy ? { tokenWhy } : {}),
      };
    })();
    steps.push(nameStep);
    const nameDone = nameStep.state === "done" || nameStep.state === "skipped";

    // 3 · The router, behind one. Its tick by hand comes only from outside.
    const relayNow = machine ? relayFor(journey, named) : null;
    const startLive = relayNow?.state === "live";
    let routerOk = true;
    if (machine?.lan) {
      const routerStep = ((): StepOf<"router"> => {
        if (journey.router === "mapped") {
          return {
            step: "router",
            state: "done",
            ...(journey.routerHow ? { how: journey.routerHow } : {}),
          };
        }
        if (journey.router === "partial" || journey.router === "refused") {
          if (outside.length > 0) {
            return {
              step: "router",
              state: "done",
              ...(journey.router === "partial" && journey.routerHow
                ? { how: journey.routerHow }
                : {}),
            };
          }
          if (startLive) {
            return { step: "router", state: "by-hand" };
          }
          return {
            step: "router",
            state: journey.router,
            ...(journey.routerHow ? { how: journey.routerHow } : {}),
            ...(http ? { http } : {}),
          };
        }
        return {
          step: "router",
          state: routerAsking ? "asking" : "needs",
          ...(http ? { http } : {}),
        };
      })();
      routerOk = !(
        routerStep.state === "needs" || routerStep.state === "asking"
      );
      steps.push(routerStep);
    }

    // 4 · The low ports, on a rootless runtime; known once its machine read them.
    let runtimeOk = true;
    if (machine && journey.machineId) {
      const read =
        lowRead?.machineId === journey.machineId ? lowRead : null;
      const absent =
        read?.read === "failed" ||
        (read?.read !== undefined && !read.read.rootless);
      if (!absent) {
        const allowed =
          (journey.lowPorts && (!read || read.lowest <= lowest)) ||
          (read?.read !== "failed" &&
            read?.read.allowed === true &&
            read.lowest <= lowest);
        let state: StepOf<"runtime">["state"] = "needs";
        if (allowed) {
          state = "done";
        } else if (!read || read.lowest !== lowest) {
          state = "checking";
        }
        runtimeOk = state === "done";
        steps.push({ step: "runtime", state, lowest });
      }
    }

    // 5 · The certificate, with a name: over HTTP once the router is asked.
    const certDone =
      named &&
      journey.certificateName === name &&
      journey.certificateEndsAt !== null;
    const eligibleCert =
      !!machine &&
      named &&
      nameDone &&
      runtimeOk &&
      (!http || routerOk) &&
      !certDone;
    if (named) {
      let certStep: StepOf<"certificate"> = {
        step: "certificate",
        state: "waiting",
      };
      if (certDone) {
        certStep = {
          step: "certificate",
          state: "done",
          endsAt: journey.certificateEndsAt as number,
        };
      } else if (certifying) {
        certStep = { step: "certificate", state: "running" };
      } else if (journey.certificateWhy && eligibleCert) {
        certStep = {
          step: "certificate",
          state: "failed",
          why: journey.certificateWhy,
        };
      }
      steps.push(certStep);
    }

    // 6 · The start, once everything above it stands.
    const eligibleStart =
      !!machine && nameDone && routerOk && runtimeOk && (!named || certDone);
    const startStep = ((): StepOf<"start"> => {
      if (!(eligibleStart || relayNow)) {
        return { step: "start", state: "waiting" };
      }
      if (starting) {
        return { step: "start", state: "running", progress: STREAM_RELAY_WORDS.starting };
      }
      if (!relayNow) {
        return { step: "start", state: "waiting" };
      }
      switch (relayNow.state) {
        case "live":
          return { step: "start", state: "done" };
        case "failed":
          return {
            step: "start",
            state: "failed",
            why: relayNow.why ?? STREAM_RELAY_WORDS.failed,
            ...(relayNow.whyCommand ? { command: relayNow.whyCommand } : {}),
          };
        case "stopped":
          return {
            step: "start",
            state: "failed",
            why: STREAM_RELAY_WORDS.stoppedStep,
          };
        default: {
          const pulled = relay.progress();
          return {
            step: "start",
            state: "running",
            progress: pulled
              ? STREAM_RELAY_WORDS.pulling(pulled.done, pulled.total)
              : STREAM_RELAY_WORDS.starting,
          };
        }
      }
    })();
    steps.push(startStep);
    const startDone = startStep.state === "done";

    // 7 · The proof.
    const proveStep = ((): StepOf<"prove"> => {
      if (!startDone) {
        return { step: "prove", state: "waiting" };
      }
      const [best] = outside;
      if (best) {
        return {
          step: "prove",
          state: "done",
          device: best.device,
          at: best.at,
          ports: best.ports.join(", "),
        };
      }
      const [latest] = [...proofs].sort((a, b) => b.at - a.at);
      if (latest && latest.ports.length === 0) {
        return {
          step: "prove",
          state: "failed",
          device: latest.device,
          at: latest.at,
          outside: latest.outside,
          ...(latest.refused ? { refused: true } : {}),
        };
      }
      const inside = proofs.find((one) => one.ports.length > 0);
      if (inside) {
        return {
          step: "prove",
          state: "inside",
          device: inside.device,
          at: inside.at,
          ports: inside.ports.join(", "),
        };
      }
      return { step: "prove", state: "waiting" };
    })();
    steps.push(proveStep);

    return {
      steps,
      machine,
      candidate: picked?.candidate,
      found,
      eligibleCert,
      eligibleStart,
      lowest,
      named,
      startDone,
      proved: proveStep.state === "done",
    };
  };

  /** The live relay's summary: from the first time this journey had it live, or a relay set up before any journey. */
  const summaryOf = (journey: StoredJourney | null): RelaySummary | null => {
    const stored = relay.read();
    if (!stored || (journey && journey.liveAt === null)) {
      return null;
    }
    const proven = outsideProofs(db.proofs())[0];
    const pulled = relay.progress();
    return {
      machine: {
        name: machineName(stored.machineId),
        address: stored.address,
        lan: journey?.machineId === stored.machineId ? journey.lan : null,
      },
      name: stored.hostname,
      endsAt:
        journey?.certificateName === stored.hostname
          ? journey.certificateEndsAt
          : null,
      ports:
        stored.state === "live"
          ? stored.health.map((one) => ({
              name: one.port,
              up: one.up,
              ...(one.error ? { error: one.error } : {}),
            }))
          : [],
      proven: proven ? { device: proven.device, at: proven.at } : null,
      state: stored.state,
      why: stored.why,
      whyCommand: stored.whyCommand,
      ...(pulled
        ? { progress: STREAM_RELAY_WORDS.pulling(pulled.done, pulled.total) }
        : {}),
    };
  };

  const view = (): RelayJourneyView => {
    const journey = db.journey();
    const stored = relay.read();
    const urls =
      stored?.state === "live"
        ? streamRelayUrls(stored.address, stored.hostname)
        : [];
    if (!journey) {
      return {
        open: false,
        asks: false,
        done: false,
        machine: null,
        candidates: candidates().length,
        steps: [],
        summary: summaryOf(null),
        urls,
      };
    }
    const computed = compute(journey);
    const done = computed.startDone && computed.proved;
    return {
      open: true,
      asks: journey.closed === null && !done,
      done,
      machine: computed.machine,
      candidates: computed.found.length,
      steps: computed.steps,
      summary: summaryOf(journey),
      urls,
    };
  };

  const publish = (): void => {
    const now = view();
    const text = JSON.stringify(now);
    if (text !== published) {
      published = text;
      deps.publish(now);
    }
  };

  /* -------------------------------------------------------------- */
  /* What the journey does by itself                                  */
  /* -------------------------------------------------------------- */

  const checkName = async (name: string, address: string): Promise<void> => {
    nameAsking = true;
    try {
      const answers = await resolve4(name);
      const askedAt = Date.now();
      if (answers.includes(address)) {
        db.journeyUpdate({ nameState: "pointed" });
        nameCheck = null;
        return;
      }
      if (answers.length === 0) {
        nameCheck = { name, askedAt, finding: "unresolved" };
        return;
      }
      const proxied = (
        await Promise.all(answers.map((one) => isCloudflareAddress(one)))
      ).some(Boolean);
      nameCheck = proxied
        ? { name, askedAt, finding: "proxied" }
        : { name, askedAt, finding: "elsewhere", answers: answers[0] };
    } finally {
      nameAsking = false;
    }
  };

  const readLowPorts = async (
    machineId: string,
    lowest: number
  ): Promise<void> => {
    lowAsking = true;
    try {
      const read = await call(machineId, RELAY_LOW_PORTS, [{ lowest }], READ_MS);
      if (read.kind === "unanswered") {
        return;
      }
      if (!read.value.ok) {
        lowRead = { machineId, lowest, read: "failed" };
        return;
      }
      const ports = read.value.result as RelayLowPorts;
      lowRead = { machineId, lowest, read: ports };
      const journey = db.journey();
      if (journey && journey.lowPorts !== ports.allowed) {
        db.journeyUpdate({ lowPorts: ports.allowed });
      }
    } finally {
      lowAsking = false;
    }
  };

  const certify = async (journey: StoredJourney): Promise<void> => {
    const { machineId, name } = journey;
    if (!(machineId && name)) {
      return;
    }
    certifying = true;
    publish();
    try {
      const endsAt = await relay.certify(machineId, {
        hostname: name,
        ...(journey.cloudflareToken
          ? { cloudflareToken: journey.cloudflareToken }
          : {}),
      });
      db.journeyUpdate({
        certificateName: name,
        certificateEndsAt: endsAt,
        certificateWhy: null,
      });
    } catch (error) {
      if (error instanceof RelayRefusal && error.status === 503) {
        // Its machine is away or slow: tried again once it is back.
        certAwayAt = Date.now();
      } else {
        db.journeyUpdate({ certificateWhy: said(error) });
      }
    } finally {
      certifying = false;
    }
  };

  const start = async (
    journey: StoredJourney,
    machine: RelayMachine,
    candidate: RelayCandidate | undefined,
    named: boolean
  ): Promise<void> => {
    if (!journey.machineId) {
      return;
    }
    starting = true;
    db.proofsForget();
    publish();
    try {
      await relay.setup({
        machineId: journey.machineId,
        address: machine.address,
        externalIp: candidate?.externalIp ?? null,
        hostname: named ? journey.name : null,
      });
    } catch (error) {
      console.warn(`[relay-journey] the relay did not start: ${said(error)}`);
    } finally {
      starting = false;
    }
  };

  /** A fleet machine on another network than the relay's proves it, without the person. */
  const fleetProve = async (relayAddress: string, relayMachine: string, urls: string[]): Promise<void> => {
    const away = deps.machines().find((one) => {
      if (!one.online || one.machineId === relayMachine) {
        return false;
      }
      const reached = candidateOf(one)?.address ?? one.seen;
      return (
        reached !== undefined &&
        isPublicAddress(reached) &&
        plainAddress(reached) !== relayAddress
      );
    });
    if (!away) {
      return;
    }
    fleetProving = true;
    try {
      const read = await call(away.machineId, RELAY_PROVE, [{ urls }], READ_MS);
      if (read.kind === "answered" && read.value.ok) {
        const answered = read.value.result as string[];
        if (answered.length > 0) {
          db.proved({
            deviceId: `machine:${away.machineId}`,
            device: away.name,
            address: candidateOf(away)?.address ?? away.seen ?? null,
            outside: true,
            ports: [...new Set(answered.map(portNameOf))],
            refused: false,
            at: Date.now(),
          });
        }
      }
    } finally {
      fleetProving = false;
      fleetProvedAt = Date.now();
    }
  };

  /** One look at everything: what it can do by itself now is started, and the view sent when it changed. */
  const refresh = async (): Promise<void> => {
    const journey = db.journey();
    if (!journey) {
      publish();
      return;
    }
    const computed = compute(journey);
    const { machine, candidate, found } = computed;
    const now = Date.now();
    // One machine could run it: it is the one.
    if (!journey.machineId && found.length === 1 && found[0]) {
      pick(found[0]);
      publish();
      return;
    }
    // The address it is reached at moved (a new lease at the ISP): kept.
    if (
      machine &&
      candidate &&
      (journey.address !== candidate.address || journey.lan !== candidate.lan)
    ) {
      db.journeyUpdate({ address: candidate.address, lan: candidate.lan });
    }
    const steps = new Map(computed.steps.map((step) => [step.step, step]));
    const nameStep = steps.get("name") as StepOf<"name"> | undefined;
    if (
      machine &&
      journey.machineId &&
      !nameAsking &&
      journey.nameState === "open" &&
      journey.name &&
      (nameCheck?.name !== journey.name || now - nameCheck.askedAt >= NAME_MS) &&
      nameStep &&
      (nameStep.state === "checking" || nameStep.state === "needs")
    ) {
      checkName(journey.name, machine.address).catch((error: unknown) =>
        console.warn(`[relay-journey] ${journey.name} not asked: ${said(error)}`)
      );
    }
    const runtime = steps.get("runtime") as StepOf<"runtime"> | undefined;
    if (
      journey.machineId &&
      !lowAsking &&
      (runtime === undefined
        ? lowRead?.machineId !== journey.machineId
        : runtime.state !== "done")
    ) {
      readLowPorts(journey.machineId, computed.lowest).catch(() => undefined);
    }
    if (
      computed.eligibleCert &&
      !certifying &&
      !journey.certificateWhy &&
      now - certAwayAt >= AWAY_MS
    ) {
      certify(journey).catch(() => undefined);
    }
    const startStep = steps.get("start") as StepOf<"start"> | undefined;
    if (
      machine &&
      computed.eligibleStart &&
      !starting &&
      !relayFor(journey, computed.named)
    ) {
      start(journey, machine, candidate, computed.named).catch(() => undefined);
    }
    if (startStep?.state === "done" && journey.liveAt === null) {
      db.journeyUpdate({ liveAt: now });
    }
    const stored = relay.read();
    if (
      startStep?.state === "done" &&
      stored &&
      !computed.proved &&
      !fleetProving &&
      now - fleetProvedAt >= FLEET_PROOF_MS
    ) {
      fleetProve(
        stored.address,
        stored.machineId,
        streamRelayUrls(stored.address, stored.hostname)
      ).catch(() => undefined);
    }
    publish();
  };

  const tick = (): void => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    refresh()
      .catch((error: unknown) =>
        console.warn(`[relay-journey] not looked at: ${said(error)}`)
      )
      .finally(() => {
        refreshing = false;
      });
  };

  /* -------------------------------------------------------------- */
  /* What the person does                                             */
  /* -------------------------------------------------------------- */

  const pick = (candidate: RelayCandidate): void => {
    db.journeyUpdate({
      machineId: candidate.machineId,
      address: candidate.address,
      lan: candidate.lan,
      router: null,
      routerHow: null,
      lowPorts: false,
    });
    lowRead = null;
    nameCheck = null;
  };

  const openPorts = async (journey: StoredJourney): Promise<void> => {
    const machineId = journey.machineId;
    const lan = journey.lan;
    if (!(machineId && lan)) {
      throw new RelayRefusal(409, "The relay's machine is not behind a router.");
    }
    routerAsking = true;
    publish();
    try {
      const read = await call(
        machineId,
        RELAY_MAP,
        [{ lan, http: journey.nameState !== "skipped" && !journey.cloudflareToken }],
        MAP_MS
      );
      if (read.kind === "unanswered") {
        throw new RelayRefusal(503, STREAM_RELAY_WORDS.machineAway(machineName(machineId)));
      }
      if (!read.value.ok) {
        throw new RelayRefusal(409, read.value.error ?? "The router was not asked.");
      }
      const mapped = read.value.result as RelayMapped;
      let router: StoredJourney["router"] = "refused";
      if (mapped.listener) {
        router = mapped.range ? "mapped" : "partial";
      }
      db.journeyUpdate({ router, routerHow: mapped.how });
    } finally {
      routerAsking = false;
    }
  };

  /** Let CawCo add it: the token checked, the zone found, the record made DNS only; the token kept sealed once it reaches the zone. */
  const addTheRecord = async (journey: StoredJourney, token: string): Promise<void> => {
    const name = journey.name;
    const address = journey.address;
    const zone = name ? zoneOf(name) : null;
    if (!(name && address && zone)) {
      throw new RelayRefusal(409, "The relay has no name with a zone to add yet.");
    }
    tokenWhy = undefined;
    const verified = await verifyToken(token);
    if (!verified.ok) {
      tokenWhy = STREAM_RELAY_WORDS.tokenRefused(zone, verified.said);
      return;
    }
    const found = await zoneId(token, zone);
    if (!found.ok) {
      tokenWhy = STREAM_RELAY_WORDS.tokenRefused(zone, found.said);
      return;
    }
    if (!found.value) {
      tokenWhy = STREAM_RELAY_WORDS.zoneMissing(zone);
      return;
    }
    // It reaches the zone: kept, for the certificate's DNS challenge too.
    db.journeyUpdate({ cloudflareToken: token, certificateWhy: null });
    const made = await addRecord(token, found.value, name, address);
    if (!made.ok) {
      tokenWhy = STREAM_RELAY_WORDS.recordRefused(name, made.said);
      return;
    }
    // Cloudflare holds it DNS only, pointing at the machine: it stands.
    db.journeyUpdate({ nameState: "pointed" });
    nameCheck = null;
  };

  const act = async (act: RelayAct, asker: RelayAsker): Promise<void> => {
    const journey = db.journey();
    if (act.act === "set-up") {
      db.journeyOpen(asker.domain);
      db.asked();
      const opened = db.journey();
      if (opened && !opened.name && opened.nameState === "open") {
        const suggestion = suggestedName(asker.domain ?? opened.domain ?? "");
        if (suggestion) {
          db.journeyUpdate({ name: suggestion });
        }
      }
      return;
    }
    if (act.act === "later" && !journey) {
      db.asked();
      return;
    }
    if (!journey) {
      throw new RelayRefusal(404, "The stream relay is not set up yet: press Set up first.");
    }
    switch (act.act) {
      case "later":
      case "done-for-now":
        db.journeyUpdate({ closed: act.act });
        db.asked();
        return;
      case "pick": {
        const candidate = candidates().find((one) => one.machineId === act.machineId);
        if (!candidate) {
          throw new RelayRefusal(
            409,
            `${machineName(act.machineId)} can't run the relay: the internet reaches it nowhere the hub knows.`
          );
        }
        pick(candidate);
        return;
      }
      case "name": {
        const name = act.name.trim().toLowerCase();
        if (!RELAY_DNS_NAME.test(name)) {
          throw new RelayRefusal(400, STREAM_RELAY_WORDS.notDnsName(name || act.name));
        }
        db.journeyUpdate({ name, nameState: "open" });
        nameCheck = null;
        tokenWhy = undefined;
        return;
      }
      case "skip-name":
        db.journeyUpdate({ nameState: "skipped" });
        return;
      case "add-name": {
        const suggestion = suggestedName(asker.domain ?? journey.domain ?? "");
        db.journeyUpdate({
          nameState: "open",
          name: journey.name ?? suggestion,
          closed: null,
        });
        nameCheck = null;
        return;
      }
      case "add-record":
        await addTheRecord(journey, act.token.trim());
        return;
      case "open-ports":
        await openPorts(journey);
        return;
      case "retry":
        db.journeyUpdate({ certificateWhy: null });
        return;
      case "start-again":
      case "start": {
        const stored = relay.read();
        if (stored && stored.machineId === journey.machineId) {
          await relay.start();
        }
        return;
      }
      case "stop":
        await relay.stop();
        return;
      case "remove":
        await relay.remove();
        db.journeyForget();
        nameCheck = null;
        tokenWhy = undefined;
        lowRead = null;
        return;
      case "check-again":
        return;
      default:
        throw new RelayRefusal(400, `No such act: ${JSON.stringify(act)}`);
    }
  };

  /**
   * Whether a screen asked from outside the relay's network: the public
   * address the relay's own STUN answer saw it at (`seenAs`) differs from the
   * relay's; without one, the address its request came from. An address
   * that is no public one (the LAN, the tailnet) and no STUN answer can't be
   * told outside: it counts as inside, and no outside tick comes of it.
   */
  const outsideOf = (
    seenAs: string | null,
    address: string | null,
    relayAddress: string
  ): boolean => {
    const from = [seenAs, address].find(
      (one): one is string => one !== null && isPublicAddress(one)
    );
    return from !== undefined && plainAddress(from) !== relayAddress;
  };

  return {
    view,
    token: () => db.journey()?.cloudflareToken ?? null,
    changed: tick,
    connected: (machineId) => {
      const journey = db.journey();
      if (journey?.machineId === machineId && journey.router && journey.router !== "refused") {
        openPorts(journey).catch((error: unknown) =>
          console.warn(`[relay-journey] the router was not asked again: ${said(error)}`)
        );
      }
      tick();
    },
    act: async (one, asker) => {
      try {
        await act(one, asker);
      } finally {
        tick();
      }
    },
    try: (asker) => {
      const minted = relay.mint(`proof:${asker.device.id}`, TRY_MS);
      if (!(minted && relay.read()?.state === "live")) {
        throw new RelayRefusal(409, "The stream relay is not live yet, so there is nothing to prove.");
      }
      return minted;
    },
    proof: (report, asker) => {
      const stored = relay.read();
      if (!stored) {
        throw new RelayRefusal(409, "The fleet has no stream relay to prove.");
      }
      const urls = streamRelayUrls(stored.address, stored.hostname);
      db.proved({
        deviceId: asker.device.id,
        device: asker.device.name,
        address: report.seenAs ?? asker.address,
        outside: outsideOf(report.seenAs, asker.address, stored.address),
        ports: [...new Set(report.answered.filter((url) => urls.includes(url)).map(portNameOf))],
        refused: report.refused.length > 0 && report.answered.length === 0,
        at: Date.now(),
      });
      tick();
    },
    watch: () => {
      tick();
      const timer = setInterval(tick, TICK_MS);
      timer.unref();
      return () => clearInterval(timer);
    },
  };
};

/* ------------------------------------------------------------------ */
/* Through a domain                                                     */
/* ------------------------------------------------------------------ */

/** The headers a proxy in front adds: a TLS terminator's scheme, Cloudflare's client address and ray (developers.cloudflare.com/fundamentals/reference/http-headers/). */
const PROXY_HEADERS = ["x-forwarded-proto", "cf-connecting-ip", "cf-ray"];

/**
 * The domain a request reached CawCo through, when it came through a proxy:
 * it carries one of {@link PROXY_HEADERS} and its page's host is none of the
 * hub's own names (`own`) and no address. Null otherwise.
 */
export const domainOf = (headers: Headers, own: readonly string[]): string | null => {
  if (!PROXY_HEADERS.some((name) => headers.has(name))) {
    return null;
  }
  const origin = pageOrigin(Object.fromEntries(headers));
  let host: string;
  try {
    host = new URL(origin ?? "").hostname.toLowerCase();
  } catch {
    return null;
  }
  const bare = host.replace(/^\[|\]$/g, "");
  if (!bare || isIP(bare) !== 0 || own.includes(bare)) {
    return null;
  }
  return bare;
};

/** The public address a request came from: Cloudflare's word for it through a proxy, the first forwarded hop, else the socket's. */
export const askedFrom = (headers: Headers, socket: string | null): string | null => {
  const through =
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-cawco-client-address") ??
    socket;
  return through ? plainAddress(through) : null;
};

/** A browser's own key, for a device the hub has no pairing for (a trusted hub): its agent's words, hashed. */
export const browserKey = (userAgent: string | null): string =>
  `browser:${createHash("sha256").update(userAgent ?? "").digest("hex").slice(0, 16)}`;

/** Answers a refusal with its status and sentence; anything else goes on as an error. */
const refused = (error: unknown): Response => {
  if (error instanceof RelayRefusal) {
    return new Response(error.message, { status: error.status });
  }
  throw error;
};

const ACT_BODY = t.Union([
  t.Object({
    act: t.Union(
      (
        [
          "set-up",
          "later",
          "skip-name",
          "add-name",
          "open-ports",
          "retry",
          "start-again",
          "check-again",
          "done-for-now",
          "start",
          "stop",
          "remove",
        ] as const
      ).map((one) => t.Literal(one))
    ),
  }),
  t.Object({ act: t.Literal("add-record"), token: t.String({ minLength: 1, maxLength: 200 }) }),
  t.Object({ act: t.Literal("pick"), machineId: t.String({ minLength: 1 }) }),
  t.Object({ act: t.Literal("name"), name: t.String({ maxLength: 253 }) }),
]);

/**
 * `GET /api/stream-relay` (the journey, with the asking page's domain),
 * `POST /api/stream-relay/act` (one {@link RelayAct}), `GET
 * /api/stream-relay/try` (a 60 s credential for this screen's proof) and
 * `POST /api/stream-relay/proof` (what it found). Every one is the
 * person's: hub-auth.ts lists none for sessions.
 */
export const relayJourneyRoutes = (
  journey: RelayJourney,
  askerOf: (request: Request, socket: string | null) => RelayAsker,
  socketOf: (request: Request, server: unknown) => string | null
) => {
  const answer = (asker: RelayAsker): RelayAnswer => ({
    domain: asker.domain,
    journey: journey.view(),
  });
  return new Elysia()
    .get("/api/stream-relay", ({ request, server }) =>
      answer(askerOf(request, socketOf(request, server)))
    )
    .post(
      "/api/stream-relay/act",
      { body: ACT_BODY },
      async ({ body, request, server }) => {
        const asker = askerOf(request, socketOf(request, server));
        try {
          await journey.act(body as RelayAct, asker);
          return answer(asker);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get("/api/stream-relay/try", ({ request, server }) => {
      try {
        return journey.try(askerOf(request, socketOf(request, server)));
      } catch (error) {
        return refused(error);
      }
    })
    .post(
      "/api/stream-relay/proof",
      {
        body: t.Object({
          answered: t.Array(t.String(), { maxItems: 8 }),
          refused: t.Array(t.String(), { maxItems: 8 }),
          seenAs: t.Union([t.String({ maxLength: 64 }), t.Null()]),
        }),
      },
      ({ body, request, server }) => {
        const asker = askerOf(request, socketOf(request, server));
        try {
          journey.proof(body, asker);
          return answer(asker);
        } catch (error) {
          return refused(error);
        }
      }
    );
};
