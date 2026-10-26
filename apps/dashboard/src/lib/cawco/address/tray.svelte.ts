/**
 * The cawco address tray, as a working drawing (design-explore): one live
 * set-up of the word address that the three directions (FamilyTray,
 * CardTray, StationsTray) each draw. Nothing in the app reads it yet; only
 * their states files mount it.
 *
 * The hub's part is played here: each state moves on when "the hub sees the
 * thing happen" (sign-in landed, admin approved, address answered,
 * certificates on, expiry off, a phone opened it), a few seconds after the
 * person did their part. A state reached by jumping (the story's control)
 * holds still, so it can be read.
 *
 * Facts it stands on: the advisor's report (design 6ddc57c4) and its facts
 * (research 924f764b): the bare word is a search until a device has opened
 * `cawco/` once; Tailscale renames a taken name `cawco-1` for good, NetBird
 * `cawco-12-7`; a person's sign-in expires in 180 days unless expiry is
 * switched off; Headscale asks its admin to approve; NetBird admits by a
 * setup key, issues no certificates and resolves only the long name by
 * default; https lives only at the long name; the clipboard only on https.
 */

import type { CawStatus } from "@cawco/core/threads";
import { DAY_MS } from "@cawco/core/time";

export type Network = "tailscale" | "headscale" | "netbird";

/** Where the tray was opened from. */
export type Source = "needs" | "settings";

/** One state of the set-up, as the advisor numbered them (S0a to S10). */
export type Step =
  | "finding"
  | "found"
  | "signin"
  | "admin"
  | "key"
  | "checking"
  | "secure"
  | "keep"
  | "phone"
  | "live"
  | "failed"
  | "unsupported";

/** What went wrong, as the hub would classify it (S9). */
export type Cause =
  | "stale-link"
  | "wrong-tailnet"
  | "refused"
  | "key-refused"
  | "no-answer"
  | "expired"
  | "certs-off";

/** The status files Caw is drawn from in the tray. */
export const TRAY_STATUSES = [
  "ready",
  "idle",
  "loading",
  "done",
  "needs-you",
] as const satisfies readonly CawStatus[];

/** A file Caw is drawn from in the tray, or the pose still to be drawn. */
export type TrayPose =
  | (typeof TRAY_STATUSES)[number]
  | "climb"
  | "head-smile"
  | "head-unsmile"
  | "head-beat";

/** The poses the advisor named that no file holds yet. */
export type PoseToDraw = "look-up" | "phone" | "shrug";

interface NetworkFacts {
  /** Its admin console's page for each thing an admin does. */
  consoles: { dns: string; machines: string; keys: string };
  /** Where its own sign-in or control lives. */
  control: string;
  /** The suffix its names end in. */
  domain: string;
  name: string;
}

/** The device's name on `network`: the word, or the network's own next one once the word is taken. */
function deviceName(network: Network, taken: boolean): string {
  if (!taken) {
    return "cawco";
  }
  return network === "netbird" ? "cawco-12-7" : "cawco-1";
}

/**
 * The failures whose way out redoes a step the network asked for: the
 * sign-in, for a link or login that went stale or the wrong tailnet; the
 * admin's approval, for a refusal. Every drawing of the set-up has them.
 */
const REDO = {
  "stale-link": "signin",
  "wrong-tailnet": "signin",
  expired: "signin",
  refused: "admin",
} as const;

/** The three networks as this drawing's person has them. */
const NETWORKS: Record<Network, NetworkFacts> = {
  tailscale: {
    name: "Tailscale",
    domain: "heron-pike.ts.net",
    control: "login.tailscale.com",
    consoles: {
      dns: "https://login.tailscale.com/admin/dns",
      machines: "https://login.tailscale.com/admin/machines",
      keys: "",
    },
  },
  headscale: {
    name: "Headscale",
    domain: "mesh.northwind.dev",
    control: "hs.northwind.dev",
    consoles: { dns: "", machines: "", keys: "" },
  },
  netbird: {
    name: "NetBird",
    domain: "netbird.cloud",
    control: "app.netbird.io",
    consoles: {
      dns: "https://app.netbird.io/dns",
      machines: "https://app.netbird.io/peers",
      keys: "https://app.netbird.io/setup-keys",
    },
  },
};

