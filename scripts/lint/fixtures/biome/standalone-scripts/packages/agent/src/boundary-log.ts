// Planted: the judge's protocol, which is not written beside it.
import { JUDGE_READY } from "./boundary/protocol";

// Left alone: the log protocol beside it.
import { LOG_FRAME } from "./boundary-log-protocol";

export const used = [JUDGE_READY, LOG_FRAME];
