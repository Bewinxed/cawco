/**
 * The container host: a browser as a neko container (our image, built on
 * the machine) with its Chromium profile on a named volume of its own,
 * `cawco-browser-<slug>`, so a project's sign-ins outlive the container.
 * neko's HTTP and Chromium's DevTools are published on 127.0.0.1 alone; the
 * media port, UDP and TCP, on every address, advertised with the machine's
 * own addresses so a screen on the LAN or the tailnet connects directly.
 */
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { readWithin } from "@cawco/core/bounded";
import type { BrowserRelay } from "@cawco/core/browser";
import { browserSlug } from "@cawco/core/browser";
import type Docker from "dockerode";
import { ensureImage } from "./image";
import type { Runtime } from "./runtime";
import {
  type BrowserHost,
  type BrowserRecord,
  httpAnswers,
  type Progress,
  portsOf,
} from "./state";

/** The image's repository on the machine. */
const IMAGE = "cawco-browser";

/** The label every browser container and volume carries: its key. */
export const BROWSER_LABEL = "dev.cawco.browser";

/** How long a container has to answer once started. */
const LIVE_MS = 90_000;
const LIVE_POLL_MS = 250;

/** A browser whose relay credential lapses within this is started with a fresh one. */
export const RELAY_RENEW_MS = 24 * 60 * 60_000;

/** How long neko has to answer a login. */
const LOGIN_MS = 5000;

/** How long a stop gives the container before the runtime kills it. */
const STOP_SECONDS = 10;

/** Interfaces that are containers' and VMs' own bridges: no screen reaches the machine on them. */
const BRIDGE = /^(?:docker|br-|cni|podman|veth|virbr|vnet|lima)/;

/**
 * The machine's addresses a screen may reach it on: every IPv4 address
 * that is not loopback (LAN and tailnet), and every global IPv6 one.
 */
export const machineAddresses = (): string[] =>
  Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    BRIDGE.test(name)
      ? []
      : (addresses ?? [])
          .filter(
            (one) =>
              !one.internal &&
              (one.family === "IPv4" ||
                !(
                  one.address.startsWith("fe80") ||
                  one.address.startsWith("fc") ||
                  one.address.startsWith("fd")
                ))
          )
          .map((one) => one.address)
  );

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

/** The container's name on the runtime. */
const containerName = (record: BrowserRecord): string =>
  `cawco-browser-${browserSlug(record.key)}`;

/** The env neko starts with. */
const nekoEnv = (
  record: BrowserRecord,
  passwords: { admin: string; user: string },
  relay: BrowserRelay | undefined
): string[] => {
  const { media } = portsOf(record);
  const addresses = machineAddresses();
  return [
    "NEKO_DESKTOP_SCREEN=1280x800@30",
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
    `NEKO_WEBRTC_UDPMUX=${media}`,
    `NEKO_WEBRTC_TCPMUX=${media}`,
    // A list, space-separated: viper hands the env's string to cast's
    // ToStringSlice, which splits it with strings.Fields.
    ...(addresses.length ? [`NEKO_WEBRTC_NAT1TO1=${addresses.join(" ")}`] : []),
    ...(relay
      ? [
          `NEKO_WEBRTC_ICESERVERS_BACKEND=${JSON.stringify([relay])}`,
          "NEKO_WEBRTC_ICESERVERS_FRONTEND=[]",
        ]
      : []),
  ];
};

/** When a relay credential lapses: its username is `<expiry, s>:<who>` (the TURN REST API scheme). */
const relayExpiry = (relay: BrowserRelay): number | undefined => {
  const seconds = Number(relay.username.split(":")[0]);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
};

/** Waits until `url` answers 2xx, or throws after {@link LIVE_MS}. */
const answers = async (url: string, what: string): Promise<void> => {
  const until = Date.now() + LIVE_MS;
  while (Date.now() < until) {
    // biome-ignore lint/performance/noAwaitInLoops: polling a server that is starting.
    if (await httpAnswers(url, 2000)) {
      return;
    }
    await Bun.sleep(LIVE_POLL_MS);
  }
  throw new Error(`${what} did not answer within ${LIVE_MS / 1000} s.`);
};

/** The runtime's not-found answer. */
const notFound = (error: unknown): boolean =>
  (error as { statusCode?: number }).statusCode === 404;

export class ContainerHost implements BrowserHost {
  readonly kind = "container";
  readonly viewer = "neko";
  readonly #docker: Docker;

  constructor(runtime: Runtime) {
    this.#docker = runtime.docker;
  }

  devtoolsUrl(record: BrowserRecord): string {
    return `http://127.0.0.1:${portsOf(record).devtools}`;
  }

