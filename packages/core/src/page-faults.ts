/**
 * What went wrong as a page drew, for the agent that wrote it: a dial its
 * panel doesn't draw, an uncaught error or rejection, an asset that failed
 * to load. The preview overlay hears each one in every page it runs in (a
 * decision page, HTML or program, and a folder's or a port's preview:
 * preview overlay/faults.ts) and sends it, with the artifact and the
 * revision it was served at, to the preview origin's error path (core
 * `PREVIEW_ERRORS_PATH`, hub dashboard-errors.ts), which journals it as it
 * journals every page error and keeps it in the artifact's doc for
 * `artifact_read`. The page's own host tells the overlay what only it can
 * read (an HTML page's `cawcoDials`, dashboard decisions/host/dials.ts) as
 * a {@link PAGE_FAULT_EVENT} on the window.
 */

import { errorReportWords } from "./words/error-report";

/** One fault a page met. */
export type PageFault =
  | {
      /** A dial of `cawcoDials(panel, config)` the panel doesn't draw: its path in the config, and its kind as written (core dial-config.ts `unread`). */
      kind: "dial";
      control: string;
      panel: string;
      path: string;
    }
  | {
      /** An uncaught error or rejection: its message, and where it was thrown when the browser says (the file as a path on the page's origin, else its address). */
      kind: "error";
      column: number | null;
      file: string | null;
      line: number | null;
      message: string;
      /** Its line's words, when it was thrown in the page's own document: what to find it by in the page's source. */
      source: string | null;
    }
  | {
      /** An element's file that failed to load: the element, and the address it asked for. */
      kind: "asset";
      element: string;
      url: string;
    };

/** A fault as it reaches the hub: the artifact the page is, at the revision it was served. */
export interface PageFaultReport {
  artifact: string;
  fault: PageFault;
  revision: number;
}

/**
 * What a page on a preview origin posts to `PREVIEW_ERRORS_PATH`: the
 * preview's own door, which the hub reads as the dashboard's error report
 * (hub dashboard-errors.ts `takeErrorReport`), a fault of its artifact beside it.
 */
export interface PageErrorReport {
  fault: PageFaultReport;
  message: string;
  path: string;
  sessionId: null;
  stack: string;
  userAgent: string;
  version: string;
}

/** Faults as the artifact's doc keeps them (`meta.faults`): the latest revision's alone, the first {@link PAGE_FAULTS_KEPT}. */
export interface PageFaultsKept {
  /** How many new faults came after the first {@link PAGE_FAULTS_KEPT} and were let go. */
  dropped?: number;
  faults: PageFault[];
  revision: number;
}

/** A page's own host to the overlay, on the window: one {@link PageFault} as the event's `detail`. */
export const PAGE_FAULT_EVENT = "cawco:page-fault";

/** How many faults a revision keeps: past them the page is broken enough to read the first ones. */
export const PAGE_FAULTS_KEPT = 20;

/** The journal line an error report is written as, before its JSON: "dashboard error: " (hub dashboard-errors.ts). */
const REPORT_LINE_PREFIX_CHARS = "dashboard error: ".length;

/** The most one error report weighs: it is written as one journal line, and journald breaks a line past `LineMax` into several records. */
// @limit external: a report is written as one journal line, and journald breaks a line past LineMax, 48K by default, into several records (journald.conf(5), https://www.freedesktop.org/software/systemd/man/latest/journald.conf.html)
export const ERROR_REPORT_BYTES = 48 * 1024 - REPORT_LINE_PREFIX_CHARS;

const bytesOf = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).length;

/** What a report holds that can be cut: its stack, its message, and the words of a fault it carries. */
interface Fittable {
  fault?: { fault: object };
  message: string;
  stack: string;
}

/**
 * `report` as the hub takes it: whole, until its JSON passes
 * {@link ERROR_REPORT_BYTES}; then its stack is cut to what fits, then its
 * message, then the longest words of its fault, each ending in "… cut".
 */
export const fitReport = <T extends Fittable>(report: T): T => {
  const over = (one: T): number => bytesOf(one) - ERROR_REPORT_BYTES;
  const cutTo = (text: string, drop: number): string =>
    // Every character weighs at least one byte, so dropping `drop` characters, and the room the cut's own words take, brings it under.
    `${text.slice(0, Math.max(0, text.length - drop - errorReportWords.cut.length))}${errorReportWords.cut}`;
  let fitted = report;
  for (const field of ["stack", "message"] as const) {
    while (
      over(fitted) > 0 &&
      fitted[field].length > errorReportWords.cut.length
    ) {
      fitted = { ...fitted, [field]: cutTo(fitted[field], over(fitted)) };
    }
  }
  while (over(fitted) > 0 && fitted.fault) {
    const [longest] = Object.entries(fitted.fault.fault)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
      .sort((a, b) => b[1].length - a[1].length);
    if (!longest || longest[1].length <= errorReportWords.cut.length) {
      break;
    }
    fitted = {
      ...fitted,
      fault: {
        ...fitted.fault,
        fault: {
          ...fitted.fault.fault,
          [longest[0]]: cutTo(longest[1], over(fitted)),
        },
      },
    };
  }
  return fitted;
};

/** Whether two faults say the same thing: one is kept of each. */
export const sameFault = (one: PageFault, other: PageFault): boolean =>
  JSON.stringify(one) === JSON.stringify(other);

/**
 * The faults an artifact keeps once `fault` is met at `revision`, with
 * `had` kept: those of `revision` alone, each once, the first
 * {@link PAGE_FAULTS_KEPT}, with a count of the ones let go; null when it keeps nothing new.
 */
export function faultsWith(
  had: PageFaultsKept | undefined,
  revision: number,
  fault: PageFault
): PageFaultsKept | null {
  const faults = had?.revision === revision ? had.faults : [];
  if (faults.some((one) => sameFault(one, fault))) {
    return null;
  }
  if (faults.length >= PAGE_FAULTS_KEPT) {
    return { revision, faults, dropped: (had?.dropped ?? 0) + 1 };
  }
  return { revision, faults: [...faults, fault] };
}

/** The faults kept of `revision`: none when what is kept is another revision's. */
export const faultsAt = (
  kept: PageFaultsKept | undefined,
  revision: number
): PageFault[] => (kept?.revision === revision ? kept.faults : []);

/** How many faults of `revision` were let go past the first {@link PAGE_FAULTS_KEPT}. */
export const faultsDroppedAt = (
  kept: PageFaultsKept | undefined,
  revision: number
): number => (kept?.revision === revision ? (kept.dropped ?? 0) : 0);
