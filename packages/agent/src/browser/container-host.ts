/**
 * The container host: a browser as a neko container (our image, built on
 * the machine) with its Chromium profile on a named volume of its own,
 * `cawco-browser-<slug>`, so a project's sign-ins outlive the container.
 * neko's HTTP and Chromium's DevTools are published on 127.0.0.1 alone; the
 * media port, UDP and TCP, on every address, advertised with the machine's
 * own addresses so a screen on the LAN or the tailnet connects directly.
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
import type { BrowserRelay } from "@cawco/core/browser";
import { browserSlug } from "@cawco/core/browser";
import type { MediaPath } from "@cawco/core/capabilities";
import type Docker from "dockerode";
import { ensureImage } from "./image";
import {
  carriesLess,
  machineAddresses,
  measureMedia,
  mediaForwarding,
  mediaProtocols,
  recordMeasurement,
} from "./media-forwarding";
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
  relay: BrowserRelay | undefined,
  media: MediaPath,
  addresses: string[]
): string[] => {
  const port = portsOf(record).media;
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
    // UDP only where it is forwarded; both inside a container nothing is
    // forwarded to, so its relay candidates come over either transport.
    ...(media === "tcp" ? [] : [`NEKO_WEBRTC_UDPMUX=${port}`]),
    `NEKO_WEBRTC_TCPMUX=${port}`,
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
  /** The runtime: what it forwards is read from its endpoint, and measured, at each start. */
  readonly #runtime: Runtime;

  constructor(runtime: Runtime) {
    this.#docker = runtime.docker;
    this.#runtime = runtime;
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
    const { endpoint } = this.#runtime;
    const forwarding = await mediaForwarding(endpoint);
    let { media } = forwarding;
    // The same image, published on the record's ports, the media port
    // published for what the runtime forwards now, and its relay credential
    // good for a day more (or no relay asked for): the container as it is. Otherwise a new one on the same volume,
    // with the credential just minted.
    const relayHolds =
      !options.relay ||
      (record.relayUrls?.join(" ") === options.relay.urls.join(" ") &&
        (record.relayExpiresAt ?? 0) > Date.now() + RELAY_RENEW_MS);
    const published = portsOf(record);
    let reuse =
      kept &&
      kept.image === image &&
      kept.media === media &&
      kept.ports?.http === published.http &&
      kept.ports?.devtools === published.devtools &&
      kept.ports?.media === published.media &&
      relayHolds
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
        // biome-ignore lint/performance/noAwaitInLoops: each round waits on the container it made.
        await this.#removeContainer(record);
        container = await this.#create(
          record,
          image,
          volume,
          options.relay,
          media
        );
      }
      await this.#live(container.id, ports);
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
      reuse = false;
    }
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

  /** Starts the container when it is not running, and waits until neko and DevTools answer. */
  async #live(id: string, ports: ReturnType<typeof portsOf>): Promise<void> {
    const handle = this.#docker.getContainer(id);
    const state = await handle.inspect();
    if (!state.State.Running) {
      await handle.start();
    }
    await answers(`http://127.0.0.1:${ports.http}/health`, "neko");
    await answers(
      `http://127.0.0.1:${ports.devtools}/json/version`,
      "Chromium's DevTools"
    );
  }

  async #create(
    record: BrowserRecord,
    image: string,
    volume: string,
    relay: BrowserRelay | undefined,
    media: MediaPath
  ): Promise<NonNullable<BrowserRecord["container"]>> {
    const { http, devtools, media: port } = portsOf(record);
    const passwords = { admin: password(), user: password() };
    const protocols = mediaProtocols(media);
    const created = await this.#docker.createContainer({
      name: containerName(record),
      Image: image,
      Labels: { [BROWSER_LABEL]: record.key },
      Env: nekoEnv(record, passwords, relay, media, await machineAddresses()),
      ExposedPorts: {
        "8080/tcp": {},
        "9222/tcp": {},
        ...Object.fromEntries(
          protocols.map((proto) => [`${port}/${proto}`, {}])
        ),
      },
      HostConfig: {
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
      image,
      media,
      ports: { http, devtools, media: port },
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
  const { id, token } = (await response.json()) as {
    id?: string;
    token?: string;
  };
  if (!(id && token)) {
    throw new Error(
      `neko answered the ${as} login with no session id or token.`
    );
  }
  return { id, token };
};
