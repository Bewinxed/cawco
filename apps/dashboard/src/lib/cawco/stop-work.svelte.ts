/**
 * Stopping a project's running sessions before an end of the caller's (the
 * forget's delete, Caw turned off), kept by the work, not by its tray
 * (DESIGN.md, The Work Outlives Its Surface Rule). A tray shows a job from
 * here: its rows, how far each stop has got, the end, a refusal. A forget's
 * is StopTray, which stops every row; Caw off's is CawOffTray, whose rows
 * are each checked to stop (`picked`), the unchecked ones kept running, and
 * whose one confirm turns him off and stops the checked ones in one request.
 *
 * Cancel, Esc or Stop waiting puts the tray away. Before the stop is pressed
 * that drops the ask, since nothing has started; after it, the job is
 * parked and goes on: each stop lands as its machine confirms it, and the
 * end runs once none is left. Parked, it shows on the project's row in the
 * rail, and where it was asked (StopParked): the stops landing, then a
 * failure in words, which stands until the reader acts on it. A press there
 * brings the tray back where it was.
 *
 * Every job is kept in the tab's storage. A reload reads what still runs
 * from the hub: a stop under way whose session no longer runs has landed,
 * one still listed is still stopping, and the end runs once none is left.
 */

import { detach } from "@cawco/core/detach";
import type { ProjectStopFrame } from "@cawco/core/frames";
import type {
  CawRunning,
  ProjectConversationView,
} from "@cawco/core/project-conversation";
import { cawOffWords } from "@cawco/core/words/caw-off";
import { untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { z } from "zod";
import { StopJobSchema } from "#lib/cawco/stored-shapes.js";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import {
  cawOf,
  configureCaw,
  deleteProject,
  onProjectStop,
  type RunningSession,
  readProjects,
  stopProjectSessions,
} from "./client.svelte";
import { failureWords, hubRefusal } from "./hub-read";
import { dur } from "./motion/curves.svelte";
import { route } from "./motion/route.svelte";
import { readJson, writeJson } from "./storage";

/** Where a tray stands. */
type StopPhase =
  "none" | "list" | "armed" | "stopping" | "fail" | "ending" | "done";

/** What a job ends in once nothing it stops still runs. */
export type StopKind = "forget" | "caw-off";

/** A listed session and how far its stop has got. */
export interface StopRow {
  /** Its tile has landed in the button: it counts toward the ring. */
  arrived: boolean;
  /** Its tile has left the row: the row is folding shut, or shut. */
  departed: boolean;
  error: string | null;
  /** The row has folded shut and is drawn no more. */
  gone: boolean;
  /** Its machine is away and the hub has recorded its stop for when it is back. */
  owed: boolean;
  s: RunningSession;
  /**
   * `away`: its machine is not connected; it stops when it is back. `kept`:
   * left unchecked as Caw went off, it runs to its end, not this job's.
   */
  state: "running" | "away" | "stopping" | "stopped" | "failed" | "kept";
  /** Its title, link and what it is, where the caller names them. */
  view: { href?: string; kind?: "attempt" | "delegate"; title?: string };
}

export interface StopJob {
  /** The place the tray stands in (`head:<id>`, `rail:<id>`, `caw:<id>`). */
  at: string;
  kind: StopKind;
  /** Caw-off only: the first stop turned him off. */
  off: boolean;
  /** The tray stands; false: the job is parked. */
  open: boolean;
  phase: StopPhase;
  /** Caw off: the rows checked to stop, every one at first. */
  picked: string[];
  /** When the stop was pressed (Date.now()), for a slow row's seconds. */
  pressedAt: number;
  projectId: string;
  projectName: string;
  /** The end refused, or Caw off's turning off: the hub's words. */
  refusal: string | null;
  rows: StopRow[];
  /** How many were listed when the stop was pressed: the ring's whole. */
  total: number;
}

/** What a forget's tray says in each state. */
export interface StopWords {
  /** The second press: "Stop 3 mid-turn and forget". */
  armed: (n: number) => string;
  /** The confirm's word once it has run. */
  ended: string;
  /** The confirm's word while the stops land and the tray's own end runs. */
  ending: string;
  /** The line under the title, in each state; `done` is what the stops did. */
  line: (phase: StopPhase, n: number, done: string) => string;
  /** The plain question's confirm, with nothing running: "Forget". */
  plain: string;
  /** The first press: "Stop 3 and forget". */
  stop: (n: number) => string;
  title: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** A forget's words, for the project named `name`. */
export function forgetWords(name: string): StopWords {
  return {
    title: `Forget ${name}?`,
    plain: "Forget",
    stop: (n) => `Stop ${n} and forget`,
    armed: (n) => `Stop ${n} mid-turn and forget`,
    ending: "Forgetting…",
    ended: "Forgotten",
    line: (phase, n, done) => {
      switch (phase) {
        case "none":
          return "The grouping is removed. The checkout and its sessions stay on disk.";
        case "list":
          return `${n} running ${plural(n, "session stops", "sessions stop")} first. The checkout and its sessions stay on disk.`;
        case "armed":
        case "stopping":
          return "Transcripts and the checkout stay on disk.";
        case "fail":
          return `${name} is kept until every session is stopped.`;
        case "ending":
        case "done":
          return done;
      }
    },
  };
}

/** A parked job's line, by its kind: the stops landing, then what was left. */
export function parkedWords(job: StopJob): {
  parked: (stopped: number, total: number) => string;
  partway: (stopped: number, total: number) => string;
} {
  const name = job.projectName;
  if (job.kind === "caw-off") {
    return {
      parked: (stopped, total) => cawOffWords.parked(name, stopped, total),
      partway: cawOffWords.partway,
    };
  }
  return {
    parked: (stopped, total) =>
      `Forgetting ${name || "the project"}: stopped ${stopped} of ${total} ${plural(total, "session", "sessions")}…`,
    partway: (stopped, total) =>
      `Stopped ${stopped} of ${total}; ${name || "the project"} kept.`,
  };
}

/** A Caw-off row as the tray names it: what it is, its session, an attempt by its task. */
function cawView(one: CawRunning): StopRow["view"] {
  const href = `/session/${encodeURIComponent(one.id)}`;
  const title = one.taskTitle ?? one.title;
  return title ? { href, kind: one.kind, title } : { href, kind: one.kind };
}

const asRows = (
  listed: RunningSession[],
  view: (s: RunningSession) => StopRow["view"] = () => ({})
): StopRow[] =>
  listed.map((s) => ({
    s: {
      cwd: s.cwd,
      id: s.id,
      machineId: s.machineId,
      offline: s.offline,
      parentId: s.parentId,
      title: s.title,
    },
    view: view(s),
    state: s.offline ? "away" : "running",
    owed: false,
    departed: false,
    arrived: false,
    gone: false,
    error: null,
  }));

/** The key a job is kept under. */
const keyOf = (kind: StopKind, projectId: string) => `${kind}:${projectId}`;

/** Caw's switch's place (CawLeadSwitch): his off tray stands there when asked there. */
export const cawOffAt = (projectId: string): string => `caw:${projectId}`;

/** The key a tray travels under, into its parked place and back out. */
export const stopShare = (job: { kind: StopKind; projectId: string }): string =>
  `stop-tray:${keyOf(job.kind, job.projectId)}`;

/** A tray mounted for a job: how its stopped rows fly into its button. */
interface Flier {
  fly: (row: StopRow) => void;
}

const KEY = "cawco:stop-work";

class StopWork {
  jobs = $state<Record<string, StopJob>>({});
  /** The places drawn now that can hold a tray (`head:<id>`, `rail:<id>`, `caw:<id>`). */
  private readonly places = new SvelteSet<string>();
  private readonly timers = new Map<
    string,
    Set<ReturnType<typeof setTimeout>>
  >();
  private readonly fliers = new Map<string, Flier>();
  private readonly cawViews = new Map<
    string,
    Set<(view: ProjectConversationView) => void>
  >();
  /** The one `project.stop` listener every job hears through, once one stop runs. */
  private unhear: (() => void) | null = null;

  constructor() {
    if (typeof window === "undefined") {
      return;
    }
    const kept = readJson(
      KEY,
      z.record(z.string(), StopJobSchema),
      {},
      "session"
    );
    for (const job of Object.values(kept)) {
      // A tile in flight as the page went has landed.
      for (const row of job.rows) {
        row.departed = row.state === "stopped";
        row.arrived =
          row.state === "stopped" || row.owed || row.state === "kept";
        row.gone = row.state === "stopped";
      }
      job.phase = job.phase === "armed" ? "list" : job.phase;
    }
    this.jobs = kept;
    for (const key of Object.keys(kept)) {
      detach(this.resume(key), "resume");
    }
  }

  /** Writes every job to the tab's storage. */
  private keep(): void {
    // Read untracked: a write from inside an effect never makes it depend on every job.
    untrack(() => writeJson(KEY, $state.snapshot(this.jobs), "session"));
  }

  /** The job of `kind` on `projectId`, or null. */
  of(kind: StopKind, projectId: string): StopJob | null {
    return this.jobs[keyOf(kind, projectId)] ?? null;
  }

  /** Every job on `projectId`. */
  on(projectId: string): StopJob[] {
    return Object.values(this.jobs).filter(
      (job) => job.projectId === projectId
    );
  }

  /* ── Asking ─────────────────────────────────────────────────────── */

  /** A forget asked at `at`, with what runs read: the tray stands there. */
  askForget(
    project: { id: string; name: string },
    at: string,
    sessions: RunningSession[]
  ): void {
    this.ask({
      at,
      kind: "forget",
      projectId: project.id,
      projectName: project.name,
      rows: asRows(sessions),
      picked: [],
    });
  }

  /** Caw turned off while what he started still runs: the tray stands under the switch, every row checked. */
  askCawOff(
    project: { id: string; name: string },
    at: string,
    running: CawRunning[]
  ): void {
    const views = new Map(running.map((one) => [one.id, cawView(one)]));
    this.ask({
      at,
      kind: "caw-off",
      projectId: project.id,
      projectName: project.name,
      rows: asRows(running, (s) => views.get(s.id) ?? {}),
      picked: running.map((one) => one.id),
    });
  }

  /** Caw off's boxes: the rows that stop. */
  pick(job: StopJob, ids: string[]): void {
    job.picked = ids;
    job.refusal = null;
    this.keep();
  }

  private ask(job: {
    at: string;
    kind: StopKind;
    picked: string[];
    projectId: string;
    projectName: string;
    rows: StopRow[];
  }): void {
    const key = keyOf(job.kind, job.projectId);
    const standing = this.jobs[key];
    if (standing && !["none", "list", "armed"].includes(standing.phase)) {
      // Stops already under way: the tray comes back to them.
      this.reopen(standing, job.at);
      return;
    }
    this.quiet(key);
    this.jobs[key] = {
      ...job,
      open: true,
      off: false,
      phase: job.rows.length > 0 ? "list" : "none",
      pressedAt: 0,
      refusal: null,
      total: 0,
    };
    this.keep();
  }

  /** Hands the page's Caw the hub's view of him once a stop or a finish turned him off. */
  onCawView(
    projectId: string,
    take: (view: ProjectConversationView) => void
  ): () => void {
    const set = this.cawViews.get(projectId) ?? new Set();
    set.add(take);
    this.cawViews.set(projectId, set);
    return () => set.delete(take);
  }

  private settled(projectId: string, view: ProjectConversationView): void {
    for (const take of this.cawViews.get(projectId) ?? []) {
      take(view);
    }
  }

  /* ── The tray's presses ─────────────────────────────────────────── */

  /**
   * The confirm: Caw off turns him off and stops the checked rows; a forget
   * arms, then stops them all; either tries again, or ends with nothing running.
   */
  press(job: StopJob): void {
    if (
      job.kind === "caw-off" &&
      (job.phase === "list" || job.phase === "none")
    ) {
      this.turnOff(job);
    } else if (job.phase === "list") {
      job.phase = "armed";
      this.keep();
    } else if (job.phase === "armed") {
      job.total = job.rows.length;
      this.stop(
        job,
        job.rows.map((row) => row.s.id)
      );
    } else if (job.phase === "fail") {
      detach(this.retry(job), "retry");
    } else if (job.phase === "none") {
      detach(this.finish(job), "finish");
    }
  }

  /** One failed row's Try again: its stop alone. */
  stopOne(job: StopJob, id: string): void {
    this.stop(job, [id]);
  }

  /**
   * Caw off's confirm: the unchecked rows are kept (they run on, counted
   * as done for this job), and one request turns him off and stops the
   * checked ones. None checked, he is just turned off.
   */
  private turnOff(job: StopJob): void {
    const picked = new Set(job.picked);
    const ids = job.rows
      .filter((row) => picked.has(row.s.id))
      .map((row) => row.s.id);
    if (ids.length === 0) {
      detach(this.finish(job), "finish");
      return;
    }
    for (const row of job.rows) {
      if (!picked.has(row.s.id)) {
        row.state = "kept";
        row.arrived = true;
      }
    }
    job.total = ids.length;
    this.stop(job, ids);
  }

  /** Caw off refused before anything stopped: the ask again, its boxes as they were, the hub's words in it. */
  private unpress(job: StopJob, refusal: string | null): void {
    for (const row of job.rows) {
      if (row.state !== "stopped") {
        row.state = row.s.offline ? "away" : "running";
        row.arrived = false;
        row.error = null;
      }
    }
    job.total = 0;
    job.refusal = refusal;
    job.phase = job.rows.length > 0 ? "list" : "none";
    this.keep();
  }

  /**
   * Cancel, Esc, Stop waiting, Close: the tray goes. Before the stop it
   * drops the ask; after it, the job is parked and goes on; ended, it is done.
   */
  dismiss(job: StopJob): void {
    if (["none", "list", "armed", "done"].includes(job.phase)) {
      this.close(job);
      return;
    }
    job.open = false;
    // Nothing flies while the tray is away: each stop counts as it lands.
    for (const row of job.rows) {
      if (row.state === "stopped" && !row.arrived) {
        this.arrive(job, row);
      }
    }
    this.keep();
  }

  /** Whether the place `at` is drawn now. */
  drawn(at: string): boolean {
    return this.places.has(at);
  }

  /** A place that can hold a tray is drawn; it is gone when the returned call runs. */
  place(at: string): () => void {
    this.places.add(at);
    return () => this.places.delete(at);
  }

  /**
   * One press on its parked place (`from`): the tray again where it stood,
   * while that place is drawn; else at `from`.
   */
  reopen(job: StopJob, from: string): void {
    const at = this.places.has(job.at) ? job.at : from;
    job.at = at;
    job.open = true;
    this.keep();
  }

  /** A tray drawn for `job` flies its stopped rows into its button. */
  attach(job: StopJob, flier: Flier): () => void {
    const key = keyOf(job.kind, job.projectId);
    this.fliers.set(key, flier);
    return () => {
      if (this.fliers.get(key) === flier) {
        this.fliers.delete(key);
      }
    };
  }

  /* ── Each stop, as the hub reports it ───────────────────────────── */

  private listen(): void {
    if (this.unhear) {
      return;
    }
    this.unhear = onProjectStop((frame: ProjectStopFrame) => {
      for (const job of Object.values(this.jobs)) {
        if (job.projectId === frame.projectId) {
          this.heard(job, frame.instanceId, frame.outcome, frame.error ?? null);
        }
      }
    });
  }

  /** Stops `ids` in one request; each row turns as the hub reports it. */
  private stop(job: StopJob, ids: string[]): void {
    job.phase = "stopping";
    job.refusal = null;
    job.pressedAt = Date.now();
    for (const row of job.rows) {
      // A row whose machine is away keeps saying so; the hub records its stop.
      if (ids.includes(row.s.id) && row.state !== "away") {
        row.state = "stopping";
        row.error = null;
      }
    }
    this.keep();
    this.listen();
    this.request(job, ids).then(
      (already) => {
        for (const id of already) {
          this.heard(job, id, "stopped", null);
        }
      },
      (error: unknown) => {
        const reason = failureWords(error);
        if (job.kind === "caw-off" && !job.off) {
          // Turning him off was refused: nothing stopped, and he is still on.
          this.unpress(job, reason);
          return;
        }
        for (const id of ids) {
          this.heard(job, id, "failed", reason);
        }
      }
    );
  }

  /**
   * The hub asked to stop `ids`; each one's end arrives as `project.stop`.
   * It answers the ids it says had already ended: stopped now. Caw off's
   * first stop turns him off, and the hub stops the ones checked.
   */
  private async request(job: StopJob, ids: string[]): Promise<string[]> {
    if (job.kind === "forget" || job.off) {
      await stopProjectSessions(job.projectId, ids);
      return [];
    }
    const view = await configureCaw(job.projectId, {
      on: false,
      initiated: { stop: ids },
    });
    job.off = true;
    this.keep();
    this.settled(job.projectId, view);
    const still = new Set(view.running.map((one) => one.id));
    return ids.filter((id) => !still.has(id));
  }

  /** The failed rows again; a refused end reads what still runs and stops it. */
  private async retry(job: StopJob): Promise<void> {
    const failedIds = job.rows
      .filter((row) => row.state === "failed")
      .map((row) => row.s.id);
    if (failedIds.length > 0) {
      this.stop(job, failedIds);
      return;
    }
    if (job.kind === "caw-off") {
      // What still runs could not be read: read it again; nothing unchecked is stopped.
      job.refusal = null;
      job.phase = "stopping";
      await this.resume(jobKey(job));
      return;
    }
    let again: RunningSession[];
    try {
      again = await runningSessions(job);
    } catch (error) {
      job.refusal = failureWords(error);
      this.keep();
      return;
    }
    const known = new Set(job.rows.map((row) => row.s.id));
    job.rows = [
      ...job.rows.filter((row) => !row.gone),
      ...asRows(again.filter((s) => !known.has(s.id))),
    ];
    const fresh = again.map((s) => s.id);
    if (fresh.length === 0) {
      await this.finish(job);
      return;
    }
    job.total += fresh.filter((id) => !known.has(id)).length;
    this.stop(job, fresh);
  }

  private heard(
    job: StopJob,
    id: string,
    outcome: "stopped" | "failed" | "deferred",
    error: string | null
  ): void {
    const row = job.rows.find((each) => each.s.id === id);
    if (!row || row.state === "stopped" || this.jobs[jobKey(job)] !== job) {
      return;
    }
    if (outcome === "deferred") {
      // Its machine is away (or went away before it answered): the stop is
      // recorded for its return. Counted now; it stays where it is.
      row.state = "away";
      row.owed = true;
      row.error = null;
      this.arrive(job, row);
    } else if (outcome === "failed") {
      if (row.state === "stopping") {
        row.state = "failed";
        row.error = error;
      }
    } else {
      row.state = "stopped";
      row.error = null;
      const flier = job.open ? this.fliers.get(jobKey(job)) : undefined;
      if (flier) {
        // Its word and glyph turn first; its tile leaves after the fade.
        this.after(job, dur("--dur-fade"), () => flier.fly(row));
      } else {
        row.departed = true;
        row.gone = true;
        this.arrive(job, row);
      }
    }
    settle(job);
    this.keep();
  }

  /**
   * A row has landed in the button (or, parked, counted): the ring takes its
   * share. Its lead may go next; the last one makes the ring whole, and after a
   * beat the end runs.
   */
  arrive(job: StopJob, row: StopRow): void {
    if (row.arrived) {
      return;
    }
    row.arrived = true;
    const parent = job.rows.find((each) => each.s.id === row.s.parentId);
    const flier = job.open ? this.fliers.get(jobKey(job)) : undefined;
    if (parent && flier) {
      this.after(job, dur("--dur-stagger"), () => flier.fly(parent));
    }
    if (job.rows.every((each) => each.arrived)) {
      this.after(job, dur("--dur-control"), () => {
        detach(this.finish(job), "finish");
      });
    }
    this.keep();
  }

  /* ── The end ─────────────────────────────────────────────────────── */

  private async finish(job: StopJob): Promise<void> {
    if (job.phase === "ending" || job.phase === "done") {
      return;
    }
    const key = jobKey(job);
    job.phase = "ending";
    this.keep();
    const started = performance.now();
    try {
      if (job.kind === "forget") {
        await deleteProject(job.projectId);
      } else if (!job.off) {
        // Nothing checked, or nothing he started still ran: he is turned off now, the rest finishing.
        this.settled(
          job.projectId,
          await configureCaw(job.projectId, {
            on: false,
            initiated: { stop: [] },
          })
        );
        job.off = true;
      }
    } catch (error) {
      if (this.jobs[key] !== job) {
        return;
      }
      if (job.kind === "caw-off") {
        this.unpress(job, failureWords(error));
        return;
      }
      job.refusal = failureWords(error);
      job.phase = job.rows.length > 0 ? "fail" : "none";
      this.keep();
      return;
    }
    // The ending word is read before the ended one: an end quicker than the
    // label's morph waits for the morph to land.
    const morphing =
      job.rows.length > 0
        ? dur("--dur-morph") - (performance.now() - started)
        : 0;
    if (morphing > 0 && job.open) {
      await new Promise<void>((resolve) => setTimeout(resolve, morphing));
    }
    // The ended word ("Forgotten") is said where the question was asked and
    // held there before the caller goes on (a forgotten project's page
    // leaves for home), so the end is seen in place. Parked, the end is the
    // outcome: the project's row goes with it, or Caw's switch says he is off.
    job.phase = "done";
    this.keep();
    if (job.open) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, dur("--dur-hold"))
      );
    }
    if (job.kind === "forget") {
      await forgotten(job.projectId);
    }
    this.close(job);
  }

  /** The tray folds away as it is (--dur-exit), then the job goes. */
  private close(job: StopJob): void {
    if (!job.open) {
      this.drop(job);
      return;
    }
    job.open = false;
    this.keep();
    setTimeout(() => this.drop(job), dur("--dur-exit"));
  }

  /* ── After a reload ─────────────────────────────────────────────── */

  /**
   * A job the page held as it went: what still runs is read from the hub. A
   * stop under way whose session no longer runs has landed; one still
   * listed is still stopping, and its end arrives as before. A forget whose
   * project the hub no longer has has ended.
   */
  private async resume(key: string): Promise<void> {
    const job = this.jobs[key];
    if (!job) {
      return;
    }
    if (job.phase === "done") {
      this.drop(job);
      return;
    }
    const read = await stillRunning(job);
    if (read === "gone") {
      // The project is gone: a forget's end happened; a Caw off has no project to speak of.
      this.drop(job);
      if (job.kind === "forget") {
        await readProjects();
      }
      return;
    }
    if (!Array.isArray(read)) {
      if (!["none", "list", "armed"].includes(job.phase)) {
        job.refusal = read.refused;
        job.phase = "fail";
        this.keep();
      }
      return;
    }
    const running = read;
    const still = new Map(running.map((s) => [s.id, s]));
    if (["none", "list", "armed"].includes(job.phase)) {
      this.askAgain(job, running);
      return;
    }
    if (
      job.kind === "caw-off" &&
      !job.off &&
      !(await this.wentOff(job, still))
    ) {
      return;
    }
    this.listen();
    for (const row of job.rows) {
      if (
        (row.state === "stopping" || row.state === "away") &&
        !still.has(row.s.id)
      ) {
        row.state = "stopped";
        row.departed = true;
        row.gone = true;
        row.arrived = true;
      }
    }
    if (job.phase === "ending") {
      job.phase = "stopping";
    }
    settle(job);
    this.keep();
    if (job.rows.every((row) => row.arrived)) {
      await this.finish(job);
    }
  }

  /** The ask, again on what runs now: a session that ended since leaves the list. */
  private askAgain(job: StopJob, running: RunningSession[]): void {
    const still = new Set(running.map((s) => s.id));
    if (job.kind === "forget") {
      job.rows = asRows(running);
    } else {
      job.rows = job.rows.filter((row) => still.has(row.s.id));
      job.picked = job.picked.filter((id) => still.has(id));
    }
    job.phase = job.rows.length > 0 ? "list" : "none";
    this.keep();
  }

  /**
   * Caw off whose page went while he was being turned off: the hub's
   * answer is whether he is, and so whether the stops went. Still on, the
   * ask stands again on what still runs; unread, the failure is said.
   */
  private async wentOff(
    job: StopJob,
    still: Map<string, RunningSession>
  ): Promise<boolean> {
    let view: ProjectConversationView;
    try {
      view = await cawOf(job.projectId);
    } catch (error) {
      job.refusal = failureWords(error);
      job.phase = "fail";
      this.keep();
      return false;
    }
    if (view.on) {
      job.rows = job.rows.filter((row) => still.has(row.s.id));
      job.picked = job.picked.filter((id) => still.has(id));
      this.unpress(job, null);
      return false;
    }
    job.off = true;
    return true;
  }

  private after(job: StopJob, ms: number, run: () => void): void {
    const key = jobKey(job);
    const set = this.timers.get(key) ?? new Set();
    this.timers.set(key, set);
    const timer = setTimeout(() => {
      set.delete(timer);
      if (this.jobs[key] === job) {
        run();
      }
    }, ms);
    set.add(timer);
  }

  private quiet(key: string): void {
    for (const timer of this.timers.get(key) ?? []) {
      clearTimeout(timer);
    }
    this.timers.delete(key);
  }

  private drop(job: StopJob): void {
    const key = jobKey(job);
    if (this.jobs[key] !== job) {
      return;
    }
    this.quiet(key);
    delete this.jobs[key];
    this.keep();
  }
}

