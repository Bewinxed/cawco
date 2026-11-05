/**
 * Sessions as an agent reads them: its delegates and their tree, a delegate
 * or session it started, the delegate types it can start. Each session by its chip's link and the handle `handoff` and
 * `stop_delegate` take; a spawn's own link carries its full id, which the
 * transcript's delegate card is keyed by (core transcript-rules.ts).
 */
import {
  artifactLink,
  type DelegateType,
  delegateTypesWords as delegateTypesUiWords,
  type GeneratedImage,
  delegatePeekWords as peek,
  planLink,
  sessionLink,
  startsAny,
  workWords,
} from "@cawco/core";
import { contextWords } from "@cawco/core/words/context";
import { imageGenerationWords } from "@cawco/core/words/image-generation";
import type { DelegateResult, HandoffResult } from "../delegation-actions";
import {
  type DelegateList,
  type DelegateNode,
  type DelegatePeek,
  PAGES_READ_MOST,
} from "../delegation-tree";
import type { Step } from "../transcript-steps";
import {
  excludedNamed,
  type HeldWork,
  type QueuedDelegate,
} from "../work-items";
import { ago, ahead, count, handle, lasted, lines, quote } from "./words";

/** How many of a list's newest a concise answer names; the rest are counted. */
const LISTED = 25;

/** A delegate's handle: its folder's name and its id's first eight, what handoff and stop_delegate take. */
const tagOf = (node: Pick<DelegateNode, "instanceId" | "name">): string =>
  node.name.includes("#")
    ? node.name
    : `${node.name}#${handle(node.instanceId)}`;

/** A delegate's state and its age, in words. */
const stateWords = (node: DelegateNode, now: number): string => {
  const started = Date.parse(node.startedAt);
  switch (node.state) {
    case "done":
    case "failed":
    case "cancelled": {
      const ended = node.endedAt ? Date.parse(node.endedAt) : now;
      return `${node.state} ${ago(ended, now)}, after ${lasted(ended - started)}`;
    }
    case "waiting":
      return node.waitingOn
        ? `waiting on ${quote(node.waitingOn.reason, 120)}${node.waitingOn.until ? ` until ${ahead(node.waitingOn.until, now)}` : ""}`
        : "waiting";
    case "stalled":
      return node.stalled
        ? `stalled: ${node.stalled.words}${node.stalled.until ? ` (${ahead(node.stalled.until, now)})` : ""}`
        : "stalled";
    case "stale":
      return `stale: ${node.stalled?.words ?? "held at its limit past the cutoff, carried on once written to"}. handoff to it carries it on; continue_session continues it in a fresh conversation; stop_delegate lets it go`;
    case "starting":
    case "running":
      return `${node.state} for ${lasted(now - started)}`;
    default:
      return String(node.state);
  }
};

/** One delegate as a line, and its children under it, newest first. */
const nodeLines = (
  node: DelegateNode,
  depth: number,
  now: number
): string[] => {
  const live =
    node.state === "starting" ||
    node.state === "running" ||
    node.state === "waiting" ||
    node.state === "stalled" ||
    node.state === "stale";
  const facts = [
    stateWords(node, now),
    ...(live && node.machine ? [`on ${node.machine}`] : []),
    ...(node.cacheWarm ? ["cache warm"] : ["cache cold"]),
    // Its plan by its link, which the person's dashboard draws as its chip.
    ...(node.plan
      ? [planLink(node.instanceId, `plan ${node.plan.done}/${node.plan.total}`)]
      : []),
    ...(node.queued > 0 ? [`${count(node.queued, "message")} unread`] : []),
    ...(node.paused ? [node.paused] : []),
    ...(node.startHeld ? [workWords.heldStartListed(node.startHeld)] : []),
    ...(node.landingWait
      ? [`${node.landingWait.words} since ${ago(node.landingWait.since, now)}`]
      : []),
  ];
  // An ended delegate's report is its headline; a live one has none yet.
  let report = live ? "" : ": no report";
  if (node.report) {
    report = `: ${quote(node.report, 240)}`;
  }
  const own = `${"  ".repeat(depth)}- ${sessionLink(tagOf(node), node.title)} · ${facts.join(" · ")}${report}`;
  return [
    own,
    ...newestFirst(node.children).flatMap((child) =>
      nodeLines(child, depth + 1, now)
    ),
  ];
};

