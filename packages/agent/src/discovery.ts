import { existsSync } from "node:fs";
import {
  CAWCO_ENV,
  CAWCO_HUB_PORT,
  CAWCO_MDNS_TYPE,
  readEnv,
} from "@cawco/core";
import { Bonjour, type Service } from "bonjour-service";
import { readConfig, writeConfig } from "./config";

/**
 * The network rungs of hub discovery, shared between `cawco up`
 * (`@cawco/cli`'s `discoverHub`) and the daemon's own re-discovery on a
 * sustained reconnect failure (`rediscoverHub`, below) — the latter only for a
 * hub that was discovered, never one the operator named.
 *
 * This lives on the agent side of the package graph, not core and not cli:
 * `@cawco/cli` already depends on `@cawco/agent` (it dynamically imports
 * `runDaemon` and `machineId` from here for `cawco up`), so the reverse
 * dependency — agent importing from cli — would be a cycle. `discover.ts`
 * imports these instead of keeping its own copies of the mDNS/tailscale/probe
 * logic; its own rungs (`--hub`/env, the CLI's cached config, localhost) and
 * its user-facing `[n/5]` narration stay put, unchanged.
 */

/** Long enough for a responder on the link to answer, short enough to not feel stuck. */
export const MDNS_BROWSE_MS = 2000;
export const PROBE_TIMEOUT_MS = 1500;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:\/\//i;
const HTTP_PREFIX = /^http/;

/**
 * Accepts either end of the pair — a daemon's `ws://host:port/ws`, a plain
 * http base, or a bare `host:port` — and answers with the http base.
 */
export const toHttpBase = (raw: string): string | undefined => {
  const text = raw.trim();
  const url = URL.parse(SCHEME_PREFIX.test(text) ? text : `http://${text}`);
  if (!url) {
    return undefined;
  }
  const scheme =
    { "ws:": "http:", "wss:": "https:" }[url.protocol] ?? url.protocol;
  return scheme === "http:" || scheme === "https:"
    ? `${scheme}//${url.host}`
    : undefined;
};

export const toWsUrl = (httpBase: string): string =>
  `${httpBase.replace(HTTP_PREFIX, "ws")}/ws`;

/**
 * What tells a cawco hub apart from whatever else is listening on the port:
 * `/api/agents` is the fleet, so a 200 carrying an array is the whole test.
 */
export const probeHub = async (httpUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(`${httpUrl}/api/agents`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return response.ok && Array.isArray(await response.json());
  } catch {
    return false;
  }
};

/** Probes every candidate at once and takes whichever answers first. */
export const firstToAnswer = (
  candidates: string[],
  probe: (httpUrl: string) => Promise<boolean> = probeHub
): Promise<string | undefined> => {
  if (candidates.length === 0) {
    return Promise.resolve(undefined);
  }
  return Promise.any(
    candidates.map(async (url) => {
      if (!(await probe(url))) {
        throw new Error(url);
      }
      return url;
    })
  ).catch(() => undefined);
};

/**
 * Browses `_cawco._tcp.local` for as long as it takes the first hub to answer.
 *
 * This is link-local multicast. It does not cross a router and it does not cross
 * a tailnet — a hub reachable only over Tailscale is invisible here no matter
 * how long the browse runs. That case belongs to {@link tailscaleCandidates};
 * do not come back and try to widen this one.
 */
export const browseMdns = (): Promise<string[]> =>
  new Promise((resolve) => {
    const bonjour = new Bonjour();
    const settle = (candidates: string[]): void => {
      clearTimeout(timer);
      browser.stop();
      bonjour.destroy();
      resolve(candidates);
    };
    const browser = bonjour.find(
      { type: CAWCO_MDNS_TYPE, protocol: "tcp" },
      (service: Service) => {
        const addresses = (service.addresses ?? []).filter((address) =>
          IPV4.test(address)
        );
        if (addresses.length > 0) {
          settle(
            addresses.map((address) => `http://${address}:${service.port}`)
          );
        }
      }
    );
    const timer = setTimeout(() => settle([]), MDNS_BROWSE_MS);
  });

/** The shape of `tailscale status --json` this reads, and nothing more. */
interface TailscaleNode {
  HostName?: string;
  Online?: boolean;
  TailscaleIPs?: string[];
}

/**
 * The macOS app ships its CLI inside the bundle and only symlinks it into the
 * PATH if the user asks, so a Mac on the tailnet reads as "no tailscale" unless
 * these are tried — found the hard way, from a Mac that was plainly on the net.
 */
const TAILSCALE_BINARIES = [
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
];

const tailscaleBinary = (): string | undefined =>
  Bun.which("tailscale") ?? TAILSCALE_BINARIES.find((path) => existsSync(path));

