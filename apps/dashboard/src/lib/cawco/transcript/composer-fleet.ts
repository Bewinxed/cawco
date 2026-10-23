/**
 * What a composer in the app reads of the fleet, and the parts a
 * conversation's composer shows: the live store and its reads, a queued
 * message's lift, a harness's refusal and its relaunch, `/mcp auth`'s
 * sign-in, the hub seam, and the delegate tray, the ask it grows into, the
 * minimized question's face, the recall wheel, the canvas, the skill chips
 * and the suggestion chips. Every composer in the app is handed it
 * (Composer `fleet`), so each part is in its first frame. Composer imports
 * its type alone, so a comment's reply (the artifact page's comment kit, a
 * comment card) loads none of it.
 */
import {
  cawco,
  readOlderPage,
  replaceQueued,
  userTurnActions,
} from "../client.svelte";
import { mcpSignInIntent, signInToMcp } from "../fleet";
import HarnessBlock from "../HarnessBlock.svelte";
import {
  forgetRelaunch,
  harnessBlockOf,
  relaunchRefusalOf,
  relaunchUnblocked,
  retryRelaunch,
} from "../harness-block.svelte";
import CawFace from "../home/CawFace.svelte";
import { hubSeam } from "../hub-live";
import SkillChip from "../SkillChip.svelte";
import { CanvasRoom } from "./canvas-room.svelte";
import DelegateTray from "./DelegateTray.svelte";
import {
  asBubble,
  asField,
  bubbleBox,
  bubbleWords,
  fieldBox,
  LEFT_BY,
  landing,
  liftAsk,
  notEdited,
  readFirst,
  replacing,
  startFlight,
  watchReplace,
  writesTo,
} from "./lift.svelte";
import Prompt from "./Prompt.svelte";
import RecallWheel from "./RecallWheel.svelte";
import SuggestionChips from "./SuggestionChips.svelte";

export const composerFleet = {
  CanvasRoom,
  CawFace,
  DelegateTray,
  HarnessBlock,
  Prompt,
  RecallWheel,
  SkillChip,
  SuggestionChips,
  cawco,
  forgetRelaunch,
  harnessBlockOf,
  hubSeam,
  lift: {
    asBubble,
    asField,
    bubbleBox,
    bubbleWords,
    fieldBox,
    LEFT_BY,
    landing,
    liftAsk,
    notEdited,
    readFirst,
    replacing,
    startFlight,
    watchReplace,
    writesTo,
  },
  mcpSignInIntent,
  readOlderPage,
  relaunchRefusalOf,
  relaunchUnblocked,
  replaceQueued,
  retryRelaunch,
  signInToMcp,
  userTurnActions,
};

export type ComposerFleet = typeof composerFleet;
