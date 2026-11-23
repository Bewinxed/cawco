/**
 * What a section's own states file feeds it: a situation's record, nothing
 * refused or running, and changes that go nowhere (the live story's mock
 * hub answers them; here each frame is one state read alone).
 */

import type { PlaceFlow, StageSends } from "./changes";
import { SITUATIONS, type Situation } from "./settings.fixtures";
import { LARGE_FILE_KEYS, TIE_SETUP } from "./tie-setup.fixture";

/** No step open under any place's row. */
const NO_FLOW: PlaceFlow | null = null;

export const stageArgs = (
  situation: Situation,
  refused: StageSends["refused"] = {}
) => ({
  situation,
  record: SITUATIONS[situation],
  pending: [],
  refused,
  onchange: () => undefined,
  onretry: () => undefined,
  onreread: () => undefined,
  onaddplace: () => undefined,
  onplace: () => undefined,
  onflow: () => undefined,
  onaddkey: () => Promise.resolve({ name: "Lantern LFS key" }),
  flow: NO_FLOW,
  movingPlaceId: null,
  setup: TIE_SETUP,
  keys: LARGE_FILE_KEYS,
  hrefOf: (page: string) => `/config/${page}`,
});

/** The hub's words for a change it refused, as the live story's mock says them. */
export const REFUSED_WORDS =
  "The hub could not save this: another change to this project was being written. Nothing changed. (settings_busy)";
