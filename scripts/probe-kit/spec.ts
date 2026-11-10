/**
 * The probe kit's contract, stated once: what a probe spec must export, what
 * the runner hands it, and where it may run. A spec module's default export
 * is a {@link Spec}, written
 *
 *     const spec: Spec = { group, name, run: async (kit) => { … } };
 *     export default spec;
 *
 * run.ts loads each module under `specs/` and `specs/web/` and reads that
 * export's fields; scripts/probe-groups-check.ts reads {@link Spec.group}
 * from the same shape. The kit itself (kit.ts) is the runner behind
 * {@link Kit}: browsers, the build, scratch fleets. Nothing here runs: the
 * only imports are types (playwright-core's `Page`, the scratch fleet's and
 * the groups' names), so a lint or the runner reads the contract without
 * loading a browser launcher.
 */
import type { Page } from "playwright-core";
import type { Fleet, HubAddress, Reply, Seen } from "../scratch-fleet";
import type { SpecGroup } from "./groups";

/** Every viewport a spec opens. `touch` is a finger: touch events, a mobile viewport. */
export const VIEWS = {
  desk: { width: 1440, height: 900, touch: false },
  /** The owner's widest desk window. */
  desk2529: { width: 2529, height: 1400, touch: false },
  tablet: { width: 1024, height: 1366, touch: true },
  /** An iPad mini's portrait: the journeys' tablet. */
  tabletPortrait: { width: 768, height: 1024, touch: true },
  phone: { width: 390, height: 844, touch: true },
  /** Playwright's iPhone 13 device: 390 wide, its 664 the room Safari's toolbars leave. */
  phoneSafari: { width: 390, height: 664, touch: true },
  /** A touch tablet's portrait, an iPad Air's 820: a finger, whatever the width (comment-card-sizing). */
  tablet820: { width: 820, height: 1180, touch: true },
  /** A desk's window drawn as narrow as that tablet: a mouse. */
  narrow820: { width: 820, height: 1180, touch: false },
  /** A desk panel as narrow as the phone: a mouse, its scrollbars a desk's. */
  deskPanel: { width: 390, height: 844, touch: false },
  /** Past the phone's line and under the drawer's: the rail is a sheet, the bar is the desk's. */
  narrowDesk: { width: 680, height: 900, touch: false },
  /** The owner's own browser window as he works in it (his capture of the project page). */
  window1037: { width: 1037, height: 760, touch: false },
  /** The widest phone, a Pro Max's 430pt. */
  phoneWide: { width: 430, height: 932, touch: true },
  /** The simulators the iOS specs pair with: iPhone 16 Pro and iPad Pro 13-inch (M4), portrait. */
  iphone: { width: 402, height: 874, touch: true },
  /** An iPhone 15 Pro, portrait. */
  iphone15Pro: { width: 393, height: 852, touch: true },
  ipad: { width: 1032, height: 1376, touch: true },
  /** An iPad Pro 11-inch (M4), portrait: the simulator ios-config and ios-views pair with. */
  ipad11: { width: 834, height: 1194, touch: true },
  /** The same iPad in landscape. Either way up it is an iPad's regular width, so the web stands
   *  the side panel beside the conversation (layoutPolicy.sideDrawer) as the app does. */
  ipadWide: { width: 1376, height: 1032, touch: true },
} as const;

export type View = keyof typeof VIEWS;

export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

/** The browser engines a page runs on. */
export type Engine = "chromium" | "webkit" | "firefox";

