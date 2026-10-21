/**
 * Connect a machine's tray as data: every state the dialog draws (the
 * rework's A to I), derived from the SSH add as the hub holds it and from
 * the person's own choices. One place builds the status card's words and
 * its rail, so the live dialog and the states file draw the same thing from
 * the same inputs.
 *
 * The rail is five phases (core `INSTALL_PHASES`), bound to the step lines
 * the hub, the install script and `cawco binary-install` print. A run's
 * phase only moves forward: a step line no phase names keeps the one it
 * was in.
 */
import {
  INSTALL_PHASES,
  INSTALL_STEP_PREFIX,
  installPhaseOf,
  SSH_STEP,
  type SshJoinJob,
} from "@cawco/core/join";
import type { Component } from "svelte";
import type { ReadinessHue, ReadinessKind } from "./readiness.svelte";

/** Card 1: where the password lives on the form. */
export type PasswordPlace = "line" | "shown" | "refused";
/** Card 2: the done moment's emphasis. */
export type DoneMoment = "caw" | "rail" | "flight";

/** The three choices the owner picks between; the designer's picks by default. */
export interface JoinTaste {
  done: DoneMoment;
  /** Card 3: the five phase names under the rail on the desk. */
  names: boolean;
  password: PasswordPlace;
}

export const TASTE: JoinTaste = { password: "line", done: "caw", names: true };

/** One segment of the rail. */
export type Segment = "empty" | "current" | "filled" | "failed" | "done";

/**
 * The card's glyph: the spinner while it runs, the done check, the attn
 * mark when the person is asked, the fail mark, the idle pause.
 */
export type CardTone = "running" | "done" | "attn" | "fail" | "stopped";

/** The phases' names, in the rail's order. */
export const PHASE_NAMES: readonly string[] = INSTALL_PHASES.map(
  (each) => each.name
);

/** What the status card draws: one sentence, the rail, one line, and what it folds. */
export interface CardView {
  /** A command that is the fix (the host-key case), in a CopyBox. */
  copy: { label: string; text: string } | null;
  /** The phase in progress while it runs, else -1. */
  current: number;
  /** Joined: the machine's readiness, its glyph and hue on the card. */
  joined: Joined | null;
  /** The fix's or the result's line under the rail, or the waiting line. */
  line: string | null;
  /** Every line the add printed, the output's box. */
  lines: string[];
  /** The output opens itself: a failure that carries a tail. */
  outputOpen: boolean;
  /** The sign-in was refused: the card asks for a password in place. */
  password: boolean;
  segments: Segment[];
  /** The one sentence, the current step in words while it runs. */
  sentence: string;
  /** When the current step began, for "Still going" (ms), while it runs. */
  stepSince: number | null;
  /** Each step line said so far, without its prefix. */
  steps: string[];
  tone: CardTone;
}

/** The step lines of a run, in the order they were said, without their prefix. */
export const stepsOf = (lines: readonly string[]): string[] =>
  lines
    .filter((line) => line.startsWith(INSTALL_STEP_PREFIX))
    .map((line) => line.slice(INSTALL_STEP_PREFIX.length));

/**
 * The phase a run is in: the furthest any of its step lines reached, 0
 * (signing in) before the first.
 */
export const phaseOf = (steps: readonly string[]): number =>
  steps.reduce((at, step) => Math.max(at, installPhaseOf(step)), 0);

/** `ssh`'s host in a `user@host` target, for the words and the host-key fix. */
export const hostOf = (target: string): string =>
  target.split("@").at(-1) ?? target;

/**
 * The steps whose words name no machine: the sentence says where they run.
 * The rest name their own place (a URL, a path, the hub) already.
 */
const SAYS_WHERE = [
  "checking for systemd",
  "finding the newest",
  "verifying the release signature",
];
const TRAILING_ELLIPSIS = /…$/;

/** A step line as the card's sentence: capitalised, where it runs, in progress. */
export function sentenceOf(step: string, host: string): string {
  const bare = step.replace(TRAILING_ELLIPSIS, "");
  const where = SAYS_WHERE.some((start) => bare.startsWith(start))
    ? ` on ${host}`
    : "";
  return `${bare.charAt(0).toUpperCase()}${bare.slice(1)}${where}…`;
}

const rail = (length: number, of: (index: number) => Segment): Segment[] =>
  Array.from({ length }, (_, index) => of(index));

const RAIL = INSTALL_PHASES.length;

/** The add while it runs (states D and E). */
function running(job: SshJoinJob, stepSince: number | null): CardView {
  const steps = stepsOf(job.lines);
  const at = phaseOf(steps);
  const step = steps.at(-1);
  return {
    tone: "running",
    sentence: step
      ? sentenceOf(step, hostOf(job.target))
      : `Signing in to ${job.target}…`,
    segments: rail(RAIL, (index) => {
      if (index < at) {
        return "filled";
      }
      return index === at ? "current" : "empty";
    }),
    current: at,
    line: step
      ? "It keeps installing if you close this."
      : "Nothing has run on the machine yet.",
    stepSince: step ? stepSince : null,
    steps,
    lines: job.lines,
    outputOpen: false,
    joined: null,
    password: false,
    copy: null,
  };
}

/** The phase a failure stopped in. */
function failedAt(job: SshJoinJob, steps: readonly string[]): number {
  const { problem } = job;
  switch (problem?.kind) {
    case "host-key":
    case "unreachable":
      return 0;
    case "download":
      return 1;
    case "step":
      return Math.max(installPhaseOf(problem.step), phaseOf(steps));
    case "unregistered":
      return RAIL - 1;
    case undefined:
      // No problem the hub named (it lost track, or refused): as far as it got.
      return phaseOf(steps);
    default:
      return problem satisfies never;
  }
}

