/**
 * A project's Caw, as one page holds him: the hub's view of the lead (on or
 * off, harness, the session, why it cannot start), and what his face and
 * the head's line say now, derived from live sources only (PRODUCT.md,
 * Derived liveness). The landing page's head draws it; a thread tab reads
 * the same status.
 *
 * The status (fable-lead-switch.md §3, design §2 States):
 * - `reconnecting` while the hub is unreachable, `loading` while another
 *   project's board is on its way past its grace;
 * - `sleeping` while the lead is off;
 * - `loading` until his view is first read (shown past its grace);
 * - `needs-you` while the lead has a question parked in a thread;
 * - `working` while the lead session is in a turn of its own;
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
  type CawHarness,
  type CawView,
  type ProjectCap,
  type ProjectSpend,
  questionsOf,
} from "@cawco/core";
import {
  type BlockedRequest,
  cawco,
  cawOf,
  configureCaw,
  projectSpend,
} from "../client.svelte";
import type { CawStatus } from "../home/Caw.svelte";
import { dur } from "../motion/curves.svelte";
import type { TaskSummary } from "../project-tasks";
import { resetLabel } from "../usage";

/** What each harness Caw runs on is called. */
export const CAW_HARNESS_LABEL: Record<CawHarness, string> = {
  claude: "Claude Code",
  opencode: "OpenCode",
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

/** An attempt runs at a task whose attempt before it failed or was stopped. */
export const isRetry = (task: TaskSummary): boolean => {
  const [newest, before] = task.attempts;
  return (
    task.liveAttempt &&
    (newest?.state === "starting" || newest?.state === "running") &&
    (before?.state === "failed" || before?.state === "cancelled")
  );
};

/** What the head's line says when Caw has something: words, or his ask as a link. */
export type CawWords =
  | { kind: "say"; text: string }
  | { kind: "ask"; more: number; text: string; threadId: string };

export class CawLead {
  /** The hub's view, once read. */
  view = $state<CawView | null>(null);
  /** The last read or change the hub refused, in its words. */
  refused = $state<string | null>(null);
  /** A switch or harness change is on its way to the hub. */
  moving = $state(false);
  /** The project's spend, read when the panel opens. */
  spend = $state<ProjectSpend | null>(null);
  /** The task that just landed, held for two breaths. */
  landed = $state<string | null>(null);
  /**
   * His first read has outlasted --dur-wait-grace: only then does Caw stand
   * in for the wait (The Real Wait Rule); a read that lands sooner shows
   * nothing of its own.
   */
  waited = $state(false);
  #landedTimer: ReturnType<typeof setTimeout> | undefined;

  readonly #projectId: () => string;
  readonly #tasks: () => TaskSummary[];
  readonly #reading: () => boolean;
  /** The project `view` was read for. */
  #viewFor: string | null = null;

  /**
   * `reading`: the page is on its way to another project and the wait has
   * outlasted its grace; Caw stands in for it (design §2, Loading).
   */
  constructor(
    projectId: () => string,
    tasks: () => TaskSummary[],
    reading: () => boolean
  ) {
    this.#projectId = projectId;
    this.#tasks = tasks;
    this.#reading = reading;
  }

  /** Reads his view; the page calls it on arrival and after a reconnect. */
  async read(): Promise<void> {
    const id = this.#projectId();
    // Another project's Caw is not this one's: his view goes, and a Caw
    // already on screen holds `loading` until this project's is read.
    if (this.#viewFor !== id) {
      this.waited = this.view !== null || this.#reading();
      this.view = null;
      this.spend = null;
    }
    const grace = this.view
      ? undefined
      : setTimeout(() => {
          this.waited = this.view === null;
        }, dur("--dur-wait-grace"));
    try {
      const view = await cawOf(id);
      if (id === this.#projectId()) {
        this.view = view;
        this.#viewFor = id;
        this.refused = null;
      }
    } catch (error) {
      this.refused = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(grace);
      this.waited = false;
    }
  }

  /** Caw is drawn: his view is read, the read outlasted its grace, or the hub is away. */
  readonly shown = $derived.by(
    () =>
      this.view !== null ||
      this.waited ||
      this.#reading() ||
      cawco.hub === "unreachable"
  );

  /** Reads what the project has spent (the panel's line). */
  async readSpend(): Promise<void> {
    const id = this.#projectId();
    try {
      const spend = await projectSpend(id);
      if (id === this.#projectId()) {
        this.spend = spend;
      }
    } catch {
      // The panel's line stays as it was; the Usage page says why.
    }
  }

  /** Turns the lead on or off, or moves it to another harness or model. */
  async configure(change: {
    harness?: CawHarness;
    model?: string | null;
    on?: boolean;
  }) {
    this.moving = true;
    try {
      this.view = await configureCaw(this.#projectId(), change);
      this.refused = null;
    } catch (error) {
      this.refused = error instanceof Error ? error.message : String(error);
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
    const id = this.view?.leadInstanceId;
    return id ? (cawco.instanceIndex.byId.get(id) ?? null) : null;
  });

  /** The questions the lead has parked in threads, oldest first. */
  readonly asks = $derived.by((): BlockedRequest[] => {
    const id = this.view?.leadInstanceId;
    return id
      ? cawco.blocked.filter(
          (row) => row.instanceId === id && row.request.threadId
        )
      : [];
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
    if (this.view && !this.view.on) {
      return "sleeping";
    }
    if (!this.view) {
      return "loading";
    }
    if (this.asks.length > 0) {
      return "needs-you";
    }
    // His own turn: an attempt he parents running is not Caw working.
    const leadId = this.view.leadInstanceId;
    if (leadId && cawco.busyOf(leadId)) {
      return "working";
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

  /** What Caw says on the head's line; null gives the line back to the place. */
  readonly words = $derived.by((): CawWords | null => {
    const pressing =
      this.status === "reconnecting" ||
      this.status === "loading" ||
      this.status === "needs-you" ||
      this.status === "working";
    if (this.capLine && !pressing) {
      return { kind: "say", text: this.capLine };
    }
    return this.#said;
  });

  readonly #said = $derived.by((): CawWords | null => {
    switch (this.status) {
      case "reconnecting":
        return { kind: "say", text: "Reconnecting" };
      case "loading":
        return this.waited || this.#reading()
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
          text: question ?? "Caw asks you something",
          more: this.asks.length - 1,
          threadId: first.request.threadId as string,
        };
      }
      case "working": {
        const tool = this.view?.leadInstanceId
          ? cawco.currentToolOf(this.view.leadInstanceId)
          : null;
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
      default:
        return null;
    }
  });

  /** The panel's first line: what Caw is, in a sentence. */
  readonly sentence = $derived.by((): string => {
    switch (this.status) {
      case "sleeping":
        return "Asleep · nothing wakes a model";
      case "working":
        return `Awake · ${this.#said?.text ?? "working"}`;
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
      default:
        return "Awake · resting";
    }
  });

  /** Caw holds his still: idle, and the done hold. */
  readonly holds = $derived(this.status === "idle" || this.status === "done");
}
