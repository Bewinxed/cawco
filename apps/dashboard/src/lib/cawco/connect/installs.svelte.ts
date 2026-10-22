/**
 * Adding a machine, as this page holds it: the hub's installs and the draft
 * (hub installs.ts, `GET /api/installs` and the `installs` frame), and
 * Add machine's window over them: whether it stands open, on which install
 * or on the draft, and what it hangs from (DESIGN.md, The Work Outlives Its
 * Surface Rule).
 *
 * Everything the window shows is read from where the work lives: an install
 * from the hub, the draft from the hub (never a password), and which of them
 * the window stands on from the page's URL (`?install=<id>`, `?install=new`),
 * so a reload opens it again at the same step with the same details. The
 * password typed for a sign-in is this page's alone and goes with a reload;
 * the window says so.
 *
 * The draft travels as edits, never as a copy laid over the hub's: each
 * save carries only the fields typed since the last, stamped with this
 * page's order (core DraftStamp), one save at a time, outliving the page
 * (`keepalive`). What the hub says comes back in its order (`rev`), over the
 * socket and in answers alike, and an edit typed here stands over the hub's
 * draft until the hub has kept it, so nothing typed is lost to a save in
 * flight, an answer that arrives late, or a reload.
 */
import {
  currentStep,
  type DraftStamp,
  type Install,
  type InstallDraft,
  type InstallDraftEdit,
  type InstallRoute,
  type InstallSignIn,
  type InstallStart,
  type InstallStarted,
  type InstallsFrame,
  type InstallsRead,
  type JoinInfo,
} from "@cawco/core";
import { MediaQuery } from "svelte/reactivity";
import { replaceState } from "$app/navigation";
import { page } from "$app/state";
import { currentClientId } from "../client-id";
import { failureWords, hubRefusal } from "../hub-read";

/** The URL's word for the window: an install's id, or the draft's. */
export const INSTALL_PARAM = "install";
const DRAFT_KEY = "new";

/** Under the phone's line the window is the drawer (DESIGN.md, Breakpoints: 640px). */
export const phone = new MediaQuery("(width < 640px)");

/** Which of the window's steps stands. */
export type ConnectStep = "route" | "reach" | "running" | "outcome";

/** What the window hangs from: the Add machine that opened it, or the top bar's machines item. */
export type ConnectFrom = "add" | "bar";

/** The draft as the window edits it: the hub's, kept as the person types. */
export interface DraftFields {
  address: string | null;
  port: string;
  route: InstallRoute | null;
  signIn: InstallSignIn;
  target: string;
}

const EMPTY_DRAFT: DraftFields = {
  route: null,
  target: "",
  port: "",
  signIn: "key",
  address: null,
};

/** How long the draft waits after a keystroke before the hub keeps it. Our choice. */
const DRAFT_SAVE_MS = 400;
/** A save the hub didn't keep goes again after this, then twice as long each time up to the most. Our choice, as the fleet's read does. */
const RETRY_FIRST_MS = 1000;
const RETRY_MOST_MS = 10_000;

/** The fields an edit may carry: what the hub's draft holds, but its code. */
const fieldsOf = (draft: InstallDraft): DraftFields => ({
  route: draft.route,
  target: draft.target,
  port: draft.port,
  signIn: draft.signIn,
  address: draft.address,
});

class Connect {
  /** Every install the hub keeps, oldest first. */
  installs = $state<Install[]>([]);
  /** The hub's draft, as the window shows it: as the hub last said it, but while a start from it is under way. */
  hubDraft = $state<InstallDraft | null>(null);
  /** Whether the hub has answered this page once. */
  known = $state(false);