/**
 * Every online node on the tailnet, at the hub port.
 *
 * This is the rung that actually crosses machines: mDNS is link-local, so a hub
 * in another building or another country is only ever found here. `Self` is in
 * the list alongside the peers because a hub can be bound to its tailnet address
 * alone, which no localhost probe would reach.
 */
export const tailscaleCandidates = async (
  port: number
): Promise<{ ip: string; host: string }[]> => {
  const binary = tailscaleBinary();
  if (!binary) {
    return [];
  }
  const status = await Bun.$`${binary} status --json`
    .quiet()
    .json()
    .catch(() => undefined);
  if (!status) {
    return [];
  }

  const nodes: TailscaleNode[] = [
    ...Object.values((status.Peer ?? {}) as Record<string, TailscaleNode>),
    ...((status.Self ? [status.Self] : []) as TailscaleNode[]),
  ];
  return nodes
    .filter((node) => node.Online && node.TailscaleIPs?.[0])
    .map((node) => ({
      ip: `http://${node.TailscaleIPs?.[0]}:${port}`,
      host: node.HostName ?? "?",
    }));
};

/** Everything {@link rediscoverHub} calls out to, injectable so a test never touches the real network or `CONFIG_PATH`. */
export interface RediscoverProbes {
  readonly browseMdns?: () => Promise<string[]>;
  readonly log?: (line: string) => void;
  readonly port?: number;
  readonly probe?: (httpUrl: string) => Promise<boolean>;
  readonly readCachedHubUrl?: () => Promise<string | undefined>;
  readonly repin?: (httpUrl: string) => Promise<void>;
  readonly tailscaleCandidates?: (
    port: number
  ) => Promise<{ ip: string; host: string }[]>;
}

/**
 * Re-runs the rungs that can find a hub without being told one: cached → mDNS
 * → tailscale-walk. On a hit, repins the winner into the CLI's config the same
 * way `discoverHub` does, and returns it.
 *
 * Skips two of `discoverHub`'s five rungs on purpose: `--hub`/env have nothing
 * new to read this long after `cawco up` started, and localhost is not a
 * rung a *relocated* hub can land on — a hub that was reachable on this
 * machine would have answered the pinned URL already if the pinned URL was
 * localhost, so retrying it here only finds the same failure again.
 *
 * Returns `undefined` when nothing answers, which is not itself a failure:
 * the caller's existing backoff series simply continues against the old URL.
 */
export const rediscoverHub = async (
  probes: RediscoverProbes = {}
): Promise<string | undefined> => {
  const note =
    probes.log ??
    ((): void => {
      // no-op: a caller that doesn't want narration doesn't get any
    });
  const probe = probes.probe ?? probeHub;
  const findMdns = probes.browseMdns ?? browseMdns;
  const findTailscale = probes.tailscaleCandidates ?? tailscaleCandidates;
  const port =
    probes.port ?? Number(readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT);

  const settle = async (httpUrl: string, rung: string): Promise<string> => {
    note(`[rediscover/${rung}] ${httpUrl} answered — repinning`);
    if (probes.repin) {
      await probes.repin(httpUrl);
    } else {
      await writeConfig({ hubUrl: httpUrl });
    }
    return httpUrl;
  };

  const cached = probes.readCachedHubUrl
    ? await probes.readCachedHubUrl()
    : (await readConfig())?.hubUrl;
  if (cached) {
    note(`[rediscover/cached] ${cached}: probing`);
    if (await probe(cached)) {
      return settle(cached, "cached");
    }
    note("[rediscover/cached] did not answer");
  } else {
    note("[rediscover/cached] none configured");
  }

  note("[rediscover/mdns] browsing");
  const advertised = await findMdns();
  if (advertised.length > 0) {
    const answered = await firstToAnswer(advertised, probe);
    if (answered) {
      return settle(answered, "mdns");
    }
    note("[rediscover/mdns] nothing advertised answered");
  } else {
    note("[rediscover/mdns] nothing advertising on the local link");
  }

  const peers = await findTailscale(port);
  if (peers.length > 0) {
    note(
      `[rediscover/tailscale] probing ${peers.map((p) => `${p.host} ${p.ip}`).join(", ")}`
    );
    const answered = await firstToAnswer(
      peers.map((peer) => peer.ip),
      probe
    );
    if (answered) {
      return settle(answered, "tailscale");
    }
    note(`[rediscover/tailscale] no peer answered on :${port}`);
  } else {
    note("[rediscover/tailscale] no binary, or no online peers");
  }

  note("[rediscover] nothing answered — the existing backoff series continues");
  return undefined;
};