const newestFirst = (nodes: DelegateNode[]): DelegateNode[] =>
  nodes.toSorted((a, b) => b.startedAt.localeCompare(a.startedAt));

const queuedLine = (one: QueuedDelegate, now: number): string =>
  `- ${quote(one.title, 120)} ${handle(one.id)} · queued ${ago(one.queuedAt, now)}${one.heldBy ? `, behind ${quote(one.heldBy.title, 80)} (${one.heldBy.globs})` : ""}`;

const heldLine = (work: HeldWork, now: number): string => {
  const excluded = excludedNamed(work.excluded);
  return `- workspace ${handle(work.workspaceId)} on ${work.machine} · held ${ago(work.heldAt, now)} · ${work.holds} · ${work.size}${excluded ? ` · kept out of git: ${excluded}` : ""}`;
};

/** How much of a delegate's last words a look at it quotes. */
const LAST_WORDS_MAX = 400;

/** One step as a line: the tool in words, its target, and how it ended. */
const stepLine = (step: Step, now: number): string => {
  const ended = {
    error: ` · ${peek.failed}`,
    pending: ` · ${peek.running}`,
    success: "",
  }[step.status];
  return `- ${step.tool}${step.target ? ` ${quote(step.target, 140)}` : ""}${ended}${step.at ? ` · ${ago(step.at, now)}` : ""}`;
};

/** What it does now: the call open and for how long, thinking between calls, or idle since its last activity. */
const nowLine = (look: DelegatePeek, now: number): string => {
  const node = look.delegate;
  if (node.endedAt) {
    return peek.nowEnded;
  }
  if (!look.busy) {
    return peek.nowIdle(lasted(now - Date.parse(node.lastActivityAt)));
  }
  const [newest] = "list" in look.steps ? look.steps.list : [];
  if (newest?.status === "pending") {
    const line = `${newest.tool}${newest.target ? ` ${quote(newest.target, 140)}` : ""}`;
    return peek.nowStep(
      line,
      newest.at
        ? lasted(now - Date.parse(newest.at))
        : "a time its harness did not keep"
    );
  }
  return peek.nowThinking(newest?.at ? ago(newest.at, now) : "not yet taken");
};

const NUMBER = new Intl.NumberFormat("en-US");

/** Its context against its model's window; its cache's warmth is on its first line. */
const contextLine = (look: DelegatePeek): string => {
  const { context } = look;
  if (context.tokens === null) {
    return peek.contextNone;
  }
  let share = "";
  if (context.window) {
    share = peek.contextShare(
      Math.round((context.tokens / context.window) * 100),
      NUMBER.format(context.window)
    );
  } else if (context.windowWhy) {
    share = peek.contextWindowUnknown(context.windowWhy);
  }
  const filing = context.filing
    ? contextWords.peek(context.filing.stage, context.filing.compactsAt)
    : "";
  return peek.context(NUMBER.format(context.tokens), `${share}${filing}`);
};

/** What its workspace holds so far, and what it handed up. */
const madeLines = (look: DelegatePeek): string[] => {
  const { made } = look;
  const handed = peek.handed(
    made.handed.map((one) => artifactLink(one.id, one.name))
  );
  if ("unread" in made) {
    return [peek.madeHeading, peek.madeUnread(made.unread), handed];
  }
  return [
    peek.madeHeading,
    peek.commits(made.ahead, made.clone?.subjects ?? []),
    peek.uncommitted(made.dirty),
    made.clone ? peek.outputs(made.clone.outputs) : peek.outputsUnread,
    handed,
  ];
};

/** `delegate_list` with a `target`: one delegate, who, now, its last steps, context, made so far, last words. */
const peekWords = (look: DelegatePeek): string => {
  const now = Date.now();
  const node = look.delegate;
  const { steps } = look;
  let stepLines: (string | false)[];
  if ("unread" in steps) {
    stepLines = [peek.stepsUnread(steps.unread)];
  } else if (steps.list.length === 0) {
    stepLines = [peek.stepsNone];
  } else {
    stepLines = [
      peek.stepsHeading(steps.list.length),
      ...steps.list.map((step) => stepLine(step, now)),
      steps.cut && peek.stepsCut(PAGES_READ_MOST),
      steps.more && peek.stepsMore,
    ];
  }
  return lines(
    nodeLines(node, 0, now)[0],
    nowLine(look, now),
    stepLines.filter((line): line is string => !!line),
    contextLine(look),
    madeLines(look),
    look.lastWords
      ? peek.lastWords(
          look.lastWords.at ? ago(look.lastWords.at, now) : "undated",
          quote(look.lastWords.text, LAST_WORDS_MAX)
        )
      : peek.lastWordsNone
  );
};

