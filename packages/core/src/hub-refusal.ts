import { z } from "zod";

/** A hub refusal's body as every route sends it: an RFC 9457 problem (hub refusal.ts). */
const PROBLEM = z.object({ code: z.string().optional(), detail: z.string() });

/**
 * The sentence a refused hub answer says, from its body as it came: the
 * problem's `detail`, or the text itself, trimmed, when it is no problem
 * (an older hub's plain sentence, a proxy's page). Every reader outside the
 * dashboard (the CLI, the agent) shows a refusal through this.
 */
export const refusalWords = (body: string): string => {
  const text = body.trim();
  if (!text.startsWith("{")) {
    return text;
  }
  try {
    const problem = PROBLEM.safeParse(JSON.parse(text));
    return problem.success ? problem.data.detail : text;
  } catch {
    return text;
  }
};
