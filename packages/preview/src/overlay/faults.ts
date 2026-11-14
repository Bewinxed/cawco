/**
 * What the page meets as it draws (core page-faults.ts), heard from the
 * overlay's first moment, before any script of the page's runs (the entry,
 * overlay.ts, starts it): an uncaught error or rejection, an element's file
 * that failed to load, and what the page's own host tells on the window as
 * {@link PAGE_FAULT_EVENT} (a dial an HTML page's `cawcoDials` writes that
 * the panel doesn't draw, dashboard decisions/host/dials.ts). Each goes,
 * once, to the hub's error path on the page's own origin (core
 * `PREVIEW_ERRORS_PATH`), named by the artifact the page is and the
 * revision it was drawn at: the hub journals it and keeps it for
 * `artifact_read`. Held until the page knows its artifact and revision
 * (page.ts {@link faultsGoTo}); a page with none (a preview no artifact
 * holds) sends nothing.
 */

import {
  PAGE_FAULT_EVENT,
  PAGE_FAULT_TEXT_MAX,
  PAGE_FAULTS_KEPT,
  type PageErrorReport,
  type PageFault,
  sameFault,
} from "@cawco/core/page-faults";
import { PREVIEW_ERRORS_PATH } from "@cawco/core/preview/routes";
import { cutShort } from "@cawco/core/words/helpers";

/** The first frame of a stack that names its place: V8's `at … (url:line:col)` or `at url:line:col`, WebKit's and Gecko's `…@url:line:col`. */
const FRAME_PLACE = /(?:\(|@|at )((?:https?|blob):[^\s()]+):(\d+):(\d+)\)?/u;

/** What the faults are sent as: the artifact and its revision, null until the page knows both. */
let to: { artifact: string; revision: number } | null = null;
/** The faults met before {@link to} was known, and every fault sent: each once. */
const met: PageFault[] = [];
let sent = 0;

/** `text` kept to the hub's bound, ending in "…" where it was cut (the "…" is within the bound). */
const clip = (text: string): string => cutShort(text, PAGE_FAULT_TEXT_MAX - 1);

/** An address as the fault names it: a path on the page's own origin, else the whole address; null for the page's own document. */
function placeOf(address: string): string | null {
  try {
    const url = new URL(address, location.href);
    if (url.origin !== location.origin) {
      return clip(url.href);
    }
    const page = new URL(location.href);
    return url.pathname === page.pathname && url.search === page.search
      ? null
      : clip(url.pathname);
  } catch {
    return clip(address);
  }
}

/** A thrown value's message: an `Error`'s own, else its words. */
const messageOf = (thrown: unknown): string => {
  if (thrown instanceof Error) {
    return thrown.message || thrown.name;
  }
  try {
    return typeof thrown === "string" ? thrown : JSON.stringify(thrown);
  } catch {
    return String(thrown);
  }
};

/** Sends one fault, as the hub's error route takes a page's report. */
function send(fault: PageFault): void {
  if (!to || sent >= PAGE_FAULTS_KEPT) {
    return;
  }
  sent += 1;
  const report: PageErrorReport = {
    message: clip(
      fault.kind === "error" ? fault.message : `${fault.kind} fault`
    ),
    stack: "",
    path: location.pathname.slice(0, 1000) || "/",
    sessionId: null,
    version: "overlay",
    userAgent: navigator.userAgent.slice(0, 512),
    fault: { artifact: to.artifact, revision: to.revision, fault },
  };
  fetch(PREVIEW_ERRORS_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
    keepalive: true,
  }).catch(() => undefined);
}

/** The page's own document as it was served, read once: an error's line in it is said with the line's words. */
let served: Promise<string[] | null> | undefined;
const servedLines = (): Promise<string[] | null> => {
  served ??= fetch(location.href, { credentials: "same-origin" })
    .then((response) => (response.ok ? response.text() : null))
    .then((text) => text?.split("\n") ?? null)
    .catch(() => null);
  return served;
};

/** An error thrown in the page's own document, its line's words put in from the document as served; any other fault as it is. */
async function withSource(fault: PageFault): Promise<PageFault> {
  if (fault.kind !== "error" || fault.file !== null || fault.line === null) {
    return fault;
  }
  const words = (await servedLines())?.[fault.line - 1]?.trim();
  return words ? { ...fault, source: clip(words) } : fault;
}

