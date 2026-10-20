/**
 * The Empty Starts Work Rule (DESIGN.md): an empty state's one action starts
 * the work that would fill it, its words written for the person and theirs
 * to edit before anything goes. Where the work can't start, the empty state
 * says why and offers the way by hand (EmptyAsk draws both).
 *
 * The routes it takes are the ones that already exist:
 * - inside a project, Caw's panel: his composer holds the words, unsent
 *   (CawLead `draft`, the board's and Routines' starters);
 * - a session's own transcript, its own composer, as Files' "Ask <agent>
 *   for a page" does (`paneDrafts`);
 * - a fleet surface no project owns (Configure), the New Session form, the
 *   words as its first prompt (`newSession`'s `prompt`, as a refused send
 *   picked up by a new session opens it): nothing starts until Start.
 *
 * The words live here, not in core's words, because they are the
 * dashboard's alone: the app draws none of these surfaces.
 */
import { accountsWords } from "@cawco/core";
import { cawco } from "./client.svelte";
import { newSession, type SpawnPrefill } from "./spawn/new-session.svelte";
import { spawnPrefs } from "./spawnPrefs.svelte";
import { paneDrafts } from "./transcript/composer-draft.svelte";
import { speakerName } from "./transcript/speaker";

/** Why a fleet ask can't start: no session starts without a machine. */
export const NO_SESSION_CAN_START =
  "No machine is online, so no session can start.";

/**
 * A session can start for a fleet ask: a machine is online. Until the
 * socket's first snapshot is in nothing is claimed (The Claim Of Nothing
 * Rule): the ask stands, and the form says what it finds.
 */
export const sessionCanStart = (): boolean =>
  !cawco.liveRead || cawco.onlineMachines.length > 0;

/** "Ask" takes its object by name (WORDS.md): the form's own agent, as it opens. */
export const askLabel = (what: string): string =>
  `Ask ${accountsWords.harnesses[spawnPrefs.harness]} for ${what}`;

/**
 * What each empty Configure list asks for, as the person would ask it. The
 * session that takes them has CawCo's own tools for the list, so each names
 * CawCo and the fleet; each says where to look first, so what it makes fits.
 */
export const FLEET_ASKS = {
  hooks: {
    what: "a hook",
    words:
      "Make a CawCo hook for my fleet: look at what my sessions keep doing before or after their work, and have a hook run it for them.",
  },
  rules: {
    what: "a rule",
    words:
      "Make a CawCo rule for my fleet: look at what my sessions keep asking me, and write a rule that answers it for them.",
  },
  mcp: {
    what: "an MCP server",
    words:
      "Find an MCP server that fits the work in my projects and add it to my CawCo fleet, so every machine gets it.",
  },
  delegateTypes: {
    what: "delegate types",
    words:
      "Make delegate types for my CawCo fleet: a few presets my sessions can delegate to, from the kinds of work my projects ask for.",
  },
} as const;

/** The New Session form, its first prompt these words, hanging from the press. */
export function askNewSession(
  words: string,
  anchor: HTMLElement | null,
  where: Omit<SpawnPrefill, "prompt"> = {}
): void {
  newSession({ ...where, prompt: { text: words, extras: {} } }, anchor);
}

/** The last part of a folder's path, as a sentence names it. */
const folderName = (cwd: string): string =>
  cwd.split("/").filter(Boolean).at(-1) ?? cwd;

/**
 * A session nothing has been said in: its own agent fills it, asked to read
 * where it stands and say what is there.
 */
export const firstAskWords = (cwd: string): string =>
  `Read through ${folderName(cwd) || "this folder"} and tell me what's here and where the work stands.`;

/** Its action, naming the session's own agent (Files' "Ask Claude Code for a page"). */
export const firstAskLabel = (harness: string | null | undefined): string =>
  `Ask ${speakerName(harness)} about this folder`;

/**
 * The first ask: in this session's own composer while it takes words, the
 * caret after them, nothing sent; a session that takes none here opens the
 * New Session form in its folder with the same words.
 */
export function askFirst(
  instanceId: string,
  writable: boolean,
  anchor: HTMLElement | null
): void {
  const row = cawco.session(instanceId);
  const words = firstAskWords(row?.cwd ?? "");
  const draft = paneDrafts.get(instanceId);
  if (draft && writable) {
    draft.ask(words);
    return;
  }
  const projectId = cawco.instanceIndex.byId.get(instanceId)?.projectId;
  askNewSession(words, anchor, {
    ...(row?.machineId ? { machineId: row.machineId } : {}),
    ...(row?.cwd ? { cwd: row.cwd } : {}),
    ...(projectId ? { projectId } : {}),
  });
}
