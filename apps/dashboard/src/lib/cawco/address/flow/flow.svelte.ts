/**
 * The word address set up as one flow (design e791c712, §4): one tray that
 * transforms in place from Start to Done, Caw on its centre axis as a still
 * per moment, every failure in one shape. A working drawing for the design
 * preview (vite.config.ts beside it); nothing in the app reads it.
 *
 * The hub's part is played here as the kept drawing plays it
 * (tray.svelte.ts): each state moves on a few seconds after the person did
 * their part, when "the hub sees the thing happen". A state reached by a
 * jump (the page's moments) holds still, so it can be read; `manual` holds
 * every state still until `hubSees()` moves it, so a probe drives each
 * change on its own clock.
 *
 * Its facts are the kept drawing's (NETWORKS, the sign-in's expiry), and its
 * order is the report's: Start, Waiting (and Headscale's admin), Answers,
 * Phone, HTTPS (Tailscale, when certificates are off), Done.
 */
import { store, stored } from "#lib/cawco/storage.js";
import { NETWORKS, type Network } from "../tray.svelte";

/** One state of the tray, in the order the flow runs. */
export type Step =
  | "start"
  | "signin"
  | "admin"
  | "answers"
  | "phone"
  | "https"
  | "done"
  | "failed";

/** What went wrong (§4.5), each in the one failure shape. */
export type Cause =
  | "stopped"
  | "unsupported"
  | "stale-link"
  | "wrong-tailnet"
  | "refused"
  | "key-refused"
  | "taken"
  | "no-answer"
  | "expired"
  | "certs-off";

/** Caw's stills (caw/), one per moment (§4.4). */
export type Pose =
  | "start"
  | "waiting"
  | "admin"
  | "key"
  | "listen"
  | "phone"
  | "phone-up"
  | "lock-open"
  | "lock-shut"
  | "live"
  | "shrug"
  | "shrug-tag"
  | "shrug-hourglass";

/** Where the tray stands: Needs you's row, Settings' button, the phone's sheet. */
export type Surface = "needs" | "settings" | "phone";

/** The causes, each with the networks it happens on (an empty list: none of the three). */
export const CAUSES: { id: Cause; label: string; on: Network[] }[] = [
  {
    id: "stopped",
    label: "Client stopped",
    on: ["tailscale", "headscale", "netbird"],
  },
  { id: "unsupported", label: "Unsupported network", on: [] },
  {
    id: "stale-link",
    label: "Sign-in link expired",
    on: ["tailscale", "headscale"],
  },
  {
    id: "wrong-tailnet",
    label: "Another tailnet",
    on: ["tailscale", "headscale"],
  },
  { id: "refused", label: "Admin refused", on: ["headscale"] },
  { id: "key-refused", label: "Key refused", on: ["netbird"] },
  {
    id: "taken",
    label: "Name taken",
    on: ["tailscale", "headscale", "netbird"],
  },
  {
    id: "no-answer",
    label: "Doesn't answer",
    on: ["tailscale", "headscale", "netbird"],
  },
  { id: "expired", label: "Signed out", on: ["tailscale", "headscale"] },
  { id: "certs-off", label: "Certificates off", on: ["tailscale"] },
];

/** The page's moments: each state the flow stands in, held still to be read. */
export const MOMENTS = [
  { id: "start", label: "Start" },
  { id: "signin", label: "Waiting" },
  { id: "admin", label: "Admin" },
  { id: "answers", label: "Answers" },
  { id: "phone", label: "Phone" },
  { id: "phone-opened", label: "Phone opened" },
  { id: "https", label: "HTTPS" },
  { id: "https-on", label: "HTTPS on" },
  { id: "done", label: "Done" },
] as const satisfies readonly { id: string; label: string }[];

type StepMoment = (typeof MOMENTS)[number]["id"];
export type MomentId = StepMoment | `failed:${Cause}`;

/** Where each step moment stands the flow: its step, who opened it, its certificates, the networks it happens on (every one when unsaid). */
const PLACES: Record<
  StepMoment,
  { step: Step; phoneOpened?: "peer"; certs?: boolean; on?: Network[] }
> = {
  start: { step: "start" },
  signin: { step: "signin" },
  admin: { step: "admin", on: ["headscale"] },
  answers: { step: "answers" },
  phone: { step: "phone" },
  "phone-opened": { step: "phone", phoneOpened: "peer" },
  https: { step: "https", certs: false, on: ["tailscale"] },
  "https-on": { step: "https", certs: true, on: ["tailscale"] },
  done: { step: "done", phoneOpened: "peer" },
};

