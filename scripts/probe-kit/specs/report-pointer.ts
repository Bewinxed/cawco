/**
 * The hub's check on a `finish_item` report (hub report-pointer.ts) refuses
 * one that points at the chat for its result and passes every other: each of
 * `REPORT_POINTER_CASES`, real report snippets, goes the way the list says.
 * No fleet; `finish-report-pointer` proves the refusal on a scratch fleet.
 *
 *   bun scripts/probe-kit/run.ts report-pointer
 */
import {
  chatPointer,
  REPORT_POINTER_CASES,
} from "../../../packages/hub/src/report-pointer";
import type { Kit, Spec } from "../kit";

const run = (kit: Kit): Promise<void> => {
  for (const { refused, text } of REPORT_POINTER_CASES) {
    const phrase = chatPointer(text);
    kit.check(
      `${refused ? "refused" : "passes"}: ${text.replace(/\s+/g, " ").slice(0, 90)}`,
      (phrase !== undefined) === refused,
      phrase === undefined ? "no pointer found" : `pointer: "${phrase}"`
    );
  }
  return Promise.resolve();
};

export default { name: "report-pointer", run } satisfies Spec;
