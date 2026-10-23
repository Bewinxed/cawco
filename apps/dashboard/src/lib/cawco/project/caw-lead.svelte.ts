/**
 * A project's Caw, as one page holds him: on or off, his harness and model,
 * his session and whether he can start, from what the dashboard holds (the
 * project's row and the machines), and what his face and the head's line
 * say now, derived from live sources only (PRODUCT.md, Derived liveness).
 * The hub's view of him (`GET …/caw`) is read for what only it carries:
 * what he started that still runs, what his own turn answers, his spend.
 * The landing page's head draws it; a thread tab reads the same status.
 *
 * The status (fable-lead-switch.md §3, design §2 States):
 * - `reconnecting` while the hub is unreachable, `loading` while another
 *   project's board is on its way past its grace;
 * - `loading` until the project's row is read (shown past its grace);
 * - `needs-you` while the lead has a question parked in a thread;
 * - `working` while the lead session is in a turn of its own, on or off;
 * - `sleeping` otherwise while he is off: only your words wake him;
 * - `trying` while an attempt at a task runs again after a failed one;
 * - `done` for two breaths after a task lands in a done stage;
 * - `idle` when nothing is due (no task to do, under way or waiting);
 * - else `ready`.
 *
 * Past the project's spend cap the head's line says so whenever Caw has
 * nothing more pressing to say ("Budget reached · resets in 4h"), and his
 * panel says it too (project-caps.ts in the hub).
 */

import {
  CAW_NO_MACHINE,
  type CawInitiated,
  type CawView,
  type HarnessKind,
  type ProjectCap,
  questionsOf,
  type StarterPlace,
} from "@cawco/core";
import { failureWords } from "#lib/cawco/hub-read.js";
import { browser } from "$app/env";
import {
  type BlockedRequest,
  cawco,
  cawOf,
  configureCaw,
  type ProjectRow,
  threadsOf,
} from "../client.svelte";
import type { CawStatus } from "../home/Caw.svelte";
import { dur } from "../motion/curves.svelte";
import type { TaskSummary } from "../project-tasks";
import { store, stored } from "../storage";
import { isRetry } from "../tasks/retry";
import { ComposerDraft } from "../transcript/composer-draft.svelte";
import { resetLabel } from "../usage";

/** Where a project's panel being open or put away is kept, in this browser. */
const openKey = (projectId: string): string => `cawco.caw.open.${projectId}`;

/**
 * A project's page to open on Caw's panel when it is next drawn here: New
 * project lands on it with his panel open on the Setup thread.
 */
export const openOnArrival = (projectId: string): void => {
  store("local", openKey(projectId), "1");
};

/** The statuses the head Caw changes between, fetched once he is on screen. */
export const HEAD_NEXT: CawStatus[] = [
  "working",
  "needs-you",
  "done",
  "trying",
  "idle",
  "loading",
  "reconnecting",
];

/** `--breath` in ms (`calc(var(--c-500) * 4)`), read from the root. */
function breathMs(): number {
  const token = getComputedStyle(document.documentElement)
    .getPropertyValue("--c-500")
    .trim();
  const value = Number.parseFloat(token);
  return (token.endsWith("ms") ? value : value * 1000) * 4;
}

/** What the head's line says when Caw has something: words, or his ask as a link. */
export type CawWords =
  | { kind: "say"; text: string }
  | { kind: "ask"; more: number; text: string; threadId: string };

/**
 * What the page holds for its Caw: the project's id and row (its load's,
 * then the dashboard's live one), whether a machine was online as it loaded,
 * its tasks, and whether it is on its way to another project past the wait's
 * grace (Caw stands in for it: design §2, Loading).
 */
export interface CawPage {
  id: () => string;
  machinesOnline: () => boolean;
  project: () => ProjectRow | null;
  reading: () => boolean;
  tasks: () => TaskSummary[];
}

