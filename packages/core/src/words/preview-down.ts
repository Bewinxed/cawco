/** What the proxy's own page says when a preview is down. */

import type { PreviewDown } from "../preview/protocol";
import { previewWords } from "./preview";

/**
 * What a proxy's own page says of each hop that did not answer (DESIGN.md's
 * error formula: what happened, why, the way back); a preview of a workspace
 * no boundary runs is refused in its words too. `server` is a server nothing
 * starts again by itself: a port preview with no recorded command
 * (core `PreviewSource.serve`).
 */
export const DOWN_WORDS: Record<PreviewDown, string> = {
  server:
    "The page's server stopped answering. Start it again from its session, then reload.",
  machine:
    "The machine serving this preview isn't answering. Check that it is connected, then reload.",
  hub: "The hub didn't answer its own preview server. Reload to try again.",
  workspace:
    "That workspace isn't running, so its server can't be reached. Once a session there is back, reload.",
  reach:
    "The way to this preview's server didn't open. Reload to try again; if it fails again, open its session.",
  closed:
    "This preview is closed: its session shows something else now, or has ended. Open its session to show it again.",
  gone: previewWords.gonePage,
  error: previewWords.errorPage,
  crashed: previewWords.crashedPage,
};

/**
 * `server` for a server a stage runs (a sheet's, or a port preview's
 * recorded command; agent stage.ts): it is started again by itself, and a
 * reload starts it when its restarts are spent.
 */
export const SERVER_RESTARTS_WORDS =
  "The page's server stopped answering and is starting again. Reload in a moment.";

/** The names a down state's words take, where the frame drawing it knows them; each falls back to the unnamed form. */
export interface DownNames {
  /** The session's machine: `lead` begins a sentence, `mid` stands inside one (`previewWords.unnamed.machine`). */
  machine?: { lead: string; mid: string };
  /** The port a stopped server was on, where known. */
  port?: number | null;
  /** What brings a stopped server back: its stage starts it again by itself, its session can be asked from here, or the person starts it. */
  server?: "restarting" | "askSession" | "start";
}

/**
 * Every frame's down state for hop `down` (core `PreviewDown`), in one set of
 * words: the dashboard's kit empty state over a frame (dashboard
 * FrameDown.svelte) and the proxy's own page in a tab of its own
 * (preview proxy `downResponse`). `title` heads it; `line` says what
 * happened and the way back; `details` is the machine's own words (`why`)
 * under Show details, null where the line already says them (`gone`, whose
 * why is its reason; `error` and `crashed`, whose why is the status or what
 * threw, short and part of the sentence).
 */
export function downState(
  down: PreviewDown,
  why: string | null,
  names: DownNames = {}
): { details: string | null; line: string; title: string } {
  const machine = names.machine ?? previewWords.unnamed.machine;
  const { down: words } = previewWords;
  switch (down) {
    case "gone":
      return {
        title: previewWords.goneTitle,
        line: why ?? previewWords.goneLine,
        details: null,
      };
    case "error":
      return {
        title: previewWords.errorTitle,
        line: previewWords.errorLine(why ?? previewWords.errorWhyUnknown),
        details: null,
      };
    case "crashed":
      return {
        title: previewWords.crashedTitle,
        line: previewWords.crashedLine(why ?? previewWords.crashedWhyUnknown),
        details: null,
      };
    case "server": {
      const where = names.port
        ? words.serverOnPort(names.port, machine.mid)
        : words.serverOn(machine.mid);
      const back = {
        restarting: words.serverRestarting,
        askSession: words.serverAskSession,
        start: words.serverStart,
      }[names.server ?? "start"];
      return {
        title: words.serverTitle,
        line: `${where} ${back}`,
        details: why,
      };
    }
    case "workspace":
      return {
        title: words.workspaceTitle,
        line: words.workspaceLine,
        details: why,
      };
    case "reach":
      return {
        title: words.reachTitle(machine.lead),
        line: words.reachLine,
        details: why,
      };
    case "hub":
      return { title: words.hubTitle, line: words.hubLine, details: why };
    case "closed":
      return { title: words.closedTitle, line: words.closedLine, details: why };
    case "machine":
      return {
        title: previewWords.machineNotAnswering(machine.lead),
        line: words.machineLine,
        details: why,
      };
    default:
      return down satisfies never;
  }
}
