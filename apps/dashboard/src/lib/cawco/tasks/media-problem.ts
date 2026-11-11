/**
 * Why a picture, clip or sound `name` at `src` didn't show, in the hub's
 * words: the platform says nothing of why it could not, so the same `src`
 * is asked once more, to read the hub's refusal (TaskOutput, MediaPlayer).
 */
import { madeWords } from "@cawco/core/words/made";
import { failureWords, hubRefusal } from "../hub-read";

export const mediaProblem = (src: string, name: string): Promise<string> =>
  fetch(src).then(
    async (response) =>
      response.ok
        ? madeWords.notShown(name)
        : failureWords(
            await hubRefusal(response, madeWords.notShownThen(name))
          ),
    (error: unknown) => failureWords(error)
  );
