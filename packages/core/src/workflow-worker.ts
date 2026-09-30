/// <reference lib="webworker" />
/**
 * The program sandbox (proposal §13.3). One Worker per active run. The module
 * under it sees `w`, `z` and the language — nothing else: the preamble below
 * removes every ambient capability before the program is imported, and the
 * loader refuses a program that imports anything but zod.
 *
 * Every `w.*` call takes the next sequence number and posts an effect request
 * to the hub thread, whose workflow engine answers it from storage on replay
 * or performs it live.
 *
 * After the program starts, and after every answer it is handed, the worker
 * posts `idle` once the program has run as far as that answer takes it — all
 * of its microtasks drained. The hub orders a replay by it: it hands the next
 * answer only once the program has issued every call the last one led to.
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import type { WorkflowFailure } from "./workflow";
import { errorOf, failureOf, stepIdFor } from "./workflow-program";

export interface WorkerStart {
  inputs?: Record<string, unknown>;
  mode: "inputs" | "run";
  path: string;
  runId: string;
}

export type WorkerOut =
  | { type: "effect"; id: number; seq: number; kind: string; args: unknown }
  | { type: "done"; result: unknown }
  | { type: "failed"; failure: WorkflowFailure }
  /** The program has run as far as its first `answered` answers take it. */
  | { type: "idle"; answered: number }
  | { type: "inputs"; shape: unknown }
  | { type: "ready" };

export type WorkerIn =
  | { type: "effect-result"; id: number; result: unknown }
  | { type: "effect-error"; id: number; failure: WorkflowFailure };

/** The globals a program must not see. Removed before its module is loaded. */
const STRIPPED = [
  "Bun",
  "process",
  "fetch",
  "require",
  "XMLHttpRequest",
  "WebSocket",
  "Worker",
  "importScripts",
  "navigator",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "crypto",
];

declare const self: DedicatedWorkerGlobalScope;

/**
 * Kept before the preamble strips timers from the program: a timer callback
 * runs only after every microtask the last message queued has drained.
 */
const later = setTimeout;

const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: unknown) => void }
>();
let nextCall = 0;
let nextSeq = 0;
let answered = 0;

/** Tells the hub the program has gone as far as `answered` answers take it. */
const postIdle = () => {
  const upTo = answered;
  later(() => {
    self.postMessage({ type: "idle", answered: upTo } satisfies WorkerOut);
  }, 0);
};

self.addEventListener("message", (event: MessageEvent<WorkerIn>) => {
  const message = event.data;
  if (message?.type !== "effect-result" && message?.type !== "effect-error") {
    return;
  }
  answered += 1;
  const entry = pending.get(message.id);
  if (entry) {
    pending.delete(message.id);
    if (message.type === "effect-result") {
      entry.resolve(message.result);
    } else {
      entry.reject(errorOf(message.failure));
    }
  }
  postIdle();
});

const effect = (kind: string, args: unknown): Promise<unknown> => {
  const id = nextCall;
  const seq = nextSeq;
  nextCall += 1;
  nextSeq += 1;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    self.postMessage({
      type: "effect",
      id,
      seq,
      kind,
      args,
    } satisfies WorkerOut);
  });
};

