/**
 * Sessions as an agent reads them: its delegates and their tree, a delegate
 * or session it started, the delegate types it can start. Each session by its chip's link and the handle `handoff` and
 * `stop_delegate` take; a spawn's own link carries its full id, which the
 * transcript's delegate card is keyed by (core transcript-rules.ts).
 */
import {
  type DelegateType,
  type GeneratedImage,
  planLink,
  sessionLink,
} from "@cawco/core";
import type { DelegateResult, HandoffResult } from "../delegation-actions";
import type { DelegateList, DelegateNode } from "../delegation-tree";
import {
  excludedNamed,
  type HeldWork,
  type QueuedDelegate,
} from "../work-items";
import { ago, ahead, count, handle, lasted, lines, quote } from "./words";

/** How many of a list's newest a concise answer names; the rest are counted. */
export const LISTED = 25;

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
    case "starting":
    case "running":
      return `${node.state} for ${lasted(now - started)}`;
    default: {
      const unhandled: never = node.state;
      return String(unhandled);
    }
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
    node.state === "stalled";
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

/** `delegate_list`: the tree newest first, then the queued and the held. */
export const delegateListWords = (
  tree: DelegateList,
  asked: { include?: "live" | "all"; since?: string; before?: string }
): string => {
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

/** One delegate type as a line: what it is for, then what it runs. */
const typeLine = (type: DelegateType & { source?: string }): string => {
  const runs = [
    `${type.harness} ${type.model}`,
    ...(type.effort ? [`${type.effort} effort`] : []),
    ...(type.skills?.length ? [`skills ${type.skills.join(", ")}`] : []),
    ...(type.denyTools?.length ? [`denies ${type.denyTools.join(", ")}`] : []),
    ...(type.connections?.length
      ? [`connections ${type.connections.join(", ")}`]
      : []),
    ...(type.canDelegate ? ["may delegate"] : []),
    ...(type.source === "project" ? ["the project's own"] : []),
  ];
  return `- ${type.name}: ${type.description.replace(/\s+/gu, " ").trim()} (${runs.join("; ")})`;
};

/** `list_delegate_types` and admin_delegate_types_read's list: each type, a line. */
export const delegateTypesWords = (catalog: {
  types: (DelegateType & { source?: string })[];
}): string =>
  catalog.types.length === 0
    ? "No delegate types are configured."
    : lines(
        `${count(catalog.types.length, "delegate type")}; delegate's type takes the name:`,
        catalog.types.map(typeLine)
      );

/** `generate_image`: where it is, how big. */
export const imageWords = (image: GeneratedImage): string =>
  `Saved ${image.width} × ${image.height} PNG at ${image.path}; show it with show_image.`;
