/**
 * The container host: a browser as a neko container (our image, built on
 * the machine) with its Chromium profile on a named volume of its own,
 * `cawco-browser-<owner>-<slug>`, so a project's sign-ins outlive the
 * container. Its container and volume carry two labels: its key, and the
 * agent whose records keep it (state.ts `browserOwner`). Every agent of a
 * machine has the machine's id, so a machine browser's key is theirs alike;
 * on one runtime each finds, makes and removes its own alone.
 * neko's HTTP and Chromium's DevTools are published on 127.0.0.1 alone; the
 * media port, UDP and TCP, on every address, advertised with the machine's
 * own addresses so a screen on the LAN or the tailnet connects directly.
 * Where the runtime gives it a namespace of its own (native rootless Podman
 * 5.3 or later with pasta, egress.ts `placementOf`), a container stands in
 * one (`NetworkMode: "pasta"`), made from the machine's network at each of
 * its starts, and reaches the relay of its own machine at
 * `host.containers.internal`; the machine's network at its start is kept in
 * its record, and it is started again when that no longer holds
 * (browsers.ts `followNetwork`). On every other runtime it stands on the
 * runtime's media network at its slot's address (media-network.ts), where
 * the stream relay's coturn stands too on the relay's machine. Its relay URLs
 * are composed for this machine (relay-urls.ts).
 *
 * The media port is published for what the runtime forwards
 * (media-forwarding.ts), measured once the container is live, and a
 * container the host forwards less for is made again to match before it is
 * live. TCP alone (Colima on its ssh forwarder): neko's UDP mux is left
 * unset, and with a TCP mux and no ephemeral range neko enables only TCP
 * network types (webrtc/manager.go), so it advertises no UDP candidate
 * nobody could reach. Nothing forwarded (Colima's `none`): nothing is
 * published, and both muxes stay set inside the container, so neko enables
 * UDP and TCP network types and gathers relay candidates from every TURN URL
 * (pion/ice's `relayNetworkTypesForURL` keeps a URL only for network types of
 * its own transport). With neither mux, neko would fall back to the ephemeral
 * range 59000-59100 over UDP alone, and no `transport=tcp` or `turns:` URL
 * would relay.
 */
import { randomBytes } from "node:crypto";
import { readWithin } from "@cawco/core/bounded";
import type { BrowserKey, BrowserRelay } from "@cawco/core/browser";
import {
  BROWSER_SCREEN,
  BROWSER_SLOTS,
  browserPorts,
  browserSlug,
} from "@cawco/core/browser";
import type { MediaPath } from "@cawco/core/capabilities";
import { lookUntil } from "@cawco/core/effect/poll";
import { stunServer } from "@cawco/core/env-ports";
import { machineId } from "@cawco/core/machine-id";
import {
  bootId,
  markerIsLive,
  type ProcessMarker,
  processStart,
} from "@cawco/core/process-identity";
import { DAY_MS } from "@cawco/core/time";
import type Docker from "dockerode";
import { Effect } from "effect";
import { z } from "zod";
import { type BluezBus, standBluezBus, stopBluezBus } from "./bluez-bus";
import {
  doorBind,
  doorOrigins,
  doorSpki,
  doorTarget,
  openDoor,
} from "./dashboard-door";
import { statusOf } from "./docker-status";
import { machineNetwork, type Placement, placementOf } from "./egress";
import { hubPacUrl } from "./hub-pac";
import { ensureImage } from "./image";
import {
  carriesLess,
  machineAddresses,
  measureMedia,
  mediaForwarding,
  mediaProtocols,
  recordMeasurement,
} from "./media-forwarding";
import {
  ensureMediaNetwork,
  MEDIA_NETWORK,
  type MediaNetwork,
  onMediaNetwork,
  relayMediaAddress,
  slotAddress,
  slotHost,
} from "./media-network";
import { passkeyInjector, vhciAvailable } from "./passkey-inject";
import { machineHostOf, wantedHostRules } from "./preview-names";
import { relayKeyOf, relayUrlsFor } from "./relay-urls";
import type { Runtime } from "./runtime";
import {
  type BrowserHost,
  type BrowserRecord,
  browserOwner,
  httpAnswers,
  type MachineNetwork,
  type Progress,
  portsOf,
} from "./state";

/**
 * The virtual BLE adapter, up before Chromium starts, and BlueZ's bus for
 * the container (bluez-bus.ts), through which Chromium finds it: a WebAuthn
 * dialog offers a phone or tablet only when it finds an adapter present
 * (passkey-inject.ts `ensureAdapter`). Without either the browser starts all
 * the same, with no passkey relay.
 */
const standAdapter = async (key: BrowserKey): Promise<BluezBus | undefined> => {
  if (!vhciAvailable()) {
    return;
  }
  await keepAdapter(key);
  return standBluezBus(key);
};

