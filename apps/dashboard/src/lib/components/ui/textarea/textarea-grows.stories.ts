/**
 * The kit Textarea growing and giving up lines (Component Story Format 3,
 * live components): a routine's prompt in a form, the fields under it
 * making room as it grows. The meta's args are every story's; a story's
 * own args are what it changes.
 */
import type { CanvasQueries, UserEvent } from "@cawco/core/stage-play";
import TextareaLive from "./textarea-live.svelte";

/** What a flow's `play` is handed on the canvas (core stage-play.ts). */
interface Play {
  canvas: CanvasQueries;
  update: (next: Record<string, unknown>) => Promise<void>;
  userEvent: UserEvent;
}

const PROMPT =
  "Read every issue opened or reopened in the customer onboarding portal since the last run, label each one with its area and its severity, and close the exact duplicates with a link to the issue they repeat.";

export default {
  title: "Kit/Textarea grows",
  component: TextareaLive,
  args: { prompt: PROMPT },
};

/** A prompt of three lines, the fields under it. */
export const Written = {};

/** A new line typed under the prompt, three times: the field grows a line each time and the fields under it make room. */
export const LinesTyped = {
  args: { prompt: `${PROMPT}\nThen\nAnd\nDone` },
  from: "Written",
  play: async ({ canvas, userEvent }: Play) => {
    const field = canvas.getByTestId("prompt");
    for (const line of ["\nThen", "\nAnd", "\nDone"]) {
      await userEvent.type(field, line);
      await userEvent.wait(300);
    }
  },
};

/** Two lines typed, the second while the first is still growing: it carries on from where the field stands. */
export const LineTypedMidGrow = {
  args: { prompt: `${PROMPT}\nThen\nAnd` },
  from: "Written",
  play: async ({ canvas, userEvent }: Play) => {
    const field = canvas.getByTestId("prompt");
    await userEvent.type(field, "\nThen");
    await userEvent.wait(40);
    await userEvent.type(field, "\nAnd");
    await userEvent.wait(300);
  },
};

/** The prompt cut to one sentence: the field gives up its lines and the fields under it close up. */
export const Shortened = {
  args: { prompt: "Triage new issues." },
  from: "Written",
  play: async ({ update, userEvent }: Play) => {
    await update({ prompt: "Triage new issues." });
    await userEvent.wait(300);
  },
};
