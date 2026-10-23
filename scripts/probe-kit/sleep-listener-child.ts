/**
 * The sleep listener's agent (specs/sleep-listener.ts): starts Linux's sleep
 * and wake listener with the agent's own `hearSleep` (agent/src/activity.ts),
 * prints `listening` once gdbus says it monitors logind, and then stays up
 * until it is killed.
 *
 *   bun scripts/probe-kit/sleep-listener-child.ts
 */
import { hearSleep } from "../../packages/agent/src/activity";

hearSleep(
  () => undefined,
  () => console.log("listening")
);
setInterval(() => undefined, 60_000);