/**
 * The virtual BLE adapter made when it is not up, for `who` (a browser's
 * key, or the agent's containers that ran on past its restart). The adapter
 * is the agent's own (its `/dev/vhci` handle) and goes as the agent stops,
 * where a container's Chromium and its bus outlive the agent
 * (bluez-bus.ts): Chromium takes an adapter that appears on BlueZ as its own.
 */
export const keepAdapter = async (who: string): Promise<void> => {
  if (!vhciAvailable()) {
    return;
  }
  await passkeyInjector.ensureAdapter().catch((error: unknown) => {
    console.warn(
      `[browser] ${who}: no virtual BLE adapter, so no passkey relay: ${error instanceof Error ? error.message : String(error)}`
    );
  });
};

/** Where a container in a namespace of its own reaches the machine, and so the relay on it: pasta's `--map-guest-addr`, Podman 5.3 on. */
const MACHINE_FROM_PASTA = "host.containers.internal";

/** The image's repository on the machine. */
const IMAGE = "cawco-browser";

/** The label every browser container and volume carries: its key. */
const BROWSER_LABEL = "dev.cawco.browser";

/** The label naming the agent whose records keep a browser's container and volume (state.ts `browserOwner`). */
const OWNER_LABEL = "dev.cawco.browser.owner";

/** How long a container has to answer once started. */
const LIVE_MS = 90_000;
const LIVE_POLL_MS = 250;

/** A browser whose relay credential lapses within this is started with a fresh one. */
export const RELAY_RENEW_MS = DAY_MS;

/** How long neko has to answer a login. */
const LOGIN_MS = 5000;

/** How long a Chromium restarted in its running container has to answer DevTools before the container is restarted. */
const CHROMIUM_MS = 20_000;

/** How long a stop gives the container before the runtime kills it. */
const STOP_SECONDS = 10;

/** What a member may do in neko: an admin (the daemon) and a viewer (the person, through the hub). */
const PROFILE = {
  name: "",
  can_login: true,
  can_connect: true,
  can_watch: true,
  can_host: true,
  can_share_media: false,
  can_access_clipboard: true,
  sends_inactive_cursor: false,
  can_see_inactive_cursors: false,
};

const password = (): string => randomBytes(24).toString("base64url");

/** A browser's container and volume name on the runtime: its owner's and its key's. */
const nameOf = (owner: string, key: BrowserKey): string =>
  `cawco-browser-${owner}-${browserSlug(key)}`;

/** The labels a browser's container and volume carry. */
const labelsOf = (owner: string, key: BrowserKey): Record<string, string> => ({
  [BROWSER_LABEL]: key,
  [OWNER_LABEL]: owner,
});

/** What neko answers a login with. */
const NekoLogin = z.object({
  id: z.string().optional(),
  token: z.string().optional(),
});

/** The runtime's not-found answer, taken as gone. */
const absent = (error: unknown): void => {
  if (statusOf(error) !== 404) {
    throw error;
  }
};

/**
 * What `owner` holds on `docker`, for `key` alone when it is named: its
 * containers' ids and its volumes' names. The runtime filters on the one
 * owner label, and the key is matched here, so no runtime's way of combining
 * two label filters decides what is found.
 */
const ownedBy = async (
  docker: Docker,
  owner: string,
  key?: BrowserKey
): Promise<{ containers: string[]; volumes: string[] }> => {
  const filters = { label: [`${OWNER_LABEL}=${owner}`] };
  const ours = (labels: Record<string, string> | undefined) =>
    key === undefined || labels?.[BROWSER_LABEL] === key;
  const containers = await docker.listContainers({ all: true, filters });
  const { Volumes } = await docker.listVolumes({ filters });
  return {
    containers: containers
      .filter((one) => ours(one.Labels))
      .map((one) => one.Id),
    volumes: (Volumes ?? [])
      .filter((one) => ours(one.Labels))
      .map((one) => one.Name),
  };
};

/** Removes the containers {@link ownedBy} names, and the ids in `also`, keeping every volume. */
const removeContainers = async (
  docker: Docker,
  owner: string,
  key: BrowserKey,
  also: (string | undefined)[] = []
): Promise<void> => {
  const { containers } = await ownedBy(docker, owner, key);
  const ids = new Set([
    ...containers,
    ...also.filter((id): id is string => !!id),
  ]);
  await Promise.all(
    [...ids].map((id) =>
      docker.getContainer(id).remove({ force: true }).catch(absent)
    )
  );
};

/**
 * Removes everything {@link ownedBy} names, containers first (a volume in
 * use cannot go): an agent's own browsers on a runtime, by its label alone.
 */
const removeOwned = async (
  docker: Docker,
  owner: string,
  key?: BrowserKey
): Promise<void> => {
  const { containers, volumes } = await ownedBy(docker, owner, key);
  await Promise.all(
    containers.map((id) =>
      docker.getContainer(id).remove({ force: true }).catch(absent)
    )
  );
  await Promise.all(
    volumes.map((name) => docker.getVolume(name).remove().catch(absent))
  );
};

/** The relay as neko is given it: the credential, at the URLs composed for this machine. */
interface NekoRelay {
  credential: string;
  urls: string[];
  username: string;
}

