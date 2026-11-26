/**
 * What each Antigravity account on this machine offers: the models agy's
 * `session/new` lists for it, read live in the account's own home with its
 * own method, never a list kept by CawCo (a Gemini API key's account lists
 * Gemini alone). The read opens one session and asks nothing of it; the
 * conversation it made is removed from the home after.
 */
import { existsSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { client, methods } from "@agentclientprotocol/sdk";
import { boundedRead } from "@cawco/core/effect/bounded";
import type { ModelInfo } from "@cawco/core/harness/kinds";
import { accountsRoot } from "@cawco/core/paths/claude";
import { AGY_APP_DATA, agyAccountRecord } from "@cawco/core/paths/harnesses";
import { runtimeVersion } from "@cawco/core/runtime";
import { Effect } from "effect";
import { modelsOf } from "./agy-frames";
import {
  agyArgs,
  agyEnvironment,
  agyToStart,
  endGroup,
  prepareAgyHome,
  readAgySignIn,
  signInAcp,
  startAcp,
} from "./agy-launch";

/** The accounts with an Antigravity record on this machine. */
export const agyAccountIds = (): string[] => {
  try {
    return readdirSync(accountsRoot(), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() && existsSync(agyAccountRecord(entry.name))
      )
      .map((entry) => entry.name)
      .toSorted();
  } catch {
    return [];
  }
};

/** How long one account's read may take: agy starts in about a second and a half (§P, "Cost of a process"). */
const READ_MS = 30_000;

/** Account `accountId`'s models as agy lists them, read in its own home; refused in words when it cannot be read. */
export const agyAccountModels = async (
  accountId: string
): Promise<ModelInfo[]> => {
  const { bin, signIn, home } = await Effect.runPromise(
    Effect.gen(function* () {
      const agy = yield* agyToStart();
      const read = yield* readAgySignIn(accountId);
      const prepared = yield* prepareAgyHome(accountId, read);
      return { bin: agy.bin, signIn: read, home: prepared };
    }).pipe(Effect.mapError((refused) => new Error(refused.message)))
  );
  const { child, connection } = startAcp(
    { bin, args: agyArgs(home), env: agyEnvironment(signIn, {}), cwd: home },
    client({ name: "cawco" }),
    { said: () => undefined, ended: () => undefined }
  );
  let made: string | undefined;
  try {
    // The promise edge of one bounded read of agy.
    return await Effect.runPromise(
      boundedRead(
        READ_MS,
        Effect.promise(async () => {
          await signInAcp(connection, signIn.method, runtimeVersion);
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
      await removeConversation(home, made);
    }
  }
};

/** The conversation `sessionId` agy made in `home`, removed: its store and its working files. */
const removeConversation = async (
  home: string,
  sessionId: string
): Promise<void> => {
  const data = join(home, AGY_APP_DATA);
  await rm(join(data, "conversations", `${sessionId}.db`), { force: true });
  await rm(join(data, "brain", sessionId), { recursive: true, force: true });
};
