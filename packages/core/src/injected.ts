/**
 * The marker lines cawco opens every message it puts into a session with,
 * on someone else's behalf — another session's hand-off, a delegate's report
 * or ask. (A rule's marker lives beside the rest
 * of rules, in `rules.ts`.)
 *
 * A message's `origin` says who sent it while it streams, but storage strips
 * it: a transcript read back off disk returns every one of these as a plain
 * user turn. The marker is the part that survives, so the hub builds it here
 * and the dashboard parses it here, and a stored copy renders exactly as the
 * live one did — never as the reader's own words.
 *
 * Every marker is two parts: one machine tag, `[cawco:<kind> key=value …]`
 * on the message's first line ({@link markerTag}), each value
 * URI-encoded, and then the line its reader (a model, a person) reads, as it
 * always was. Only the tag is ever parsed ({@link readMarkerTag}); the line a
 * reader reads is built from the tag's fields again and passed over, never
 * read. Messages stored before the tag were given it once, by the hub's
 * migration over its stored sends (hub db/tag-markers.ts).
 */
import type { ArtifactKind, CarryRestored } from "./index";

/** One marker's tag, read: its kind, its fields, and the text after the tag's line. */
export interface MarkerTag {
  fields: Readonly<Partial<Record<string, string>>>;
  kind: string;
  rest: string;
}

/**
 * The tag a marker opens with: `[cawco:<kind> key=value …]` and a line
 * break, each value URI-encoded (so it holds no space, `=` or `]`); a field
 * that is undefined is left out.
 */
export const markerTag = (
  kind: string,
  fields: Readonly<Record<string, string | number | undefined>>
): string =>
  `[cawco:${kind}${Object.entries(fields)
    .flatMap(([key, value]) =>
      value === undefined
        ? []
        : [` ${key}=${encodeURIComponent(String(value))}`]
    )
    .join("")}]\n`;

/**
 * A tag's line: its kind, its fields, and the one whitespace after it (a
 * line break as written, a space where a harness catalog folded a first
 * prompt onto one line).
 */
const TAG = /^\[cawco:([a-z-]+)((?: [a-z]+=[^\s\]]*)*)\]\s/;
const FIELD = / ([a-z]+)=([^\s\]]*)/g;

/** The tag `text` opens with, read; null when it opens with none, or one that does not decode. */
export function readMarkerTag(text: string): MarkerTag | null {
  const tag = TAG.exec(text);
  if (!tag) {
    return null;
  }
  const fields: Record<string, string> = {};
  try {
    for (const [, key, value] of tag[2].matchAll(FIELD)) {
      fields[key] = decodeURIComponent(value);
    }
  } catch {
    return null;
  }
  return { kind: tag[1], fields, rest: text.slice(tag[0].length) };
}

/**
 * The text after the line a reader reads (`line`, built again from the tag's
 * fields), trimmed: that line is passed over, never parsed. A line whose
 * break a harness catalog folded to spaces is passed over all the same.
 */
const afterLine = (rest: string, line: string): string => {
  const head = line.trimEnd();
  return (rest.startsWith(head) ? rest.slice(head.length) : rest).trim();
};

/** The tag `text` opens with when it is of `kind`, else null. */
const tagOf = (text: string, kind: string): MarkerTag | null => {
  const tag = readMarkerTag(text);
  return tag?.kind === kind ? tag : null;
};

/**
 * The words a hand-off opens with, for the session that reads it; one
 * stored before a hand-off named its sender's id has no `#<short>`.
 */
const handoffLine = (from: string, short: string): string =>
  `[Hand-off from the ${from}${short ? `#${short}` : ""} session — another agent, not the user]\n\n`;

/**
 * A hand-off from another session, named `<name>#<first 8 of its id>` as a
 * report names its delegate, so a reader can link, mark and relate the sender.
 */
export const handoffMarker = (from: string, id: string): string =>
  `${markerTag("handoff", { from, short: id.slice(0, 8) })}${handoffLine(from, id.slice(0, 8))}`;

/**
 * Where a hand-off's marker ends, its tag and its line and the whitespace
 * after them; 0 for text that opens with none.
 */
