import { readWithin } from "@cawco/core/bounded";
import { CAWCO_ENV, readEnv } from "@cawco/core/cawco-env";
import type { PreviewFrame } from "@cawco/core/frames";
import type { PreviewDown, PreviewSource } from "@cawco/core/preview/protocol";
import type {
  PreviewAddress,
  PreviewSettings,
} from "@cawco/core/preview/routes";
import { PREVIEW_PING_PATH } from "@cawco/core/preview/routes";
import type { Upstream } from "@cawco/core/preview/upstream";
import type { StageState } from "@cawco/core/stage";
import { isStreamRelayPort } from "@cawco/core/stream-relay";
import { secondsOf } from "@cawco/core/time";
import {
  causeOf,
  downOf,
  errorWhy,
  previewFailed,
  RELAY_HEADER,
} from "@cawco/preview/proxy";
import { ElysiaStatus, problem } from "elysia";
import {
  FLEET_PORTS,
  LOCAL_DASHBOARD_PORT,
  PREVIEW_PORTS,
  PREVIEW_PORTS_TEXT,
} from "./config";
import type { ArtifactRow } from "./db/artifacts";
import { type PreviewsDb, projectOfOrigin } from "./db/previews";
import {
  type HostPattern,
  hostFor,
  labelOf,
  originFor,
  PORT_SUFFIX,
  parsePattern,
} from "./preview-hosts";
import { HOP, isEmbed } from "./preview-origin";
import { createPreviewPorts } from "./preview-ports";
import { reachOrigin } from "./preview-reach-origin";
import type { PreviewStop, PreviewUnloaded } from "./preview-stops";
import type { TailnetHttpsService } from "./tailnet-https";
import { WatchedMap } from "./watched-map";

/**
 * What a session's panel shows: its artifact, and which open of it this is.
 * The operator's intent, kept in the database (`shown_previews`) so it
 * outlives the hub too; only a close, or the session ending, ends it. What
 * serves it is never kept here: a frame reads its source off the
 * artifact's row as it is published, and a machine's preview is served on
 * its artifact's own origin, whose upstream follows the row
 * (preview-service.ts). Every preview is an origin of its own, never the
 * dashboard's: a port of the hub's range, and in host mode a host name on
 * the first port too. So a previewed app keeps its own storage and
 * cookies, routes by its own paths at the root, and two previews open at
 * once never cross.
 */
export interface PreviewTarget {
  /** The artifact the panel shows (Projects spec §5.10). */
  artifact: PreviewFrame["artifact"];
  revision: string;
  /** The show it is ({@link PreviewFrame.show}): new with each show, kept by an update's re-show and a republish. */
  show: string;
}

/**
 * What each session's panel shows, by instance id: every key is a session's,
 * so the board and the panel's frames read it as one. A page the hub
 * serves stands at the session's origin's root too (the apps load it
 * there); a machine's preview is served on its artifact's own origin alone
 * (`artifactOrigin`), never the session's, so whatever the panel shows
 * next, a frame of it keeps its own content.
 */
export const previewTargets = new WatchedMap<string, PreviewTarget>();

/** An artifact as its panel's frame names it: its title, the head's name, and its ask, the head's line under it, when it has one. */
export const shownArtifact = (
  row: Pick<ArtifactRow, "ask" | "id" | "kind" | "name" | "title">
): PreviewFrame["artifact"] => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  title: row.title,
  ...(row.ask ? { ask: row.ask } : {}),
});
/**
 * The dashboard origins this hub is reached from: each one a dashboard or an
 * artifact's tab opened its socket from (server.ts, from the origin the
 * dashboard's relay gated), and the operator's dashboard address. Only these
 * may frame a preview (`frame-ancestors`), and only these may hello its
 * overlay (`overlayResponse`): a page of another site that frames a preview
 * port it can reach is refused by the browser and ignored by the overlay.
 */
const parents = new Set<string>();

/** Who hears each new parent: the preview server's link (preview-control.ts). */
const parentsHeard = new Set<(parents: string[]) => void>();

