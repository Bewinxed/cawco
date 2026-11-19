/**
 * An agent's reply streaming into the transcript with each chunk's words
 * fading in as they land. The fixture mounts the
 * transcript's live row and a mock of the hub's stream; its dials set how
 * fast the words come and start the reply again.
 */
import StreamingReplyLive from "./streaming-reply-live.svelte";

export default {
  title: "Streaming reply/Each chunk fades in",
  component: StreamingReplyLive,
  args: { pace: "usual", again: 0 },
};

/** Each chunk fades in as it lands, as today. Streaming costs the page 296 ms a second of main thread at 29 tabs (layerize 55, paint 11) and 186 ms at 2. */
export const Fading = {};
