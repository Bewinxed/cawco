// What house/redacted-brand must report (expected.txt): each way the review
// of 55301f3a3b made the brand without the redactor that still compiles.
import type { Envelope } from "../../../packages/core/src/protocol";
import type { redactedAsk } from "../../../packages/hub/src/redactor";
import {
  type Redacted,
  redactedFrame,
} from "../../../packages/hub/src/redactor";
import {
  type ClientSocket,
  sendToClient,
} from "../../../packages/hub/src/wire-socket";

declare const socket: ClientSocket;
declare const raw: Envelope;
declare const said: string;

// A type alias, and a cast and a guard through it.
type Aliased = Redacted<Envelope>;
export const viaAlias = (): void =>
  sendToClient(socket, raw as unknown as Aliased);
export const aliasGuard = (value: unknown): value is Aliased =>
  value !== undefined;
// `never`, handed over and returned.
export const asNever = (): void => sendToClient(socket, raw as never);
export const neverBack = async (value: Envelope): Promise<Redacted<Envelope>> =>
  value as never;
// An implicit `any`, handed back (one handed over does not compile: `Typed`).
export const parsedBack = (): Redacted<Envelope> => JSON.parse(said);
// A generic cast helper, named and inferred.
const stamp = <T>(value: unknown): T => value as T;
export const stamped = (): void =>
  sendToClient(socket, stamp<Redacted<Envelope>>(raw));
// A type the compiler derives.
export const derived = (): void =>
  sendToClient(socket, raw as unknown as ReturnType<typeof redactedAsk>);
// A declared maker.
declare function forge<T>(value: T): Redacted<T>;
export const forged = (): void => sendToClient(socket, forge(raw));
// `Object.assign` onto a redacted value.
export const assigned = (): void =>
  sendToClient(
    socket,
    Object.assign(redactedFrame(raw), { payload: raw.payload })
  );
// Guards the old rule's pattern did not see.
export const arrowGuard = <T>(value: unknown): value is Redacted<T> =>
  value !== undefined;
export function functionGuard<T>(value: unknown): value is Redacted<T> {
  return value !== undefined;
}
export const methodGuard = {
  holds(value: unknown): value is Redacted<Envelope> {
    return value !== undefined;
  },
};
export class ClassGuard {
  holds(value: unknown): value is Redacted<Envelope> {
    return value !== undefined;
  }
}
export function asserted(value: unknown): asserts value is Redacted<Envelope> {
  if (value === undefined) {
    throw new Error("none");
  }
}
// Kept in a variable of its own type.
export const kept: Redacted<Envelope> = JSON.parse(said);

// Each stands: a parameter's type, a return's, a callback's.
export const passOn = (frame: Redacted<Envelope>): void =>
  sendToClient(socket, frame);
export const made = (): Redacted<Envelope> => redactedFrame(raw);
export interface Sends {
  each: (made: () => Redacted<Envelope>) => void;
  one: (frame: Redacted<Envelope>) => Redacted<Envelope>;
}