/** A dashboard opened its socket from `origin`, an origin its relay let through. */
export const noteParent = (origin: string | undefined): void => {
  if (!origin) {
    return;
  }
  try {
    const url = new URL(origin);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !parents.has(url.origin)
    ) {
      parents.add(url.origin);
      for (const heard of parentsHeard) {
        heard([...parents]);
      }
    }
  } catch {
    // Not an origin: nothing to add.
  }
};

/** `heard` hears every parent each time one is added. */
export const onParents = (heard: (parents: string[]) => void): void => {
  parentsHeard.add(heard);
};

// The operator's own dashboard address, before any dashboard has connected.
noteParent(readEnv(CAWCO_ENV.dashboardUrl));
// The dashboard on every computer's loopback (core `localDashboardPort`).
noteParent(`http://localhost:${LOCAL_DASHBOARD_PORT}`);

/** Every origin that may frame a preview now (the preview server's `frame-ancestors`, and who may hello its overlay). */
export const previewParents = (): string[] => [...parents];

/** Where a machine's preview is served now, or the hop that failed, why, and what stopped it (preview-service.ts `reach`). */
export type PreviewReach =
  | { ok: true; upstream: Upstream }
  | { ok: false; down: PreviewDown; error: string; stop: PreviewStop };

export function previewFrame(
  instanceId: string,
  state: "open" | "closed",
  target: PreviewTarget,
  /** What serves it, as its row names it now; none once the row is gone. */
  source: PreviewSource | undefined,
  address: PreviewAddress | null,
  /** The session's artifacts by id, newest first. */
  artifacts: string[],
  /** A sheet's stage as its doc keeps it; none for any other kind, or before it was told. */
  stage: StageState | null = null,
  /** The project whose origin serves it, `address` being that origin's: a project's page. */
  project?: string
): PreviewFrame {
  return {
    kind: "preview",
    instanceId,
    state,
    artifact: target.artifact,
    artifacts,
    ...(address ?? {}),
    ...(project ? { project } : {}),
    ...(source ? { source } : {}),
    revision: target.revision,
    show: target.show,
    ...(stage ? { stage } : {}),
  };
}

/** How long the machine's listener has to answer the hub's ping. Our call: under the pane's own 10 s for the whole probe. */
const PING_RELAY_MS = 5000;

/**
 * A preview no panel shows, loaded once through its machine's listener `at`
 * as a pane's load is (a sleeping stage or served server wakes for it): null
 * when nothing stands in its way, else what failed and why, as CawCo's own
 * down page names it (`downOf`): a hop that didn't answer, or `error`, a page
 * its server answered with an error status (4xx, 5xx, as a render that
 * throws answers 500), which the machine's listener answers with CawCo's
 * page when it has nothing to draw (core `errorPageResponse`) and serves
 * as the page when it is HTML, its why said here the same way (core
 * `errorWhy`). A
 * page with no answer within `waitMs` is a server still making it (a first
 * compile, a build holding its event loop), and no failure: a served server
 * is up once its port listens, however long its pages take (agent stage.ts
 * `listens`). The listener's own ping then says whether the way to the server
 * stands, so `machine` is said only of a listener that answers neither.
 */
export async function loadedOnce(
  at: Upstream,
  path: string | undefined,
  waitMs: number
): Promise<PreviewUnloaded | null> {
  const address = at.address.includes(":") ? `[${at.address}]` : at.address;
  const failed: PreviewStop = { kind: "failed" };
  const said = (html: string): PreviewUnloaded | null => {
    const down = downOf(html);
    return down && { failure: down.down, why: down.why, stop: failed };
  };
  try {
    const page = await readWithin(waitMs, async (signal) => {
      const answer = await fetch(`http://${address}:${at.port}${path ?? "/"}`, {
        // A pane's load: a sleeping stage or served server wakes for it.
        headers: { [RELAY_HEADER]: at.token, "sec-fetch-mode": "navigate" },
        redirect: "manual",
        signal,
      });
      return { status: answer.status, body: await answer.text() };
    });
    if (page.kind === "answered") {
      const { status, body } = page.value;
      // An HTML error page the listener served as the page (a render that
      // throws answers 500 with its own): no page to hand up all the same.
      return (
        said(body) ??
        (status >= 400
          ? { failure: "error", why: errorWhy(status, body), stop: failed }
          : null)
      );
    }
    const pinged = await readWithin(PING_RELAY_MS, async (signal) => {
      const answer = await fetch(
        `http://${address}:${at.port}${PREVIEW_PING_PATH}`,
        { headers: { [RELAY_HEADER]: at.token }, signal }
      );
      return await answer.text();
    });
    return pinged.kind === "answered"
      ? said(pinged.value)
      : {
          failure: "machine",
          why: `its listener didn't answer the hub within ${secondsOf(pinged.after)} s`,
          stop: { kind: "silent" },
        };
  } catch (error) {
    return {
      failure: "machine",
      why: `its listener didn't answer the hub: ${causeOf(error)}`,
      stop: failed,
    };
  }
}

