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

const input = {
  command: "bun run --cwd apps/dashboard build",
  description: "Build the dashboard to check the new panel compiles",
};

/** The ask as the client holds it parked (its PendingPermission). */
const request = {
  heard: 0,
  input,
  instanceId: "probe-instance",
  presentation: presentPermission("Bash", input, {
    asker: "Caw",
    project: "cockpit",
    current: () => undefined,
    memory: () => undefined,
    projectName: () => undefined,
  }),
  requestId: "probe-request",
  toolName: "Bash",
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