  async running(record: BrowserRecord): Promise<boolean> {
    if (!record.container) {
      return false;
    }
    const inspected = await this.#docker
      .getContainer(record.container.id)
      .inspect()
      .catch((error: unknown) => {
        if (notFound(error)) {
          return;
        }
        throw error;
      });
    return inspected?.State.Running === true;
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
    const volume = containerName(record);
    await this.#docker
      .getVolume(volume)
      .inspect()
      .catch(async (error: unknown) => {
        if (!notFound(error)) {
          throw error;
        }
        await this.#docker.createVolume({
          Name: volume,
          Labels: { [BROWSER_LABEL]: record.key },
        });
      });
    const kept = record.container;
    // The same image, and its relay credential good for a day more (or no
    // relay asked for): the container as it is. Otherwise a new one on the
    // same volume, with the credential just minted.
    const relayHolds =
      !options.relay ||
      (record.relayUrls?.join(" ") === options.relay.urls.join(" ") &&
        (record.relayExpiresAt ?? 0) > Date.now() + RELAY_RENEW_MS);
    const reuse =
      kept && kept.image === image && relayHolds
        ? await this.#docker
            .getContainer(kept.id)
            .inspect()
            .then(
              () => true,
              (error: unknown) => {
                if (notFound(error)) {
                  return false;
                }
                throw error;
              }
            )
        : false;
    let container = kept && reuse ? kept : undefined;
    if (!container) {
      await this.#removeContainer(record);
      container = await this.#create(record, image, volume, options.relay);
    }
    const handle = this.#docker.getContainer(container.id);
    const state = await handle.inspect();
    if (!state.State.Running) {
      await handle.start();
    }
    const ports = portsOf(record);
    await answers(`http://127.0.0.1:${ports.http}/health`, "neko");
    await answers(
      `http://127.0.0.1:${ports.devtools}/json/version`,
      "Chromium's DevTools"
    );
    // A new container carries the credential it was made with, or none.
    const { relayExpiresAt, relayUrls, ...rest } = record;
    const relay = reuse
      ? { relayExpiresAt, relayUrls }
      : {
          relayExpiresAt: options.relay && relayExpiry(options.relay),
          relayUrls: options.relay?.urls,
        };
    const next: BrowserRecord = {
      ...rest,
      ...(relay.relayExpiresAt === undefined
        ? {}
        : { relayExpiresAt: relay.relayExpiresAt }),
      ...(relay.relayUrls ? { relayUrls: relay.relayUrls } : {}),
      host: "container",
      container,
      state: "live",
    };
    // neko answers its admin's login, or the browser is not one CawCo can drive.
    await nekoLogin(next, "admin");
    return next;
  }

  async #create(
    record: BrowserRecord,
    image: string,
    volume: string,
    relay: BrowserRelay | undefined
  ): Promise<NonNullable<BrowserRecord["container"]>> {
    const { http, devtools, media } = portsOf(record);
    const passwords = { admin: password(), user: password() };
    const created = await this.#docker.createContainer({
      name: containerName(record),
      Image: image,
      Labels: { [BROWSER_LABEL]: record.key },
      Env: nekoEnv(record, passwords, relay),
      ExposedPorts: {
        "8080/tcp": {},
        "9222/tcp": {},
        [`${media}/udp`]: {},
        [`${media}/tcp`]: {},
      },
      HostConfig: {
        PortBindings: {
          "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: String(http) }],
          "9222/tcp": [{ HostIp: "127.0.0.1", HostPort: String(devtools) }],
          [`${media}/udp`]: [{ HostIp: "0.0.0.0", HostPort: String(media) }],
          [`${media}/tcp`]: [{ HostIp: "0.0.0.0", HostPort: String(media) }],
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
      image,
      volume,
      adminPassword: passwords.admin,
      userPassword: passwords.user,
    };
  }

  async #removeContainer(record: BrowserRecord): Promise<void> {
    const named = await this.#docker
      .listContainers({
        all: true,
        filters: { label: [`${BROWSER_LABEL}=${record.key}`] },
      })
      .catch(() => []);
    await Promise.all(
      named.map((one) =>
        this.#docker
          .getContainer(one.Id)
          .remove({ force: true })
          .catch((error: unknown) => {
            if (!notFound(error)) {
              throw error;
            }
          })
      )
    );
  }

  async stop(record: BrowserRecord): Promise<void> {
    if (!record.container) {
      return;
    }
    await this.#docker
      .getContainer(record.container.id)
      .stop({ t: STOP_SECONDS })
      .catch((error: unknown) => {
        // 304: already stopped; 404: gone.
        const status = (error as { statusCode?: number }).statusCode;
        if (status !== 304 && status !== 404) {
          throw error;
        }
      });
  }

  async remove(record: BrowserRecord): Promise<void> {
    await this.#removeContainer(record);
    await this.#docker
      .getVolume(record.container?.volume ?? containerName(record))
      .remove()
      .catch((error: unknown) => {
        if (!notFound(error)) {
          throw error;
        }
      });
  }
}

/**
 * A neko session token for the browser: the daemon's own as admin, or a
 * viewer's (the hub's, for a person watching). neko answers it in the
 * login's body while its cookie is off.
 */
export const nekoLogin = async (
  record: BrowserRecord,
  as: "admin" | "viewer"
): Promise<string> => {
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
  const { token } = (await response.json()) as { token?: string };
  if (!token) {
    throw new Error(`neko answered the ${as} login with no token.`);
  }
  return token;
};
