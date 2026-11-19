/**
 * The frame bus: what the dashboard does with each kind of frame the hub
 * sends. A store names the kinds it takes, each with its handler
 * (`onFrame`); the client routes them all at once (`routeFrames`), and a
 * kind no route names is a compile error there, so a kind the hub gains is
 * taken by a store, or named as one no page receives (`hubOnly`), before it
 * ships. Whatever reads a frame (the socket, a stream's frame, a replayed
 * read) hands it to `takeFrame`.
 */
import type { FramePayload } from "@cawco/core/frames";

/** Every kind of frame the hub sends. */
export type FrameKind = FramePayload["kind"];

/** The frame of the kind `K`. */
export type FrameOf<K extends FrameKind> = Extract<FramePayload, { kind: K }>;

/** What takes the frames of one kind: any frame the router hands it, taken when it is of `kind`. */
export interface FrameRoute<K extends FrameKind> {
  readonly kind: K;
  readonly take: (frame: FramePayload) => void;
}

/** A route of any kind, as the router holds it. */
type AnyRoute = FrameRoute<FrameKind>;

/** Whether `frame` is of the kind `kind`. */
const isOf = <K extends FrameKind>(
  kind: K,
  frame: FramePayload
): frame is FrameOf<K> => frame.kind === kind;

/** The frames of kind `kind` go to `take`, each narrowed to its kind. */
export const onFrame = <K extends FrameKind>(
  kind: K,
  take: (frame: FrameOf<K>) => void
): FrameRoute<K> => ({
  kind,
  take: (frame) => {
    if (isOf(kind, frame)) {
      take(frame);
    }
  },
});

/** Kinds that travel machine → hub only: no page is sent one, and none takes it. */
export const hubOnly = <K extends FrameKind>(...kinds: K[]): FrameRoute<K>[] =>
  kinds.map((kind) => onFrame(kind, () => undefined));

type KindOf<R> = R extends { readonly kind: infer K } ? K : never;

/** The kinds no route in `R` names. */
type Unrouted<R extends readonly AnyRoute[]> = Exclude<
  FrameKind,
  KindOf<R[number]>
>;

let routes = new Map<FrameKind, AnyRoute["take"]>();

/**
 * Every kind's route, replacing the routes before (the app starts the
 * client's once, client.svelte.ts `startClient`). A kind none of them names
 * is a compile error naming it; a kind two of them name is refused. Returns
 * the unrouting: a frame is then taken by nothing, as before any route.
 */
export function routeFrames<const R extends readonly AnyRoute[]>(
  table: R,
  ..._unrouted: [Unrouted<R>] extends [never] ? [] : [missing: Unrouted<R>]
): () => void {
  const next = new Map<FrameKind, AnyRoute["take"]>();
  for (const route of table) {
    if (next.has(route.kind)) {
      throw new Error(`The frame kind ${route.kind} is routed twice.`);
    }
    next.set(route.kind, route.take);
  }
  routes = next;
  return () => {
    if (routes === next) {
      routes = new Map();
    }
  };
}

/** One frame, to the route its kind has. */
export function takeFrame(frame: FramePayload): void {
  routes.get(frame.kind)?.(frame);
}

/**
 * The board: the socket's first frame (`instances`), whole or what moved
 * since the board the page named, and each `board` frame after, what moved.
 */
export type BoardFrame = FrameOf<"instances" | "board">;