export interface PageOptions {
  /**
   * A browser of its own, by name, for a page traced while another page is:
   * DevTools tracing runs one at a time per browser ("Tracing has already
   * been started (possibly in another tab)"). Unset, the run's shared one.
   */
  browser?: string;
  /**
   * WebKit for a spec that reads Safari's engine, Firefox for Gecko's;
   * Chromium otherwise. A WebKit page here has Playwright's inspector
   * attached, which keeps every frame the page takes away, a frame of plain
   * objects as much as an app's, and after `page.requestGC()` too: what a
   * page lets go of in WebKit is read with no inspector (canvas-cost
   * `memory`, its `uninspected` runs, through safari-bridge.ts).
   */
  engine?: Engine;
  /**
   * Chromium only: its `--host-resolver-rules`, where a spec needs a name to
   * reach one address alone (`MAP localhost [::1]`: an agent's loopback
   * beside a scratch hub on 127.0.0.1; `MAP *.localtest.me 127.0.0.1`: host
   * mode's names where no DNS answers, as in a workspace). The browser then
   * connects to every name directly: a proxy the environment names (a
   * workspace's) would resolve the name itself, and answered such a page
   * 407.
   */
  hostRules?: string;
  /**
   * The page's context accepts a certificate of the run's own (a
   * Cloudflare-like front's, cloudflare-front.ts `scratchCertificate`), as a
   * browser trusts the real edge's: its https origins stay secure contexts.
   */
  ignoreHTTPSErrors?: boolean;
  /**
   * Scripts installed before the page's own, in order: a function (run as
   * it is, none of this module's scope with it), or a script's source.
   */
  init?: ((() => void) | { content: string })[];
  /**
   * Chromium only: every frame in the page's own process, its preview's
   * included, as WebKit runs them and as Chromium does a frame of the same
   * site it does not isolate. Unset, Playwright's Chromium keys a preview's
   * origin to a process of its own (preview-bound's 2).
   */
  oneProcess?: boolean;
  /**
   * An HTTP proxy every request of the page's context goes through, its
   * loopback ones included (Playwright bypasses none unless told): a
   * spec's stand-in for what stands between the owner's browser and his
   * hub (idle-proxy.ts). `http://127.0.0.1:<port>`.
   */
  proxy?: string;
  /** Device pixels per css px, when a spec reads another device (an iPhone's 3). */
  scale?: number;
  /**
   * Chromium only: scrollbars that take their width, as a desk's Chromium
   * draws them (app.css's thin ones). Unset, Playwright's headless Chromium
   * hides them (`--hide-scrollbars`), so a box that starts or stops
   * scrolling never narrows what it holds.
   */
  scrollbars?: boolean;
  theme?: Theme;
}

/** A spec: one surface, a short list of assertions on the kit's helpers. */
export interface Spec {
  /** The command that runs it alone, said with `host`; the spec's own by its name when unsaid. */
  command?: string;
  /**
   * The group it stands in (groups.ts): one the owner kept, never one he
   * cut. Every module under specs/ names one (scripts/probe-groups-check.ts);
   * a run the kit makes of something else (a journey, a preview) needs none.
   */
  group?: SpecGroup;
  /**
   * Why the spec runs on the host, outside every workspace, when it does:
   * it starts workspace boundaries (a delegate's, a stage's, a place's), and
   * no boundary starts inside another (README "A spec that delegates runs on
   * the host"). Inside a workspace such a spec is not run: the run says it
   * runs on the host, with its command.
   */
  host?: string;
  /** The spec's name: its file's, and its output folder's. */
  name: string;
  /**
   * Why the spec stands up its own git and HOME, when it does: it runs in a
   * process of its own (run.ts {@link OWN_HOME_ENV}), with a scratch HOME set
   * as that process starts (Bun's `os.homedir()` reads HOME once, at start,
   * and never a HOME set later) and none of an enclosing workspace's git or
   * gh settings, which would send its own setup pushes through that
   * workspace's git door.
   */
  ownHome?: string;
  /**
   * Why the spec runs in a process of its own, when it does: it sets
   * variables a module reads once as it loads (the hub's config reads
   * `CAWCO_PREVIEW_PORTS` and `CAWCO_DB_PATH` into constants), and in a run's
   * shared process a spec before it has loaded that module already. run.ts
   * starts it fresh ({@link OWN_PROCESS_ENV}), HOME and git settings as the
   * run's; an {@link Spec.ownHome} spec gets a process of its own too.
   */
  ownProcess?: string;
  run: (kit: Kit) => Promise<void>;
  /**
   * Why the spec runs inside a workspace's boundary, when it does: it reads
   * what the boundary gives a command (its proxy, its tool door). Outside
   * every workspace such a spec is not run: the run says it runs in a
   * workspace, with its command. Started from a session's shell, it runs in
   * a process of its own that keeps that session's variables, which every
   * other spec runs without (caller-env.ts).
   */
  workspace?: string;
}