/** What of the project still runs, as the hub lists it. */
async function runningSessions(job: StopJob): Promise<RunningSession[]> {
  const response = await fetch(`/api/projects/${job.projectId}/running`);
  if (!response.ok) {
    throw await hubRefusal(
      response,
      "so its sessions were not listed. Try again."
    );
  }
  return ((await response.json()) as { sessions: RunningSession[] }).sessions;
}

function jobKey(job: StopJob): string {
  return keyOf(job.kind, job.projectId);
}

/** What of the project still runs after a reload; "gone" when the hub no longer has the project. */
async function stillRunning(
  job: StopJob
): Promise<RunningSession[] | "gone" | { refused: string }> {
  try {
    const response = await fetch(`/api/projects/${job.projectId}/running`);
    if (response.status === 404) {
      return "gone";
    }
    if (!response.ok) {
      throw await hubRefusal(
        response,
        "so what still runs could not be read. Reopen it to try again."
      );
    }
    return ((await response.json()) as { sessions: RunningSession[] }).sessions;
  } catch (error) {
    return { refused: failureWords(error) };
  }
}

/** Nothing is still stopping and something failed: offer Try again. */
function settle(job: StopJob): void {
  if (
    job.phase === "stopping" &&
    !job.rows.some((row) => row.state === "stopping") &&
    job.rows.some((row) => row.state === "failed")
  ) {
    job.phase = "fail";
  }
}

/** The project is gone: the reader is taken off its page, which no longer exists, before the list drops it. */
async function forgotten(id: string): Promise<void> {
  if (page.url.pathname === `/project/${id}`) {
    await goto(route.spoke, { replace: true });
  }
  await readProjects();
}

export const stopWork = new StopWork();
