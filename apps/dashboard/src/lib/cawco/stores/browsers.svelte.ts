/**
 * Every machine's browsers as the hub lists them: the `browser_list` frame
 * the socket opens with, then one on each change; and the person taking one
 * over.
 */
import type { ListedBrowser } from "@cawco/core/browser";
import type { BrowserAskFrame } from "@cawco/core/frames";
import { askWords } from "@cawco/core/words/asks";
import { hub } from "#lib/platform/hub.js";
import { hubDone } from "#lib/platform/hub-read.js";
import type { FrameOf } from "../hub/frames";

const browsersState = $state<{
  /**
   * Every machine's browsers as the hub lists them: the `browser_list`
   * frame the socket opens with, then each one on a change; undefined until
   * the first.
   */
  browsers: ListedBrowser[] | undefined;
}>({
  browsers: undefined,
});

// A browser changed (a take-over, its state, its page's origin): every view of one follows.
export function takeBrowsers(frame: FrameOf<"browser_list">): void {
  browsersState.browsers = frame.browsers;
}

/**
 * Take over on a browser ask (core `BrowserAskFrame`), from its transcript
 * card or its Needs you row alike: the hub's `/takeover` (browsers.ts)
 * starts the private period for that ask, takes it off every screen and
 * opens the session's panel on its browser. Answers null once the hub has
 * it, else the line the refusal reads, the hub's own sentence inside it
 * (WORDS, the error formula).
 */
export async function takeOverBrowser(
  requestId: string,
  browserAsk: BrowserAskFrame
): Promise<string | null> {
  try {
    await hubDone(
      hub.api.browsers({ key: browserAsk.key }).takeover.post({
        requestId,
        machineId: browserAsk.machineId,
      })
    );
    return null;
  } catch (error) {
    return `${askWords.cantTakeOver} ${error instanceof Error ? error.message : String(error)} ${askWords.stillWaiting}`;
  }
}

/** Every machine's browsers as the hub last told them. */
export const browsersStore = {
  /** Every machine's browsers as the hub last told them; undefined until its first frame. */
  get browsers(): ListedBrowser[] | undefined {
    return browsersState.browsers;
  },
};