/** The env neko starts with. */
const nekoEnv = (
  record: BrowserRecord,
  passwords: { admin: string; user: string },
  relay: NekoRelay | undefined,
  media: MediaPath,
  addresses: string[],
  stun: string
): string[] => {
  const port = portsOf(record).media;
  return [
    `NEKO_DESKTOP_SCREEN=${BROWSER_SCREEN.width}x${BROWSER_SCREEN.height}@30`,
    "NEKO_SERVER_BIND=0.0.0.0:8080",
    "NEKO_SERVER_CORS=",
    "NEKO_MEMBER_PROVIDER=multiuser",
    `NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=${passwords.admin}`,
    `NEKO_MEMBER_MULTIUSER_USER_PASSWORD=${passwords.user}`,
    `NEKO_MEMBER_MULTIUSER_ADMIN_PROFILE=${JSON.stringify({ ...PROFILE, is_admin: true, can_see_inactive_cursors: true })}`,
    `NEKO_MEMBER_MULTIUSER_USER_PROFILE=${JSON.stringify({ ...PROFILE, is_admin: false })}`,
    "NEKO_SESSION_LOCKED_CONTROLS=true",
    "NEKO_SESSION_IMPLICIT_HOSTING=false",
    "NEKO_SESSION_COOKIE_ENABLED=false",
    "NEKO_SESSION_MERCIFUL_RECONNECT=true",
    "NEKO_CAPTURE_VIDEO_CODEC=vp8",
    "NEKO_WEBRTC_ICELITE=false",
    // UDP only where it is forwarded; both inside a container nothing is
    // forwarded to, so its relay candidates come over either transport.
    ...(media === "tcp" ? [] : [`NEKO_WEBRTC_UDPMUX=${port}`]),
    `NEKO_WEBRTC_TCPMUX=${port}`,
    // A list, space-separated: viper hands the env's string to cast's
    // ToStringSlice, which splits it with strings.Fields.
    ...(addresses.length ? [`NEKO_WEBRTC_NAT1TO1=${addresses.join(" ")}`] : []),
    // Always named: with neither list set neko gives both
    // stun.l.google.com:19302 (server/internal/config/webrtc.go, "add default
    // stun server if none are configured"), a server no one chose. Its own
    // candidates come from the relay, at the URLs composed for this machine
    // (relay-urls.ts), and the fleet's STUN server; each viewer's list is the
    // hub's, put in the offer it relays (hub browser-routes.ts), so neko
    // gives none of its own.
    `NEKO_WEBRTC_ICESERVERS_BACKEND=${JSON.stringify([
      ...(relay ? [relay] : []),
      { urls: [stun] },
    ])}`,
    "NEKO_WEBRTC_ICESERVERS_FRONTEND=[]",
  ];
};

/** When a relay credential lapses: its username is `<expiry, s>:<who>` (the TURN REST API scheme). */
const relayExpiry = (relay: BrowserRelay): number | undefined => {
  const seconds = Number(relay.username.split(":")[0]);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
};

/**
 * Whether `record`'s container was made as a start asks now: the same image,
 * published on the record's ports, the media port published for what the
 * runtime forwards now, at its slot's address on the media network or in a
 * namespace of its own as the runtime places it (one made on the media
 * network is made again in its own), made with the STUN server named now and
 * the preview names' rules found now (preview-names.ts), BlueZ's bus as it
 * is given now (bluez-bus.ts), and its relay
 * credential, for the same relay, good for a day more (or no relay asked
 * for). Otherwise a new one is made on the same volume, with the credential
 * just minted. One made before it named its STUN server has neko's own
 * default in it, and is made again.
 */
const keptAsAsked = (
  record: BrowserRecord,
  now: {
    image: string;
    media: MediaPath;
    /** Its slot's address on the media network; none in a namespace of its own. */
    address: string | undefined;
    hostRules: string | undefined;
    pac: string;
    /** Its dashboard door as its Chromium and socat are told it (dashboard-door.ts). */
    door: { spki: string; target: string };
    /** The host path bound for BlueZ's bus (bluez-bus.ts); none when it has none. */
    bluez: string | undefined;
  },
  relay: BrowserRelay | undefined
): boolean => {
  const kept = record.container;
  const published = portsOf(record);
  const relayHolds =
    !relay ||
    (record.relayKey === relayKeyOf(relay) &&
      (record.relayExpiresAt ?? 0) > Date.now() + RELAY_RENEW_MS);
  return (
    !!kept &&
    kept.image === now.image &&
    kept.media === now.media &&
    kept.address === now.address &&
    kept.ports?.http === published.http &&
    kept.ports?.devtools === published.devtools &&
    kept.ports?.media === published.media &&
    kept.stun === stunServer() &&
    kept.hostRules === now.hostRules &&
    kept.pac === now.pac &&
    kept.door?.spki === now.door.spki &&
    kept.door?.target === now.door.target &&
    kept.bluez === now.bluez &&
    relayHolds
  );
};

