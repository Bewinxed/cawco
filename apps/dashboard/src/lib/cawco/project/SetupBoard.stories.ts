/**
 * A project's board while Caw sets it up (Component Story Format 3, live
 * components): his draft as the board it becomes, and his open setup
 * questions over its stages, the starting set he proposes among them,
 * each answered where it stands.
 */
import { hubAs } from "../hub-stand-in";
import SetupBoard from "./SetupBoard.svelte";
import {
  PR_AIM,
  PR_ASKS,
  PR_DELEGATES,
  PR_DRAFT,
  PR_NAME,
  PR_SET_ASK,
} from "./setup.fixtures";

const noop = () => undefined;

export default {
  title: "Onboarding/Setup board",
  component: SetupBoard,
  args: {
    name: PR_NAME,
    aim: PR_AIM,
    stages: PR_DRAFT,
    delegates: PR_DELEGATES,
    coming: 0,
    asks: [PR_ASKS[1], PR_SET_ASK],
    onBoard: true,
    sending: false,
    problem: null,
    onaim: noop,
    onstages: noop,
    onanswercaw: noop,
    onsetup: noop,
  },
  decorators: [hubAs("connected")],
  parameters: { viewport: 1440 },
};

/** Caw has drafted the stages and asks two things: which accounts it posts from, and the skills and servers its sessions start with. */
export const QuestionAndStartingSet = {};

/** Only the starting set is left to answer. */
export const StartingSetAlone = { args: { asks: [PR_SET_ASK] } };