/**
 * What the hub's preview server (preview-server/main.ts) does for it: stand
 * its listeners as the port rows and the mode now say (`ports`), and the
 * answer of the stand that follows, the binds it refused and host mode's
 * refusal; null when the server isn't connected.
 */
export interface PreviewServerHand {
  stand: () => void;
  stood: () => Promise<{
    refused: { key: string; port: number; held: boolean; why: string }[];
    host: { held: boolean; why: string } | null;
  } | null>;
}

/** The port a host pattern's name ends in (`HostPattern.after`), when it names one. */
const PATTERN_PORT = /:(\d+)$/u;
/** One name of the pattern's, its port left off: a made-up session's, or the range's first port's. */
const sampleName = (pattern: HostPattern): string =>
  hostFor(
    pattern,
    pattern.key === "port"
      ? PREVIEW_PORTS.first
      : "00000000-0000-4000-8000-000000000000"
  ).replace(PORT_SUFFIX, "");

/**
 * Whether a host pattern's names reach anything: one generated name has to
 * resolve, a made-up session's or the range's first port's, in the DNS, its
 * record (a wildcard for `{session}`, one per port for `{port}`) pointing at
 * the hub or the proxy in front of it.
 */
const probePattern = async (pattern: HostPattern): Promise<string | null> => {
  const name = sampleName(pattern);
  try {
    await Bun.dns.lookup(name);
    return null;
  } catch (error) {
    return `${name} doesn't resolve (${causeOf(error)}): point the pattern's names at the hub's port ${PREVIEW_PORTS.first}, then save again.`;
  }
};

/**
 * Every preview origin's port and the fleet's mode, as the hub keeps them:
 * which origin keeps which port (preview-ports.ts), where each one stands as
 * a screen names it, and how previews are reached (Settings › Previews).
 * The listeners on them are the preview server's, its own process
 * (preview-server/main.ts): each change here is said to it, and it binds
 * what the rows say. In either mode each session, project or machine
 * artifact that shows a preview takes a port of the range; its port is kept,
 * so the previewed app keeps its storage across restarts. Host mode adds one
 * listener on the range's first port that routes each request by its Host,
 * a name per origin from the fleet's pattern: `{session}` its key's label,
 * or `{port}` the preview port it keeps. A client reached under the
 * pattern's domain loads the names; any other loads the ports (core
 * `previewRoute`).
 */