/**
 * `container` as its record keeps it: with the machine's network it
 * `started` on where it stands in a namespace of its own, and none
 * elsewhere.
 */
const startedOn = (
  container: NonNullable<BrowserRecord["container"]>,
  placement: Placement,
  started: MachineNetwork | undefined
): NonNullable<BrowserRecord["container"]> => {
  const { network: _before, ...made } = container;
  return placement === "own-namespace" && started
    ? { ...made, network: started }
    : made;
};

/** Whether `url` answers 2xx within `ms`, asked again every {@link LIVE_POLL_MS}. */
const answersWithin = (url: string, ms: number): Promise<boolean> =>
  Effect.runPromise(
    lookUntil(
      {
        every: LIVE_POLL_MS,
        deadlineMs: ms,
        until: (answered: boolean) => answered,
      },
      Effect.promise(() => httpAnswers(url, 2000))
    ).pipe(Effect.map((looked) => looked.kind === "found"))
  );

/** Waits until `url` answers 2xx, or throws after {@link LIVE_MS}. */
const answers = async (url: string, what: string): Promise<void> => {
  if (!(await answersWithin(url, LIVE_MS))) {
    throw new Error(`${what} did not answer within ${LIVE_MS / 1000} s.`);
  }
};

/** What restarts Chromium inside its container: supervisord's own client, on neko's config. */
const RESTART_CHROMIUM = [
  "supervisorctl",
  "-c",
  "/etc/neko/supervisord.conf",
  "restart",
  "chromium",
];

/**
 * Runs {@link RESTART_CHROMIUM} in `container`: answers what it printed, or
 * throws it with its exit code.
 */
const restartChromium = async (
  container: Docker.Container
): Promise<string> => {
  const exec = await container.exec({
    Cmd: RESTART_CHROMIUM,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
  });
  const chunks: Buffer[] = [];
  for await (const chunk of await exec.start({ Tty: true })) {
    chunks.push(Buffer.from(chunk));
  }
  const said = Buffer.concat(chunks).toString();
  const { ExitCode } = await exec.inspect();
  if (ExitCode !== 0) {
    throw new Error(`exit ${ExitCode}: ${said.trim()}`);
  }
  return said.trim();
};

/** The runtime's not-found answer. */
const notFound = (error: unknown): boolean => statusOf(error) === 404;

/**
 * Each running container's main process, by container id, as its engine
 * named it (`State.Pid`) at the last inspect that found it running: while
 * that process lives (its pid, start and boot, core process-identity.ts
 * `markerIsLive`), the container runs, and the engine is not asked. Read
 * where the engine shares this machine's kernel alone ({@link Runtime}'s
 * `ownNetwork`): a VM's engine names a pid inside the VM.
 *
 * Every minute's tick asks whether each live browser runs (browsers.ts
 * `readBack`), and a rootless Podman's API is socket-activated: each ask
 * started `podman.service` again, once a minute on obelisk (2026-11-19, 122
 * starts an hour, each about 80 ms of CPU and a "left-over process" warning
 * for the containers' pasta and rootlessport), for a container whose process
 * had run all along. A process that is gone sends the next ask to the engine.
 */
const mainProcesses = new Map<string, ProcessMarker>();

/** `id`'s main process `pid` kept as the marker {@link mainProcesses} reads; none when it is already gone. */
const keepMainProcess = async (id: string, pid: number): Promise<void> => {
  const [procStart, boot] = await Promise.all([processStart(pid), bootId()]);
  if (procStart && boot) {
    mainProcesses.set(id, { pid, procStart, bootId: boot });
  }
};

export class ContainerHost implements BrowserHost {
  readonly kind = "container";
  readonly viewer = "neko";
  readonly #docker: Docker;
  /** The runtime: what it forwards is read from its endpoint, and measured, at each start. */
  readonly #runtime: Runtime;

  constructor(runtime: Runtime) {
    this.#docker = runtime.docker;
    this.#runtime = runtime;
  }

  devtoolsUrl(record: BrowserRecord): string {
    return `http://127.0.0.1:${portsOf(record).devtools}`;
  }

