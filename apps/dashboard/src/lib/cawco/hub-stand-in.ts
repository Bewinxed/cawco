/**
 * A states file's hub, named by a story's decorator (the stage nests a
 * decorator's context into its story): `decorators: [hubAs("connected")]`
 * draws the component as the person sees it with the hub live, and
 * `hubAs("connecting")` as they see it while it reconnects;
 * `hubAs("connected", {}, { offline: true })` with the session's machine
 * offline. Its reads are
 * answered from `answers` by path, and refused for any other path in words
 * that say so.
 */
import type { HubRequest } from "@cawco/core/hub-request";
import HubStandIn from "./HubStandIn.svelte";
import type { HubState } from "./hub/socket.svelte";
import type { HubSeam } from "./hub-seam";

export const hubAs =
  (
    state: HubState,
    answers: Record<string, unknown> = {},
    machine: { offline?: boolean } = {}
  ) =>
  () => {
    const seam: HubSeam = {
      state,
      machineOffline: machine.offline,
      read: <T>({ path }: HubRequest): Promise<T> =>
        path in answers
          ? Promise.resolve(answers[path] as T)
          : Promise.reject(
              new Error(`The stand-in hub has no answer for ${path}.`)
            ),
    };
    return { Component: HubStandIn, props: { seam } };
  };
