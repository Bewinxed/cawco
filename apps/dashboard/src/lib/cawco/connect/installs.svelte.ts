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
 */
import {
  currentStep,
  type Install,
  type InstallDraft,
  type InstallRoute,
  type InstallSignIn,
  type InstallStarted,
  type InstallsFrame,
  type InstallsRead,
  type JoinInfo,
} from "@cawco/core";
import { MediaQuery } from "svelte/reactivity";
import { replaceState } from "$app/navigation";
import { page } from "$app/state";
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

class Connect {
  /** Every install the hub keeps, oldest first. */
  installs = $state<Install[]>([]);
  /** The hub's draft, as it last said it. */
  hubDraft = $state<InstallDraft | null>(null);
  /** Whether the hub has answered this page once. */
  known = $state(false);
  /** Why the installs couldn't be read, while they couldn't. */
  readFailed = $state<string | null>(null);

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
  /** The draft as typed here. */
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

  #saveTimer: ReturnType<typeof setTimeout> | undefined;

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

  /** The hub's frame, or its answer to a read: the installs and the draft, whole. */
  take(read: InstallsRead): void {
    this.installs = read.installs;
    this.hubDraft = read.draft;
    this.known = true;
    this.readFailed = null;
    // A draft another device changed reads here too, unless this page is typing in it.
    if (!(this.open && this.id === null && this.#saveTimer)) {
      this.fields = read.draft
        ? {
            route: read.draft.route,
            target: read.draft.target,
            port: read.draft.port,
            signIn: read.draft.signIn,
            address: read.draft.address,
          }
        : { ...EMPTY_DRAFT };
    }
    // The window's install left the hub (removed elsewhere): the window has nothing to stand on.
    if (this.open && this.id && !this.install) {
      this.close();
    }
  }

  async load(): Promise<void> {
    try {
      const response = await fetch("/api/installs");
      if (!response.ok) {
        throw await hubRefusal(response);
      }
      this.take((await response.json()) as InstallsRead);
    } catch (error) {
      this.readFailed = failureWords(error);
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
      this.fields = { ...this.fields, route };
      this.saveDraft(true);
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

  /** The draft as typed now, kept by the hub soon (or at once). */
  saveDraft(now = false): void {
    clearTimeout(this.#saveTimer);
    const send = () => {
      this.#saveTimer = undefined;
      this.#putDraft(false)
        .then(async (response) => {
          if (response.ok) {
            this.take((await response.json()) as InstallsRead);
          }
        })
        .catch(() => undefined);
    };
    if (now) {
      send();
    } else {
      this.#saveTimer = setTimeout(send, DRAFT_SAVE_MS);
    }
  }

  /**
   * The page is going (a reload, the tab closed): a draft save still waiting
   * goes now, outliving the page (`keepalive`), since its timer never runs
   * after the page has gone, and nothing typed is lost.
   */
  flushDraft(): void {
    if (this.#saveTimer === undefined) {
      return;
    }
    clearTimeout(this.#saveTimer);
    this.#saveTimer = undefined;
    this.#putDraft(true).catch(() => undefined);
  }

  #putDraft(keepalive: boolean): Promise<Response> {
    const draft: InstallDraft = { ...this.fields };
    return fetch("/api/installs/draft", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
      keepalive,
    });
  }

  /** Back to Route: the draft forgets its route, nothing else. */
  chooseRoute(route: InstallRoute | null): void {
    this.fields = { ...this.fields, route };
    this.saveDraft(true);
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
   */
  async start(
    body: Record<string, unknown>,
    hold = 0
  ): Promise<InstallStarted> {
    const response = await fetch("/api/installs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw await hubRefusal(response);
    }
    const started = (await response.json()) as InstallStarted;
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