/** Set on the process run.ts starts for an {@link Spec.ownHome} spec: its scratch HOME. */
export const OWN_HOME_ENV = "CAWCO_PROBE_OWN_HOME";

/** Set on every process run.ts starts for one spec ({@link Spec.ownProcess}, {@link Spec.ownHome}). */
export const OWN_PROCESS_ENV = "CAWCO_PROBE_OWN_PROCESS";

/**
 * The variables of an enclosing workspace's git and gh an
 * {@link Spec.ownHome} spec runs without: its git config words
 * (`GIT_CONFIG_*`, with `pushInsteadOf` to the workspace's door), the door's
 * own (`CAWCO_GIT_*`), its ssh, LFS and template settings, and gh's config dir.
 */
export const ENCLOSING_GIT_ENV =
  /^(?:GIT_CONFIG_\w+|CAWCO_GIT_\w+|GIT_SSH_COMMAND|GIT_LFS_SKIP_PUSH|GIT_TEMPLATE_DIR|GH_CONFIG_DIR)$/u;

/**
 * Why a spec cannot start a boundary of its own where this run is: inside a
 * workspace, on Linux bwrap is refused the namespaces it needs and on macOS
 * Seatbelt does not nest (core boundary-nesting.ts). The host is not.
 */
export const BOUNDARY_INSIDE =
  "a workspace boundary cannot start inside another (bwrap on Linux is refused its namespaces, macOS's Seatbelt does not nest)";

export interface Kit {
  /** The dev server against no hub: the `/motion/` benches, which need none. */
  bench: () => Promise<string>;
  /**
   * The dev server against `hub`, a stub the spec stands up itself, its
   * server render included: SvelteKit's dev guard runs there, so a relative
   * `fetch` the render makes throws `ssr_fetch_relative_url` into its log
   * (`$TMPDIR/probe-kit/vite-dev-<port>.err.log`). It stops when the spec ends.
   */
  benchFor: (hub: string) => Promise<string>;
  /** The built dashboard against no hub (built once per run): a bench a runtime spec times. */
  built: () => Promise<string>;
  /**
   * The built dashboard served against `hub`, a hub the spec stands up
   * itself (a stub answering the reads one surface makes, server-side
   * rendering included): its address. It stops when the spec ends.
   */
  builtFor: (hub: string) => Promise<string>;
  /** One assertion: a PASS or FAIL line. Returns `ok`. */
  check: (assertion: string, ok: boolean, detail?: string) => boolean;
  /**
   * A scratch fleet (scratch-fleet.ts), nothing launched yet, answered once
   * the run's dashboard is built; its `dashboard()` serves that build
   * against its hub once asked, where the hub is reached (`hub.at`). Both go
   * when the spec ends. `hub`: where its hub listens and is reached
   * (scratch-fleet.ts `HubAddress`), 127.0.0.1 unless named.
   */
  fleet: (
    respond: (request: Seen) => Reply | Promise<Reply>,
    hub?: HubAddress
  ) => Promise<KitFleet>;
  /** A line that is neither a pass nor a fail. */
  note: (line: string) => void;
  /** Where the spec writes what a reviewer reads after a failure. */
  out: string;
  /** A page in a pinned context; it closes when the spec ends. */
  page: (view: View, options?: PageOptions) => Promise<Page>;
  spec: string;
}

export type KitFleet = Fleet & {
  /** The built dashboard served against this fleet's hub: its address. */
  dashboard: () => Promise<string>;
  /**
   * The dev server against this fleet's hub: every module is its own URL,
   * so a spec can name which source files a page fetched.
   */
  devDashboard: () => Promise<string>;
};