export class CawLead {
  /**
   * The hub's view, once read: what only it carries is read from it (what
   * he started that still runs, what his turn answers, his spend).
   */
  view = $state<CawView | null>(null);
  /** The last read or change the hub refused, in its words. */
  refused = $state<string | null>(null);
  /** A switch or harness change is on its way to the hub. */
  moving = $state(false);
  /** The task that just landed, held for two breaths. */
  landed = $state<string | null>(null);
  /**
   * The project's row has not come within --dur-wait-grace: only then does
   * Caw stand in for the wait (The Real Wait Rule); a row that comes sooner
   * shows nothing of its own.
   */
  waited = $state(false);
  /**
   * His panel stands beside the page (CawFloat), the page yielding it its
   * room. One panel whichever seat opened it: the head's at 48, or the 80
   * he stands at over an empty board or an empty Decisions tab. `anchor` is
   * the seat on screen now: focus goes back to it as the panel is put away.
   * Open or put away by the person is kept per project, so the
   * conversation is where they left it when they come back (caw-assistant
   * design, "Open/closed is remembered per project"); a project they never
   * opened or put it away on opens it while its board is empty
   * ({@link arrive}).
   */
  #open = $state(false);
  get open(): boolean {
    return this.#open;
  }
  set open(next: boolean) {
    this.#open = next;
    const id = this.#projectId();
    if (id) {
      store("local", openKey(id), next ? "1" : "0");
    }
  }
  anchor = $state<HTMLElement | null>(null);
  /**
   * A New thread asked for (the head's Ask Caw, the views bar's "+"):
   * his panel shows a thread not yet started, its composer taking the
   * caret, and clears it (CawThread).
   */
  fresh = $state(false);
  /** Your half-written words to him, in his panel's composer, kept while it is put away. */
  readonly draft = new ComposerDraft();
  #landedTimer: ReturnType<typeof setTimeout> | undefined;

  readonly #projectId: () => string;
  readonly #row: () => ProjectRow | null;
  readonly #loadedOnline: () => boolean;
  readonly #tasks: () => TaskSummary[];
  readonly #reading: () => boolean;
  /** The project this Caw is now ({@link follow}). */
  #for: string | null = null;
  /** The project whose arrival opened or kept his panel ({@link arrive}). */
  #arrivedFor: string | null = null;

  constructor(page: CawPage) {
    this.#projectId = page.id;
    this.#row = page.project;
    this.#loadedOnline = page.machinesOnline;
    this.#tasks = page.tasks;
    this.#reading = page.reading;
    // The wait is the seat's, from the moment it stands: a page still
    // connecting has not read the projects, and the seat must not stand
    // empty past the grace while it does (design §2, Loading). A server
    // render has no wait to stand in for.
    if (!browser) {
      return;
    }
    setTimeout(() => {
      if (this.project === null) {
        this.waited = true;
      }
    }, dur("--dur-wait-grace"));
  }

  /**
   * A starter's words into his panel's composer and the panel open, the
   * caret after them: nothing is sent (The Empty Starts Work Rule). The
   * send after it tells the hub whether its words went as they stood
   * (project-starters.ts outcomes), under the place it stood in.
   */
  ask(text: string, place: StarterPlace): void {
    this.draft.press(text, place);
    this.open = true;
  }

  /**
   * New work, told to him: his panel on a new thread, the caret in its
   * composer (the head's Ask Caw, the views bar's "+"). What he does
   * with it (files tasks, starts a session, asks back) is his.
   */
  newThread(): void {
    this.fresh = true;
    this.draft.focusWanted = true;
    this.open = true;
  }