  /** The window stands open. */
  open = $state(false);
  /** The install it stands on; null on the draft. */
  id = $state<string | null>(null);
  /** What it hangs from, and the element itself while it is on the page. */
  from = $state<ConnectFrom>("bar");
  anchor: HTMLElement | null = null;
  /** The output sheet stands open beside the window. */
  output = $state(false);
  /**
   * The window came back from the output sheet: it hands focus to its Open
   * output as it arrives (ConnectWindow `arrive`), then forgets it.
   */
  backFromOutput = false;
  /** The window the output sheet was opened from, to bring back as it closes. */
  #outputFrom: {
    id: string;
    anchor: HTMLElement | null;
    from: ConnectFrom;
  } | null = null;
  /** The draft as the window shows it: the hub's, under every edit typed here it hasn't kept yet. */
  fields = $state<DraftFields>({ ...EMPTY_DRAFT });
  /**
   * The sign-in password, typed in this page only: never sent but with the
   * Add machine or Retry that uses it, never kept by the hub.
   */
  password = $state("");
  /** The window was opened again by a reload that had a password in it: it says why the field is empty. */
  passwordLost = $state(false);
  /** The hub's addresses and key, for Reach. */
  join = $state<JoinInfo | null>(null);
  joinFailed = $state<string | null>(null);

  /** The hub's `rev` of what this page shows: anything older is passed over. */
  #rev = 0;
  /** The hub's draft as it last said it. */
  #draftNow: InstallDraft | null = null;
  /**
   * A start from the draft is under way: the window shows the draft it
   * started from, its line and code with it, until it stands on the install
   * (the hub has used the draft up meanwhile).
   */
  #starting = false;
  /** Edits typed here, not yet sent. */
  #unsaved: Partial<DraftFields> = {};
  /** The edits of the save the hub hasn't answered: one at a time, so they land in the order typed. */
  #sending: Partial<DraftFields> | null = null;
  /** This page's count of its draft edits and the starts made from the draft (DraftStamp `seq`). */
  #seq = 0;
  #saveTimer: ReturnType<typeof setTimeout> | undefined;
  #saveRetryMs = RETRY_FIRST_MS;
  #readRetry: ReturnType<typeof setTimeout> | undefined;

  /** The install the window stands on, as the hub has it now. */
  get install(): Install | null {
    return this.installs.find((one) => one.id === this.id) ?? null;
  }

  /** The step the window stands on: read from the install or the draft, never kept apart from them. */
  get step(): ConnectStep {
    const { install } = this;
    if (install) {
      return install.state === "running" ? "running" : "outcome";
    }
    return this.fields.route === null ? "route" : "reach";
  }

  /** The installs the band shows: every one but those whose machine already has its own row now. */
  get band(): Install[] {
    return this.installs.filter((one) => one.state !== "joined");
  }

  /**
   * The hub's frame, or its answer to a request: the installs and the draft,
   * whole, unless it is older than what this page shows already (`rev`).
   * Whether it was taken.
   */
  take(read: InstallsRead): boolean {
    if (read.rev < this.#rev) {
      return false;
    }
    this.#rev = read.rev;
    this.installs = read.installs;
    this.#draftNow = read.draft;
    this.known = true;
    this.#show();
    // The window's install left the hub (removed elsewhere): the window has nothing to stand on.
    if (this.open && this.id && !this.install) {
      this.close();
    }
    return true;
  }

  /**
   * The hub was reached on a new socket: its next read is taken whatever its
   * `rev`, since a restarted hub counts from its own start.
   */
  reconnected(): Promise<void> {
    this.#rev = 0;
    return this.load();
  }

  /**
   * The draft the window shows: another device's edits read here as they
   * reach the hub, under this page's own until the hub has kept them.
   */
  #show(): void {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: start() sets it across its awaits; the rule reads only the field's initial value
    if (this.#starting) {
      return;
    }
    this.hubDraft = this.#draftNow;
    this.fields = {
      ...(this.#draftNow ? fieldsOf(this.#draftNow) : EMPTY_DRAFT),
      ...this.#sending,
      ...this.#unsaved,
    };
  }

  /**
   * The installs and the draft, read whole. A read that fails is tried again
   * after a second, then twice as long each time up to ten, while the hub's
   * socket stays open, as the fleet's read is (client.svelte.ts `readFleet`);
   * a socket that closes reads them again as it is back.
   */
  async load(delay = 1000): Promise<void> {
    clearTimeout(this.#readRetry);
    try {
      const response = await fetch("/api/installs");
      if (!response.ok) {
        throw await hubRefusal(response);
      }
      this.take((await response.json()) as InstallsRead);
    } catch {
      if (globalThis.__cawcoSocket?.readyState !== WebSocket.OPEN) {
        return;
      }
      this.#readRetry = setTimeout(() => {
        // biome-ignore lint/complexity/noVoid: fire-and-forget; each read schedules its own next try
        void this.load(Math.min(delay * 2, 10_000));
      }, delay);
    }
  }

  async loadJoin(): Promise<void> {
    try {
      const response = await fetch("/api/join");
      if (!response.ok) {
        throw await hubRefusal(response);
      }
      this.join = (await response.json()) as JoinInfo;
      this.joinFailed = null;
    } catch (error) {
      this.joinFailed = failureWords(error);
    }
  }

  /**
   * The URL says which install the window stands on, so a reload opens it
   * there. Read from the address bar itself: a shallow replace (this one's
   * last) reaches `page.shallow`, never `page.url`, which keeps the last
   * navigation's (SvelteKit 3.1 `update_state`).
   */
  #writeUrl(): void {
    const now = new URL(location.href);
    const url = new URL(now);
    if (this.open) {
      url.searchParams.set(INSTALL_PARAM, this.id ?? DRAFT_KEY);
    } else {
      url.searchParams.delete(INSTALL_PARAM);
    }
    if (url.href !== now.href) {
      replaceState(url, page.state);
    }
  }

  /**
   * The window as the URL names it: after a reload, or a link that opens an
   * install (a row of Caw's panel, a notification). It opens on the same
   * install or the draft, hung from the bar's machines item. Asked once the
   * hub's installs are known, so it never opens on an install it can't read.
   */
  follow(named: string | null): void {
    if (!(named && this.known)) {
      return;
    }
    const id = named === DRAFT_KEY ? null : named;
    if (this.open && this.id === id) {
      return;
    }
    if (id !== null && !this.installs.some((one) => one.id === id)) {
      // An install the hub no longer keeps: the URL forgets it.
      this.open = false;
      this.#writeUrl();
      return;
    }
    this.open = true;
    this.from = "bar";
    this.anchor = null;
    this.id = id;
    this.output = false;
    // A sign-in that needed a password needs it typed again: it was never kept.
    this.passwordLost =
      this.fields.signIn === "password" ||
      this.installs.some((one) => one.id === id && one.signIn === "password");
  }

  /**
   * Add machine: the draft, on the route the entry point implies, or where
   * it was left. A route the caller names replaces the draft's choice.
   */
  openNew(anchor: HTMLElement | null, route?: InstallRoute): void {
    this.from = anchor ? "add" : "bar";
    this.anchor = anchor;
    this.id = null;
    this.output = false;
    this.passwordLost = false;
    if (route && this.fields.route !== route) {
      this.edit({ route }, true);
    }
    this.open = true;
    this.#writeUrl();
  }

  /** One install's window, where it stands: its row, a notification, the bar's popover. */
  openInstall(
    id: string,
    anchor: HTMLElement | null,
    from: ConnectFrom = "bar"
  ): void {
    this.from = from;
    this.anchor = anchor;
    this.id = id;
    this.output = false;
    this.passwordLost = false;
    this.open = true;
    this.#writeUrl();
  }

  /** Open output: the window parks into its row as the output's sheet opens. */
  openOutput(): void {
    this.#outputFrom = this.id
      ? { id: this.id, anchor: this.anchor, from: this.from }
      : null;
    this.open = false;
    this.output = true;
    this.#writeUrl();
  }

  /**
   * The output's sheet closes, by Close or Esc: back-navigation, so the
   * window it was opened from comes back where it was, on its install, its
   * Open output in hand (The Work Outlives Its Surface Rule). With no window
   * to come back to (its install gone), the sheet gives focus to where the
   * install is parked (OutputSheet).
   */
  closeOutput(): void {
    const back = this.#outputFrom;
    this.#outputFrom = null;
    this.output = false;
    if (back && this.installs.some((one) => one.id === back.id)) {
      this.backFromOutput = true;
      this.openInstall(back.id, back.anchor, back.from);
      return;
    }
    this.#writeUrl();
  }

  /**
   * ×, Esc, a press outside, a drag down: the window parks and the work goes
   * on. An outcome stays where it was parked too (its row, a joined one's
   * notice), Retry on it, until Remove install takes it away.
   */
  close(): void {
    this.open = false;
    this.output = false;
    this.#outputFrom = null;
    this.#writeUrl();
  }

  /** An edit typed here: the window shows it at once, and the hub keeps it soon (or now). */
  edit(patch: Partial<DraftFields>, now = false): void {
    this.#unsaved = { ...this.#unsaved, ...patch };
    this.fields = { ...this.fields, ...patch };
    clearTimeout(this.#saveTimer);
    if (now) {
      this.#save();
    } else {
      this.#saveTimer = setTimeout(() => this.#save(), DRAFT_SAVE_MS);
    }
  }

  /**
   * The edits not yet sent go to the hub, one save at a time, so they land
   * in the order typed; the next goes as this one is answered. A save the
   * hub didn't keep (it was down, or refused it) leaves its edits standing
   * here, under any typed since, and goes again a second later, then twice
   * as long each time up to ten.
   */
  #save(): void {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = undefined;
    if (this.#sending || Object.keys(this.#unsaved).length === 0) {
      return;
    }
    const sending = this.#unsaved;
    this.#unsaved = {};
    this.#sending = sending;
    this.#send(sending)
      .then(async (response) => {
        if (!response.ok) {
          throw await hubRefusal(response);
        }
        const read = (await response.json()) as InstallsRead;
        this.#sending = null;
        this.#saveRetryMs = RETRY_FIRST_MS;
        // An answer older than a frame already taken still ends the save.
        if (!this.take(read)) {
          this.#show();
        }
        this.#save();
      })
      .catch(() => {
        this.#unsaved = { ...sending, ...this.#unsaved };
        this.#sending = null;
        this.#saveTimer = setTimeout(() => this.#save(), this.#saveRetryMs);
        this.#saveRetryMs = Math.min(this.#saveRetryMs * 2, RETRY_MOST_MS);
      });
  }

  /**
   * The page is going (a reload, the tab closed): every edit not yet kept
   * goes now, since no timer runs after the page has gone. A save still
   * unanswered goes on too; landing after this one, it changes nothing (its
   * stamp is older). Should the page stay after all (the back/forward
   * cache), its edits go again as usual.
   */
  flushDraft(): void {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = undefined;
    if (Object.keys(this.#unsaved).length === 0) {
      return;
    }
    this.#send({ ...this.#sending, ...this.#unsaved }).catch(() => undefined);
    this.#saveTimer = setTimeout(() => this.#save(), DRAFT_SAVE_MS);
  }

  /** The next stamp in this page's order of edits and starts. */
  #stamp(): DraftStamp {
    this.#seq += 1;
    return { page: currentClientId(), seq: this.#seq };
  }

  /**
   * Every save outlives the page (`keepalive`): one already sent when the
   * page goes is otherwise cancelled with it (Fetch, "terminate a fetch
   * group"), and what it carried never reaches the hub.
   */
  #send(draft: Partial<DraftFields>): Promise<Response> {
    const edit: InstallDraftEdit = { stamp: this.#stamp(), draft };
    return fetch("/api/installs/draft", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(edit),
      keepalive: true,
    });
  }

  /** Back to Route: the draft forgets its route, nothing else. */
  chooseRoute(route: InstallRoute | null): void {
    this.edit({ route }, true);
  }

  /** The SSH install of a running add for the same machine and port, if one runs. */
  runningFor(target: string, port: number | null): Install | undefined {
    return this.installs.find(
      (one) =>
        one.state === "running" &&
        one.route === "ssh" &&
        one.target === target.trim() &&
        one.port === port
    );
  }

  /**
   * Starts the install the draft describes: the window then stands on it,
   * after `hold` ms where the step that started it has something to say
   * first (Copy command's "Copied · Listening for it…"). The install is in
   * the band at once. Throws the hub's refusal.
   *
   * It uses the draft up (its stamp): the edits typed here before it are
   * done with, and one of them still on its way changes nothing once it
   * lands. An install already running for that machine opens instead, and
   * the draft stays.
   */
  async start(body: InstallStart, hold = 0): Promise<InstallStarted> {
    this.#starting = true;
    try {
      const response = await fetch("/api/installs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, stamp: this.#stamp() }),
      });
      if (!response.ok) {
        throw await hubRefusal(response);
      }
      const started = (await response.json()) as InstallStarted;
      if (!started.existing) {
        clearTimeout(this.#saveTimer);
        this.#saveTimer = undefined;
        this.#unsaved = {};
      }
      this.#adopt(started.install);
      this.password = "";
      this.passwordLost = false;
      if (hold > 0) {
        await new Promise((done) => setTimeout(done, hold));
      }
      if (this.open && this.id === null) {
        this.id = started.install.id;
        this.#writeUrl();
      }
      return started;
    } finally {
      this.#starting = false;
      this.#show();
    }
  }

  /** An install the hub just answered with, ahead of its frame. */
  #adopt(install: Install): void {
    const at = this.installs.findIndex((one) => one.id === install.id);
    this.installs =
      at === -1
        ? [...this.installs, install]
        : this.installs.map((one) => (one.id === install.id ? install : one));
  }

  async stop(id: string): Promise<void> {
    const response = await fetch(`/api/installs/${id}/stop`, {
      method: "POST",
    });
    if (!response.ok) {
      throw await hubRefusal(response);
    }
    this.take((await response.json()) as InstallsRead);
  }

  async retry(id: string): Promise<void> {
    const install = this.installs.find((one) => one.id === id);
    const response = await fetch(`/api/installs/${id}/retry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        install?.signIn === "password" ? { password: this.password } : {}
      ),
    });
    if (!response.ok) {
      throw await hubRefusal(response);
    }
    const started = (await response.json()) as InstallStarted;
    this.#adopt(started.install);
    // A command install retried is a new one, with a new code.
    this.id = started.install.id;
    this.password = "";
    this.passwordLost = false;
    this.#writeUrl();
  }

  /** Remove install, or a joined one's notice dismissed: it leaves the band. */
  async remove(id: string): Promise<void> {
    const response = await fetch(`/api/installs/${id}`, { method: "DELETE" });
    if (!response.ok) {
      throw await hubRefusal(response);
    }
    this.take((await response.json()) as InstallsRead);
  }

  /** The install's whole output, for the output sheet. */
  async outputOf(id: string): Promise<string[]> {
    const response = await fetch(`/api/installs/${id}/output`);
    if (!response.ok) {
      throw await hubRefusal(response);
    }
    return ((await response.json()) as { lines: string[] }).lines;
  }
}

export const connect = new Connect();

/** The hub's `installs` frame (client.svelte.ts). */
export function takeInstallsFrame(frame: InstallsFrame): void {
  connect.take(frame);
}

/**
 * The hub was reached on a socket (client.svelte.ts `hubReached`): the
 * installs and the draft are read whole, now that the socket carrying their
 * frames is open, so no change falls between the read and the frames (a
 * draft save that outlived a reload, an install a hub restart lost).
 */
export function readInstalls(): Promise<void> {
  return connect.reconnected();
}

/** A running install's step line, as the band and the window's head say it. */
export const runningStep = (install: Install) => currentStep(install);

/**
 * Where an install's work is parked, for focus to go back to as its window
 * or its output closes: its row where one is drawn, else what opens the
 * place its row lives in (the bar's machines item at the desk, the
 * navigation's button on a phone, whose sheet holds the band).
 */
export function parkedAt(id: string | null): HTMLElement | null {
  const rows = id
    ? document.querySelectorAll<HTMLElement>(
        `[data-install-row="${CSS.escape(id)}"]`
      )
    : [];
  const openers = document.querySelectorAll<HTMLElement>(
    "[data-machines], [data-slot=burger]"
  );
  return [...rows, ...openers].find((one) => one.checkVisibility()) ?? null;
}
