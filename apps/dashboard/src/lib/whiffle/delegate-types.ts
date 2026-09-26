import type { DelegateType } from "@whiffle/core";
import { HARNESSES } from "@whiffle/core";

/**
 * The dashboard's side of delegate types: fetch wrappers in the shape
 * `rules.ts` established — a refusal from the hub is an Elysia bare string,
 * so `said` unwraps it and every call throws a whole sentence the caller can
 * print.
 *
 * Validation lives in `@whiffle/core`'s `delegateTypeProblem`, reused here
 * rather than re-derived, so the form's refusals agree with the hub's own.
 */

// biome-ignore lint/performance/noBarrelFile: re-exporting @whiffle/core's validator keeps the hub's own delegate-type rules the single source of truth
export {
  type DelegateType,
  delegateTypeProblem,
} from "@whiffle/core";

/** `DelegateType['harness']` is the same three-value union `HARNESSES` already is. */
export const DELEGATE_HARNESSES = HARNESSES;

export interface DelegateTypesPayload {
  types: DelegateType[];
}

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

export const loadDelegateTypes = (): Promise<DelegateTypesPayload> =>
  send<DelegateTypesPayload>(
    "/api/delegate-types",
    {},
    "load the delegate types"
  );

/** Create and edit are the same route on the hub — `PUT` upserts by name. */
export const saveDelegateType = (draft: DelegateType): Promise<DelegateType> =>
  send<DelegateType>(
    `/api/delegate-types/${encodeURIComponent(draft.name)}`,
    { method: "PUT", ...json(draft) },
    `save ${draft.name || "the delegate type"}`
  );

export const removeDelegateType = async (name: string): Promise<void> => {
  const response = await fetch(
    `/api/delegate-types/${encodeURIComponent(name)}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    throw new Error(`Could not delete ${name} — ${await said(response)}.`);
  }
};

/** A blank draft, on the defaults that make the common case one field of typing. */
export const blankDelegateType = (): DelegateType => ({
  name: "",
  description: "",
  harness: "claude",
  model: "",
});

/** Whatever the caller threw, as a sentence. Every panel in this app has one. */
export const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
