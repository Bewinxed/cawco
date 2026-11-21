/**
 * What a stage's own states file feeds it: a situation's record, nothing
 * refused or running, and changes that go nowhere (the live story's mock
 * hub answers them; here each frame is one state read alone).
 */

import type { StageSends } from "./changes";
import { SITUATIONS, type Situation } from "./records";

export const stageArgs = (
  situation: Situation,
  refused: StageSends["refused"] = {}
): StageSends & {
  hrefOf: (page: string) => string;
  movingPlaceId: string | null;
  onaddplace: () => void;
  onplace: () => void;
  onreread: () => void;
  situation: Situation;
} => ({
  situation,
  record: SITUATIONS[situation],
  pending: [],
  refused,
  onchange: () => undefined,
  onretry: () => undefined,
  onreread: () => undefined,
  onaddplace: () => undefined,
  onplace: () => undefined,
  movingPlaceId: null,
  hrefOf: (page) => `/config/${page}`,
});

/** The hub's words for a change it refused, as the live story's mock says them. */
export const REFUSED_WORDS =
  "The hub could not save this: another change to this project was being written. Nothing changed. (settings_busy)";
