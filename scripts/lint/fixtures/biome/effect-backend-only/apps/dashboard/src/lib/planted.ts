// Planted: the dashboard reaches Effect, a subpath of it, the house kit and
// the keyed lock, by import, type import, re-export and on demand.
import { Effect } from "effect";
import type { Schedule } from "effect/Schedule";
import { makeJoin } from "@cawco/core/effect/join";
import { makeKeyedLock } from "@cawco/core/keyed-lock";
export { lookUntil } from "@cawco/core/effect/poll";
export const later = () => import("effect");

// Left alone: the house backoff, which the dashboard's retries use.
import { backoffWait } from "@cawco/core/backoff";

export const used: unknown[] = [Effect, makeJoin, makeKeyedLock, backoffWait];
export type Used = Schedule<number>;
