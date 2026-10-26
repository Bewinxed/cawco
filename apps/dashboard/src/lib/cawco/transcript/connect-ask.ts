/**
 * A connect ask's sign-in address, split for reading (ConnectAddress): the
 * person sees the whole address before anything opens, its host where the
 * eye finds it (MCP URL-mode elicitation: "MUST show the full URL to the
 * user for examination before consent", "SHOULD highlight the domain of the
 * URL to mitigate subdomain spoofing").
 */

/** A sign-in address: its scheme, its host, and the rest. */
const ADDRESS = /^(https?:\/\/)([^/?#]+)(.*)$/iu;

/** The address split for reading: its host in strong ink, the rest muted. */
export function addressParts(url: string): {
  head: string;
  host: string;
  rest: string;
} {
  const at = ADDRESS.exec(url);
  return at
    ? { head: at[1], host: at[2], rest: at[3] }
    : { head: "", host: url, rest: "" };
}

/** Where a sign-in path may break: after one of these, never inside a run. */
const BREAK_AFTER = /(?<=[./&=?])/u;
/** A last run shorter than this joins the run before it, so no line holds a few characters alone. */
const TAIL_MIN = 12;

/**
 * An address's path and query as the runs it breaks between: each run ends
 * after a dot, a slash, `&`, `=` or `?`, and a short last run (`k2Jx9` of
 * `state=k2Jx9`) is held to the runs before it until it is no orphan.
 */
export function addressRuns(rest: string): string[] {
  const runs = rest.split(BREAK_AFTER).filter((run) => run !== "");
  while (runs.length > 1 && (runs.at(-1)?.length ?? 0) < TAIL_MIN) {
    const tail = runs.pop() ?? "";
    runs[runs.length - 1] += tail;
  }
  return runs;
}