/** Every view the story's control can jump to, in the order the set-up runs. */
export const VIEWS = [
  { id: "finding", step: "finding", label: "S0a · Finding the network" },
  { id: "found", step: "found", label: "S0b · Found it" },
  { id: "signin", step: "signin", label: "S1 · Waiting for your sign-in" },
  { id: "admin", step: "admin", label: "S2 · Waiting for your admin" },
  { id: "key", step: "key", label: "S3 · Paste a setup key" },
  { id: "checking", step: "checking", label: "S4 · Checking the address" },
  { id: "secure-on", step: "secure", label: "S5a · HTTPS on" },
  { id: "secure-off", step: "secure", label: "S5b · HTTPS off" },
  { id: "secure-none", step: "secure", label: "S5c · No HTTPS (NetBird)" },
  { id: "keep", step: "keep", label: "S6 · Keep it signed in" },
  { id: "keep-off", step: "keep", label: "S6 · Expiry switched off" },
  { id: "phone", step: "phone", label: "S7 · Open it on your phone" },
  { id: "live", step: "live", label: "S8 · Live" },
  { id: "failed", step: "failed", label: "S9 · Failed" },
  { id: "unsupported", step: "unsupported", label: "S10 · Unsupported" },
] as const satisfies readonly { id: string; label: string; step: Step }[];

export type ViewId = (typeof VIEWS)[number]["id"];

/** The causes, in the order the advisor's table lists them. */
export const CAUSES: { id: Cause; label: string; on: Network[] }[] = [
  {
    id: "stale-link",
    label: "Sign-in link expired",
    on: ["tailscale", "headscale"],
  },
  {
    id: "wrong-tailnet",
    label: "Joined another tailnet",
    on: ["tailscale", "headscale"],
  },
  { id: "refused", label: "Admin didn't approve", on: ["headscale"] },
  { id: "key-refused", label: "NetBird refused the key", on: ["netbird"] },
  {
    id: "no-answer",
    label: "Address doesn't answer",
    on: ["tailscale", "headscale", "netbird"],
  },
  { id: "expired", label: "Key expired later", on: ["tailscale", "headscale"] },
  { id: "certs-off", label: "Certificates turned off", on: ["tailscale"] },
];

/**
 * The views a network has. Tailscale signs in by a link and issues
 * certificates. Headscale also waits on its admin, issues none yet
 * (juanfont/headscale#2527: "`tailscale cert` requires headscale to
 * implement /machine/set-dns", still open), and expires a node only where
 * its server sets `node.expiry` (default "0", no expiry), with no switch
 * per device. NetBird takes a key, issues no certificates, and never
 * expires a peer enrolled by a setup key (docs.netbird.io, Peer Session
 * Expiration: "Peers, added with a setup key, won't be affected").
 */
export function viewsOn(network: Network): ViewId[] {
  const skip: Record<Network, ViewId[]> = {
    tailscale: ["admin", "key", "secure-none"],
    headscale: ["key", "secure-on", "secure-off", "keep-off"],
    netbird: ["signin", "admin", "secure-on", "secure-off", "keep", "keep-off"],
  };
  return VIEWS.map((view) => view.id).filter(
    (id) => !skip[network].includes(id)
  );
}

/** The time the set-up's sign-in happened, for the expiry line: 23 Oct 2026. */
const SIGNED_IN = Date.UTC(2026, 9, 23);
/** A person's sign-in expires after 180 days (facts §4). */
export const EXPIRY_DAYS = 180;
export const EXPIRES = SIGNED_IN + EXPIRY_DAYS * DAY_MS;
/** "21 Apr 2027". */
export const dateOf = (at: number): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(at);

/** How long the drawn hub takes to see each thing happen, in ms. */
const HUB = {
  finding: 1600,
  signin: 6000,
  approve: 6000,
  checking: 3200,
  certs: 4500,
  expiry: 4500,
  phone: 7000,
} as const;

/** One fact in the Details' Facts list: drawn by its mark, said in a line. */
export interface Fact {
  /** `yes` a check, `no` a cross, `wait` the live dot, `info` a plain mark. */
  mark: "yes" | "no" | "wait" | "info";
  text: string;
}

/**
 * A device joining a network: the network's facts, what it offers the
 * device, and the name the device was given. Each drawing of the set-up
 * extends it, with its own steps.
 */
export abstract class NetworkDevice {
  network = $state<Network>("tailscale");
  /** The network gave another name than cawco. */
  nameTaken = $state(false);

  readonly facts = $derived(NETWORKS[this.network]);
  /** Only Tailscale issues certificates for its names (see `viewsOn`). */
  readonly issuesCerts = $derived(this.network === "tailscale");
  /** Only Tailscale's device carries an expiry the flow asks about; Headscale's is its server's, NetBird's none. */
  readonly expires = $derived(this.network === "tailscale");
  /** The name the device was given: what every later state shows and types. */
  readonly name = $derived(deviceName(this.network, this.nameTaken));
  /** The long name, under the network's suffix. */
  readonly long = $derived(`${this.name}.${this.facts.domain}`);

