/**
 * The marker lines whiffle opens every message it puts into a session with,
 * on someone else's behalf — another session's hand-off, a workflow's brief or
 * notice, a delegate's report or ask. (A rule's marker lives beside the rest
 * of rules, in `rules.ts`.)
 *
 * A message's `origin` says who sent it while it streams, but storage strips
 * it: a transcript read back off disk returns every one of these as a plain
 * user turn. The marker is the part that survives, so the hub builds it here
 * and the dashboard parses it here, and a stored copy renders exactly as the
 * live one did — never as the reader's own words.
 */

/** A hand-off from another session. */
export const handoffMarker = (from: string): string =>
  `[Hand-off from the ${from} session — another agent, not the user]\n\n`;

/** A workflow step's brief, handed to the session that runs the step. */
export const workflowStepMarker = (workflow: string, step: string): string =>
  `[Hand-off from the ${workflow} workflow — step ${step}, not the user]\n\n`;

/**
 * The marker and the break after it, however that break was kept: written as
 * a blank line, and folded to spaces in a harness catalog's first prompt.
 */
const HANDOFF =
  /^\[Hand-off from the (.+?) (?:session — another agent|workflow — step (.+?)), not the user\]\s+/;

/** `text` with `line` right after any hand-off marker it opens with. */
const afterMarker = (text: string, line: string): string => {
  const at = HANDOFF.exec(text)?.[0].length ?? 0;
  return `${text.slice(0, at)}${line}\n\n${text.slice(at)}`;
};

/** How a checkout lands on `base`, the repository's default branch, and reads it. */
const landLine = (base: string): string =>
  `The repository's default branch is ${base}. Land with \`git fetch origin && git rebase origin/${base} && git push origin HEAD:${base}\`. Compare against ${base} with \`git show origin/${base}:<path>\`.`;

/**
 * The opening of a side quest the daemon started in a fresh git worktree of
 * `cwd`, cut from `base` (none for a repository with no remote, which has
 * nowhere to land), with the line that says so right after any hand-off
 * marker.
 */
export const withWorktreeLine = (
  text: string,
  cwd: string,
  base: string | undefined
): string =>
  afterMarker(
    text,
    `You work in your own git worktree (your current directory). Paths under ${cwd} in this brief mean the same path in your worktree.${base ? ` ${landLine(base)}` : ""} The stash list is shared by every worktree of the repo.`
  );

/**
 * The opening of a work item's session, in its workspace's shared clone of
 * `repoRoot` cut from `base` and inside its boundary, with the line that says
 * so right after any hand-off marker.
 */
export const withWorkspaceLine = (
  text: string,
  repoRoot: string,
  base: string
): string =>
  afterMarker(
    text,
    `You work in your own clone of ${repoRoot} (your current directory), on its own branch; its stash is its own. Paths under ${repoRoot} in this brief mean the same path in your clone. ${landLine(base)} Your shell commands run inside this workspace's boundary: they can write only this clone, /tmp (the workspace's own), ~/.cache, ~/.bun and ~/.npm; they see and signal only this workspace's processes; they cannot reach the service manager; the hub and the internet are reachable.`
  );

/**
 * A hand-off read back into who sent it and what it says. `from` names the
 * sending session, or the workflow and step for a step's brief.
 */
export function parseHandoffMarker(
  text: string
): { from: string; body: string } | null {
  const marker = HANDOFF.exec(text);
  if (!marker) {
    return null;
  }
  const [line, from, step] = marker;
  return {
    from: step === undefined ? from : `${from} workflow · ${step}`,
    body: text.slice(line.length).trim(),
  };
}

/**
 * A workflow telling its supervising session what happened: a step passed or
 * failed, the run finished, a question or checkpoint came up.
 */
export const workflowNoticeMarker = (workflow: string, event: string): string =>
  `[Workflow ${workflow} — ${event}]\n\n`;

const WORKFLOW_NOTICE = /^\[Workflow (.+?) — (.+?)\]\n\n/;

/** A workflow notice read back into the workflow, the event and the detail. */
export function parseWorkflowNotice(
  text: string
): { workflow: string; event: string; body: string } | null {
  const marker = WORKFLOW_NOTICE.exec(text);
  if (!marker) {
    return null;
  }
  return {
    workflow: marker[1],
    event: marker[2],
    body: text.slice(marker[0].length).trim(),
  };
}

/**
 * The header of a delegate's report to its parent, written when the
 * delegate's turn ends. `label` is `<name>#<first 8 of its id>`.
 */
export const reportMarker = (label: string, failed: boolean): string =>
  `[Report from delegate ${label} — turn ${failed ? "failed" : "complete"}]\n\n`;

const REPORT =
  /^\[Report from delegate (.+?)#([0-9a-f]{8}) — turn (complete|failed)\]\n\n/;

/**
 * A report read back. Only the 8-character short id survives, so consumers
 * pair it with the delegate's full id by prefix.
 */
export function parseReportMarker(text: string): {
  name: string;
  short: string;
  failed: boolean;
  body: string;
} | null {
  const marker = REPORT.exec(text);
  if (!marker) {
    return null;
  }
  return {
    name: marker[1],
    short: marker[2],
    failed: marker[3] === "failed",
    body: text.slice(marker[0].length).trim(),
  };
}

/**
 * A delegate's permission ask, routed to its parent: an opening line naming
 * the delegate, the ask itself, then the tag line carrying the ids the
 * parent's `answer_delegate` call copies, then how to answer.
 */
export const delegateAskText = (ask: {
  label: string;
  body: string;
  instance: string;
  request: string;
  instruction: string;
}): string =>
  `[Delegate ask from ${ask.label}]\n\n${ask.body}\n\n[delegate-ask instance=${ask.instance} request=${ask.request}]\n\n${ask.instruction}`;

const ASK_OPENING = /^\[Delegate ask from (.+?)\]\n\n/;
const ASK_TAG = /\n\n\[delegate-ask instance=([0-9a-f-]{36}) request=(\S+)\]/;

/** An ask read back: who asked, its ids, and the ask alone (no tag, no instruction). */
export function parseDelegateAsk(text: string): {
  label: string;
  instance: string;
  request: string;
  body: string;
} | null {
  const opening = ASK_OPENING.exec(text);
  const tag = opening ? ASK_TAG.exec(text) : null;
  if (!(opening && tag)) {
    return null;
  }
  return {
    label: opening[1],
    instance: tag[1],
    request: tag[2],
    body: text.slice(opening[0].length, tag.index).trim(),
  };
}
