/**
 * The rules a design graph's performance read judges by (design perf-read
 * §1, Faults): what an ask must name to be measured, and the faults its
 * numbers raise, each in core words/stage-measure.ts's sentence.
 */

import type {
  MeasureAsk,
  MeasureFault,
  MeasureRead,
  MeasureTrend,
} from "./stage-measure";
import { measureWords as words } from "./words/stage-measure";

/** Chrome's long animation frame line, ms. */
const LONG_FRAME_MS = 50;

/** How steady a counter's growth must be to call it a leak: a step (a cache filled once) fits a line worse. */
const LEAK_FIT = 0.9;

/** Whether a counter left something behind on every repeat: at least one a repeat over the run (fuite's rule), on a steady line. */
const grewEach = (trend: MeasureTrend, repeats: number): boolean =>
  repeats > 0 &&
  trend.end - trend.start >= repeats &&
  (trend.fit ?? 0) >= LEAK_FIT;

/** The ways `on` names its element, as sent. */
const ON_WAYS = ["role", "text", "testId", "selector"] as const;

/**
 * Why `ask` can't be measured as sent, in words naming what to send
 * instead; null when it can. The move it makes is {@link moveOf}'s.
 */
export function measureAskRefusal(ask: MeasureAsk): string | null {
  if (ask.play && ask.press) {
    return words.bothMoves;
  }
  if (!(ask.play || ask.press)) {
    return words.noMove;
  }
  if (ask.play) {
    return ask.on || ask.text !== undefined || ask.key !== undefined
      ? words.playTakesNoElement
      : null;
  }
  const press = ask.press ?? "click";
  if (!ask.on) {
    return words.noElement(press);
  }
  if (ON_WAYS.filter((way) => way in (ask.on ?? {})).length !== 1) {
    return words.onOneWay;
  }
  if ((press === "type") !== (ask.text !== undefined)) {
    return words.textForType;
  }
  if ((press === "key") !== (ask.key !== undefined)) {
    return words.keyForKey;
  }
  return null;
}

/** What the faults are read from beside the numbers: the traced plays that dropped a frame, the share of motion frames that laid out, and the seconds a still-running motion was waited on. */
export interface FaultEvidence {
  droppedPlays: number;
  everyShare: number;
  traced: number;
  /** Seconds the scan waited on motion that was still running; null when it settled. */
  unsettledAfter: number | null;
}

/** The faults `read`'s numbers raise, each by the line of design perf-read §1. */
export function faultsOf(
  read: Omit<MeasureRead, "faults">,
  evidence: FaultEvidence
): MeasureFault[] {
  const faults: MeasureFault[] = read.nonComposited.map((one) => ({
    kind: "non-composited",
    says: words.nonComposited(one),
  }));
  if (evidence.droppedPlays >= 2) {
    faults.push({
      kind: "dropped-frames",
      says: words.droppedFrames(
        evidence.droppedPlays,
        evidence.traced,
        read.frames.dropped
      ),
    });
  }
  if (read.frames.longest >= LONG_FRAME_MS) {
    faults.push({
      kind: "long-frame",
      says: words.longFrame(read.frames.longest, read.frames.longestWork),
    });
  }
  if (read.layout.everyFrame) {
    faults.push({
      kind: "layout-every-frame",
      says: words.layoutEveryFrame(evidence.everyShare),
    });
  }
  for (const one of read.layout.forced.filter((each) => !each.library)) {
    faults.push({ kind: "forced-layout", says: words.forcedLayout(one) });
  }
  const { memory } = read;
  if (memory) {
    const { repeats } = read.runs;
    /** What a counter that grew on every repeat leaves a repeat, at least one; 0 for one that didn't. */
    const leftBy = (trend: MeasureTrend) =>
      grewEach(trend, repeats) ? Math.max(1, Math.round(trend.perRepeat)) : 0;
    const left = {
      objects: leftBy(memory.objects),
      nodes: leftBy(memory.nodes),
      listeners: leftBy(memory.listeners),
      documents: leftBy(memory.documents),
    };
    if (Object.values(left).some((one) => one > 0)) {
      faults.push({ kind: "leak", says: words.leak(left, repeats) });
    }
  }
  if (evidence.unsettledAfter !== null) {
    faults.push({
      kind: "unsettled",
      says: words.unsettled(evidence.unsettledAfter),
    });
  }
  return faults;
}