  abstract go(step: (typeof REDO)[keyof typeof REDO]): void;

  /** A failure's way out, where it redoes a step the network asked for (REDO): true when it went. */
  protected redo(cause: string): cause is keyof typeof REDO {
    if (!Object.hasOwn(REDO, cause)) {
      return false;
    }
    this.go(REDO[cause as keyof typeof REDO]);
    return true;
  }
}

/**
 * The live set-up: where it stands, on which network, and what the person
 * has done. Its methods are the presses the tray offers, each moving it as
 * the hub would.
 */
export class AddressTray extends NetworkDevice {
  step = $state<Step>("finding");
  cause = $state<Cause>("stale-link");
  /** Where it was opened from: Settings is the only way to an unsupported network. */
  source = $state<Source>("needs");
  /** The tray stands open; closed, its work goes on and its row says where it stands. */
  open = $state(false);
  /** This dashboard runs on https (or localhost): Copy works. */
  overHttps = $state(true);
  /** The tailnet issues certificates. */
  certs = $state(false);
  /** Key expiry is switched off for cawco's device. */
  expiryOff = $state(false);
  /** A phone (or this phone) has opened the address once. */
  phoneOpened = $state(false);
  /**
   * The hub sees a phone's first request reach its device, and ticks the
   * phone step by itself (the advisor's open question 1, unsettled until
   * the embedded client is tried); off, the step waits on Done.
   */
  seesPhone = $state(true);
  /** An optional station the person skipped. */
  skipped = $state<{ secure: boolean; keep: boolean; phone: boolean }>({
    secure: false,
    keep: false,
    phone: false,
  });
  /** The person pressed the page an admin acts on, and the hub watches for the change. */
  watching = $state(false);
  /** The step ‹ goes back to, on an optional station reached from another one. */
  back = $state<Step | null>(null);
  /** The NetBird key as pasted: never kept past Use this key. */
  key = $state("");
  /** It has been live once: the confetti is for that once. */
  celebrated = $state(false);
  /** Live for the first time this opening: the confetti plays. */
  firstLive = $state(false);
  /** The Details fold stands open. */
  details = $state(false);
  /** Stop or Remove asked, waiting on its confirmation. */
  stopping = $state(false);
  /** The set-up was stopped or removed: the row is gone, Settings offers Set up again. */
  stopped = $state(false);
  /** The view the story's control last jumped to: a jumped state holds still. */
  jumped = $state(false);

  #timer: ReturnType<typeof setTimeout> | undefined;

  /** The word a browser navigates on, slash and all. */
  readonly typed = $derived(`${this.name}/`);
  /** The short address: plain http, the bare word. */
  readonly short = $derived(`http://${this.name}/`);
  /** The long address: https once the tailnet issues certificates; NetBird's stays http. */
  readonly longAddress = $derived(
    this.issuesCerts && this.certs
      ? `https://${this.long}`
      : `http://${this.long}`
  );
  /** NetBird resolves only the long name until its admin adds a search domain (facts §7). */
  readonly bareWordWorks = $derived(this.network !== "netbird");
  /** The address that opens CawCo on any device (the QR, the phone's button, the row once live): the word where it resolves, else the long name. */
  readonly phoneAddress = $derived(
    this.bareWordWorks ? this.short : `http://${this.long}/`
  );
  /** What a browser is told to type the first time. */
  readonly phoneTyped = $derived(this.bareWordWorks ? this.typed : this.long);
  /** The view the control shows for where it stands now. */
  readonly view = $derived.by((): ViewId => {
    switch (this.step) {
      case "secure":
        if (!this.issuesCerts) {
          return "secure-none";
        }
        return this.certs ? "secure-on" : "secure-off";
      case "keep":
        return this.expiryOff ? "keep-off" : "keep";
      case "finding":
      case "found":
      case "signin":
      case "admin":
      case "key":
      case "checking":
      case "phone":
      case "live":
      case "failed":
      case "unsupported":
        return this.step;
    }
  });
  /** It is waiting on something only the hub can see happen. */
  readonly waiting = $derived(
    this.step === "finding" ||
      this.step === "signin" ||
      this.step === "admin" ||
      this.step === "checking" ||
      (this.step === "phone" && !this.phoneOpened && this.seesPhone) ||
      this.watching
  );

