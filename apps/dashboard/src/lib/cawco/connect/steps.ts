/**
 * An install's steps as its window and its band row draw them: each step of
 * its route in order with where it stands, when it started and ended, its
 * limit, and the installer's checks under the step that serves them (core
 * install.ts `CHECK_STEP`). Read from the hub's install alone.
 */
import {
  CHECK_STEP,
  CHECK_WORDS,
  INSTALL_CHECKS,
  type Install,
  type InstallCheck,
  type InstallStep,
  stepLimit,
  stepsOf,
  stepWords,
} from "@cawco/core";

/** Where a step stands: its status glyph (DESIGN.md, Status displays). */
export type MarkState = "done" | "current" | "failed" | "stopped" | "future";

export interface CheckRow {
  check: InstallCheck;
  state: MarkState;
  words: string;
}

export interface StepRow {
  checks: CheckRow[];
  endedAt: number | null;
  limit: number | null;
  startedAt: number | null;
  state: MarkState;
  step: InstallStep;
  words: string;
}

/** Where the install stopped going: the step it is on, or the one it ended on. */
const reachedStep = (install: Install): InstallStep | null => {
  if (install.state === "joined") {
    return null;
  }
  return install.problemStep ?? install.steps.at(-1)?.step ?? null;
};

export const stepRows = (install: Install): StepRow[] => {
  const order = stepsOf(install.route);
  const reached = reachedStep(install);
  const at = reached === null ? order.length : order.indexOf(reached);
  const ENDING: Record<Install["state"], MarkState> = {
    running: "current",
    stopped: "stopped",
    failed: "failed",
    lost: "failed",
    joined: "done",
  };
  const ending = ENDING[install.state];
  return order.map((step, index) => {
    const mark = install.steps.findLast((one) => one.step === step);
    let state: MarkState = "future";
    if (install.state === "joined" || index < at) {
      state = "done";
    } else if (index === at) {
      state = ending;
    }
    // By a command the hub sees only that it installs: every check stands under that.
    const parentOf = (check: InstallCheck): InstallStep =>
      install.route === "command" ? "install" : CHECK_STEP[check];
    const checks = INSTALL_CHECKS.filter(
      (check) => parentOf(check) === step
    ).map((check): CheckRow => {
      const said = install.checks.find((one) => one.check === check);
      let checkState: MarkState = "future";
      if (said) {
        checkState = said.passed ? "done" : "failed";
      } else if (state === "done") {
        checkState = "done";
      }
      return { check, state: checkState, words: CHECK_WORDS[check] };
    });
    return {
      step,
      words: stepWords(install.route, step),
      state,
      startedAt: mark?.startedAt ?? null,
      endedAt: mark?.endedAt ?? null,
      limit: stepLimit(install.route, step),
      checks,
    };
  });
};

/** The step a running install is on, as its row and the window's live line say it. */
export const currentRow = (install: Install): StepRow | undefined =>
  stepRows(install).find((row) => row.state === "current");