export function createPreviewListeners(
  hostname: string,
  deps: {
    /** The artifact whose row points at artifact origin `key` now; undefined for any other origin. */
    artifactAt: (key: string) => string | undefined;
    /** Whether a screen follows session `instanceId`'s conversation now. */
    followed: (instanceId: string) => boolean;
    /** Origins that let their port go to another: what each shows is told again, without its old address. */
    letGo: (keys: string[]) => void;
  },
  db: PreviewsDb,
  tailnet: Pick<TailnetHttpsService, "origin">,
  {
    listens,
    server,
  }: {
    /** False for a hub built only to be read (server.ts `serves`): every ask for an origin's port is refused. */
    listens: boolean;
    server: PreviewServerHand;
  }
) {
  let settings = db.settings();
  /** Host mode's refusal as the preview server last said it; null while its listener stands, or in port mode. */
  let hostRefused: { held: boolean; why: string } | null = null;
  /** The origins with a socket open on them now, as the preview server says them. */
  const watched = new Set<string>();

  /**
   * Host mode's pattern while its listener stands; none in port mode, or
   * while host mode didn't open (its stored pattern refused, its port
   * held): host mode then names no origin, and every client loads each
   * origin's port until Settings › Previews saves a pattern that opens.
   */
  const hostPattern = (): HostPattern | undefined => {
    if (settings.mode !== "host" || hostRefused) {
      return;
    }
    const pattern = parsePattern(settings.pattern ?? "");
    return pattern instanceof ElysiaStatus ? undefined : pattern;
  };

  /**
   * Whether a screen shows origin `key` through a session's panel it
   * follows: a session's own origin while a screen follows the session; an
   * artifact's while a followed session's panel shows that artifact. A
   * project's origin no panel keeps: a frame of it does, or nothing.
   */
  const panelShows = (key: string): boolean => {
    if (projectOfOrigin(key) !== null) {
      return false;
    }
    if (!isEmbed(key)) {
      return deps.followed(key);
    }
    const artifactId = deps.artifactAt(key);
    return (
      artifactId !== undefined &&
      [...previewTargets].some(
        ([instanceId, target]) =>
          target.artifact.id === artifactId && deps.followed(instanceId)
      )
    );
  };

  /** Whether origin `key` is in use now: a frame of it open on a screen (a socket on its listener), or a panel a screen follows shows it ({@link panelShows}). */
  const inUse = (key: string): boolean => watched.has(key) || panelShows(key);

  /** Which port each origin keeps (preview-ports.ts). */
  const ports = createPreviewPorts({
    db,
    inUse,
    letGo: deps.letGo,
    listens,
    mode: () => settings.mode,
    moved: server.stand,
  });

  /**
   * Whether origin `key`'s address is told to every screen that shows it
   * (artifact-pages.ts `toldAddress`): its owner is a row, and it is in use
   * ({@link inUse}) or is a project's that still keeps its stored port.
   */
  const holds = (key: string): boolean =>
    db.ownerHeld(key) &&
    (inUse(key) ||
      (projectOfOrigin(key) !== null &&
        db.ports().some((row) => row.key === key)));

  /** A preview port as a process on the hub's own machine dials it: on the listeners' bind address, loopback for a wildcard. */
  const loopback = (port: number): string => {
    let host = hostname;
    if (hostname === "0.0.0.0") {
      host = "127.0.0.1";
    } else if (hostname === "::") {
      host = "[::1]";
    } else if (hostname.includes(":")) {
      host = `[${hostname}]`;
    }
    return `http://${host}:${port}`;
  };

  /** Origin `key`'s address on `port`: the port, its tailnet origin while the hub serves HTTPS there, and once host mode stands its whole origin. */
  const addressAt = (key: string, port: number): PreviewAddress => {
    const secure = tailnet.origin(port);
    const onTailnet = secure ? { tailnet: secure } : {};
    const pattern = hostPattern();
    if (pattern) {
      const origin = originFor(
        pattern,
        pattern.key === "port" ? port : labelOf(key)
      );
      return { port, origin, ...onTailnet };
    }
    return { port, ...onTailnet };
  };

  /** Each kept port whose owner went (an artifact deleted while the hub was down) let go. */
  const dropUnheld = (): void => {
    for (const { key } of db.ports()) {
      if (!db.ownerHeld(key)) {
        db.dropPort(key);
      }
    }
  };

  /** What the preview server said of its last binds (preview-server/wire.ts `bound`). */
  const stood = (said: {
    refused: { key: string; port: number; held: boolean; why: string }[];
    host: { held: boolean; why: string } | null;
  }): void => {
    for (const { key, port, why } of said.refused) {
      previewFailed(HOP, key, `port ${port} didn't open: ${why}`);
    }
    ports.refused(said.refused);
    if (said.host) {
      previewFailed(HOP, null, said.host.why);
    }
    hostRefused = settings.mode === "host" ? said.host : null;
  };

  return {
    /** Each kept port whose owner went let go, and the preview server stands its listeners on the rest. */
    start(): void {
      dropUnheld();
      server.stand();
    },

    /** What the preview server said of its last binds. */
    stood,

    /** Origin `key` has a socket open on it now (`on`), or none, as the preview server says it. */
    watched(key: string, on: boolean): void {
      if (on) {
        watched.add(key);
      } else {
        watched.delete(key);
      }
    },

    /** Origin `key`'s address: its port, taken when it has none; refused as preview-ports.ts `open` refuses. */
    address(key: string) {
      const port = ports.open(key);
      return port instanceof ElysiaStatus ? port : addressAt(key, port);
    },

    /** Origin `key`'s address while it keeps a port, none taken for it; null when it has none. */
    bound(key: string): PreviewAddress | null {
      const port = db.ports().find((row) => row.key === key)?.port;
      return port === undefined ? null : addressAt(key, port);
    },

    holds,

    inUse,

    /** Origin `key` as a process on the hub's own machine dials it ({@link loopback}). */
    local(key: string) {
      const port = ports.open(key);
      return port instanceof ElysiaStatus ? port : loopback(port);
    },

    loopback,

    /** The origin's owner ended (a session, a project, an artifact): its port is free again. */
    release: ports.release,

    /** Whether the hub reaches a preview origin's ping itself now (preview-reach-origin.ts). */
    reach: (origin: string) => reachOrigin(origin, hostPattern()),

    /** Host mode's names as a browser's resolver takes them, with one name of theirs to resolve: null in port mode, or while host mode doesn't stand. */
    names(): { patterns: string[]; sample: string } | null {
      const pattern = hostPattern();
      if (!pattern) {
        return null;
      }
      return {
        patterns: [`*.${pattern.domain}`, pattern.domain],
        sample: sampleName(pattern),
      };
    },

    /** Host mode's preview domain and the port its pattern names (443 when it names none): null in port mode, or while host mode doesn't stand. */
    domain(): { name: string; port: number } | null {
      const pattern = hostPattern();
      if (!pattern) {
        return null;
      }
      const named = PATTERN_PORT.exec(pattern.after)?.[1];
      return { name: pattern.domain, port: named ? Number(named) : 443 };
    },

    settings(): PreviewSettings {
      return settings.mode === "host"
        ? {
            mode: "host",
            pattern: settings.pattern ?? "",
            passDomain: hostPattern()?.domain ?? "",
            ports: PREVIEW_PORTS_TEXT,
          }
        : { mode: "port", ports: PREVIEW_PORTS_TEXT };
    },

    /**
     * The fleet's mode, from the person's Settings or Caw's approved write.
     * Host mode takes a pattern of `https://` and a host name whose first
     * label holds one of `{session}` or `{port}`, under a domain a cookie may
     * be set on, whose generated name resolves, and whose listener the
     * preview server opens; a refusal says why and changes nothing.
     */
    async set(next: { mode: "port" | "host"; pattern?: string }) {
      if (next.mode === "port") {
        settings = { mode: "port", pattern: null };
        db.setSettings(settings);
        hostRefused = null;
        server.stand();
        return this.settings();
      }
      const pattern = (next.pattern ?? "").trim().toLowerCase();
      const parsed = parsePattern(pattern);
      if (parsed instanceof ElysiaStatus) {
        return parsed;
      }
      const unreachable = await probePattern(parsed);
      if (unreachable) {
        return problem(422, {
          code: "preview-pattern-unresolved",
          detail: unreachable,
        });
      }
      const fleet =
        FLEET_PORTS.get(PREVIEW_PORTS.first) ??
        (isStreamRelayPort(PREVIEW_PORTS.first) ? "the stream relay's" : null);
      if (fleet) {
        return problem(503, {
          code: "preview-host-mode-unopened",
          detail: `Port ${PREVIEW_PORTS.first} is ${fleet} port, so host-mode previews can't take it: set CAWCO_PREVIEW_PORTS to a range whose first port is free.`,
        });
      }
      const before = settings;
      settings = { mode: "host", pattern };
      db.setSettings(settings);
      const answer = server.stood();
      server.stand();
      const said = await answer;
      if (said === null || said.host) {
        // Nothing changes: the mode before goes on as it was.
        settings = before;
        db.setSettings(settings);
        server.stand();
        return problem(503, {
          code: "preview-host-mode-unopened",
          detail:
            said?.host?.why ??
            "The preview server isn't running, so host mode's listener can't open: start it with `cawco service start preview`.",
        });
      }
      hostRefused = null;
      return this.settings();
    },
  };
}

export type PreviewListeners = ReturnType<typeof createPreviewListeners>;
