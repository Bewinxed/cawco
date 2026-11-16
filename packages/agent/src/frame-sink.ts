import type { DaemonFrame } from "@cawco/core/envelopes";

/** Where the frames an agent has to send go (core envelopes.ts `DaemonFrame`): whether one went. */
export type FrameSink = (frame: DaemonFrame) => boolean;
