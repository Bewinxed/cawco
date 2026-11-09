/**
 * THE DOOR every TypeScript caller of the hub builds its request through:
 * the route, named as the hub declares it (`"PUT /api/accounts/routing/:provider"`),
 * and what it sends, held exactly to what that route takes
 * (hub-routes.gen.ts, written from the hub's own route table). It returns the
 * method, path and JSON body each caller's own transport sends, with its
 * own credentials, deadline and refusal words.
 *
 * Exact: the hub refuses a field its route doesn't take with a 422 (hub
 * server.ts `normalize: false`, unknown-fields.ts), and TypeScript refuses an
 * extra property only on a fresh object literal ("Since assigning
 * `squareOptions` won't undergo excess property checks, the compiler won't
 * give you an error", typescriptlang.org/docs/handbook/2/objects.html). Two
 * dashboard saves drifted so, each passing a typed variable whole: routing's
 * `atLimit.delegateWork` and a delegate type's `name`, `cawcoTodos` and
 * `role`. So `sent` is checked field by field, at every depth, for a typed
 * variable as much as for a literal (`Exact`): a field no branch of the
 * route's schema declares is a type error, as unknown-fields.ts reads a
 * union; a record or `unknown` the route takes stays open; `any` is refused.
 * hub-request.fixtures.ts holds both drifts as type errors.
 */
import type { components } from "./hub-routes.gen";
import type { ReadonlyDeep, Sending } from "./sending";

/** Every hub route by `METHOD /path`, and what it takes: `path`, `query`, `body`. */
type HubRoutes = components["schemas"];
export type HubRoute = keyof HubRoutes;

/** What `route` takes. */
export type HubSent<R extends HubRoute> = ReadonlyDeep<HubRoutes[R]>;

/** The routes that take nothing they need, called with no `sent`. */
type BareRoute = {
  [R in HubRoute]: Record<string, never> extends HubRoutes[R] ? R : never;
}[HubRoute];

/** A request as each transport sends it: spread it into `fetch`'s init. */
export interface HubRequest {
  body?: string;
  headers?: { "Content-Type": "application/json" };
  method: string;
  /** From `/`, its parameters encoded and its query after it. */
  path: string;
}

/** What a request may carry, read loosely, for {@link requestOf}. */
interface Parts {
  body?: unknown;
  path?: Record<string, string | number>;
  query?: Record<string, unknown>;
}

const PARAMETER = /^:(.+)$/u;

/** One query value as text: an object as JSON (Elysia's `t.ObjectString`), anything else as it prints. */
const queryText = (value: unknown): string =>
  typeof value === "object" ? JSON.stringify(value) : String(value);

/** The query's fields as the hub's query parser reads them: an array as its key repeated, nothing for `undefined`. */
const queryOf = (query: Record<string, unknown> | undefined): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one !== undefined && one !== null) {
        search.append(key, queryText(one));
      }
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

/** `route` with `parts` filled in, read as given. */
const requestOf = (route: string, parts: Parts): HubRequest => {
  const space = route.indexOf(" ");
  const method = route.slice(0, space);
  const path = route
    .slice(space + 1)
    .split("/")
    .map((segment) => {
      const name = PARAMETER.exec(segment)?.[1];
      if (name === undefined) {
        return segment;
      }
      const value = parts.path?.[name];
      if (value === undefined) {
        throw new Error(`${route}: no value for its path parameter ${name}`);
      }
      return encodeURIComponent(String(value));
    })
    .join("/");
  return {
    method,
    path: `${path}${queryOf(parts.query)}`,
    ...(parts.body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parts.body),
        }),
  };
};

/**
 * The request for `route`, with what it sends: its path parameters, query
 * and body, each held exactly to what the route takes (core sending.ts `Exact`).
 */
export function hubRequest<R extends BareRoute>(route: R): HubRequest;
export function hubRequest<R extends HubRoute, const S>(
  route: R,
  sent: Sending<S, HubSent<R>>
): HubRequest;
export function hubRequest(route: string, sent: Parts = {}): HubRequest {
  return requestOf(route, sent);
}

/**
 * The request for `route` with a body or query sent as given, never held to
 * the route: only for a probe that proves the hub refuses it (a 422 naming
 * the field). Its path parameters are still the route's. The ban on hub paths
 * built outside this door (scripts/lint) lists each file that calls it.
 */
export const hubRequestAsGiven = <R extends HubRoute>(
  route: R,
  sent: {
    body?: unknown;
    query?: Record<string, unknown>;
  } & (HubSent<R> extends { path: infer P } ? { path: P } : unknown)
): HubRequest => requestOf(route, sent as Parts);

/** `request` as `fetch`'s init, `init`'s own fields (a signal, credentials, other headers) beside it. */
const hubInit = (request: HubRequest, init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    headers.set(name, value);
  }
  return {
    ...init,
    method: request.method,
    headers,
    ...(request.body === undefined ? {} : { body: request.body }),
  };
};

/**
 * `request` at the hub at `base` as `fetch`'s two arguments, its URL and its
 * init (`init`'s own fields beside it): spread into any sender that takes
 * them (`fetch`, a machine's proven fetch, a deadline's).
 */
export const hubAt = (
  base: string,
  request: HubRequest,
  init: RequestInit = {}
): [url: string, init: RequestInit] => [
  `${base}${request.path}`,
  hubInit(request, init),
];

/**
 * A sender of a hub request: `fetch` itself, or one that carries the caller's
 * credential (the agent's `provenFetch`, a machine's `machineFetch`, a
 * SvelteKit load's own `fetch`).
 */
export type HubSender = (url: string, init: RequestInit) => Promise<Response>;

/**
 * `request` sent through `sender` to the hub at `base` (its origin, or `""`
 * on a page the hub serves through its own origin), `init`'s own fields
 * beside it. The sender is named at every call, never defaulted: it is what
 * carries the caller's credential (a machine's proof, a session's bearer, the
 * owner's token), and a default would send without one in silence, as the
 * agent's update loop did when this took `fetch` by default (the nightly from
 * 886030601, refused as anonymous).
 */
export const fetchHub = (
  sender: HubSender,
  base: string,
  request: HubRequest,
  init: RequestInit = {}
): Promise<Response> => sender(...hubAt(base, request, init));
