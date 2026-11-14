/**
 * Why a picture, clip or sound `name` didn't show, in the hub's words: the
 * platform says nothing of why it could not, so the file its element shows
 * is asked once more, to read the hub's refusal (TaskOutput, MediaPlayer).
 */
import { madeWords } from "@cawco/core/words/made";
import type { ServedFile } from "#lib/platform/hub-file.js";
import { failureWords, hubAsk, hubRefusal } from "#lib/platform/hub-read.js";

export const mediaProblem = (file: ServedFile, name: string): Promise<string> =>
  hubAsk(file.ask()).then(
    (asked) =>
      asked.ok
        ? madeWords.notShown(name)
        : failureWords(hubRefusal(asked.refused, madeWords.notShownThen(name))),
    (error: unknown) => failureWords(error)
  );