  /**
   * Another project's Caw is not this one's: his view goes, and his panel
   * and your words to the last project's Caw with it.
   */
  #follow(id: string): void {
    if (this.#for === id) {
      return;
    }
    if (this.#for !== null) {
      this.#open = false;
      this.draft.text = "";
    }
    this.view = null;
    this.#for = id;
  }

  /**
   * The page has read the project's board and its row: his panel opens as
   * the person last left it here, else while the board is empty and he can
   * take words (a project just made opens on him). Once per project.
   * Arriving on a page his sheet would stand over (a decision page on a
   * phone, `covered`), it stays put away, as if put away by hand: his
   * thread keeps its place and his seat brings it back.
   */
  arrive(emptyBoard: boolean, covered: boolean): void {
    const id = this.#projectId();
    if (!id || this.#arrivedFor === id || !this.project) {
      return;
    }
    this.#follow(id);
    this.#arrivedFor = id;
    const kept = stored("local", openKey(id));
    this.#open = !covered && (kept === null ? emptyBoard : kept === "1");
  }

  /** Reads his view; the page calls it on arrival and after a reconnect. */
  async read(): Promise<void> {
    const id = this.#projectId();
    this.#follow(id);
    try {
      const view = await cawOf(id);
      if (id === this.#projectId()) {
        this.view = view;
        this.refused = null;
      }
    } catch (error) {
      this.refused = failureWords(error);
    }
  }

  /**
   * The project as the hub lists it, the page's (its load's read, then the
   * dashboard's own row): his switch, harness, model and session, kept
   * current by `projects.changed` (caw.ts `setLead`, `configure`) and by his
   * change's own answer (client `configureCaw`).
   */
  readonly project = $derived.by(() => this.#row());
  /** On or off; null until the project is read. */
  readonly on = $derived(this.project ? this.project.caw : null);
  /** His harness and model (null: the harness's default), the project's settings. */
  readonly harness = $derived(this.project?.cawHarness ?? null);
  readonly model = $derived(this.project?.cawModel ?? null);
  /** His session's id, while the hub has one. */
  readonly leadId = $derived(this.project?.leadInstanceId ?? null);
  /**
   * A machine is online for him to start on: the dashboard's machines once
   * the socket's first snapshot is in, the page load's read until then.
   */
  readonly #machinesOnline = $derived.by(() =>
    cawco.liveRead ? cawco.onlineMachines.length > 0 : this.#loadedOnline()
  );
  /** Why he cannot start now, in a sentence; null when he can. */
  readonly problem = $derived(this.#machinesOnline ? null : CAW_NO_MACHINE);
  /** You can talk to him, on or off: the project is read and a machine is online for him to start on. */
  readonly canTalk = $derived(this.project !== null && this.#machinesOnline);

  /** Caw is drawn: the project is read, the read outlasted its grace, or the hub is away. */
  readonly shown = $derived.by(
    () =>
      this.project !== null ||
      this.waited ||
      this.#reading() ||
      cawco.hub === "unreachable"
  );

  /** Turns the lead on or off, or moves it to another harness or model. */
  async configure(change: {
    harness?: HarnessKind;
    /** Turning him off with what he started still running: it finishes or stops. */
    initiated?: CawInitiated;
    model?: string | null;
    on?: boolean;
  }) {
    this.moving = true;
    try {
      this.view = await configureCaw(this.#projectId(), change);
      this.refused = null;
    } catch (error) {
      this.refused = failureWords(error);
    } finally {
      this.moving = false;
    }
  }

  /** A task moved into a done stage: `done` and its words, for two breaths. */
  land(taskId: string): void {
    clearTimeout(this.#landedTimer);
    this.landed = taskId;
    this.#landedTimer = setTimeout(() => {
      this.landed = null;
    }, 2 * breathMs());
  }

  /** The lead's session, while the hub has one. */
  readonly lead = $derived.by(() => {
    const id = this.leadId;
    return id ? (cawco.instanceIndex.byId.get(id) ?? null) : null;
  });

  /**
   * What the lead has asked in his threads, oldest first: his questions and
   * project settings (on his row), and memory proposals he asked about
   * (parked under their own id, tagged to one of this project's threads).
   */
  readonly asks = $derived.by((): BlockedRequest[] => {
    const id = this.leadId;
    const threads = new Set(
      threadsOf(this.#projectId()).map((thread) => thread.id)
    );
    return cawco.blocked.filter(
      (row) =>
        row.request.threadId &&
        (row.instanceId === id || threads.has(row.request.threadId))
    );
  });

  /** The attempt running again after a failed one, if any. */
  readonly retrying = $derived.by(() => this.#tasks().find(isRetry) ?? null);

  readonly status = $derived.by((): CawStatus => {
    // A wait stands over whatever he was: the hub away, or another
    // project's board on its way.
    if (cawco.hub === "unreachable") {
      return "reconnecting";
    }
    if (this.#reading()) {
      return "loading";
    }
    if (!this.project) {
      return "loading";
    }
    if (this.asks.length > 0) {
      return "needs-you";
    }
    // His own turn: an attempt he parents running is not Caw working. Off,
    // he still answers your words, and works while he does.
    const { leadId } = this;
    if (leadId && cawco.busyOf(leadId)) {
      return "working";
    }
    if (!this.project.caw) {
      return "sleeping";
    }
    if (this.retrying) {
      return "trying";
    }
    if (this.landed) {
      return "done";
    }
    const due = this.#tasks().some(
      (task) =>
        task.kind === "todo" ||
        task.kind === "active" ||
        task.kind === "waiting"
    );
    return due ? "ready" : "idle";
  });

  /** The project's spend cap while it holds the project back. */
  readonly cap = $derived.by((): ProjectCap | null =>
    cawco.capHolding(this.#projectId())
  );

  /** The cap's line: reached, and when the next period starts it clear. */
  readonly capLine = $derived.by((): string | null =>
    this.cap
      ? `Budget reached · resets ${resetLabel(new Date(this.cap.resetsAt).toISOString(), cawco.now)}`
      : null
  );

  /**
   * The cap's line while it is what he has to say: past the cap, with
   * nothing more pressing (the hub away, his board unread, an ask of yours,
   * a turn under way). His head's line and his panel's both say it.
   */
  readonly capSays = $derived.by((): string | null => {
    const pressing =
      this.status === "reconnecting" ||
      this.status === "loading" ||
      this.status === "needs-you" ||
      this.status === "working";
    return pressing ? null : this.capLine;
  });

  /** What Caw says on the head's line; null gives the line back to the place. */
  readonly words = $derived.by((): CawWords | null =>
    this.capSays ? { kind: "say", text: this.capSays } : this.#said
  );

  readonly #said = $derived.by((): CawWords | null => {
    switch (this.status) {
      case "reconnecting":
        return { kind: "say", text: "Reconnecting" };
      // The board's words while the board is unread, and only then: a seat
      // waiting on his own view says nothing over a board already drawn.
      case "loading":
        return this.#reading()
          ? { kind: "say", text: "Reading the board…" }
          : null;
      case "needs-you": {
        const [first] = this.asks;
        const question = questionsOf(
          first.request.toolName,
          first.request.input
        )?.[0]?.question;
        return {
          kind: "ask",
          text:
            question ??
            (first.request.presentation.summary || "Caw asks you something"),
          more: this.asks.length - 1,
          threadId: first.request.threadId as string,
        };
      }
      case "working": {
        const tool = this.leadId ? cawco.currentToolOf(this.leadId) : null;
        return {
          kind: "say",
          text: tool
            ? [tool.name, tool.glance].filter(Boolean).join(" · ")
            : "Working…",
        };
      }
      case "trying":
        return { kind: "say", text: `Retrying ${this.retrying?.id}` };
      case "done":
        return { kind: "say", text: `${this.landed} landed` };
      case "ready":
      case "idle":
      case "sleeping":
      case "compacted":
        return null;
    }
  });

  /** The panel's first line: what Caw is, in a sentence. */
  readonly sentence = $derived.by((): string => {
    switch (this.status) {
      case "sleeping": {
        // What he started and you let finish, still running.
        const finishing = (this.view?.running ?? []).filter(
          (one) => one.kind !== "turn"
        ).length;
        return finishing > 0
          ? `Off · ${finishing} of his still finishing`
          : "Off · answers when you write";
      }
      // A turn no thread woke works here, on his panel: what it answers.
      case "working":
        return `Awake · ${this.view?.answering ?? this.#said?.text ?? "working"}`;
      case "needs-you":
        return "Awake · waiting on you";
      case "trying":
        return `Awake · ${this.#said?.text}`;
      case "done":
        return `Awake · ${this.landed} landed`;
      case "loading":
        return "Reading the board…";
      case "reconnecting":
        return "Reconnecting to the hub";
      case "idle":
        return "Awake · nothing due";
      case "ready":
      case "compacted":
        return "Awake · resting";
    }
  });

  /** Caw holds his still: idle, and the done hold. */
  readonly holds = $derived(this.status === "idle" || this.status === "done");
}
