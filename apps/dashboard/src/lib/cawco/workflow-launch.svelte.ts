/**
 * A workflow's launch, kept by the work, not by its form (DESIGN.md, The
 * Work Outlives Its Surface Rule). The form (WorkflowLaunch) shows what is
 * here: whether it stands open, what was typed and picked, and how far the
 * launch has got. All of it is in the tab's own storage, so a reload brings
 * the form back open at the same step with the same details.
 *
 * Esc, ✕ or a press outside closes the form and parks the launch: a start
 * under way goes on, and nothing navigates. The workflow's row (or the
 * editor's head) shows it parked (WorkflowLaunchParked): starting, then the
 * run in its row once the hub has it, or the refusal in words with Reopen,
 * which brings the form back where it was. Only the form's Cancel ends it.
 * A start that lands while the form stands open goes to the run's page, as
 * Start run always has.
 */
import { untrack } from "svelte";
import { goto } from "$app/navigation";
import { failureWords } from "./hub-read";
import { readJson, writeJson } from "./storage";
import { runHref } from "./workflow-runs";
import { launchWorkflow, loadWorkflowRuns } from "./workflows";

/** What the form holds: its inputs and where the run goes. */
export interface LaunchDraft {
  inputs: Record<string, string>;
  machineId: string;
  supervisor: string;
  workspace: string;
}

/** One workflow's launch. */
export interface Launch {
  /** When Start run was last pressed (Date.now()); 0 before. */
  at: number;
  /** What the form holds; null until it has filled its defaults. */
  draft: LaunchDraft | null;
  /** The workflow's name, for the parked line. */
  name: string;
  /** The hub's refusal, or why the start is not known to have happened. */
  refusal: string | null;
  /** editing: nothing asked yet; starting: the hub is asked; failed: it did not start. */
  step: "editing" | "starting" | "failed";
}

interface Kept {
  launches: Record<string, Launch>;
  open: string | null;
}

const KEY = "cawco:workflow-launches";

/** A start older than this when the page reloaded is looked for among the workflow's runs from this far back, ms. */
const SINCE_SLACK_MS = 2000;

/** The key a form travels under, into its parked line and back out. */
export const launchShare = (workflowId: string): string =>
  `workflow-launch:${workflowId}`;

class WorkflowLaunches {
  /** The workflow whose form stands open, or null. */
  open = $state<string | null>(null);
  /** Every workflow's launch this tab holds, by workflow id. */
  launches = $state<Record<string, Launch>>({});
  /** The button the open form hangs from, when a press opened it. */
  from: HTMLElement | null = null;

  constructor() {
    const kept = readJson<Kept>(KEY, { open: null, launches: {} }, "session");
    this.open = kept.open;
    this.launches = kept.launches;
    for (const [id, launch] of Object.entries(kept.launches)) {
      if (launch.step === "starting") {
        // The page went before the hub answered: the runs say whether it started.
        // biome-ignore lint/complexity/noVoid: its outcome is written to the launch
        void this.settleStart(id, launch.at);
      }
    }
  }

  /** Writes the launches to the tab's storage. */
  keep(): void {
    // Read untracked: a form's effect writes its draft through here, and
    // must not come to depend on every launch it writes.
    untrack(() =>
      writeJson(
        KEY,
        { open: this.open, launches: $state.snapshot(this.launches) },
        "session"
      )
    );
  }

  of(workflowId: string): Launch | null {
    return this.launches[workflowId] ?? null;
  }

  /** Opens `workflowId`'s form under `from`, where its launch stands. */
  openFor(workflowId: string, name: string, from: HTMLElement | null): void {
    this.from = from;
    this.launches[workflowId] ??= {
      at: 0,
      draft: null,
      name,
      refusal: null,
      step: "editing",
    };
    this.open = workflowId;
    this.keep();
  }

  /** Esc, ✕ or a press outside: the form closes, the launch stays as it is. */
  park(): void {
    this.open = null;
    this.from = null;
    this.keep();
  }

  /** The form's Cancel: the launch and what it held are dropped. */
  cancel(workflowId: string): void {
    delete this.launches[workflowId];
    if (this.open === workflowId) {
      this.open = null;
      this.from = null;
    }
    this.keep();
  }

  /** The form's fields, written as they change. */
  write(workflowId: string, draft: LaunchDraft): void {
    const launch = this.launches[workflowId];
    if (launch) {
      launch.draft = draft;
      this.keep();
    }
  }

  /**
   * Start run: the hub is asked to start it. Started while the form stands
   * open, the reader goes with it to the run's page; parked, the run is in
   * its workflow's row and nothing moves. A refusal stays in the launch,
   * said in the form and where it is parked.
   */
  async start(workflowId: string): Promise<void> {
    const launch = this.launches[workflowId];
    const draft = launch?.draft;
    if (!(launch && draft) || launch.step === "starting") {
      return;
    }
    launch.step = "starting";
    launch.refusal = null;
    launch.at = Date.now();
    this.keep();
    let runId: string;
    try {
      ({ runId } = await launchWorkflow(workflowId, {
        inputs: draft.inputs,
        workspace: { path: draft.workspace, machineId: draft.machineId },
        supervisor: draft.supervisor
          ? { delegateType: draft.supervisor }
          : null,
      }));
    } catch (caught) {
      this.fail(workflowId, failureWords(caught));
      return;
    }
    this.started(workflowId, runId);
  }

  private fail(workflowId: string, refusal: string): void {
    const launch = this.launches[workflowId];
    if (launch) {
      launch.step = "failed";
      launch.refusal = refusal;
      this.keep();
    }
  }

  private started(workflowId: string, runId: string): void {
    const watched = this.open === workflowId;
    delete this.launches[workflowId];
    if (watched) {
      this.open = null;
      this.from = null;
    }
    this.keep();
    if (watched) {
      // biome-ignore lint/complexity/noVoid: the run's page reads itself
      void goto(runHref(runId));
    }
  }

  /**
   * A start the page left before the hub answered: a run of the workflow
   * since it was pressed is that start; none, and it did not start.
   */
  private async settleStart(workflowId: string, at: number): Promise<void> {
    let runs: Awaited<ReturnType<typeof loadWorkflowRuns>>["runs"];
    try {
      ({ runs } = await loadWorkflowRuns(workflowId));
    } catch (caught) {
      this.fail(
        workflowId,
        `The page reloaded before the hub answered, and its runs could not be read to say whether it started: ${failureWords(caught)} Reopen it to start it again.`
      );
      return;
    }
    const run = runs.find(
      (each) => new Date(each.startedAt).getTime() >= at - SINCE_SLACK_MS
    );
    if (run) {
      this.started(workflowId, run.id);
      return;
    }
    this.fail(
      workflowId,
      "The page reloaded before the hub answered, and no run of it started. Start run to try again."
    );
  }
}

export const workflowLaunches = new WorkflowLaunches();