/** How long the drawn hub takes to see each thing happen, in ms. */
const HUB = {
  signin: 6000,
  approve: 6000,
  answers: 2400,
  phone: 7000,
  certs: 4500,
  expiry: 4500,
  name: 4500,
} as const;

/** The peer the drawn hub sees open the address first, from the tailnet's peer list. */
export const PEER = "Nour's iPhone";

/** What the page keeps across a reload: the work, and which trays stand open. */
interface Kept {
  cause: Cause;
  celebrated: boolean;
  certs: boolean;
  certsAtJoin: boolean;
  expiryOff: boolean;
  nameTaken: boolean;
  network: Network;
  open: Record<Surface, boolean>;
  phoneOpened: "peer" | "here" | null;
  started: boolean;
  step: Step;
  stopped: boolean;
}

const STORE = "cawco:address-preview";

export class AddressFlow {
  network = $state<Network>("tailscale");
  /** The fork: certificates were already on when cawco joined (HTTPS is then skipped). */
  certsAtJoin = $state(false);
  step = $state<Step>("start");
  cause = $state<Cause>("stale-link");
  /** The tailnet issues certificates now. */
  certs = $state(false);
  /** Tailscale named the device cawco-1 (NetBird cawco-12-7), and the person kept it. */
  nameTaken = $state(false);
  /** Who opened the address first: a peer the hub named, or this phone itself. */
  phoneOpened = $state<"peer" | "here" | null>(null);
  /** Key expiry is switched off for cawco's device. */
  expiryOff = $state(false);
  /** What the hub watches for after the person opened an admin's page. */
  watching = $state<"certs" | "expiry" | "name" | null>(null);
  /** The step ‹ goes back to, on an optional step reopened from Done. */
  back = $state<Step | null>(null);
  /** NetBird's key as pasted: never kept past Use this key. */
  key = $state("");
  /** It went live once: the confetti is for that once. */
  celebrated = $state(false);
  /** Live for the first time this opening. */
  firstLive = $state(false);
  /** Stop asked, waiting on its confirmation. */
  stopping = $state(false);
  /** Stopped (or removed): the row is gone and Settings offers Set up. */
  stopped = $state(false);
  /** It was begun once: Settings says Open. */
  started = $state(false);
  /** Which trays stand open. */
  open = $state<Record<Surface, boolean>>({
    needs: true,
    settings: true,
    phone: true,
  });
  /** A jumped state holds still. */
  jumped = $state(false);
  /** Every state holds still until `hubSees()` (the probe's clock). */
  manual = $state(false);
  /** The Check again of a failure that has nothing new to find. */
  checkedAgain = $state(false);

  #timer: ReturnType<typeof setTimeout> | undefined;
  #next: (() => void) | undefined;

  readonly facts = $derived(NETWORKS[this.network]);
  /** Only Tailscale issues certificates for its names. */
  readonly issuesCerts = $derived(this.network === "tailscale");
  /** Only Tailscale's device carries an expiry the person can switch off. */
  readonly expires = $derived(this.network === "tailscale");
  readonly name = $derived.by(() => {
    if (!this.nameTaken) {
      return "cawco";
    }
    return this.network === "netbird" ? "cawco-12-7" : "cawco-1";
  });
  /** NetBird resolves only its long name until an admin adds the search domain. */
  readonly bareWordWorks = $derived(this.network !== "netbird");
  readonly long = $derived(`${this.name}.${this.facts.domain}`);
  /** The address that opens CawCo: the word where it resolves, else the long name. */
  readonly address = $derived(
    this.bareWordWorks ? `http://${this.name}/` : `http://${this.long}/`
  );
  /** What a browser is told to type the first time, slash and all. */
  readonly typed = $derived(this.bareWordWorks ? `${this.name}/` : this.long);
  readonly secureAddress = $derived(`https://${this.long}`);
  /** It waits on something only the hub can see happen. */
  readonly waiting = $derived(
    this.step === "signin" ||
      this.step === "admin" ||
      this.step === "answers" ||
      (this.step === "phone" && this.phoneOpened === null) ||
      this.watching !== null
  );
  readonly pose = $derived.by((): Pose => {
    switch (this.step) {
      case "start":
        return this.network === "netbird" ? "key" : "start";
      case "signin":
        return "waiting";
      case "admin":
        return "admin";
      case "answers":
        return "listen";
      case "phone":
        return this.phoneOpened ? "phone-up" : "phone";
      case "https":
        return this.certs ? "lock-shut" : "lock-open";
      case "done":
        return "live";
      case "failed":
        if (this.cause === "taken") {
          return "shrug-tag";
        }
        return this.cause === "expired" ? "shrug-hourglass" : "shrug";
    }
  });