  /**
   * The slots another agent's browsers hold on this runtime (two users of a
   * rootful engine, a scratch fleet beside the machine's own agent), running
   * or stopped: each read from its container's own settings, its HTTP port's
   * binding and its address on the media network, so no browser of this
   * agent is made on a slot whose ports or address another holds.
   */
  async heldSlots(): Promise<ReadonlySet<number>> {
    const owner = await browserOwner();
    const listed = await this.#docker.listContainers({
      all: true,
      filters: { label: [BROWSER_LABEL] },
    });
    const others = listed.filter((one) => one.Labels?.[OWNER_LABEL] !== owner);
    const inspected = await Promise.all(
      others.map((one) =>
        this.#docker
          .getContainer(one.Id)
          .inspect()
          .catch((error: unknown) => {
            absent(error);
          })
      )
    );
    const held = new Set<number>();
    for (const one of inspected) {
      const http = Number(
        one?.HostConfig.PortBindings?.["8080/tcp"]?.[0]?.HostPort
      );
      const address =
        one?.NetworkSettings.Networks?.[MEDIA_NETWORK]?.IPAMConfig?.IPv4Address;
      for (let slot = 0; slot < BROWSER_SLOTS; slot += 1) {
        if (
          browserPorts(slot).http === http ||
          address?.endsWith(`.${slotHost(slot)}`)
        ) {
          held.add(slot);
        }
      }
    }
    return held;
  }

  /**
   * Whether `record`'s container was made with other preview-name rules
   * than the hub's names want now (preview-names.ts): a start then makes it
   * again. False while the hub doesn't answer: nothing is known to differ.
   */
  async rulesDue(record: BrowserRecord): Promise<boolean> {
    const wanted = await wantedHostRules(this.#runtime);
    return wanted !== null && wanted.rules !== record.container?.hostRules;
  }

  servesItsPorts(record: BrowserRecord): Promise<boolean> {
    const made = record.container?.ports;
    const now = portsOf(record);
    return Promise.resolve(
      made !== undefined &&
        made.http === now.http &&
        made.devtools === now.devtools &&
        made.media === now.media
    );
  }

  async running(record: BrowserRecord): Promise<boolean> {
    if (!record.container) {
      return false;
    }
    const { id } = record.container;
    const main = mainProcesses.get(id);
    if (main && (await markerIsLive(main))) {
      return true;
    }
    mainProcesses.delete(id);
    const inspected = await this.#docker
      .getContainer(id)
      .inspect()
      .catch((error: unknown) => {
        if (notFound(error)) {
          return;
        }
        throw error;
      });
    const running = inspected?.State.Running === true;
    const pid = inspected?.State.Pid ?? 0;
    if (running && this.#runtime.ownNetwork && pid > 0) {
      await keepMainProcess(id, pid);
    }
    return running;
  }

  async start(
    record: BrowserRecord,
    options: { relay?: BrowserRelay; progress: (row: Progress) => void }
  ): Promise<BrowserRecord> {
    const image = await ensureImage(this.#docker, IMAGE, (step) =>
      options.progress({
        state: step.stage,
        progress: { done: step.done, total: step.total, what: "image" },
      })
    );
    options.progress({ state: "starting" });
    const bluez = await standAdapter(record.key);
    const owner = await browserOwner();
    const kept = record.container;
    const volume = await this.#volumeFor(record, owner);
    const { endpoint } = this.#runtime;
    const forwarding = await mediaForwarding(endpoint);
    let { media } = forwarding;
    const { placement, network, address } = await this.#placed(record);
    // Not known now (the hub didn't answer): the container's own stand.
    const wanted = await wantedHostRules(this.#runtime);
    const hostRules = wanted ? wanted.rules : kept?.hostRules;
    // Its dashboard door, open before its Chromium is (dashboard-door.ts).
    const door = await this.#door(record);
    const { pac, pacOrigins } = door;
    let reuse =
      kept &&
      keptAsAsked(
        record,
        {
          image,
          media,
          address,
          hostRules,
          pac,
          door: { spki: door.spki, target: door.target },
          bluez: bluez?.source,
        },
        options.relay
      )
        ? await this.#exists(kept.id)
        : false;
    let container = kept && reuse ? kept : undefined;
    // The machine's network its namespace was made from: read just before
    // the container starts, kept while a reused one runs on.
    let started: MachineNetwork | undefined = container?.network;
    if (!container && forwarding.advice) {
      console.info(
        `[browser] ${record.key}: media published for ${media}. ${forwarding.advice}`
      );
    }
    const ports = portsOf(record);
    const mediaPort = ports.media;
    if (mediaPort === undefined) {
      throw new Error(`${record.key} has no media port on the container host.`);
    }
    // Live, then measured: a host that forwards less than the container was
    // published for has that kept for its endpoint, and the container is made
    // again for it. Each round publishes less, so this ends.
    for (;;) {
      if (!container) {
        await removeContainers(this.#docker, owner, record.key, [kept?.id]);
        container = await this.#create(record, {
          image,
          volume,
          relay: options.relay,
          media,
          owner,
          network,
          address,
          hostRules,
          pac,
          pacOrigins,
          door: { spki: door.spki, target: door.target },
          bluez,
        });
      }
      started = (await this.#live(container.id, ports, placement)) ?? started;
      const measured = await measureMedia(
        this.#runtime,
        mediaPort,
        media
      ).catch((error: unknown) => {
        console.warn(
          `[browser] ${record.key}: media port ${mediaPort} not measured (${error instanceof Error ? error.message : String(error)}); it stays published for ${media}`
        );
      });
      if (!(measured && carriesLess(measured, media))) {
        break;
      }
      console.info(
        `[browser] ${record.key}: the runtime at ${endpoint} forwards ${measured} of media port ${mediaPort}, published for ${media}; kept for the runtime, and the container made again for ${measured}`
      );
      await recordMeasurement(endpoint, measured);
      media = measured;
      container = undefined;
      started = undefined;
      reuse = false;
    }
    // A new container carries the credential it was made with, or none.
    const { relayExpiresAt, relayKey, ...rest } = record;
    const relay = reuse
      ? { relayExpiresAt, relayKey }
      : {
          relayExpiresAt: options.relay && relayExpiry(options.relay),
          relayKey: options.relay && relayKeyOf(options.relay),
        };
    const next: BrowserRecord = {
      ...rest,
      ...(relay.relayExpiresAt === undefined
        ? {}
        : { relayExpiresAt: relay.relayExpiresAt }),
      ...(relay.relayKey ? { relayKey: relay.relayKey } : {}),
      host: "container",
      container: startedOn(container, placement, started),
      state: "live",
    };
    // neko answers its admin's login, or the browser is not one CawCo can drive.
    await nekoLogin(next, "admin");
    return next;
  }

  /**
   * Where `record`'s container stands on this runtime (egress.ts
   * `placementOf`): on the media network at its slot's address, or in a
   * namespace of its own with no address, so a kept one made on the media
   * network is made again in its own.
   */
  async #placed(record: BrowserRecord): Promise<{
    placement: Placement;
    network: MediaNetwork | undefined;
    address: string | undefined;
  }> {
    const { slot } = record;
    if (slot === undefined) {
      throw new Error(`${record.key} has no slot on the container host.`);
    }
    const placement = placementOf(this.#runtime);
    if (placement === "own-namespace") {
      return { placement, network: undefined, address: undefined };
    }
    const network = await ensureMediaNetwork(this.#docker);
    return { placement, network, address: slotAddress(network, slot) };
  }

  /** Whether the runtime still has container `id`. */
  #exists(id: string): Promise<boolean> {
    return this.#docker
      .getContainer(id)
      .inspect()
      .then(
        () => true,
        (error: unknown) => {
          if (notFound(error)) {
            return false;
          }
          throw error;
        }
      );
  }

  /**
   * Starts the container when it is not running, brings its Chromium back
   * when it runs with DevTools silent ({@link #revive}), and waits until
   * neko and DevTools answer. Answers the machine's network read just before
   * it started, where it is placed in a namespace of its own (a start makes
   * that namespace anew); undefined when it ran already or stands on the
   * media network.
   */
  async #live(
    id: string,
    ports: ReturnType<typeof portsOf>,
    placement: Placement
  ): Promise<MachineNetwork | undefined> {
    const handle = this.#docker.getContainer(id);
    const state = await handle.inspect();
    const devtools = `http://127.0.0.1:${ports.devtools}/json/version`;
    let started: MachineNetwork | undefined;
    if (!state.State.Running) {
      started =
        placement === "own-namespace" ? await machineNetwork() : undefined;
      await handle.start();
    } else if (!(await httpAnswers(devtools, 2000))) {
      started = await this.#revive(handle, devtools, placement);
    }
    await answers(`http://127.0.0.1:${ports.http}/health`, "neko");
    await answers(devtools, "Chromium's DevTools");
    return started;
  }

  /**
   * A running container whose Chromium's DevTools does not answer: Chromium
   * restarted in place (`supervisorctl restart chromium`), and the container
   * restarted when DevTools still doesn't answer within
   * {@link CHROMIUM_MS}. supervisord's own respawn of a Chromium that died
   * can stand with no DevTools listening (21–22 Nov 2026, after each crash
   * on the BlueZ bus's loss, bluez-bus.ts), where a restart through its
   * client listens again. Answers the machine's network read just before a
   * container restart, as {@link #live} does a start.
   */
  async #revive(
    handle: Docker.Container,
    devtools: string,
    placement: Placement
  ): Promise<MachineNetwork | undefined> {
    const id = handle.id.slice(0, 12);
    const restarted = await restartChromium(handle).then(
      (said) => `restarted (${said})`,
      (error: unknown) =>
        `not restarted (${error instanceof Error ? error.message : String(error)})`
    );
    if (await answersWithin(devtools, CHROMIUM_MS)) {
      console.info(
        `[browser] container ${id}: DevTools did not answer; Chromium ${restarted}, and it answers again`
      );
      return;
    }
    console.warn(
      `[browser] container ${id}: DevTools did not answer; Chromium ${restarted}, and it still doesn't answer after ${CHROMIUM_MS / 1000} s, so the container is restarted`
    );
    const started =
      placement === "own-namespace" ? await machineNetwork() : undefined;
    await handle.restart({ t: STOP_SECONDS });
    return started;
  }

  /**
   * `record`'s dashboard door, open (dashboard-door.ts), as its container is
   * told it: the key Chromium accepts, the target its socat carries to (the
   * door's socket on a native engine, its port on the machine in a VM), and
   * and its PAC (hub-pac.ts) with the dashboard's origins it is made from:
   * the hub's now, else, while it doesn't answer, those its container was
   * made with.
   */
  async #door(record: BrowserRecord): Promise<{
    pac: string;
    pacOrigins: string[];
    spki: string;
    target: string;
  }> {
    const { door } = portsOf(record);
    await openDoor(record.key, door);
    const target = this.#runtime.ownNetwork
      ? doorTarget({ socket: true })
      : doorTarget({ host: machineHostOf(this.#runtime).name, port: door });
    const pacOrigins =
      (await doorOrigins(record.key)) ?? record.container?.pacOrigins ?? [];
    return {
      pac: hubPacUrl(pacOrigins),
      pacOrigins,
      spki: await doorSpki(),
      target,
    };
  }

  /** The volume `record` names (its sign-ins), or one made for it now, named and labelled for `owner`. */
  async #volumeFor(record: BrowserRecord, owner: string): Promise<string> {
    const volume = record.container?.volume ?? nameOf(owner, record.key);
    await this.#docker
      .getVolume(volume)
      .inspect()
      .catch(async (error: unknown) => {
        if (!notFound(error)) {
          throw error;
        }
        await this.#docker.createVolume({
          Name: volume,
          Labels: labelsOf(owner, record.key),
        });
      });
    return volume;
  }

  async #create(
    record: BrowserRecord,
    made: {
      image: string;
      volume: string;
      relay: BrowserRelay | undefined;
      media: MediaPath;
      owner: string;
      /** The media network it stands on; none in a namespace of its own. */
      network: MediaNetwork | undefined;
      /** Its slot's address on the media network; none in a namespace of its own. */
      address: string | undefined;
      /** Chromium's resolver rules for the preview names (preview-names.ts); none to map. */
      hostRules: string | undefined;
      /** The PAC its Chromium starts with (hub-pac.ts), and the dashboard's origins it was made from. */
      pac: string;
      pacOrigins: string[];
      /** Its dashboard door as its Chromium and socat are told it (dashboard-door.ts). */
      door: { spki: string; target: string };
      /** BlueZ's bus for Chromium (bluez-bus.ts); none without a virtual adapter. */
      bluez: BluezBus | undefined;
    }
  ): Promise<NonNullable<BrowserRecord["container"]>> {
    const {
      image,
      volume,
      relay,
      media,
      owner,
      network,
      address,
      hostRules,
      pac,
      pacOrigins,
      door,
      bluez,
    } = made;
    const { extraHosts } = machineHostOf(this.#runtime);
    const { http, devtools, media: port } = portsOf(record);
    const passwords = { admin: password(), user: password() };
    const stun = stunServer();
    const protocols = mediaProtocols(media);
    // A namespace of its own: pasta's, Podman's default rootless mode, which
    // takes no network beside it. Otherwise its slot's address on the media
    // network.
    const placed =
      network && address
        ? onMediaNetwork(network.name, address)
        : { NetworkMode: "pasta", NetworkingConfig: undefined };
    const neko = relay
      ? {
          username: relay.username,
          credential: relay.credential,
          urls: relayUrlsFor(relay, {
            machineId: await machineId(),
            relayMedia: network
              ? relayMediaAddress(network)
              : MACHINE_FROM_PASTA,
          }),
        }
      : undefined;
    const vhci = vhciAvailable();
    const created = await this.#docker.createContainer({
      name: nameOf(owner, record.key),
      Image: image,
      Labels: labelsOf(owner, record.key),
      Env: [
        ...nekoEnv(
          record,
          passwords,
          neko,
          media,
          await machineAddresses(),
          stun
        ),
        // chromium.conf passes it to Chromium's --proxy-pac-url. The PAC is
        // enough on this host and not on the local host: Chromium never
        // sends loopback through a PAC's proxy (net/docs/proxy.md, "Implicit
        // bypass rules", no way to turn them off under a PAC), and here
        // loopback is the container's own, which holds neither port. The
        // hub's address on any other name (host.containers.internal, the
        // LAN, the tailnet) is not loopback, so the PAC decides it.
        `CAWCO_PAC_URL=${pac}`,
        // chromium.conf: Chromium's --ignore-certificate-errors-spki-list,
        // and the door program's socat target (dashboard-door.ts).
        `CAWCO_DOOR_SPKI=${door.spki}`,
        `CAWCO_DOOR_TARGET=${door.target}`,
        // chromium.conf passes it to Chromium's --host-resolver-rules.
        ...(hostRules ? [`CAWCO_HOST_RULES=${hostRules}`] : []),
        // Chromium's Bluetooth is BlueZ on this bus (bluez-bus.ts).
        ...(bluez ? [bluez.env] : []),
      ],
      ...(placed.NetworkingConfig
        ? { NetworkingConfig: placed.NetworkingConfig }
        : {}),
      ExposedPorts: {
        "8080/tcp": {},
        "9222/tcp": {},
        ...Object.fromEntries(
          protocols.map((proto) => [`${port}/${proto}`, {}])
        ),
      },
      HostConfig: {
        // The machine, as the rules name it on a native engine: asked for
        // only where a rule needs it, since a runtime that can't find the
        // host's address refuses the container. A VM's runtime names the
        // machine itself, and takes none (preview-names.ts `machineHostOf`).
        ...(hostRules && extraHosts.length > 0
          ? { ExtraHosts: extraHosts }
          : {}),
        // The virtual HCI adapter for passkey relay (PasskeyInjector):
        // mounted only when the host has /dev/vhci, so machines without
        // the module loaded start the container unchanged.
        ...(vhci
          ? {
              Devices: [
                {
                  PathOnHost: "/dev/vhci",
                  PathInContainer: "/dev/vhci",
                  CgroupPermissions: "rwm",
                },
              ],
              CapAdd: ["NET_ADMIN"],
            }
          : {}),
        // The door's folder, where its socket is, on a native engine; a VM's
        // runtime reaches the door's port on the machine instead.
        Binds: [
          ...(bluez ? [bluez.bind] : []),
          ...(this.#runtime.ownNetwork ? [doorBind(record.key)] : []),
        ],
        NetworkMode: placed.NetworkMode,
        PortBindings: {
          "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: String(http) }],
          "9222/tcp": [{ HostIp: "127.0.0.1", HostPort: String(devtools) }],
          ...Object.fromEntries(
            protocols.map((proto) => [
              `${port}/${proto}`,
              [{ HostIp: "0.0.0.0", HostPort: String(port) }],
            ])
          ),
        },
        Mounts: [
          {
            Type: "volume",
            Source: volume,
            Target: "/home/neko/.config/chromium",
          },
        ],
        // neko's Chromium images: "chromium-based browsers require --shm-size=2g (or more)".
        ShmSize: 2 * 1024 ** 3,
      },
    });
    return {
      id: created.id,
      ...(address ? { address } : {}),
      image,
      media,
      ports: { http, devtools, media: port },
      runtime: { kind: this.#runtime.kind, endpoint: this.#runtime.endpoint },
      stun,
      ...(hostRules ? { hostRules } : {}),
      pac,
      pacOrigins,
      door,
      ...(bluez ? { bluez: bluez.source } : {}),
      volume,
      adminPassword: passwords.admin,
      userPassword: passwords.user,
    };
  }

  /** Stops its container, then its BlueZ bus: Chromium aborts while it runs if the bus goes first (bluez-bus.ts). */
  async stop(record: BrowserRecord): Promise<void> {
    if (record.container) {
      await this.#docker
        .getContainer(record.container.id)
        .stop({ t: STOP_SECONDS })
        .catch((error: unknown) => {
          // 304: already stopped; 404: gone.
          const status = statusOf(error);
          if (status !== 304 && status !== 404) {
            throw error;
          }
        });
    }
    await stopBluezBus(record.key);
  }

  /**
   * Every container and then every volume this agent holds on the runtime
   * for `key` (both labels, {@link ownedBy}), removed, whatever any record
   * says: what a move into a container cut short left (the agent stopped,
   * or was killed, before the record's one write).
   */
  async removeLabelled(key: BrowserKey): Promise<void> {
    await removeOwned(this.#docker, await browserOwner(), key);
  }

  async remove(record: BrowserRecord): Promise<void> {
    const owner = await browserOwner();
    await removeContainers(this.#docker, owner, record.key, [
      record.container?.id,
    ]);
    await stopBluezBus(record.key);
    await this.#docker
      .getVolume(record.container?.volume ?? nameOf(owner, record.key))
      .remove()
      .catch(absent);
  }
}

