import type { SupervisorEvent } from "@cawco/core";

/**
 * The dashboard's side of the supervisor REST surface. Fetch wrappers in the
 * shape `rules.ts` established — a refusal from the hub is an Elysia bare
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

/** What `GET /api/supervisor` answers with. */
export interface SupervisorStatus {
  config: {
    enabled: boolean;
    baseUrl: string | null;
    model: string | null;
  };
  status: {
    configured: boolean;
    reachable?: boolean;
    resolvedModel?: string;
    error?: string;
  };
}

/** What `PUT /api/supervisor/config` accepts. */
export interface SupervisorConfigPayload {
  apiKey?: string;
  baseUrl: string;
  enabled: boolean;
  model: string;
}

/** Read the supervisor's config + live reachability probe. */
export const loadSupervisor = (): Promise<SupervisorStatus> =>
  send<SupervisorStatus>("/api/supervisor", {}, "load supervisor status");

/** Write the supervisor's config. */
export const saveSupervisorConfig = (
  payload: SupervisorConfigPayload
): Promise<{ ok: true }> =>
  send<{ ok: true }>(
    "/api/supervisor/config",
    { method: "PUT", ...json(payload) },
    "save supervisor config"
  );

/** Read the intervention log, optionally filtered by session. */
export const loadSupervisorEvents = (opts?: {
  instanceId?: string;
  limit?: number;
}): Promise<SupervisorEvent[]> => {
  const params = new URLSearchParams();
  if (opts?.instanceId) {
    params.set("instanceId", opts.instanceId);
  }
  // biome-ignore lint/suspicious/noEqualsToNull: != null also excludes undefined here (limit is optional); !== null would let an unset limit through as the string "undefined".
  if (opts?.limit != null) {
    params.set("limit", String(opts.limit));
  }
  const qs = params.toString();
  return send<SupervisorEvent[]>(
    `/api/supervisor/events${qs ? `?${qs}` : ""}`,
    {},
    "load supervisor events"
  );
};
