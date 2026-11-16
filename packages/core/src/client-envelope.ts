/**
 * What a client's socket says (the dashboard, the apps, the Chrome
 * extension), parsed once where it enters the hub: {@link readClientEnvelope}
 * takes an envelope off the socket and gives back the {@link ClientEnvelope}
 * its verb names, its payload checked against that verb's schema, or why it
 * is no message a client sends.
 */

import { z } from "zod";
import type { Addressed } from "./agent-frame";
import type { ClientEnvelope, ClientSpawn } from "./envelopes";
import { isRecord } from "./is-record";
import {
  ControlPayloadSchema,
  FsPayloadSchema,
  PasskeyAdvertFrameSchema,
  SpawnPayloadSchema,
  StopRequestSchema,
} from "./stored-shapes";

/**
 * A start as a client sends it: the harness it names is read where the
 * start is named (hub spawns.ts `namedSpawn`), which says what a start that
 * names none, or one CawCo does not run, is refused for.
 */
const ClientSpawnSchema: z.ZodType<ClientSpawn> = SpawnPayloadSchema.omit({
  harness: true,
}).extend({ harness: z.string().optional() });

/** A message a client sent: its envelope, or why it is no message a client sends. */
export type ClientRead = { envelope: ClientEnvelope } | { fault: string };

/** The verbs a client sends, in the words a refusal names them. */
const CLIENT_VERBS = "spawn, stop, control or fs";

/** Why `verb`'s payload was not its schema's, by the fields that broke it. */
const payloadFault = (verb: string, error: z.ZodError): string => {
  const fields = [
    ...new Set(error.issues.map((issue) => issue.path.join(".") || "payload")),
  ];
  return `${verb} refused: its payload is not a ${verb} (${fields.join(", ")})`;
};

/**
 * `message`, an envelope off a client's socket, parsed into the
 * {@link ClientEnvelope} its verb names: a start, a stop, a control call, a
 * file request, or the extension's BLE advert (its one `frames`). A verb no
 * client sends, and a payload that is not its verb's, come back as their
 * fault, for the hub to refuse the message with.
 */
export const readClientEnvelope = (message: Addressed): ClientRead => {
  const { verb, payload, ...address } = message;
  const unknownVerb = {
    fault: `unknown verb "${verb}": a dashboard sends ${CLIENT_VERBS}`,
  };
  switch (verb) {
    case "spawn": {
      const read = ClientSpawnSchema.safeParse(payload);
      return read.success
        ? { envelope: { ...address, verb, payload: read.data } }
        : { fault: payloadFault(verb, read.error) };
    }
    case "stop": {
      const read = StopRequestSchema.safeParse(payload);
      return read.success
        ? { envelope: { ...address, verb, payload: read.data } }
        : { fault: payloadFault(verb, read.error) };
    }
    case "control": {
      const read = ControlPayloadSchema.safeParse(payload);
      return read.success
        ? { envelope: { ...address, verb, payload: read.data } }
        : { fault: payloadFault(verb, read.error) };
    }
    case "fs": {
      const read = FsPayloadSchema.safeParse(payload);
      return read.success
        ? { envelope: { ...address, verb, payload: read.data } }
        : { fault: payloadFault(verb, read.error) };
    }
    // Only the Chrome extension's BLE advert: it belongs to no machine.
    case "frames": {
      const read = isRecord(payload)
        ? PasskeyAdvertFrameSchema.safeParse(payload)
        : undefined;
      return read?.success
        ? { envelope: { ...address, verb, payload: read.data } }
        : unknownVerb;
    }
    default:
      return unknownVerb;
  }
};