/** A neko session token for the browser, as {@link nekoSession} makes it. */
export const nekoLogin = async (
  record: BrowserRecord,
  as: "admin" | "viewer"
): Promise<string> => (await nekoSession(record, as)).token;

/**
 * A new neko session for the browser, its id and its token: the daemon's own
 * as admin, or a viewer's (a person watching through the hub). Each login is
 * a session of its own (neko's multiuser provider names it `<username>-<uid>`).
 * neko answers the token in the login's body while its cookie is off.
 */
export const nekoSession = async (
  record: BrowserRecord,
  as: "admin" | "viewer"
): Promise<{ id: string; token: string }> => {
  if (!record.container) {
    throw new Error(`${record.key} runs on no container.`);
  }
  const { container } = record;
  const read = await readWithin(LOGIN_MS, (signal) =>
    fetch(`http://127.0.0.1:${portsOf(record).http}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: as === "admin" ? "cawco" : "viewer",
        password:
          as === "admin" ? container.adminPassword : container.userPassword,
      }),
      signal,
    })
  );
  if (read.kind === "unanswered") {
    throw new Error(
      `neko did not answer the ${as} login within ${LOGIN_MS / 1000} s.`
    );
  }
  const response = read.value;
  if (!response.ok) {
    throw new Error(
      `neko refused the ${as} login (HTTP ${response.status}): ${(await response.text()).trim()}`
    );
  }
  const { id, token } = NekoLogin.parse(await response.json());
  if (!(id && token)) {
    throw new Error(
      `neko answered the ${as} login with no session id or token.`
    );
  }
  return { id, token };
};
