import { z } from "zod";
import { hubFailureWords } from "./words/hub-failure";

/** A hub refusal's body as every route sends it: an RFC 9457 problem (Elysia's `problem()`). */
const PROBLEM = z.object({ code: z.string(), detail: z.string() });

/**
 * The sentence a refused hub answer says, from its body as read (Eden's
 * reading: the problem's JSON, else its text): its problem's `detail`. A
 * body that is no problem (a proxy's page, nothing) is the hub not
 * answering, said with the status that came instead. Every reader outside
 * the dashboard (the CLI, the agent, the scripts) shows a refusal through
 * this or {@link refusalWords}.
 */
export const problemWords = (value: unknown, status: number): string => {
  const problem = PROBLEM.safeParse(value);
  return problem.success
    ? problem.data.detail
    : hubFailureWords.noAnswer(status);
};

/** {@link problemWords} of a refused answer's body text, for a request sent by `fetch` itself. */
export const refusalWords = (body: string, status: number): string => {
  try {
    return problemWords(JSON.parse(body), status);
  } catch {
    return hubFailureWords.noAnswer(status);
  }
};
