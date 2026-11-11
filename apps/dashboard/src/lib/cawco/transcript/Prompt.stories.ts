/**
 * The ask in the composer's grown shape (Component Story Format 3, live
 * components): a permission Caw parks, as the hub presents it (core
 * presentPermission), its parts up (`shown`). The hub is a stand-in each
 * story names (hub-stand-in `hubAs`): live, the card as the person answers
 * it, its buttons enabled; reconnecting, its buttons held and its wait line
 * said. The meta's args are every story's; a story's own are what it
 * changes.
 */
import { presentPermission } from "@cawco/core/permission-presentation";
import { hubAs } from "../hub-stand-in";
import Prompt from "./Prompt.svelte";
import { TRIM_REQUEST } from "./unlisted-fixture";

const input = {
  command: "bun run --cwd apps/dashboard build",
  description: "Build the dashboard to check the new panel compiles",
};

/** Where Caw asks from, as the hub presents it. */
const context = {
  asker: "Caw",
  project: "cockpit",
  current: () => undefined,
  memory: () => undefined,
  projectName: () => undefined,
};

/** The ask as the client holds it parked (its PendingPermission). */
const request = {
  heard: 0,
  input,
  instanceId: "probe-instance",
  presentation: presentPermission("Bash", input, context),
  requestId: "probe-request",
  toolName: "Bash",
};

/**
 * A new project's first question, as project-setup opens one whose first
 * words leave the aim open: a CawCo `ask` with no options that blocks.
 */
const openInput = {
  blocks: true,
  questions: [
    {
      question:
        "What should Harbourline Bakery's order tracker do first: take wholesale orders from the four cafés, or plan the overnight bake from them?",
      header: "Aim",
      options: [],
      multiSelect: false,
    },
  ],
};

const openRequest = {
  heard: 0,
  input: openInput,
  instanceId: "probe-instance",
  presentation: presentPermission("AskUserQuestion", openInput, context),
  requestId: "probe-open-question",
  toolName: "AskUserQuestion",
};

export default {
  title: "Transcript/Ask",
  component: Prompt,
  args: {
    request,
    asker: "Caw",
    shown: true,
    onanswer: () => null,
  },
  decorators: [hubAs("connected")],
  parameters: { viewport: 400 },
};

/** The hub live: Caw's ask as the person answers it, Approve and Deny enabled. */
export const Connected = {};

/** The hub away: the same ask held, its buttons dimmed, Reconnecting under them. */
export const Reconnecting = { decorators: [hubAs("connecting")] };

/** A question with no options: its answer field stands open, the keys in it, no "Other" chip to press first. */
export const AQuestionWithNoOptions = {
  name: "A question with no options",
  args: { request: openRequest },
};

/**
 * The unused skills and servers routine asks to trim Cawco-Dev's starting
 * set: what leaves it, 43 items, as the table of its sessions' calls.
 */
export const Trim = {
  args: { request: TRIM_REQUEST, asker: "Unused skills and servers" },
};