  /** Reads what the last visit kept, then keeps every change. */
  restore(): void {
    let kept: Partial<Kept> | null = null;
    try {
      kept = JSON.parse(stored("local", STORE) ?? "null");
    } catch {
      kept = null;
    }
    if (!kept) {
      return;
    }
    Object.assign(this, kept);
    // The work goes on where it stood: what it waited for, the hub still watches for.
    this.#arrive();
  }

  /** Holds every state still until `hubSees()` (on), or lets the hub's clock run again (off). */
  holdHub(on: boolean): void {
    this.manual = on;
    if (on) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  /** What `restore` reads back. */
  keep(): void {
    const kept: Kept = {
      certs: this.certs,
      cause: this.cause,
      celebrated: this.celebrated,
      certsAtJoin: this.certsAtJoin,
      expiryOff: this.expiryOff,
      nameTaken: this.nameTaken,
      network: this.network,
      open: this.open,
      phoneOpened: this.phoneOpened,
      started: this.started,
      step: this.step,
      stopped: this.stopped,
    };
    store("local", STORE, JSON.stringify(kept));
  }

  #hold(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#next = undefined;
  }

  /** The drawn hub sees the thing happen `ms` from now, or at `hubSees()`; a state jumped to waits for that. */
  #after(ms: number, then: () => void): void {
    this.#hold();
    this.#next = then;
    if (this.jumped || this.manual) {
      return;
    }
    this.#timer = setTimeout(() => this.hubSees(), ms);
  }

  /** The hub sees what it waits for, now. */
  hubSees(): void {
    const next = this.#next;
    this.#hold();
    next?.();
  }

  /** On in the flow, as a press or the hub moves it. */
  go(step: Step, from: Step | null = null): void {
    this.jumped = false;
    this.watching = null;
    this.stopping = false;
    this.checkedAgain = false;
    this.back = from;
    this.step = step;
    this.started = true;
    if (step === "done" && !this.celebrated) {
      this.celebrated = true;
      this.firstLive = true;
    } else {
      this.firstLive = false;
    }
    this.#arrive();
  }

  #arrive(): void {
    switch (this.step) {
      case "signin":
        this.#after(HUB.signin, () =>
          this.go(this.network === "headscale" ? "admin" : "answers")
        );
        return;
      case "admin":
        this.#after(HUB.approve, () => this.go("answers"));
        return;
      case "answers":
        this.#after(HUB.answers, () => {
          this.certs = this.certsAtJoin && this.issuesCerts;
          this.go("phone");
        });
        return;
      case "phone":
        if (this.phoneOpened === null) {
          this.#after(HUB.phone, () => {
            this.phoneOpened = "peer";
          });
        }
        return;
      case "start":
      case "https":
      case "done":
      case "failed":
        this.#hold();
    }
  }

  /** The hub sees the work fail, where it stands (a probe's way into a failure, as the hub would move it). */
  fail(cause: Cause): void {
    this.cause = cause;
    this.go("failed");
  }

  /** Start's press: the sign-in in a new tab, or NetBird's key. */
  begin(): void {
    if (this.network === "netbird") {
      this.useKey();
      return;
    }
    this.go("signin");
  }

  useKey(): void {
    if (this.key.trim() === "") {
      return;
    }
    this.key = "";
    this.go("answers");
  }

  /** The person opened an admin's page: the hub watches for the change. */
  watch(kind: "certs" | "expiry" | "name"): void {
    if (this.watching) {
      return;
    }
    this.watching = kind;
    this.#next = () => {
      this.watching = null;
      if (kind === "certs") {
        this.certs = true;
        if (this.step === "failed") {
          this.go("done");
        }
      } else if (kind === "expiry") {
        this.expiryOff = true;
      } else {
        this.nameTaken = false;
        this.go("phone");
      }
    };
    clearTimeout(this.#timer);
    if (!this.manual) {
      this.#timer = setTimeout(() => this.hubSees(), HUB[kind]);
    }
  }

  /** On past the phone: HTTPS where certificates are off on Tailscale, else Done. */
  next(): void {
    if (this.step === "phone" && this.issuesCerts && !this.certs) {
      this.go("https", this.back);
      return;
    }
    this.go("done");
  }

  /** ‹ on a step reopened from Done. */
  goBack(): void {
    if (this.back) {
      this.go(this.back);
    }
  }

  /** A mark on Done that is not done yet reopens its step, ‹ back to Done. */
  reopen(step: "phone" | "https"): void {
    if (step === "phone") {
      this.phoneOpened = null;
    }
    this.go(step, "done");
    this.back = "done";
  }

  /** The phone itself opened the address. */
  openedHere(): void {
    this.phoneOpened = "here";
    this.next();
  }

  /** A failure's way out, as its button says it. */
  wayOut(): void {
    switch (this.cause) {
      case "stale-link":
      case "wrong-tailnet":
      case "expired":
        this.go("signin");
        return;
      case "refused":
        this.go("admin");
        return;
      case "key-refused":
        this.go("start");
        return;
      case "taken":
        this.nameTaken = true;
        this.go("phone");
        return;
      case "no-answer":
        this.go("answers");
        return;
      case "certs-off":
        this.watch("certs");
        return;
      case "stopped":
      case "unsupported":
        this.checkedAgain = true;
    }
  }

  /** Stop (while it sets up) or Remove (once live), once confirmed. */
  stop(): void {
    this.#hold();
    this.stopping = false;
    this.stopped = true;
    this.started = false;
    this.open = { needs: false, settings: false, phone: false };
    this.step = "start";
    this.jumped = true;
    this.celebrated = false;
    this.phoneOpened = null;
    this.nameTaken = false;
    this.certs = false;
    this.expiryOff = false;
  }

  /** A surface's tray closes; the work goes on, its row says where it stands. */
  park(surface: Surface): void {
    this.open[surface] = false;
    this.stopping = false;
    this.firstLive = false;
  }

  show(surface: Surface): void {
    this.stopped = false;
    this.open[surface] = true;
  }

  /** The page's moments: any state on any network, held still. */
  jump(moment: MomentId): void {
    this.#hold();
    const failed = moment.startsWith("failed:");
    const cause = failed ? (moment.slice(7) as Cause) : null;
    const on = cause
      ? CAUSES.find((one) => one.id === cause)?.on
      : PLACES[moment as StepMoment].on;
    if (on && on.length > 0 && !on.includes(this.network)) {
      this.network = on[0];
    }
    this.jumped = true;
    this.watching = null;
    this.stopping = false;
    this.stopped = false;
    this.checkedAgain = false;
    this.back = null;
    this.firstLive = false;
    this.key = "";
    this.started = moment !== "start";
    this.nameTaken = false;
    this.certs = this.certsAtJoin && this.issuesCerts;
    this.phoneOpened = null;
    if (cause) {
      this.cause = cause;
      this.step = "failed";
      this.certs = cause === "certs-off" ? false : this.certs;
    } else {
      const place = PLACES[moment as StepMoment];
      this.step = place.step;
      this.phoneOpened = place.phoneOpened ?? null;
      this.certs = place.certs ?? this.certs;
    }
    this.open = { needs: true, settings: true, phone: true };
    this.#arrive();
  }

  /** The network fork: the same moment on another network, or its nearest kin there. */
  switchNetwork(network: Network, moment: MomentId): void {
    this.network = network;
    const NEAR: Record<Network, Partial<Record<MomentId, MomentId>>> = {
      tailscale: { admin: "signin" },
      headscale: { https: "done", "https-on": "done" },
      netbird: { https: "done", "https-on": "done", admin: "signin" },
    };
    const near = NEAR[network];
    const cause = moment.startsWith("failed:")
      ? CAUSES.find((one) => one.id === moment.slice(7))
      : undefined;
    const next =
      cause && cause.on.length > 0 && !cause.on.includes(network)
        ? "failed:no-answer"
        : (near[moment] ?? moment);
    this.jump(network === "netbird" && next === "signin" ? "start" : next);
  }

  /** The moment the page's strip shows as where it stands. */
  readonly moment = $derived.by((): MomentId => {
    switch (this.step) {
      case "phone":
        return this.phoneOpened ? "phone-opened" : "phone";
      case "https":
        return this.certs ? "https-on" : "https";
      case "failed":
        return `failed:${this.cause}`;
      case "start":
      case "signin":
      case "admin":
      case "answers":
      case "done":
        return this.step;
    }
  });

  dispose(): void {
    this.#hold();
  }
}