function makeBridge(runId: string, inputs: Record<string, unknown>) {
  const handleOf = (spec: unknown) => {
    const seq = nextSeq;
    const result = effect("spawn", spec);
    return { id: stepIdFor(runId, seq), result };
  };
  /** A spec crosses the boundary as plain JSON: zod becomes JSON Schema. */
  const strip = ({ output, ...spec }: Record<string, unknown>) => ({
    ...spec,
    // biome-ignore lint/suspicious/noExplicitAny: the program hands us its own zod schema, untyped at this boundary
    outputSchema: zodToJsonSchema(output as any),
  });
  return {
    inputs,
    run: (spec: Record<string, unknown>) => effect("run", strip(spec)),
    spawn: (spec: Record<string, unknown>) => handleOf(strip(spec)),
    ask: ({ answer, ...spec }: Record<string, unknown>) =>
      effect(
        "ask",
        answer === undefined
          ? spec
          : {
              ...spec,
              // biome-ignore lint/suspicious/noExplicitAny: the program hands us its own zod schema, untyped at this boundary
              answerSchema: zodToJsonSchema(answer as any),
            }
      ),
    exec: (cmd: string, options?: { timeoutMinutes?: number }) =>
      effect("exec", { cmd, timeoutMinutes: options?.timeoutMinutes }),
    exists: (path: string) => effect("exists", { path }),
    jev: (spec: unknown) => effect("jev", spec),
    workflow: (slug: string, values: unknown) =>
      effect("workflow", { slug, inputs: values }),
    state: (name: string, schema: unknown) => {
      // biome-ignore lint/suspicious/noExplicitAny: the program hands us its own zod schema, untyped at this boundary
      const jsonSchema = zodToJsonSchema(schema as any);
      return {
        get: () => effect("state-get", { name, schema: jsonSchema }),
        set: (value: unknown) =>
          effect("state-set", { name, schema: jsonSchema, value }),
        update: async (change: (current: unknown) => unknown) => {
          const current = await effect("state-get", {
            name,
            schema: jsonSchema,
          });
          await effect("state-set", {
            name,
            schema: jsonSchema,
            value: change(current),
          });
        },
      };
    },
    checkpoint: (label: string, data?: unknown) =>
      effect("checkpoint", { label, data }),
    sleep: (ms: number) => effect("sleep", { ms }),
    now: () => effect("now", {}),
    notify: (text: string) => effect("notify", { text }),
    notes: () => effect("notes", {}),
    log: (text: string) => effect("log", { text }),
    trace: (edgeId: string, scope?: string) =>
      effect("trace", { edgeId, scope: scope ?? "root" }),
  };
}

/** Describes a zod object's fields without the hub having to hold zod types. */
// biome-ignore lint/suspicious/noExplicitAny: the shape comes out of an untyped module the sandbox just evaluated
function describeInputs(schema: any): unknown {
  const shape = schema?._def?.shape?.() ?? schema?.shape;
  if (!shape) {
    throw new Error(
      "A program's `inputs` export must be a zod object, as in z.object({ … })."
    );
  }
  const described: Record<string, unknown> = {};
  // biome-ignore lint/suspicious/noExplicitAny: zod's internal field shape has no public type
  for (const [name, field] of Object.entries<any>(shape)) {
    let current = field;
    let optional = false;
    let defaultValue: string | undefined;
    let description: string | undefined = current?._def?.description;
    for (let depth = 0; depth < 8 && current?._def; depth += 1) {
      description ??= current._def.description;
      const kind = current._def.typeName;
      if (kind === "ZodOptional" || kind === "ZodNullable") {
        optional = true;
        current = current._def.innerType;
      } else if (kind === "ZodDefault") {
        optional = true;
        defaultValue = String(current._def.defaultValue());
        current = current._def.innerType;
      } else {
        break;
      }
    }
    described[name] = {
      optional,
      ...(defaultValue === undefined ? {} : { defaultValue }),
      ...(description ? { description } : {}),
      ...(current?._def?.typeName === "ZodEnum"
        ? { options: current._def.values as string[] }
        : {}),
    };
  }
  return described;
}

self.addEventListener("message", async function boot(event: MessageEvent) {
  const start = event.data as WorkerStart;
  if (!(start && typeof start === "object" && "mode" in start)) {
    return;
  }
  self.removeEventListener("message", boot);
  for (const name of STRIPPED) {
    Reflect.deleteProperty(globalThis, name);
  }
  const forbid = (what: string) => () => {
    throw new Error(
      `A workflow program must be deterministic; ${what} is not available. Use w.now() and w.sleep().`
    );
  };
  Math.random = forbid("Math.random");
  Date.now = forbid("Date.now");
  try {
    const module = (await import(start.path)) as {
      default?: (bridge: unknown) => Promise<unknown>;
      inputs?: unknown;
    };
    if (start.mode === "inputs") {
      self.postMessage({
        type: "inputs",
        shape: describeInputs(module.inputs),
      } satisfies WorkerOut);
      return;
    }
    if (typeof module.default !== "function") {
      throw new Error(
        "A program must default-export an async function taking the workflow runtime."
      );
    }
    const running = module.default(makeBridge(start.runId, start.inputs ?? {}));
    postIdle();
    const result = await running;
    self.postMessage({ type: "done", result } satisfies WorkerOut);
  } catch (error) {
    self.postMessage({
      type: "failed",
      failure: failureOf(error),
    } satisfies WorkerOut);
  }
});