/**
 * A failed add's words with the error formula: what happened in the
 * sentence, how to fix it on the line under the rail; the output is the
 * evidence, opened by itself where the failure carries one.
 */
function failed(
  job: SshJoinJob,
  refused: string | null,
  passwordTried: boolean
): CardView {
  const steps = stepsOf(job.lines);
  const at = failedAt(job, steps);
  const where = job.target;
  const host = hostOf(where);
  const base: CardView = {
    tone: "fail",
    sentence: refused ?? `The add on ${where} stopped.`,
    segments: rail(RAIL, (index) => {
      if (index < at) {
        return "filled";
      }
      return index === at ? "failed" : "empty";
    }),
    current: -1,
    line: null,
    stepSince: null,
    steps,
    lines: job.lines,
    outputOpen: false,
    joined: null,
    password: false,
    copy: null,
  };
  const { problem } = job;
  switch (problem?.kind) {
    case "host-key":
      return {
        ...base,
        tone: "attn",
        sentence: `${host} answered with a different SSH host key than this hub saw before.`,
        line: "If the machine was reinstalled, remove the old key on the hub, then Retry.",
        copy: {
          label: "Command that removes the old host key",
          text: `ssh-keygen -R ${host}`,
        },
      };
    case "unreachable":
      return {
        ...base,
        sentence: `${where} did not answer on port ${job.port ?? 22} (${problem.detail}).`,
        line: "Check the address and that SSH is running there, then Retry.",
      };
    case "download":
      return {
        ...base,
        sentence: `${host} signed in, but the install script didn't come through this hub's SSH connection.`,
        line: "Retry fetches it again.",
        outputOpen: true,
      };
    case "step":
      if (problem.step === SSH_STEP.signIn) {
        return {
          ...base,
          tone: "attn",
          sentence: `${host} would not sign the hub in.`,
          line: passwordTried
            ? "The machine refused the password."
            : "The machine does not accept this hub's key yet.",
          password: true,
        };
      }
      return {
        ...base,
        sentence: `The step “${problem.step}” failed on ${where}.`,
        line: "Fix what it names, then Retry.",
        outputOpen: true,
      };
    case "unregistered":
      return {
        ...base,
        sentence: `CawCo installed on ${where}, but the machine never came online on this hub.`,
        line: "Retry installs it again.",
        outputOpen: true,
      };
    case undefined:
      // The hub named no problem: its own refusal, or that it lost track.
      return base;
    default:
      return problem satisfies never;
  }
}

/** A stopped add (state I): the rail as far as it got, nothing breathing. */
function stopped(job: SshJoinJob): CardView {
  const steps = stepsOf(job.lines);
  const at = phaseOf(steps);
  const signedIn = steps.length > 0;
  return {
    tone: "stopped",
    sentence: signedIn
      ? `Stopped the install on ${job.target}.`
      : `Stopped before signing in to ${job.target}.`,
    segments: rail(RAIL, (index) => (index < at ? "filled" : "empty")),
    current: -1,
    line: signedIn
      ? "Retry starts it again."
      : "Nothing on that machine changed.",
    stepSince: null,
    steps,
    lines: job.lines,
    outputOpen: false,
    joined: null,
    password: false,
    copy: null,
  };
}

/** The machine joined, as its readiness says it (readiness.svelte `readinessLine`). */
export interface Joined {
  /** The readiness glyph, tinted by its hue alone; the spinner while a Mac is checked. */
  glyph: Component | "spinner";
  hue: ReadinessHue;
  /** The readiness state, said on the card (`data-readiness`). */
  kind: ReadinessKind;
  /** The machine's facts (its OS, address and build), or what the Mac needs. */
  line: string;
  machineId: string | null;
  /** "hetzner-1 joined the fleet. Ready for agents." */
  sentence: string;
}

/** The add done (state G): one bar, the machine by name. */
function done(job: SshJoinJob | null, joined: Joined): CardView {
  const lines = job?.lines ?? [];
  return {
    tone: "done",
    sentence: joined.sentence,
    segments: rail(RAIL, () => "done"),
    current: -1,
    line: joined.line,
    stepSince: null,
    steps: stepsOf(lines),
    lines,
    outputOpen: false,
    joined,
    password: false,
    copy: null,
  };
}

/**
 * The status card for an SSH add, or null while the form shows. `joined`
 * is the machine once the fleet has it; `passwordTried`, that the refused
 * sign-in was sent a password.
 */
export function cardOf({
  job,
  refused,
  stepSince,
  joined,
  passwordTried = false,
}: {
  job: SshJoinJob | null;
  refused: string | null;
  stepSince: number | null;
  joined: Joined | null;
  passwordTried?: boolean;
}): CardView | null {
  if (joined) {
    return done(job, joined);
  }
  if (!job) {
    return null;
  }
  switch (job.state) {
    case "running":
      return running(job, stepSince);
    case "failed":
      return failed(job, refused, passwordTried);
    case "stopped":
      return stopped(job);
    case "done":
      // Done but not in the fleet yet: the form stands until it is.
      return null;
    default:
      return job.state satisfies never;
  }
}

/** Two figures of a step's elapsed time, "0:42", tabular in the card. */
export const elapsedWords = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** The machine's facts on the done card: "Linux · 178.63.54.124 · CawCo 0.1.12". */
export const factsOf = (
  os: string | null,
  host: string | null,
  version: string | null
): string =>
  [os, host, version ? `CawCo ${version}` : null]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
