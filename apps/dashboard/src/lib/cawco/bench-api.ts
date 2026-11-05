/**
 * A bench's own answers to the hub's reads (dev only): the page's `fetch`
 * of `/api/…` paths a bench names is answered from its records, as the hub
 * answered them, so a part that reads the hub (Project details, Decisions)
 * draws as it does on a live page instead of saying the dev server has no
 * hub. Every other request goes on as it would. The socket's half is
 * client.svelte.ts `standHub`.
 */

/** The answer to a request of an `/api/…` path (its query beside it), or undefined to let it go to the server. */
export type BenchAnswers = (
  path: string,
  method: string,
  query: URLSearchParams
) => unknown;

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** Answers the page's requests `answers` names until the returned call. */
export function standApi(answers: BenchAnswers): () => void {
  const real = globalThis.fetch;
  const stood: typeof fetch = (input, init) => {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.origin
    );
    if (url.pathname.startsWith("/api/")) {
      const answer = answers(url.pathname, method, url.searchParams);
      if (answer !== undefined) {
        return Promise.resolve(json(answer));
      }
    }
    return real(input, init);
  };
  globalThis.fetch = stood;
  return () => {
    if (globalThis.fetch === stood) {
      globalThis.fetch = real;
    }
  };
}
