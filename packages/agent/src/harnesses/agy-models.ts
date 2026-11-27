/**
 * What each Antigravity account on this machine offers: the models agy's
 * `session/new` lists for it, read live in the account's own home with its
 * own method, never a list kept by CawCo (a Gemini API key's account lists
 * Gemini alone), each with the context window agy states for it on that
 * account. The read opens one session and sends it no prompt; the
 * conversation it made is removed from the home after.
 */
import {
  type ClientConnection,
  client,
  methods,
} from "@agentclientprotocol/sdk";
import { boundedRead } from "@cawco/core/effect/bounded";
import type { ModelInfo } from "@cawco/core/harness/kinds";
import { runtimeVersion } from "@cawco/core/runtime";
import { Effect, Option, Queue } from "effect";
import { runPromise } from "../daemon-runtime";
import { fromPromise } from "../rejected";
import { currentOption, modelsOf } from "./agy-frames";
import {
  agyArgs,
  agyEnvironment,
  agyToStart,
  endGroup,
  prepareAgyHome,
  readAgySignIn,
  signedInAt,
  signInAcp,
  startAcp,
} from "./agy-launch";
import { accountStore, deleteAgyConversation } from "./agy-store-files";

/** How long one account's read may take: agy starts in about a second and a half (§P, "Cost of a process"). */
const READ_MS = 30_000;

/**
 * How long agy has to state a model's window once the session opens on it
 * or is set to it. agy 1.5.18 sends ACP's `usage_update`, whose `size` is
 * "Total context window size in tokens", then: "the value is sent when a
 * session starts or is reloaded, after each model call, and after a model
 * or thinking level change" (its changelog, compiled into the binary).
 */
// @limit external: agy answers a model change from its own catalog, in well under this
const WINDOW_MS = 5000;

/**
 * Each model's context window as agy states it in session `sessionId`
 * (opened as `answer`): the window `sizes` carries first is the open
 * model's; each other model is set on the session in turn, and its window
 * is the next `sizes` carries. The session is set back to the model it
 * opened on. A model agy will not set is left out, and once agy states no
 * window for a model in time, so is every model after it: unknown, never a
 * guess. None when agy states none for the model it opened on.
 */
const windowsOf = (
  connection: ClientConnection,
  sessionId: string,
  answer: unknown,
  sizes: Queue.Queue<number>
) =>
  Effect.gen(function* () {
    const windows = new Map<string, number>();
    const opened = currentOption(answer, "model");
    const stated = Queue.take(sizes).pipe(
      Effect.timeoutOption(WINDOW_MS),
      Effect.map(Option.filter((size) => size > 0))
    );
    const first = yield* stated;
    if (!(opened && Option.isSome(first))) {
      return windows;
    }
    windows.set(opened, first.value);
    const setModel = (value: string) =>
      fromPromise(() =>
        connection.agent.request(methods.agent.session.setConfigOption, {
          sessionId,
          configId: "model",
          value,
        })
      ).pipe(Effect.option);
    for (const { value } of modelsOf(answer)) {
      if (windows.has(value)) {
        continue;
      }
      yield* Queue.clear(sizes);
      if (Option.isNone(yield* setModel(value))) {
        continue;
      }
      const size = yield* stated;
      if (Option.isNone(size)) {
        // agy stated none on a change: it states none on the next either,
        // and the read's own time is not spent waiting on each.
        break;
      }
      windows.set(value, size.value);
    }
    yield* setModel(opened);
    return windows;
  });

/** Account `accountId`'s models as agy lists them, read in its own home; refused in words when it cannot be read. */
export const agyAccountModels = async (
  accountId: string
): Promise<ModelInfo[]> => {
  const { bin, signIn, home } = await runPromise(
    Effect.gen(function* () {
      const agy = yield* agyToStart();
      const read = yield* readAgySignIn(accountId);
      const prepared = yield* prepareAgyHome(accountId, read);
      return { bin: agy.bin, signIn: read, home: prepared };
    }).pipe(Effect.mapError((refused) => new Error(refused.message)))
  );
  const signedIn = await signedInAt(home);
  const since = Date.now();
  const sizes = await runPromise(Queue.unbounded<number>());
  const { child, connection } = startAcp(
    {
      bin,
      args: agyArgs(home, home),
      env: agyEnvironment(signIn, home, {}),
      cwd: home,
    },
    // The read's one session: every window agy states is its.
    client({ name: "cawco" }).onNotification(
      methods.client.session.update,
      ({ params }) => {
        if (params.update.sessionUpdate === "usage_update") {
          Queue.offerUnsafe(sizes, params.update.size);
        }
      }
    ),
    { said: () => undefined, ended: () => undefined }
  );
  let made: string | undefined;
  try {
    // The promise edge of one bounded read of agy.
    return await runPromise(
      boundedRead(
        READ_MS,
        Effect.gen(function* () {
          yield* fromPromise(() =>
            signInAcp(connection, signIn.method, runtimeVersion, {
              end: () => endGroup(child),
              home,
              signedIn,
              since,
            })
          );
          const answer = yield* fromPromise(() =>
            connection.agent.request(methods.agent.session.new, {
              cwd: home,
              mcpServers: [],
            })
          );
          const { sessionId } = answer;
          made = sessionId;
          const windows = yield* windowsOf(
            connection,
            sessionId,
            answer,
            sizes
          );
          yield* Effect.promise(() =>
            connection.agent
              .request(methods.agent.session.close, { sessionId })
              .catch(() => undefined)
          );
          return modelsOf(answer).map((model) => {
            const window = windows.get(model.value);
            return window ? { ...model, contextWindow: window } : model;
          });
        })
      )
    );
  } finally {
    connection.close();
    endGroup(child);
    if (made) {
      // Made only to read the models, never the person's: its id is not kept.
      await deleteAgyConversation(accountStore(accountId), made, false);
    }
  }
};
