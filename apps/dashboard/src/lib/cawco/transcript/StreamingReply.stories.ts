/**
 * My reading of the streaming reply: each pace the graph's dial reaches,
 * mounted in the live fixture. A still frame of each shows the same reply;
 * they differ in how the words arrive over time.
 */
import StreamingReplyLive from "./streaming-reply-live.svelte";

export default {
  title: "Streaming reply/Every pace",
  component: StreamingReplyLive,
  args: { pace: "usual", again: 0 },
};

/** The reply fading in at the pace a session usually streams, ten chunks a second. */
export const Usual = {};

/** The reply fading in as fast as the hub sends words, thirty chunks a second. */
export const Fast = { args: { pace: "fast" } };

/** The reply fading in a few words at a time, three chunks a second. */
export const Slow = { args: { pace: "slow" } };