/** A fault met: sent once, or held until the page knows where it goes. */
function heard(found: PageFault): void {
  withSource(found).then(heardWhole, () => undefined);
}

function heardWhole(fault: PageFault): void {
  if (met.some((one) => sameFault(one, fault))) {
    return;
  }
  met.push(fault);
  send(fault);
}

/** An uncaught error or rejection as a fault: its message, and where it was thrown. */
function thrownFault(
  thrown: unknown,
  at?: { column: number; file: string; line: number }
): PageFault {
  const stack =
    thrown instanceof Error && typeof thrown.stack === "string"
      ? thrown.stack
      : "";
  const framed = FRAME_PLACE.exec(stack);
  const place =
    at && at.line > 0
      ? at
      : framed && {
          file: framed[1] ?? "",
          line: Number(framed[2]),
          column: Number(framed[3]),
        };
  return {
    kind: "error",
    message: clip(messageOf(thrown)),
    source: null,
    file: place ? placeOf(place.file) : null,
    line: place ? place.line : null,
    column: place ? place.column : null,
  };
}

/** What a failed element loads from: its `src`, a sheet's `href`, a poster. */
function assetOf(target: EventTarget | null): PageFault | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const url =
    target.getAttribute("src") ??
    target.getAttribute("href") ??
    target.getAttribute("data") ??
    "";
  return url
    ? {
        kind: "asset",
        element: `<${target.localName}>`,
        url: placeOf(url) ?? clip(url),
      }
    : null;
}

/** Whether a host's word is a fault, as {@link PAGE_FAULT_EVENT} carries it. */
const isFault = (value: unknown): value is PageFault =>
  typeof value === "object" &&
  value !== null &&
  ["dial", "error", "asset"].includes((value as PageFault).kind);

/** What the page first threw, uncaught, before its load: null while it threw nothing then. */
let thrownEarly: string | null = null;

/**
 * What a script of the page first threw, uncaught or a rejection no one
 * handled, before the page's load: a page that shows nothing at its load
 * broke on it (embeds.ts `tellDrawn`, core `PreviewDown` `crashed`). Null
 * when it threw nothing before its load.
 */
export const thrownBeforeLoad = (): string | null => thrownEarly;

/** `thrown` kept as the page's first throw, while its load is still to come. */
function early(thrown: unknown): void {
  if (thrownEarly === null && document.readyState !== "complete") {
    thrownEarly = clip(
      thrown instanceof Error && thrown.message
        ? `${thrown.name}: ${thrown.message}`
        : messageOf(thrown)
    );
  }
}

/** Starts hearing the page's faults: once, before any script of the page's. */
export function watchFaults(): void {
  // In the capture phase: an element's failed load does not bubble.
  addEventListener(
    "error",
    (event) => {
      if (event instanceof ErrorEvent) {
        early(event.error ?? event.message);
        heard(
          thrownFault(event.error ?? event.message, {
            file: event.filename,
            line: event.lineno,
            column: event.colno,
          })
        );
        return;
      }
      const asset = assetOf(event.target);
      if (asset) {
        heard(asset);
      }
    },
    true
  );
  addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    early(event.reason);
    heard(thrownFault(event.reason));
  });
  addEventListener(PAGE_FAULT_EVENT, (event) => {
    const { detail } = event as CustomEvent<unknown>;
    if (isFault(detail)) {
      heard(detail);
    }
  });
}

/**
 * The page is artifact `artifact` drawn at `revision`: what it met and
 * held goes now, and each fault after. A new revision (a page that took it
 * in place) starts anew: what it met before is let go, and what it meets
 * now is sent.
 */
export function faultsGoTo(artifact: string, revision: number): void {
  if (to?.artifact === artifact && to.revision === revision) {
    return;
  }
  const moved = to !== null;
  to = { artifact, revision };
  if (moved) {
    // What the page met at the revision before is not what this one meets.
    met.length = 0;
    sent = 0;
    return;
  }
  for (const fault of met) {
    send(fault);
  }
}
