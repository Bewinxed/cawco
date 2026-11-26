/**
 * What each Antigravity account on this machine offers: the models agy's
 * `session/new` lists for it, read live in the account's own home with its
 * own method, never a list kept by CawCo (a Gemini API key's account lists
 * Gemini alone). The read opens one session and asks nothing of it; the
 * conversation it made is removed from the home after.
 */
import { client, methods } from "@agentclientprotocol/sdk";
import { boundedRead } from "@cawco/core/effect/bounded";
import type { ModelInfo } from "@cawco/core/harness/kinds";
import { runtimeVersion } from "@cawco/core/runtime";
import { Effect } from "effect";
import { runPromise } from "../daemon-runtime";
import { fromPromise } from "../rejected";
import { modelsOf } from "./agy-frames";
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
  const { child, connection } = startAcp(
    {
      bin,
      args: agyArgs(home),
      env: agyEnvironment(signIn, home, {}),
      cwd: home,
    },
    client({ name: "cawco" }),
    { said: () => undefined, ended: () => undefined }
  );
  let made: string | undefined;
  try {
    // The promise edge of one bounded read of agy.
    return await runPromise(
      boundedRead(
        READ_MS,
        fromPromise(async () => {
          await signInAcp(connection, signIn.method, runtimeVersion, {
            end: () => endGroup(child),
            home,
            signedIn,
            since,
          });
          const answer = await connection.agent.request(
            methods.agent.session.new,
            { cwd: home, mcpServers: [] }
          );
          made = answer.sessionId;
          await connection.agent
            .request(methods.agent.session.close, { sessionId: made })
            .catch(() => undefined);
          return modelsOf(answer);
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