/** `delegate_list`: the tree newest first, then the queued and the held; with a `target`, that one delegate in full. */
export const delegateListWords = (
  answer: DelegateList | DelegatePeek,
  asked: { include?: "live" | "all"; since?: string; before?: string }
): string => {
  if ("delegate" in answer) {
    return peekWords(answer);
  }
  const tree = answer;
  const now = Date.now();
  const roots = newestFirst(tree.delegates);
  const shown = roots.slice(0, LISTED);
  const window = asked.since || asked.before ? " in that window" : "";
  const which =
    asked.include === "all" || window ? "" : " live or ended within the hour";
  return lines(
    roots.length === 0
      ? `No delegates${which}${window}.`
      : `${count(roots.length, "delegate")}${which}${window}, newest first; handoff and stop_delegate take the handle in each link:`,
    shown.flatMap((node) => nodeLines(node, 0, now)),
    roots.length > shown.length &&
      `…and ${roots.length - shown.length} older: narrow with since or before.`,
    tree.queued.length > 0 &&
      "Queued for files a live item owns (stop_delegate takes the id):",
    tree.queued.map((one) => queuedLine(one, now)),
    tree.held.length > 0 &&
      `Held workspaces, with work on no remote (delegate's from or workspace, or discard_workspace, take the handle):`,
    tree.held.map((work) => heldLine(work, now))
  );
};

/**
 * `delegate`: the hub's sentence, which names the delegate by its link with
 * its full id, or says it waits queued.
 */
export const delegateWords = (result: DelegateResult): string =>
  result.state === "started" && result.workspaceTmp
    ? lines(
        result.text,
        `Its TMPDIR, where handoff's inputs land: ${result.workspaceTmp}.`
      )
    : result.text;

/** `start_session` and `continue_session`: the hub's sentence, the session's link in it. */
export const startedWords = (result: Pick<HandoffResult, "text">): string =>
  result.text;

/**
 * One delegate type as a line: what it is for, then what it runs. Its
 * preferred account by the name `names` gives it (by id), else its id.
 */
const typeLine = (
  type: DelegateType & { source?: string },
  names: Readonly<Record<string, string>> = {}
): string => {
  const runs = [
    `${type.harness} ${type.model}`,
    ...(type.effort ? [`${type.effort} effort`] : []),
    ...(type.skills?.length ? [`skills ${type.skills.join(", ")}`] : []),
    ...(type.denyTools?.length ? [`denies ${type.denyTools.join(", ")}`] : []),
    ...(type.connections?.length
      ? [`connections ${type.connections.join(", ")}`]
      : []),
    ...(type.mayStart?.length
      ? [
          startsAny(type.mayStart)
            ? delegateTypesUiWords.mayStartAny
            : delegateTypesUiWords.mayStartShort(type.mayStart.join(", ")),
        ]
      : []),
    ...(type.account
      ? [
          delegateTypesUiWords.prefersAccount(
            names[type.account] ?? type.account
          ),
        ]
      : []),
    ...(type.source === "project" ? ["the project's own"] : []),
    ...(type.source === "area" ? ["its area's"] : []),
  ];
  return `- ${type.name}: ${type.description.replace(/\s+/gu, " ").trim()} (${runs.join("; ")})`;
};

/** `list_delegate_types` and admin_delegate_types_read's list: each type, a line. */
export const delegateTypesWords = (catalog: {
  /** The fleet's account names by id, for a type's preferred account. */
  accountNames?: Readonly<Record<string, string>>;
  types: (DelegateType & { source?: string })[];
}): string =>
  catalog.types.length === 0
    ? "No delegate types are configured."
    : lines(
        `${count(catalog.types.length, "delegate type")}; delegate's type takes the name:`,
        catalog.types.map((type) => typeLine(type, catalog.accountNames))
      );

/** `generate_image`: where it is, how big, in what format, through what. */
export const imageWords = (image: GeneratedImage): string =>
  imageGenerationWords.saved(image);
