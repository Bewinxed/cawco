import type { FindAnswer } from "@cawco/core";

export interface TranscriptHit {
  cwd: string | null;
  docId: string;
  harness: string;
  instanceId?: string;
  machineId: string;
  model: string | null;
  role: string;
  score: number;
  sessionId: string;
  sidechain: boolean;
  snippet: string;
  timestamp: string | null;
  /** The conversation it is in, as the hub names it. */
  title: string;
}

/** A machine that couldn't answer the search, in the hub's own sentence. */
export interface SearchFailure {
  machineId: string;
  message: string;
}

/** Who wrote the line, as the palette names them and the index stores them. */
export const AUTHORS = [
  { token: "me", role: "user", label: "Me", detail: "only what I wrote" },
  {
    token: "agent",
    role: "assistant",
    label: "Agent",
    detail: "only what the agent wrote",
  },
] as const satisfies ReadonlyArray<{
  token: string;
  role: "user" | "assistant";
  label: string;
  detail: string;
}>;

export type AuthorToken = (typeof AUTHORS)[number]["token"];

/** A whole `@me` / `@agent` word anywhere in the query, not a prefix of one. */
const AUTHOR_IN_QUERY = /(?:^|\s)@(me|agent)(?=\s|$)/i;
/** The `@…` word being typed at the caret, which opens the author picker. */
const AUTHOR_FRAGMENT = /(?:^|\s)@([a-z]*)$/i;

export interface ParsedQuery {
  /** The role to scope to, when the query named one. */
  role?: "user" | "assistant";
  /** The query with the author token taken out — what is actually searched. */
  text: string;
}

/**
 * Split `@me some words` into the role it scopes to and the words it searches
 * for. The token is a word rather than a prefix, so a query that merely
 * contains an email address or a handle is left alone.
 */
export function parseQuery(query: string): ParsedQuery {
  const found = AUTHOR_IN_QUERY.exec(query);
  if (!found) {
    return { text: query.trim() };
  }
  const author = AUTHORS.find((a) => a.token === found[1].toLowerCase());
  return {
    text: (
      query.slice(0, found.index) + query.slice(found.index + found[0].length)
    )
      .replace(/\s+/g, " ")
      .trim(),
    role: author?.role,
  };
}

/** The `@…` word under the caret, or null when the reader is not naming one. */
export function authorFragment(query: string): string | null {
  const found = AUTHOR_FRAGMENT.exec(query);
  return found ? found[1].toLowerCase() : null;
}

/** Take the half-typed `@…` back out, once its author has been chosen. */
export function stripFragment(query: string): string {
  const found = AUTHOR_FRAGMENT.exec(query);
  return found ? query.slice(0, found.index).trimStart() : query;
}

/** Replace the `@…` being typed with a settled token, ready to type after. */
export function applyAuthor(query: string, token: AuthorToken): string {
  const found = AUTHOR_FRAGMENT.exec(query);
  if (!found) {
    return `${query.trim()} @${token} `.trimStart();
  }
  const head = query.slice(0, found.index);
  const lead = found[0].startsWith(" ") ? " " : "";
  return `${head}${lead}@${token} `;
}

export class JumpTranscriptSearch {
  hits = $state<TranscriptHit[]>([]);
  /** The machines whose results the last answer leaves out, and why. */
  failures = $state<SearchFailure[]>([]);
  pending = $state(false);
  #timer: ReturnType<typeof setTimeout> | undefined;
  #controller: AbortController | undefined;

  update(query: string, role?: "user" | "assistant") {
    clearTimeout(this.#timer);
    // Any keystroke invalidates whatever is in flight — otherwise a stale
    // response can land during the debounce window and publish old hits.
    // Clearing the field keeps the aborted request's `finally` from touching
    // `pending`, which now belongs to the query being scheduled.
    this.#controller?.abort();
    this.#controller = undefined;
    // A chip decides the scope; a token still being typed in the text does not.
    const { text, role: typedRole } = parseQuery(query);
    const scopeRole = role ?? typedRole;
    // While an `@…` is still being typed it names nobody yet; searching on the
    // half-written token would flash results for a word the reader is in the
    // middle of replacing.
    if (text.length < 2 || authorFragment(query) !== null) {
      this.hits = [];
      this.failures = [];
      this.pending = false;
      return;
    }
    this.pending = true;
    this.#timer = setTimeout(() => this.#run(text, scopeRole), 150);
  }

  async #run(q: string, role?: "user" | "assistant") {
    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    try {
      const params = new URLSearchParams({
        q,
        limit: "20",
        kinds: "conversation",
      });
      if (role) {
        params.set("by", role === "user" ? "me" : "agent");
      }
      const response = await fetch(`/api/find?${params}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Transcript search failed: ${response.status}`);
      }
      const answer = (await response.json()) as FindAnswer;
      // Each conversation whose transcript matched, by its best moment.
      const hits = answer.results.flatMap((result): TranscriptHit[] => {
        const moment =
          result.kind === "conversation" ? result.moments[0] : undefined;
        if (!(result.kind === "conversation" && result.sessionId && moment)) {
          return [];
        }
        return [
          {
            cwd: result.dir,
            docId: moment.docId,
            harness: result.harness ?? "",
            ...(result.instanceId ? { instanceId: result.instanceId } : {}),
            machineId: result.machine.id,
            model: null,
            role: moment.author === "owner" ? "user" : "assistant",
            score: result.score,
            sessionId: result.sessionId,
            sidechain: false,
            snippet: moment.excerpt,
            timestamp:
              moment.at === null ? null : new Date(moment.at).toISOString(),
            title: result.title,
          },
        ];
      });
      const failures = answer.coverage.machines
        .filter((machine) => !machine.answered)
        .map((machine) => ({
          machineId: machine.machineId,
          message: `${machine.name} couldn't search: ${machine.reason ?? "it gave no reason"}. Its results are left out; the next search tries again.`,
        }));
      if (controller.signal.aborted) {
        return;
      }
      this.failures = failures;
      const seen = new Set<string>();
      const next = hits
        .filter((hit) => {
          if (seen.has(hit.sessionId)) {
            return false;
          }
          seen.add(hit.sessionId);
          return true;
        })
        .slice(0, 10);
      // Stable rows preserve Command's keyboard selection across refreshes.
      if (
        next.length !== this.hits.length ||
        next.some((hit, i) => hit.docId !== this.hits[i].docId)
      ) {
        this.hits = next;
      }
    } catch {
      if (!controller.signal.aborted) {
        this.hits = [];
        this.failures = [];
      }
    } finally {
      if (this.#controller === controller) {
        this.pending = false;
      }
    }
  }
}