  /** Caw's pose here, and the pose the advisor wants where none is drawn yet. */
  readonly pose = $derived.by(
    (): { pose: TrayPose[]; toDraw?: PoseToDraw; standIn?: string } => {
      switch (this.step) {
        case "finding":
          return { pose: ["ready"] };
        case "found":
          return { pose: ["climb", "idle"] };
        case "signin":
          return {
            pose: ["loading"],
            toDraw: "look-up",
            standIn: "loading",
          };
        case "admin":
        case "checking":
          return { pose: ["loading"] };
        case "key":
          return { pose: ["head-smile"] };
        case "secure":
          if (!this.issuesCerts) {
            return { pose: ["head-unsmile", "idle"] };
          }
          return { pose: this.certs ? ["head-smile"] : ["idle"] };
        case "keep":
          return { pose: ["head-beat"] };
        case "phone":
          return { pose: ["ready"], toDraw: "phone", standIn: "peek" };
        case "live":
          return { pose: ["done"] };
        case "failed":
          return { pose: ["needs-you"] };
        case "unsupported":
          return {
            pose: ["head-unsmile"],
            toDraw: "shrug",
            standIn: "head-unsmile",
          };
        default:
          return { pose: ["idle"] };
      }
    }
  );

  constructor(init: Partial<Pick<AddressTray, "network" | "source">> = {}) {
    super();
    if (init.network) {
      this.network = init.network;
    }
    if (init.source) {
      this.source = init.source;
    }
  }

