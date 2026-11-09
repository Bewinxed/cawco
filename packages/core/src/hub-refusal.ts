import { z } from "zod";
import { hubFailureWords } from "./words/hub-failure";

/** A hub refusal's body as every route sends it: an RFC 9457 problem (hub refusal.ts). */
const PROBLEM = z.object({ code: z.string(), detail: z.string() });

/**
 * The sentence a refused hub answer says: its problem's `detail`. A body that
 * is no problem (a proxy's page, nothing) is the hub not answering, said with
 * the status that came instead. Every reader outside the dashboard (the CLI,
 * the agent) shows a refusal through this.
 */
export const refusalWords = (body: string, status: number): string => {
  try {
    const problem = PROBLEM.safeParse(JSON.parse(body));
    return problem.success
      ? problem.data.detail
      : hubFailureWords.noAnswer(status);
  } catch {
    return hubFailureWords.noAnswer(status);
  }
};
