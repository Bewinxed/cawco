/**
 * The door's proof (hub-request.ts): each `@ts-expect-error` below is a
 * request the hub refuses, and `bun run check` fails when one of them stops
 * being a type error. Never imported: its lines are only type-checked.
 *
 * The two drifts that reached the hub (8eda5a4ca), each as the typed
 * variable its save passed whole:
 * - routing: `putRouting(provider, routing: Omit<ProviderRouting, "provider">)`
 *   while `ProviderRouting["atLimit"]` carried `delegateWork`;
 * - delegate type: `saveDelegateType(draft: DelegateType)` sent `draft`,
 *   which carries `name`, `role`, and then `cawcoTodos`.
 */
import type { ProviderRouting } from "./accounts";
import type { DelegateType } from "./delegate-types";
import { hubRequest, hubRequestAsGiven } from "./hub-request";

const ROUTING = "PUT /api/accounts/routing/:provider";
const DELEGATE_TYPE = "PUT /api/delegate-types/:name";

declare const routing: Omit<ProviderRouting, "provider">;
/** `ProviderRouting` as it stood before 0070fe210 dropped `delegateWork`. */
declare const routingThen: Omit<ProviderRouting, "provider" | "atLimit"> & {
  atLimit: ProviderRouting["atLimit"] & { delegateWork: boolean };
};
declare const draft: DelegateType;
/** The fields the delegate-type route takes, as `DelegateType` stood before 0070fe210 dropped `cawcoTodos`. */
declare const fieldsThen: Omit<DelegateType, "name" | "role"> & {
  cawcoTodos?: boolean;
};
/** What `JSON.parse` answers: `any`. */
declare const anything: ReturnType<typeof JSON.parse>;

// What the routes take, from typed variables and from literals.
hubRequest(ROUTING, { path: { provider: "claude" }, body: routing });
hubRequest(ROUTING, {
  path: { provider: "claude" },
  body: {
    yours: { strategy: "pinned", pinnedAccountId: "a" },
    delegates: { strategy: "spread" },
    atLimit: { move: true, waitMinutes: 5, moveWholeUnderK: 0 },
  },
});
const { name, role: _role, ...fields } = draft;
hubRequest(DELEGATE_TYPE, { path: { name }, body: fields });

// The routing drift: a typed variable carrying `atLimit.delegateWork`.
// @ts-expect-error `atLimit.delegateWork` is no field of the routing route
hubRequest(ROUTING, { path: { provider: "claude" }, body: routingThen });
// The same as a literal.
hubRequest(ROUTING, {
  path: { provider: "claude" },
  body: {
    ...routing,
    // @ts-expect-error `atLimit.delegateWork` is no field of the routing route
    atLimit: { ...routing.atLimit, delegateWork: true },
  },
});

// The delegate-type drift: the draft passed whole, `name` and `role` in it.
// @ts-expect-error `name` and `role` are no fields of the delegate-type route
hubRequest(DELEGATE_TYPE, { path: { name }, body: draft });
// And `cawcoTodos` beside them.
// @ts-expect-error `cawcoTodos` is no field of the delegate-type route
hubRequest(DELEGATE_TYPE, { path: { name }, body: fieldsThen });

// A body typed `any` is refused: nothing is known of what it sends.
// @ts-expect-error a body typed `any`
hubRequest(ROUTING, { path: { provider: "claude" }, body: anything });

// A query the route doesn't take.
// @ts-expect-error the routing route takes no query
hubRequest(ROUTING, { path: { provider: "claude" }, body: routing, query: {} });

// A path parameter left out, or one the route doesn't have.
// @ts-expect-error `provider` is the routing route's path parameter
hubRequest(ROUTING, { path: {}, body: routing });
// @ts-expect-error `name` is no path parameter of the routing route
hubRequest(ROUTING, { path: { provider: "claude", name }, body: routing });
// @ts-expect-error the routing route needs its path and body
hubRequest(ROUTING);

// A literal's arrays and literal unions are read as the route's.
hubRequest(DELEGATE_TYPE, {
  path: { name: "medium" },
  body: {
    description: "d",
    harness: "claude",
    model: "m",
    skills: ["a"],
    effort: "high",
  },
});

// A query: the names the route takes, and one it doesn't.
const HISTORY = "GET /api/projects/:id/folder/history";
hubRequest(HISTORY, { path: { id: "p" } });
hubRequest(HISTORY, { path: { id: "p" }, query: { limit: 5, path: "a.md" } });
// @ts-expect-error `cursor` is no query name of the folder history route
hubRequest(HISTORY, { path: { id: "p" }, query: { cursor: "c" } });

// A route that needs nothing is called with no `sent`, and takes no body.
hubRequest("GET /api/openrouter");
// @ts-expect-error the route takes no body
hubRequest("GET /api/openrouter", { body: { a: 1 } });

// What it sends typed `any` as a whole is refused as its body is.
// @ts-expect-error `sent` typed `any`
hubRequest(HISTORY, anything);

// A probe that proves a refusal sends what the route doesn't take as given,
// by its own name; the route's path parameters are still held.
hubRequestAsGiven(ROUTING, {
  path: { provider: "claude" },
  body: { ...routing, atLimit: { ...routing.atLimit, delegateWork: true } },
});
// @ts-expect-error the routing route's path parameter is `provider`
hubRequestAsGiven(ROUTING, { path: {}, body: {} });
