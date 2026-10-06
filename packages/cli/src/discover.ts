import {
  browseMdns,
  CONFIG_PATH,
  firstToAnswer,
  MDNS_BROWSE_MS,
  probeHub,
  readConfig,
  tailscaleCandidates,
  toHttpBase,
  toWsUrl,
  writeConfig,
} from "@cawco/agent";
import {
  CAWCO_ENV,
  CAWCO_HUB_PORT,
  CAWCO_MDNS_TYPE,
  readEnv,
} from "@cawco/core";

/** Which rung of the ladder answered. */
export type HubSource =
  | "flag"
  | "env"
  | "config"
  | "mdns"
  | "tailscale"
  | "localhost";

export interface Hub {
  /** `http://host:port` — the REST API's base. */
  httpUrl: string;
  source: HubSource;
  /** `ws://host:port/ws` — what the daemon attaches to. */
  wsUrl: string;
}

export interface DiscoverOptions {
  /** `--hub`, which outranks every other rung. */
  hub?: string;
  /** Where `--verbose` narration goes. Silent when absent. */
  log?: (line: string) => void;
}

/**
 * A hub already answering on this network or tailnet, for an installer to offer
 * joining instead of starting a second one. Nothing is cached or written. A Mac
 * skips the LAN browse: macOS does not let a background service reach
 * local-network addresses, so only a tailnet address would work for it.
 */
export const findExistingHub = async (): Promise<string | undefined> => {
  const port = Number(readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT);
  const tailnet = (await tailscaleCandidates(port)).map(({ ip }) => ip);
  const lan = process.platform === "darwin" ? [] : await browseMdns();
  return await firstToAnswer([...lan, ...tailnet]);
};

/**
 * Finds the hub, trying the rungs in order and stopping at the first that
 * answers. Every rung narrates itself through `log`, because the answer to "why
 * did it pick that one" has to be readable without a debugger.
 *
 * The mDNS browse, the tailscale walk, and the probe itself live in
 * `@cawco/agent`'s `discovery` module — they are shared with the daemon's
 * own re-discovery on a sustained reconnect failure (for a hub found by a
 * discovery rung, never one named by `--hub` or env). This file keeps only the
 * rungs that are specific to a `cawco up`: being told outright, the CLI's
 * cached config, and localhost.
 */
export const discoverHub = async ({
  hub,
  log,
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: walks the five discovery rungs (flag/env, cached config, mDNS, tailscale, localhost) in order, narrating each
}: DiscoverOptions = {}): Promise<Hub | undefined> => {
  const note =
    log ??
    ((): void => {
      // --verbose narration is opt-in; silently drop it when no logger was given.
    });
  const port = Number(readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT);

  const settle = async (httpUrl: string, source: HubSource): Promise<Hub> => {
    await writeConfig({ hubUrl: httpUrl });
    return { httpUrl, wsUrl: toWsUrl(httpUrl), source };
  };

  // 1. Being told outranks being clever, and an explicit hub is not probed: the
  //    daemon is allowed to start before the hub it was pointed at exists.
  const explicit = hub ?? readEnv(CAWCO_ENV.hubUrl);
  if (explicit) {
    const source = hub ? "flag" : "env";
    const base = toHttpBase(explicit);
    if (base) {
      note(`[1/5] ${source === "flag" ? "--hub" : CAWCO_ENV.hubUrl}: ${base}`);
      return settle(base, source);
    }
    note(
      `[1/5] ${source === "flag" ? "--hub" : CAWCO_ENV.hubUrl}: ${explicit} is not a URL`
    );
  } else {
    note(`[1/5] --hub / ${CAWCO_ENV.hubUrl}: not set`);
  }

  // 2. The hub found last time is the hub most runs want, so it costs one probe.
  // A config written by `login` before any hub was known has an empty one.
  const cached = await readConfig();
  if (cached?.hubUrl) {
    note(`[2/5] cached ${cached.hubUrl} (${CONFIG_PATH}): probing`);
    if (await probeHub(cached.hubUrl)) {
      note("[2/5] cached hub answered");
      return settle(cached.hubUrl, "config");
    }
    note("[2/5] cached hub did not answer");
  } else {
    note(`[2/5] no cached hub at ${CONFIG_PATH}`);
  }

  // 3. Same network, nothing configured.
  note(
    `[3/5] mDNS _${CAWCO_MDNS_TYPE}._tcp.local: browsing ${MDNS_BROWSE_MS}ms`
  );
  const advertised = await browseMdns();
  if (advertised.length > 0) {
    note(`[3/5] mDNS advertised ${advertised.join(", ")}: probing`);
    const answered = await firstToAnswer(advertised);
    if (answered) {
      note(`[3/5] ${answered} answered`);
      return settle(answered, "mdns");
    }
    note("[3/5] nothing advertised answered");
  } else {
    note("[3/5] nothing advertising on the local link");
  }

  // 4. Different network — the tailnet is the only rung that gets there.
  const peers = await tailscaleCandidates(port);
  if (peers.length > 0) {
    note(
      `[4/5] tailscale: probing ${peers.map((p) => `${p.host} ${p.ip}`).join(", ")}`
    );
    const answered = await firstToAnswer(peers.map((peer) => peer.ip));
    if (answered) {
      note(`[4/5] ${answered} answered`);
      return settle(answered, "tailscale");
    }
    note(`[4/5] no tailscale peer answered on :${port}`);
  } else {
    note("[4/5] tailscale: no binary, or no online peers");
  }

  // 5. The hub is on this machine, which is how most people start.
  const local = `http://localhost:${port}`;
  note(`[5/5] ${local}: probing`);
  if (await probeHub(local)) {
    note("[5/5] localhost answered");
    return settle(local, "localhost");
  }
  note("[5/5] localhost did not answer");

  return undefined;
};
