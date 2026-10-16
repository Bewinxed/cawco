/**
 * The marker lines cawco opens every message it puts into a session with,
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
import type { ArtifactKind } from "./index";

/**
 * A hand-off from another session, named `<name>#<first 8 of its id>` as a
 * report names its delegate, so a reader can link, mark and relate the sender.
 */
export const handoffMarker = (from: string, id: string): string =>
  `[Hand-off from the ${from}#${id.slice(0, 8)} session — another agent, not the user]\n\n`;

/** A workflow step's brief, handed to the session that runs the step. */
export const workflowStepMarker = (workflow: string, step: string): string =>
  `[Hand-off from the ${workflow} workflow — step ${step}, not the user]\n\n`;

/**
 * The marker and the break after it, however that break was kept: written as
 * a blank line, and folded to spaces in a harness catalog's first prompt.
 */
const HANDOFF =
  /^\[Hand-off from the (?:(.+?)(?:#([0-9a-f]{8}))? session — another agent|(.+?) workflow — step (.+?)), not the user\]\s+/;

/** `text` with `line` right after any hand-off marker it opens with. */
const afterMarker = (text: string, line: string): string => {
  const at = HANDOFF.exec(text)?.[0].length ?? 0;
  return `${text.slice(0, at)}${line}\n\n${text.slice(at)}`;
};

/** How a checkout lands on `base`, the repository's default branch, and reads it. */
const landLine = (base: string): string =>
  `The repository's default branch is ${base}. Land with \`git fetch origin && git rebase origin/${base} && git push origin HEAD:${base}\`. Compare against ${base} with \`git show origin/${base}:<path>\`.`;

/**
 * Where a work item's work goes once it finishes (hub/src/landing.ts):
 * `main` onto the repository's default branch, `branch` to a branch of its
 * own on origin, `pr` to that branch with a pull request, `none` nowhere (the
 * work is not commits; its outputs are the deliverable).
 */
export type LandsMode = "main" | "branch" | "pr" | "none";

/** Every {@link LandsMode}, in the order a setting offers them. */
export const LANDS_MODES: readonly LandsMode[] = [
  "main",
  "branch",
  "pr",
  "none",
];

/** How a work item lands, and the files it hands in besides commits. */
export interface WorkspaceLanding {
  lands: LandsMode;
  /** Paths in the workspace the hub copies into the project's folder. */
  outputs?: string[];
}

/** What a session is told of its outputs, when it has any. */
const outputsLine = (outputs: string[] | undefined): string =>
  outputs?.length
    ? ` The hub then copies your outputs (${outputs.join(", ")}) into the project's folder; a missing one comes back to you.`
    : "";

/** The landing gate, as a delegate is told of it. */
const GATE =
  "its landing gate (the dependency install, the repository's `lint:changed` and `typecheck` scripts where its package.json defines them, and the iOS build when you changed the app)";

/**
 * How a work item's workspace lands: the hub does it after `finish_item`,
 * through its landing gate (hub/src/landing.ts), so the session commits and
 * never pushes. The session's report, quoting what it ran, is the proof.
 */
const hubLandLine = (
  base: string,
  { lands, outputs }: WorkspaceLanding
): string => {
  const outputsSaid = outputsLine(outputs);
  const compare = ` Your finish_item summary is the proof of the work: quote the real output of each command that proves it. Compare against ${base} with \`git show origin/${base}:<path>\`.`;
  const opening = `The repository's default branch is ${base}.`;
  switch (lands) {
    case "branch":
      return `${opening} Commit your work and do not push: after finish_item, the hub runs ${GATE} on your commits and pushes your branch to origin; nothing goes onto ${base}.${outputsSaid}${compare}`;
    case "pr":
      return `${opening} Commit your work and do not push: after finish_item, the hub runs ${GATE} on your commits, pushes your branch to origin and opens a pull request against ${base}.${outputsSaid}${compare}`;
    case "none":
      return outputs?.length
        ? `${opening} Nothing is pushed: after finish_item, your outputs (${outputs.join(", ")}) are collected into the project's folder, and a missing one comes back to you. They need not be committed.${compare}`
        : `${opening} Nothing is pushed and nothing is collected: finish_item hands your report to your parent.${compare}`;
    case "main":
      return `${opening} Commit your work and do not push: after finish_item, the hub rebases your commits onto origin/${base}, runs ${GATE} on the result, and pushes to ${base}; a failing gate comes back to you with its output.${outputsSaid}${compare}`;
  }
};

/**
 * `text` with how its work item lands right after any hand-off marker: a
 * follow-up in a session that already read its workspace line, landing
 * otherwise than the brief before it.
 */
export const withLandingLine = (
  text: string,
  base: string,
  landing: WorkspaceLanding
): string => afterMarker(text, hubLandLine(base, landing));

/**
 * The opening of a spin-off the daemon started in a fresh git worktree of
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
  base: string,
  landing: WorkspaceLanding = { lands: "main" }
): string =>
  afterMarker(
    text,
    `You work in your own clone of ${repoRoot} (your current directory), on its own branch; its stash is its own. Paths under ${repoRoot} in this brief mean the same path in your clone. ${hubLandLine(base, landing)} Your shell commands run inside this workspace's boundary: they can write only this clone, $TMPDIR (the workspace's own scratch dir: temp files go there, not /tmp) and the workspaces' own package cache (bun, npm, uv and XDG_CACHE_HOME point there; the host's caches are read-only); they read nothing in the home dir outside this clone, the toolchains and the user's git config, and none of the credentials CawCo, the harnesses and the machine's tools keep; they see and signal only this workspace's processes; they cannot reach the service manager; any public host is reachable, none of the owner's machines is, and \`cawco tools\` and \`cawco tool\` reach the hub's tools. Nothing in here makes namespaces (podman, a probe whose scratch fleet delegates): such a probe runs only as a check your parent marked \`host\`, outside the boundary on a fresh checkout of your last commit, and you cannot add one.`
  );

/**
 * `text` with the line that names a delegate's inputs right after any
 * hand-off marker: where they are, `$TMPDIR/inputs/` in its workspace, and
 * where each was read on its parent's machine. `text` as it is without any.
 */
export const withInputsLine = (
  text: string,
  inputs: readonly { from: string; name: string }[]
): string =>
  inputs.length === 0
    ? text
    : afterMarker(
        text,
        `Your parent's inputs are in $TMPDIR/inputs/: ${inputs.map(({ name, from }) => `${name} (from ${from})`).join(", ")}.`
      );

/**
 * A hand-off read back into who sent it and what it says. `from` names the
 * sending session, or the workflow and step for a step's brief; `short` is the
 * sending session's 8-character short id, which consumers pair with its full
 * id by prefix (none for a workflow's brief, nor a marker written before the
 * id was).
 */
export function parseHandoffMarker(
  text: string
): { from: string; short?: string; body: string } | null {
  const marker = HANDOFF.exec(text);
  if (!marker) {
    return null;
  }
  const [line, session, short, workflow, step] = marker;
  const body = text.slice(line.length).trim();
  return workflow === undefined
    ? { from: session, ...(short ? { short } : {}), body }
    : { from: `${workflow} workflow · ${step}`, body };
}

/**
 * The hub telling a session a message it sent another never reached it:
 * the turn the sender reads, and the line its transcript draws (a note
 * titled by who it was for, the reason under it).
 */
export const undeliveredNotice = (to: string, reason: string): string =>
  `[CawCo] Your message to ${to} was not delivered: ${reason}`;

const UNDELIVERED = /^\[CawCo\] Your message to (.+?) was not delivered: /;

/** An undelivered notice read back into who it was for and why. */
export function parseUndelivered(
  text: string
): { to: string; reason: string } | null {
  const marker = UNDELIVERED.exec(text);
  if (!marker) {
    return null;
  }
  return { to: marker[1], reason: text.slice(marker[0].length).trim() };
}

/**
 * The person sent their picks on one of the session's artifacts (hub
 * artifacts/service.ts `send`, the page's `cawco.send`): the session reads
 * them itself, with `artifact_read` from `since`. Picks never travel as the
 * person's words. Sent under the system origin
 * {@link import("./harness").ARTIFACT_ORIGIN}; a transcript draws it as one
 * quiet line ({@link import("./harness").ARTIFACT_RESPONSES}).
 */
export interface ArtifactResponses {
  id: string;
  kind: ArtifactKind;
  name: string;
  /** The `seq` to read from: the last one the session was told of. */
  since: number;
}

export const artifactResponsesNotice = ({
  id,
  kind,
  name,
  since,
}: ArtifactResponses): string =>
  `[CawCo] The ${kind} "${name}" has new responses since ${since}. Read them with artifact_read({ id: "${id}", since: ${since} }).`;

const ARTIFACT_RESPONSES_LINE =
  /^\[CawCo\] The (page|canvas|preview|sheet) "([a-z0-9][a-z0-9-]{0,62})" has new responses since (\d+)\. Read them with artifact_read\(\{ id: "([0-9a-f-]{36})", since: \d+ \}\)/;

/** An artifact's responses notice read back into what it names. */
export function parseArtifactResponses(text: string): ArtifactResponses | null {
  const line = ARTIFACT_RESPONSES_LINE.exec(text);
  if (!line) {
    return null;
  }
  return {
    kind: line[1] as ArtifactKind,
    name: line[2],
    since: Number(line[3]),
    id: line[4],
  };
}

/**
 * The person's pins, replies, resolves and ink on one of the session's
 * artifacts, delivered by themselves once they have been quiet a while (hub
 * artifacts/service.ts `deliverMarks`): the sections say each pin (its
 * number, id, anchor, source and words) and each loose stroke group, so the
 * session acts on them without reading first. Sent under the system origin
 * {@link import("./harness").ARTIFACT_ORIGIN}, like the picks' notice; a
 * transcript draws it as the same quiet line, "Comments on <name>".
 */
export interface ArtifactComments {
  id: string;
  kind: ArtifactKind;
  name: string;
}

export const artifactCommentsNotice = (
  { id, kind, name }: ArtifactComments,
  sections: string[]
): string =>
  `[CawCo] The person commented on the ${kind} "${name}" (artifact ${id}). Answer each pin in its thread with comment_reply({ pin, text }), and comment_resolve once a change settles it; comment_read has the history.\n\n${sections.join("\n\n")}`;

/**
 * A sheet's compile errors from its stage (live components, core
 * `stage.ts`), delivered on the same quiet-gathered channel as the person's
 * marks when no mark goes with them; with marks, they are sections of the
 * comments notice.
 */
export const artifactErrorsNotice = (
  { id, kind, name }: ArtifactComments,
  sections: string[]
): string =>
  `[CawCo] The ${kind} "${name}" (artifact ${id}) does not compile on its stage; the panel shows the last good render under the error. Fix each at its file:line:column; artifact_read lists the errors standing, and none once it compiles.\n\n${sections.join("\n\n")}`;

/**
 * What the person saved from a sheet's inspector (live components spec §5):
 * CawCo wrote it into the story file in the session's workspace, so the
 * session hears it on the marks' channel before it next edits that file.
 */
export const artifactSavesNotice = (
  { id, kind, name }: ArtifactComments,
  sections: string[]
): string =>
  `[CawCo] The person changed the ${kind} "${name}" (artifact ${id}) from its inspector, and CawCo wrote it into the story file in your workspace. Read the file again before you edit it.\n\n${sections.join("\n\n")}`;

/**
 * A delegate put an artifact in its parent's panel (hub artifacts/service.ts
 * `create` with `to: "parent"`): the parent owns it now, and the person's
 * picks and pins on it come to the parent. Told once, when it first arrives
 * from that delegate; the delegate's updates after are not told. Sent under
 * the system origin {@link import("./harness").ARTIFACT_ORIGIN}; a transcript
 * draws it as one quiet note.
 */
export interface ArtifactHanded extends ArtifactComments {
  /** The delegate's name, as the rail shows it. */
  from: string;
}

export const artifactHandedNotice = ({
  from,
  id,
  kind,
  name,
}: ArtifactHanded): string =>
  `[CawCo] ${from} put the ${kind} "${name}" in your panel (artifact ${id}). The person's picks and pins on it come to you; artifact_read reads it.`;

const ARTIFACT_HANDED_LINE =
  /^\[CawCo\] (.+) put the (page|canvas|preview|sheet) "([a-z0-9][a-z0-9-]{0,62})" in your panel \(artifact ([0-9a-f-]{36})\)\./;

/** A handed-up artifact's notice read back into who handed what. */
export function parseArtifactHanded(text: string): ArtifactHanded | null {
  const line = ARTIFACT_HANDED_LINE.exec(text);
  if (!line) {
    return null;
  }
  return {
    from: line[1],
    kind: line[2] as ArtifactKind,
    name: line[3],
    id: line[4],
  };
}

const ARTIFACT_COMMENTS_LINE =
  /^\[CawCo\] The person commented on the (page|canvas|preview|sheet) "([a-z0-9][a-z0-9-]{0,62})" \(artifact ([0-9a-f-]{36})\)\.[^\n]*\n\n/;

/** An artifact's comments notice read back into what it names, and its sections as one text. */
export function parseArtifactComments(
  text: string
): (ArtifactComments & { sections: string }) | null {
  const line = ARTIFACT_COMMENTS_LINE.exec(text);
  if (!line) {
    return null;
  }
  return {
    kind: line[1] as ArtifactKind,
    name: line[2],
    id: line[3],
    sections: text.slice(line[0].length),
  };
}

/**
 * Fleet watch's nudge to a session's lead (packages/hub `fleet-watch.ts`):
 * the line, then what the lead reads. A transcript draws it as the same
 * fleet-watch note the watched session's transcript has.
 */
export const fleetWatchNudge = (line: string, body: string): string =>
  `[Fleet watch] ${line}\n\n${body}`;

const FLEET_WATCH_NUDGE = /^\[Fleet watch\] (.+)\n\n/;

/** A fleet-watch nudge read back into its line and what it says. */
export function parseFleetWatchNudge(
  text: string
): { line: string; body: string } | null {
  const marker = FLEET_WATCH_NUDGE.exec(text);
  if (!marker) {
    return null;
  }
  return { line: marker[1], body: text.slice(marker[0].length).trim() };
}

/**
 * The hub's word to a fork, ahead of its first turn (packages/hub
 * `forkNotice`): whose the delegates in the conversation it copied are. A
 * transcript draws it as a note, never as the person's words.
 */
export const forkNotice = (line: string, body: string): string =>
  `[Fork] ${line}\n\n${body}`;

const FORK_NOTICE = /^\[Fork\] (.+)\n\n/;

/** A fork's notice read back into its line and what it says. */
export function parseForkNotice(
  text: string
): { line: string; body: string } | null {
  const marker = FORK_NOTICE.exec(text);
  if (!marker) {
    return null;
  }
  return { line: marker[1], body: text.slice(marker[0].length).trim() };
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
 * delegate's turn ends, or the hub issues a notice without ending the item.
 * `label` is `<name>#<first 8 of its id>`. A report from `finish_item`
 * carries the delegate's `headline` on the line under it, folded to one
 * line; the full report is the body after the blank line.
 */
export const reportMarker = (
  label: string,
  failed: boolean,
  notice = false,
  headline?: string
): string => {
  const said = headline?.replace(/\s+/g, " ").trim();
  return `[Report from delegate ${label} — ${notice ? "notice" : `turn ${failed ? "failed" : "complete"}`}]\n${said ? `Headline: ${said}\n` : ""}\n`;
};

const REPORT =
  /^\[Report from delegate (.+?)#([0-9a-f]{8}) — (turn complete|turn failed|notice)\]\n(?:Headline: ([^\n]+)\n)?\n/;

/**
 * A report read back. Only the 8-character short id survives, so consumers
 * pair it with the delegate's full id by prefix. `headline` is absent on a
 * report without one (a turn's own words, a hub notice, one stored before).
 */
export function parseReportMarker(text: string): {
  name: string;
  short: string;
  failed: boolean;
  headline?: string;
  body: string;
} | null {
  const marker = REPORT.exec(text);
  if (!marker) {
    return null;
  }
  return {
    name: marker[1],
    short: marker[2],
    failed: marker[3] === "turn failed",
    ...(marker[4] ? { headline: marker[4].trim() } : {}),
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