const handoffEnd = (text: string): number => {
  const tag = tagOf(text, "handoff");
  if (!tag) {
    return 0;
  }
  const { from = "", short = "" } = tag.fields;
  const line = handoffLine(from, short).trimEnd();
  const lineAt = text.length - tag.rest.length;
  const end = tag.rest.startsWith(line) ? lineAt + line.length : lineAt;
  return end + (LEADING_SPACE.exec(text.slice(end))?.[0].length ?? 0);
};

/** The whitespace a text opens with. */
const LEADING_SPACE = /^\s*/;

/** `text` with `line` right after any hand-off marker it opens with. */
const afterMarker = (text: string, line: string): string => {
  const at = handoffEnd(text);
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

/** The merge checks, as a delegate is told of them. */
const GATE =
  "its merge checks (the checks its project's gate.md names: for CawCo the dependency install, one `bun run check --all` in your warm workspace, and the iOS build when you changed the app)";

/**
 * How a work item's workspace lands: the hub does it after `finish_item`,
 * after its merge checks pass (hub/src/landing.ts), so the session commits and
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
      return `${opening} Commit your work and do not push: after finish_item, the hub rebases your commits onto origin/${base}, runs ${GATE} on the result, and pushes to ${base}; a failed check comes back to you with its output.${outputsSaid}${compare}`;
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
    `You work in your own clone of ${repoRoot} (your current directory), on its own branch; its stash is its own. Paths under ${repoRoot} in this brief mean the same path in your clone. ${hubLandLine(base, landing)} Your shell commands run inside this workspace's boundary: they can write only this clone, $TMPDIR (the workspace's own scratch dir: temp files go there, not /tmp) and the workspaces' own package cache (bun, npm, uv and XDG_CACHE_HOME point there; the host's caches are read-only); a write anywhere else, under ~ or /tmp included, fails as a read-only file system; they read nothing in the home dir outside this clone, the toolchains and the user's git config, and none of the credentials CawCo, the harnesses and the machine's tools keep; they see and signal only this workspace's processes; they cannot reach the service manager; any public host is reachable, none of the owner's machines is, and \`cawco tools\` and \`cawco tool\` reach the hub's tools. Nothing in here makes namespaces (podman, a probe whose scratch fleet delegates): such a probe runs only as a check your parent marked \`host\`, outside the boundary on a fresh checkout of your last commit, and you cannot add one.`
  );

/**
 * The opening of a host-scope work item's session (hub work-items.ts
 * `startHost`): on `machine` itself in `cwd`, no clone and no boundary, so
 * its commands have what a session the person starts there has. Nothing it
 * does is landed; its report is the whole of what reaches its parent.
 */
export const withHostLine = (
  text: string,
  cwd: string,
  machine: string
): string =>
  afterMarker(
    text,
    `You run on ${machine} itself, in ${cwd}, with host scope: no clone and no boundary. Your shell commands have what a session started on this machine has: its network and listening sockets, every process, the agent user's groups (docker and the like) and its files. Nothing you do is committed, pushed or landed: finish_item hands your report to your parent, so quote in it the real output of each command that proves the work.`
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
 * How CawCo moved a workspace's checkout under the session that goes on in
 * it, untold until the next message handed to that session:
 * - `recut`: the workspace retired while its session slept and was cut again
 *   for it at `commit` on `branch` (hub work-items.ts `recut`), a new clone
 *   with nothing git does not track; with `carry`, its commits were in that
 *   carry as it retired and are restored on top, HEAD where it was;
 * - `landing`: the hub rebased the workspace's commits onto origin's `branch`
 *   as it landed them (hub landing.ts `onBase`), HEAD going `from` → `to`,
 *   so the tree holds every file main gained in between, its lockfile and
 *   package manifests among them.
 */
export type CheckoutMove =
  | {
      branch: string;
      carry?: string;
      commit: string;
      kind: "recut";
      restored?: CarryRestored;
    }
  | { branch: string; from: string; kind: "landing"; to: string };

/** What a cut again made of its carry's uncommitted diff, in the moved line's words. */
export const restoredWords = (restored: CarryRestored | undefined): string => {
  if (!restored) {
    return "";
  }
  return "applied" in restored
    ? `; your uncommitted changes from ${restored.applied} are applied on top (unstaged, new files untracked)`
    : `; your uncommitted changes in ${restored.refused} did not apply (${restored.why}), so they stay there`;
};

/** The run that brings a moved checkout's installed dependencies to its lockfile, in the line's words. */
const INSTALL_AGAIN = "Run the repo's install before you build or test.";

/**
 * The hub's line to a session whose checkout CawCo moved ({@link
 * CheckoutMove}). CawCo installs nothing (the owner, 2026-10-18: "the
 * delegate or whatever will handle this as they need in each workspace"),
 * so an install the session made before the move no longer matches the
 * checkout: on 2026-10-21 a leaf's build failed on a dependency main had
 * gained since its install (`Could not resolve: "tldts"`) until it ran
 * `bun install` again. The line names the move and that run.
 */
export const movedLine = (move: CheckoutMove): string =>
  move.kind === "recut"
    ? `[CawCo] Your workspace retired while this session slept, so this folder is a new clone, cut again at ${move.commit.slice(0, 9)} on ${move.branch}${move.carry ? `, your own commits restored on top from the carry ${move.carry}, HEAD where you left it` : ""}${restoredWords(move.restored)}: installed dependencies, build outputs and your $TMPDIR scratch are gone. ${INSTALL_AGAIN}`
    : `[CawCo] Your checkout moved from ${move.from.slice(0, 9)} to ${move.to.slice(0, 9)}: the hub rebased your commits onto origin/${move.branch} as it landed them, so files main gained since are here and your installed dependencies may predate them. ${INSTALL_AGAIN}`;

/**
 * `text` with {@link movedLine} right after any hand-off marker: the first
 * message a session reads after CawCo moved its checkout.
 */
export const withMovedLine = (text: string, move: CheckoutMove): string =>
  afterMarker(text, movedLine(move));

/**
 * Where the person is, as a session is told at the start of each turn (hub
 * server.ts `presenced`, from notifications.ts `person`):
 * - `on`: on this chat now, or this is their own message: talk normally.
 *   With `recap`, this is their first message to the session since they
 *   came back from being away since `recap.since` (the hub's own word on
 *   when they left), and the notes the session kept meanwhile (its plan's
 *   "Since `recap.section`" section) ride along for it to recap or point to;
 * - `elsewhere`: here, on another chat or another app: work quietly;
 * - `away`: away since `since` (HH:MM on the hub's clock; null when no
 *   device has ever said): work without talking, and keep the notes.
 */
export type PresenceSaid =
  | {
      kind: "on";
      recap?: {
        notes: string;
        /** The plan's section the notes are under, by its heading's time (`## Since HH:MM`). */
        section: string;
        /** When the person went away, HH:MM on the hub's clock, as the hub knows it. */
        since: string;
        /** The plan's open steps waiting on the person's pick on a page, read from the plan as it stands. */
        waiting?: readonly AwayWait[];
      };
    }
  | { kind: "elsewhere" }
  | { kind: "away"; since: string | null };

/** A plan step waiting on the person's pick on a page (core plan.ts `PlanWait`), by its chip. */
export interface AwayWait {
  /** The page's artifact id and name: its `cawco:artifact` chip. */
  artifact: { id: string; name: string };
  content: string;
  step: string;
}

/** A waiting step as the recap names it: the step, then its page's chip. */
const waitLine = ({ artifact, content, step }: AwayWait): string =>
  `- step ${step} (${content}) waits on [${artifact.name}](cawco:artifact/${artifact.id})`;

/** The heading a session's away notes open with in its plan's spec: `## Since 12:18 (you were away)`. */
export const awayNotesHeading = (since: string): string =>
  `## Since ${since} (you were away)`;

/** The first "## Since HH:MM" section of a plan's spec: when it began, and its lines. */
export const awayNotesOf = (
  spec: string | undefined
): { notes: string; since: string } | undefined => {
  if (!spec) {
    return;
  }
  const lines = spec.split("\n");
  const at = lines.findIndex((line) => AWAY_HEADING.test(line));
  if (at < 0) {
    return;
  }
  const since = AWAY_HEADING.exec(lines[at] ?? "")?.[1] ?? "";
  const end = lines.findIndex(
    (line, index) => index > at && line.startsWith("## ")
  );
  const notes = lines
    .slice(at + 1, end < 0 ? undefined : end)
    .join("\n")
    .trim();
  return notes ? { since, notes } : undefined;
};

const AWAY_HEADING = /^## Since (\d{1,2}:\d{2})\b/;

/** What a session reads of the person, at the head of its turn ({@link PresenceSaid}). */
export const presenceLine = (said: PresenceSaid): string => {
  switch (said.kind) {
    case "on":
      return said.recap
        ? `[CawCo presence] The person is back on this chat; they were away since ${said.recap.since}. Your plan's notes from while they were away:\n\n${said.recap.notes}${said.recap.waiting?.length ? `\n\nWhat waits on them in your plan now:\n${said.recap.waiting.map(waitLine).join("\n")}\nName each by its link as written here.` : ""}\n\nIf their message asks something specific, answer it in full and point to "Since ${said.recap.section}" in your plan in one line. Otherwise open with a recap of those notes in one to three sentences, then answer. Then fold that section into the rest of your plan's spec with todo_write.`
        : "[CawCo presence] The person is on this chat now: talk to them normally.";
    case "elsewhere":
      return "[CawCo presence] The person is at their desk but not on this chat. Work quietly: keep your plan current with todo_write, and write to them only for what needs them.";
    case "away": {
      const heading = awayNotesHeading(said.since ?? "now");
      return `[CawCo presence] The person is away${said.since ? ` since ${said.since}` : ""}. Work without talking: no narration, and no questions in this chat unless you are blocked. Keep what they would want to know in your plan's spec with todo_write, under "${heading}" at its top: one line for each thing done, decided, or waiting on them. Something waiting on them is a step of your plan: name the step by its id, never a copy of its state. Tick steps as they finish.`;
    }
  }
};

/**
 * `text` with the person's presence after it, in a `<system-reminder>`
 * block: the session reads it, and a transcript's text and Find leave it
 * out (jsonl-parser text.ts drops every such block). After the text, so a
 * marker's tag still opens the message.
 */
export const withPresenceLine = (text: string, said: PresenceSaid): string =>
  `${text}${text ? "\n\n" : ""}<system-reminder>\n${presenceLine(said)}\n</system-reminder>`;

/**
 * A hand-off read back into who sent it and what it says. `from` names the
 * sending session; `short` is its 8-character short id, which consumers pair
 * with its full id by prefix (none on a hand-off stored before it was named).
 */
export function parseHandoffMarker(
  text: string
): { from: string; short?: string; body: string } | null {
  const tag = tagOf(text, "handoff");
  if (!tag) {
    return null;
  }
  const { from = "", short = "" } = tag.fields;
  return {
    from,
    ...(short ? { short } : {}),
    body: afterLine(tag.rest, handoffLine(from, short)),
  };
}

/** The words an undelivered notice opens with, before its reason. */
const undeliveredLine = (to: string): string =>
  `[CawCo] Your message to ${to} was not delivered: `;

/**
 * The hub telling a session a message it sent another never reached it:
 * the turn the sender reads, and the line its transcript draws (a note
 * titled by who it was for, the reason under it).
 */
export const undeliveredNotice = (to: string, reason: string): string =>
  `${markerTag("undelivered", { to })}${undeliveredLine(to)}${reason}`;

/** An undelivered notice read back into who it was for and why. */
export function parseUndelivered(
  text: string
): { to: string; reason: string } | null {
  const tag = tagOf(text, "undelivered");
  if (!tag) {
    return null;
  }
  const { to = "" } = tag.fields;
  return { to, reason: afterLine(tag.rest, undeliveredLine(to)) };
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
  `${markerTag("artifact-responses", { id, kind, name, since })}[CawCo] The ${kind} "${name}" has new responses since ${since}. Read them with artifact_read({ id: "${id}", since: ${since} }).`;

/** An artifact's responses notice read back into what it names. */
export function parseArtifactResponses(text: string): ArtifactResponses | null {
  const tag = tagOf(text, "artifact-responses");
  if (!tag) {
    return null;
  }
  const { id = "", kind = "", name = "", since = "" } = tag.fields;
  return { id, kind: kind as ArtifactKind, name, since: Number(since) };
}

/**
 * The person's pins, replies, resolves and ink on one of the session's
 * artifacts, delivered on their Send with their note first (hub
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

/** The words a comments notice opens with, before its sections. */
const commentsLine = ({ id, kind, name }: ArtifactComments): string =>
  `[CawCo] The person commented on the ${kind} "${name}" (artifact ${id}). Answer each pin in its thread with comment_reply({ pin, text }), and comment_resolve once a change settles it; comment_read has the history. To name a pin to the person, write its Link.\n\n`;

export const artifactCommentsNotice = (
  artifact: ArtifactComments,
  sections: string[]
): string =>
  `${markerTag("artifact-comments", { id: artifact.id, kind: artifact.kind, name: artifact.name })}${commentsLine(artifact)}${sections.join("\n\n")}`;

/**
 * A sheet's compile errors from its stage (live components, core
 * `stage.ts`), delivered by themselves once quiet on the person's marks'
 * channel; riding a Send with the person's marks, they are sections of the
 * comments notice.
 */
export const artifactErrorsNotice = (
  { id, kind, name }: ArtifactComments,
  sections: string[]
): string =>
  `${markerTag("artifact-errors", { id, kind, name })}[CawCo] The ${kind} "${name}" (artifact ${id}) does not compile on its stage; the panel shows the last good render under the error. Fix each at its file:line:column; artifact_read lists the errors standing, and none once it compiles.\n\n${sections.join("\n\n")}`;

/**
 * What the person saved from a sheet's inspector (live components spec §5):
 * CawCo wrote it into the story file in the session's workspace, so the
 * session hears it on the marks' channel before it next edits that file.
 */
export const artifactSavesNotice = (
  { id, kind, name }: ArtifactComments,
  sections: string[]
): string =>
  `${markerTag("artifact-saves", { id, kind, name })}[CawCo] The person changed the ${kind} "${name}" (artifact ${id}) from its inspector, and CawCo wrote it into the story file. Read the file again before you edit it.\n\n${sections.join("\n\n")}`;

/**
 * A delegate handed its parent an artifact (hub artifacts/service.ts
 * `create` with `to: "parent"`), readied and not opened: the parent owns it
 * now and opens it in its panel with artifact_show once it has reviewed it.
 * Told once per hand-off: when it starts waiting on the parent, or arrives
 * from another delegate; that delegate's updates while it waits are not told.
 * With `next`, the delegate changed an artifact the parent had opened: the
 * change waits as that next version, which artifact_read reads, and the
 * panel keeps the version opened until the parent's artifact_show opens
 * it; told once per held version. Sent under the system origin
 * {@link import("./harness").ARTIFACT_ORIGIN}; a transcript draws it as one
 * quiet note.
 */
export interface ArtifactHanded extends ArtifactComments {
  /** The delegate's name, as the rail shows it. */
  from: string;
  /** The held next version's id, when the delegate changed one the parent had opened. */
  next?: string | undefined;
}

export const artifactHandedNotice = ({
  from,
  id,
  kind,
  name,
  next,
}: ArtifactHanded): string =>
  next === undefined
    ? `${markerTag("artifact-handed", { from, id, kind, name })}[CawCo] ${from} handed you the ${kind} "${name}" (artifact ${id}), not opened: artifact_show opens it in your panel.`
    : `${markerTag("artifact-handed", { from, id, kind, name, next })}[CawCo] ${from} changed the ${kind} "${name}" (artifact ${id}): your panel keeps the version you opened until artifact_show opens the new one, which artifact_read reads as artifact ${next}.`;

/** A handed-up artifact's notice read back into who handed what, and the next version a change waits as. */
export function parseArtifactHanded(text: string): ArtifactHanded | null {
  const tag = tagOf(text, "artifact-handed");
  if (!tag) {
    return null;
  }
  const { from = "", id = "", kind = "", name = "", next } = tag.fields;
  return { from, id, kind: kind as ArtifactKind, name, next };
}

/** An artifact's comments notice read back into what it names, and its sections as one text. */
export function parseArtifactComments(
  text: string
): (ArtifactComments & { sections: string }) | null {
  const tag = tagOf(text, "artifact-comments");
  if (!tag) {
    return null;
  }
  const named = namedOf(tag);
  return { ...named, sections: afterLine(tag.rest, commentsLine(named)) };
}

/** What a notice's tag names: its artifact's id, kind and name. */
const namedOf = ({ fields }: MarkerTag): ArtifactComments => ({
  id: fields.id ?? "",
  kind: (fields.kind ?? "") as ArtifactKind,
  name: fields.name ?? "",
});

/** What a notice of `kind` names, read off its tag. */
const namedBy =
  (kind: string) =>
  (text: string): ArtifactComments | null => {
    const tag = tagOf(text, kind);
    return tag ? namedOf(tag) : null;
  };

/** Every notice CawCo sends a session on the artifact origin, by kind. */
export type ArtifactNoticeKind =
  "responses" | "comments" | "errors" | "saves" | "handed";

/** One artifact notice read back: what it is, the artifact it names, and the words its row says before that name. */
export interface ArtifactNotice extends ArtifactComments {
  /** The row's words before the artifact's name: "Comments on", "Fix tray handed you". */
  lead: string;
  notice: ArtifactNoticeKind;
}

/**
 * THE ARTIFACT NOTICES: every message CawCo sends a session under the system
 * origin {@link import("./harness").ARTIFACT_ORIGIN}, each with how it is read
 * back and the words its row leads with. A transcript draws each as the one
 * quiet line ({@link import("./harness").ARTIFACT_RESPONSES}), never as the
 * person's words; a notice on that origin none of these reads is a broken law
 * (`artifact-notice-drawn`, transcript-rules.ts `sendRow`). A new builder on
 * that origin adds its kind here.
 */
export const ARTIFACT_NOTICES: readonly {
  lead: (
    named: ArtifactComments & { from?: string; next?: string | undefined }
  ) => string;
  notice: ArtifactNoticeKind;
  read: (
    text: string
  ) => (ArtifactComments & { from?: string; next?: string | undefined }) | null;
}[] = [
  {
    notice: "responses",
    read: parseArtifactResponses,
    lead: () => "Responses on",
  },
  {
    notice: "comments",
    read: parseArtifactComments,
    lead: () => "Comments on",
  },
  {
    notice: "errors",
    read: namedBy("artifact-errors"),
    lead: () => "Compile errors on",
  },
  {
    notice: "saves",
    read: namedBy("artifact-saves"),
    lead: () => "Changes saved to",
  },
  {
    notice: "handed",
    read: parseArtifactHanded,
    lead: ({ from, next }) =>
      next === undefined ? `${from} handed you` : `${from} changed`,
  },
];

/** An artifact notice read back by the kind that claims it ({@link ARTIFACT_NOTICES}); null when none does. */
export function parseArtifactNotice(text: string): ArtifactNotice | null {
  for (const { notice, read, lead } of ARTIFACT_NOTICES) {
    const named = read(text);
    if (named) {
      return {
        notice,
        id: named.id,
        kind: named.kind,
        name: named.name,
        lead: lead(named),
      };
    }
  }
  return null;
}

/** The words a fleet-watch nudge opens with. */
const fleetWatchLine = (line: string): string => `[Fleet watch] ${line}\n\n`;

/**
 * Fleet watch's nudge to a session's lead (packages/hub `fleet-watch.ts`):
 * the line, then what the lead reads. A transcript draws it as the same
 * fleet-watch note the watched session's transcript has.
 */
export const fleetWatchNudge = (line: string, body: string): string =>
  `${markerTag("fleet-watch", { line })}${fleetWatchLine(line)}${body}`;

/** A fleet-watch nudge read back into its line and what it says. */
export function parseFleetWatchNudge(
  text: string
): { line: string; body: string } | null {
  const tag = tagOf(text, "fleet-watch");
  if (!tag) {
    return null;
  }
  const { line = "" } = tag.fields;
  return { line, body: afterLine(tag.rest, fleetWatchLine(line)) };
}

/** The words a fork's notice opens with. */
const forkLine = (line: string): string => `[Fork] ${line}\n\n`;

/**
 * The hub's word to a fork, ahead of its first turn (packages/hub
 * `forkNotice`): whose the delegates in the conversation it copied are. A
 * transcript draws it as a note, never as the person's words.
 */
export const forkNotice = (line: string, body: string): string =>
  `${markerTag("fork", { line })}${forkLine(line)}${body}`;

/** A fork's notice read back into its line and what it says. */
export function parseForkNotice(
  text: string
): { line: string; body: string } | null {
  const tag = tagOf(text, "fork");
  if (!tag) {
    return null;
  }
  const { line = "" } = tag.fields;
  return { line, body: afterLine(tag.rest, forkLine(line)) };
}

/** How a report's turn ended, as its tag says it. */
type ReportOutcome = "complete" | "failed" | "notice";

/** The words a report opens with, and its headline line under them. */
const reportLine = (
  label: string,
  outcome: ReportOutcome,
  headline: string | undefined
): string =>
  `[Report from delegate ${label} — ${outcome === "notice" ? "notice" : `turn ${outcome}`}]\n${headline ? `Headline: ${headline}\n` : ""}\n`;

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
  const said = headline?.replace(/\s+/g, " ").trim() || undefined;
  let outcome: ReportOutcome = failed ? "failed" : "complete";
  if (notice) {
    outcome = "notice";
  }
  const at = label.lastIndexOf("#");
  return `${markerTag("report", {
    name: at < 0 ? label : label.slice(0, at),
    short: at < 0 ? "" : label.slice(at + 1),
    outcome,
    headline: said,
  })}${reportLine(label, outcome, said)}`;
};

/**
 * A report read back. Only the 8-character short id survives, so consumers
 * pair it with the delegate's full id by prefix. `headline` is absent on a
 * report without one (a turn's own words, a hub notice).
 */
export function parseReportMarker(text: string): {
  name: string;
  short: string;
  failed: boolean;
  headline?: string;
  body: string;
} | null {
  const tag = tagOf(text, "report");
  if (!tag) {
    return null;
  }
  const { name = "", short = "", outcome = "", headline } = tag.fields;
  return {
    name,
    short,
    failed: outcome === "failed",
    ...(headline ? { headline } : {}),
    body: afterLine(
      tag.rest,
      reportLine(`${name}#${short}`, outcome as ReportOutcome, headline)
    ),
  };
}

/** The words a delegate's ask opens with. */
const askLine = (label: string): string => `[Delegate ask from ${label}]\n\n`;

/**
 * A delegate's permission ask, routed to its parent: its tag, an opening
 * line naming the delegate, the ask itself, then the line carrying the ids
 * the parent's `answer_delegate` call copies, then how to answer.
 */
export const delegateAskText = (ask: {
  label: string;
  body: string;
  instance: string;
  request: string;
  instruction: string;
}): string =>
  `${markerTag("delegate-ask", { label: ask.label, instance: ask.instance, request: ask.request })}${askLine(ask.label)}${ask.body}${askIds(ask.instance, ask.request)}${ask.instruction}`;

/** The line an ask's parent copies its ids from, as its `answer_delegate` call names them. */
const askIds = (instance: string, request: string): string =>
  `\n\n[delegate-ask instance=${instance} request=${request}]\n\n`;

/** An ask read back: who asked, its ids, and the ask alone (no ids, no instruction). */
export function parseDelegateAsk(text: string): {
  label: string;
  instance: string;
  request: string;
  body: string;
} | null {
  const tag = tagOf(text, "delegate-ask");
  if (!tag) {
    return null;
  }
  const { label = "", instance = "", request = "" } = tag.fields;
  const asked = afterLine(tag.rest, askLine(label));
  const ids = askIds(instance, request).trim();
  const at = asked.indexOf(ids);
  return {
    label,
    instance,
    request,
    body: (at < 0 ? asked : asked.slice(0, at)).trim(),
  };
}
