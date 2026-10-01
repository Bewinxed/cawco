/**
 * The dashboard's side of the per-session autopilot toggle. Fetch wrapper in
 * the shape `rules.ts` established — a refusal from the hub is an Elysia bare
 * string, so `said` unwraps it and the call throws a whole sentence the caller
 * can print.
 */

/** Elysia refuses with a bare string; JSON only when something else went wrong. */
async function said(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      return String((parsed as { message: unknown }).message);
    }
  } catch {
    // Not JSON, which is the ordinary case: the string is the sentence.
  }
  return body || `the hub answered ${response.status}`;
}

async function send<T>(
  url: string,
  init: RequestInit,
  attempt: string
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Could not ${attempt} — ${await said(response)}.`);
  }
  return (await response.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** The body `PUT /api/autopilot/:instanceId` accepts. */
export interface AutopilotPayload {
  enabled: boolean;
  prompt: string;
}

/** Toggle or update the standing autopilot for a session. */
export const setAutopilot = (
  instanceId: string,
  payload: AutopilotPayload
): Promise<{ ok: true }> =>
  send<{ ok: true }>(
    `/api/autopilot/${encodeURIComponent(instanceId)}`,
    { method: "PUT", ...json(payload) },
    "update autopilot"
  );