  /** Stops the drawn hub's next move. */
  #hold(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /** The drawn hub sees the thing happen `ms` from now, unless this state was jumped to. */
  #after(ms: number, then: () => void): void {
    this.#hold();
    if (this.jumped) {
      return;
    }
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      then();
    }, ms);
  }

  /** Moves on in the flow, as a press or the hub moves it. */
  go(step: Step, from: Step | null = null): void {
    this.jumped = false;
    this.watching = false;
    this.stopping = false;
    this.back = from;
    this.step = step;
    this.firstLive = step === "live" && !this.celebrated;
    this.celebrated ||= this.firstLive;
    this.#arrive();
  }

  /** What the drawn hub does on arriving at a state it watches. */
  #arrive(): void {
    switch (this.step) {
      case "finding":
        this.#after(HUB.finding, () => this.go("found"));
        return;
      case "signin":
        this.#after(HUB.signin, () =>
          this.go(this.network === "headscale" ? "admin" : "checking")
        );
        return;
      case "admin":
        this.#after(HUB.approve, () => this.go("checking"));
        return;
      case "checking":
        this.#after(HUB.checking, () => this.go("secure"));
        return;
      case "phone":
        if (!this.phoneOpened && this.seesPhone) {
          this.#after(HUB.phone, () => {
            this.phoneOpened = true;
          });
        }
        return;
      case "found":
      case "key":
      case "secure":
      case "keep":
      case "live":
      case "failed":
      case "unsupported":
        this.#hold();
    }
  }

  /** The story's control: any state, network and cause, held still to be read. */
  jump(view: ViewId): void {
    this.#hold();
    const valid = viewsOn(this.network);
    if (!valid.includes(view)) {
      this.network = (["tailscale", "headscale", "netbird"] as const).find(
        (one) => viewsOn(one).includes(view)
      ) as Network;
    }
    const step = VIEWS.find((one) => one.id === view)?.step ?? "finding";
    this.jumped = true;
    this.watching = false;
    this.stopping = false;
    this.back = null;
    this.firstLive = false;
    this.stopped = false;
    if (view === "secure-on") {
      this.certs = true;
    } else if (view === "secure-off") {
      this.certs = false;
    } else if (view === "keep-off") {
      this.expiryOff = true;
    } else if (view === "keep") {
      this.expiryOff = false;
    }
    if (step === "failed") {
      const fits = CAUSES.filter((one) => one.on.includes(this.network));
      if (!fits.some((one) => one.id === this.cause)) {
        this.cause = fits[0].id;
      }
    }
    if (step === "unsupported") {
      this.source = "settings";
    }
    if (step === "phone") {
      this.phoneOpened = false;
    }
    this.step = step;
    this.open = true;
  }

  /** The control's network: the same state on another network, or its nearest kin there. */
  switchNetwork(network: Network): void {
    const was = this.view;
    this.network = network;
    const near: Partial<Record<ViewId, ViewId>> =
      network === "netbird"
        ? {
            signin: "key",
            admin: "key",
            "secure-on": "secure-none",
            "secure-off": "secure-none",
            keep: "phone",
            "keep-off": "phone",
          }
        : {
            key: "signin",
            ...(network === "tailscale"
              ? { admin: "signin", "secure-none": "secure-off" }
              : {
                  "secure-on": "secure-none",
                  "secure-off": "secure-none",
                  "keep-off": "keep",
                }),
          };
    this.jump(near[was] ?? was);
  }

  /** The control's cause, shown on the failed state. */
  switchCause(cause: Cause): void {
    const fits = CAUSES.find((one) => one.id === cause);
    if (fits && !fits.on.includes(this.network)) {
      this.network = fits.on[0];
    }
    this.cause = cause;
    this.jump("failed");
  }

  /** Opens the tray where the set-up stands; the first opening starts it. */
  show(): void {
    this.open = true;
    this.stopped = false;
    if (this.step === "finding" && !this.#timer && !this.jumped) {
      this.#arrive();
    }
  }

  /**
   * The host's close: it carries the tray back into where it came from
   * (the row, the button, the screen's foot), then calls `done`.
   */
  closer: ((done: () => void) => void) | null = null;

  /** ×, Esc, a press outside, Done: the tray closes, the work goes on. */
  park(): void {
    if (this.open && this.closer) {
      this.closer(() => this.parkNow());
      return;
    }
    this.parkNow();
  }

  /** Closed at once: a drag down has already carried it off. */
  parkNow(): void {
    this.open = false;
    this.details = false;
    this.stopping = false;
    this.firstLive = false;
  }

  /** The first step's press: sign in by the link, or on to NetBird's key. */
  begin(): void {
    this.go(this.network === "netbird" ? "key" : "signin");
  }

  /** NetBird's Use this key: the key goes, and the hub joins with it. */
  useKey(): void {
    if (this.key.trim() === "") {
      return;
    }
    this.key = "";
    this.go("checking");
  }

  /** The person opened the admin's page: the hub watches for the switch. */
  watch(kind: "certs" | "expiry"): void {
    if (this.watching) {
      return;
    }
    this.watching = true;
    this.#hold();
    this.#timer = setTimeout(
      () => {
        this.#timer = undefined;
        this.watching = false;
        if (kind === "certs") {
          this.certs = true;
          if (this.step === "failed") {
            this.go("live");
          }
        } else {
          this.expiryOff = true;
        }
      },
      kind === "certs" ? HUB.certs : HUB.expiry
    );
  }

  /** On past an optional station: Secure, then Keep (Tailscale's expiry only), then the phone. */
  next(): void {
    const from = this.step;
    if (from === "secure") {
      this.skipped.secure = this.issuesCerts && !this.certs;
      this.go(this.expires ? "keep" : "phone", from);
    } else if (from === "keep") {
      this.skipped.keep = !this.expiryOff;
      this.go("phone", from);
    } else if (from === "phone") {
      this.skipped.phone = !this.phoneOpened;
      this.go("live", from);
    } else {
      this.go("live");
    }
  }

  /** ‹: the station before, where one was. */
  goBack(): void {
    if (this.back) {
      this.go(this.back);
    }
  }

  /** From the live state, a station not done reopens its tray. */
  reopen(station: "secure" | "keep" | "phone"): void {
    this.go(station, "live");
  }

  /** The phone itself opened the address. */
  openedHere(): void {
    this.phoneOpened = true;
    this.next();
  }

  /** The failed state's way out, as its button says it. */
  wayOut(): void {
    const { cause } = this;
    if (this.redo(cause)) {
      return;
    }
    switch (cause) {
      case "key-refused":
        this.go("key");
        return;
      case "no-answer":
        this.go("checking");
        return;
      case "certs-off":
        this.watch("certs");
        return;
      default:
        this.go("found");
    }
  }

  /** Stop (while setting up) or Remove (once live), once confirmed. */
  stop(): void {
    this.#hold();
    this.stopping = false;
    this.stopped = true;
    this.park();
    this.step = "finding";
    this.jumped = true;
    this.celebrated = false;
    this.phoneOpened = false;
    this.skipped = { secure: false, keep: false, phone: false };
  }

  /** The story's Start again: a set-up not yet begun, its row standing, the tray closed. */
  restart(): void {
    this.#hold();
    this.parkNow();
    this.step = "finding";
    this.jumped = false;
    this.stopped = false;
    this.back = null;
    this.watching = false;
    this.celebrated = false;
    this.phoneOpened = false;
    this.expiryOff = false;
    this.certs = false;
    this.key = "";
    this.skipped = { secure: false, keep: false, phone: false };
  }

  /** Done on the live state: it closes, and the row says it is live. */
  finish(): void {
    this.park();
  }

  /** Lets go of the drawn hub's timer, as the story unmounts. */
  dispose(): void {
    this.#hold();
  }
}
