import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { extname, join } from "node:path";
import {
  client,
  methods,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import { AGY_APP_DATA } from "@cawco/core/paths/harnesses";
import { runtimeVersion } from "@cawco/core/runtime";
import { cutShort, lastLines } from "@cawco/core/words/helpers";
import { imageGenerationWords } from "@cawco/core/words/image-generation";
import { Clock, Effect, type Scope } from "effect";
import { runPromise } from "../daemon-runtime";
import { agyHookHeld, onCheapestModel } from "../harnesses/agy-canary";
import { promptAnswer } from "../harnesses/agy-frames";
import { serveAgyJudge } from "../harnesses/agy-hook";
import { agyImageRunAnswerTo } from "../harnesses/agy-judge";
import {
  AGY_SPEC,
  agyLaunch,
  endGroup,
  readAgySignIn,
  signedInAt,
  signInAcp,
  startAcp,
} from "../harnesses/agy-launch";
import { turnFault } from "../harnesses/agy-outcome";
import {
  accountStore,
  agyAccountIds,
  deleteAgyConversation,
  deleteImplicitTrajectories,
  implicitTrajectories,
} from "../harnesses/agy-store-files";
import { fromPromise } from "../rejected";
import { toolGate } from "../tools";
import { ratioOf } from "./aspect";
import {
  type ImageJob,
  type ImageProvider,
  type ImageRunFailed,
  imageRunFailed,
  type MadeImage,
} from "./provider";

/**
 * Gemini through Google's own Antigravity CLI (`agy`), on an Antigravity
 * account of this machine, by that account's own sign-in method. CawCo runs
 * the `agy` binary over its published ACP interface (`agy acp`), launched
 * as every Antigravity session of the account is (agent
 * harnesses/agy-launch.ts `agyLaunch`: the account's agy home and
 * environment, telemetry off), and reads what it says and the files it
 * writes: it makes no request to Google of its own and never reads or holds
 * the account's Google login.
 *
 * A run is held to what a session on the account is: it starts only once
 * the account's hook is proven to hold (agy-canary.ts `agyHookHeld`), and
 * its main agent, which only hands the job on, runs on the account's
 * cheapest Google model at its lowest thinking level (agy-canary.ts
 * `onCheapestModel`); the image's model is agy's subagent's own.
 *
 * One run is one ACP session in the account's home, with a folder of its
 * own as the session's folder, where agy's log of the run is written too. The home's one hook asks the run's own
 * judge, which lets the main agent hand the image to agy's
 * `image-generator` subagent, that subagent's `generate_image` run on the
 * run's references, and reads of the run's folder, and denies the rest
 * (agy-judge.ts `agyImageRunAnswerTo`). The image is found by its bytes
 * ({@link madeImage}), and the run's conversations, its own and its
 * subagent's, and the implicit trajectory its agy wrote as it started are
 * removed from the home as the run ends, so an image run never shows as a
 * conversation and leaves nothing of itself in the home.
 */

/**
 * What agy is asked: one image, handed to its built-in `image-generator`
 * subagent, the one holder of `generate_image` on agy 1.5.18 (its main
 * agent of an ACP session has none: the project's
 * `assets/bbb39c69/declared-tools.out`), with the references (`paths`,
 * numbered as the job's prompt names them) as that call's `ImagePaths`.
 * That subagent "Pass[es] source or reference images via ImagePaths" and
 * makes "at most 3 attempts per image" (its system prompt, in the agy 1.5.1
 * binary), so the image's brief is written once, to go word for word to
 * it, and holds it to one call.
 */
const promptOf = (job: ImageJob, paths: string[]): string => {
  const ratio = ratioOf(job.size);
  const brief = [
    `The image: ${job.prompt}`,
    ...(ratio ? [`Aspect ratio: ${ratio}.`] : []),
    ...(paths.length
      ? [
          [
            "Reference images, numbered as the image above names them:",
            ...paths.map((path, index) => `Image ${index + 1}: ${path}`),
          ].join("\n"),
          `Pass them as generate_image's ImagePaths, exactly these paths in this order: ${JSON.stringify(paths)}.`,
        ]
      : []),
    "Call generate_image once and do not retry, then give the absolute path of the saved image.",
  ];
  return [
    "Make exactly one image, then stop. Hand it to your image-generator subagent with one invoke_subagent call whose brief is the text between the two --- lines, word for word.",
    "---",
    ...brief,
    "---",
    "Do not edit files, run commands or make anything else. Wait until the image is saved, then answer with the absolute path of the saved image file.",
  ].join("\n\n");
};

/** The extension each reference type is written under, for agy to read it by. */
const REFERENCE_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * Each reference written into the run's own folder, as
 * `reference-<n>.<ext>` in the job's order, and its absolute path: the
 * run's session works in that folder, its judge lets it read nothing else,
 * and the bytes it reads are the ones the orchestration admitted and
 * checked.
 */
const writeReferences = async (
  cwd: string,
  references: ImageJob["references"]
): Promise<string[]> =>
  await Promise.all(
    references.map(async (reference, index) => {
      const path = join(
        cwd,
        `reference-${index + 1}${REFERENCE_EXTENSIONS[reference.mime] ?? ""}`
      );
      await writeFile(path, reference.bytes, { mode: 0o600 });
      return path;
    })
  );

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

/** Each image file under `dir`, written since `since` (ms epoch), newest first. */
const imagesUnder = async (dir: string, since: number): Promise<string[]> => {
  const names = await readdir(dir, { recursive: true }).catch(() => []);
  const found: { mtime: number; path: string }[] = [];
  for (const name of names) {
    const path = join(dir, name);
    if (!IMAGE_EXTENSIONS.has(extname(path).toLowerCase())) {
      continue;
    }
    const info = await stat(path).catch(() => undefined);
    if (info?.isFile() && info.mtimeMs >= since) {
      found.push({ path, mtime: info.mtimeMs });
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime).map((one) => one.path);
};

/**
 * The image the run made, its bytes: the newest image file written since
 * the run started in its conversation's folder or the run's own folder,
 * never one whose bytes are a reference's. agy writes its image in its
 * conversation's folder (`<app-data>/brain/<session>/<name>_<time>.jpg`,
 * measured on agy 1.5.0, 2026-11-04), not where it is asked, and CawCo
 * writes the references in the run's own folder after the run's start: a
 * run that made nothing would otherwise answer one of them back as its
 * image (a reference's pixels returned when agy's tool call failed,
 * measured on agy 1.5.1, 2026-11-05). So what counts as agy's is decided
 * by its bytes, which no name, folder or copy of agy's changes.
 */
const madeImage = async (
  places: readonly string[],
  since: number,
  references: ImageJob["references"]
): Promise<Buffer | undefined> => {
  const found = (
    await Promise.all(places.map((place) => imagesUnder(place, since)))
  ).flat();
  for (const path of found) {
    const bytes = await readFile(path).catch(() => undefined);
    if (
      bytes &&
      !references.some((reference) => reference.bytes.equals(bytes))
    ) {
      return bytes;
    }
  }
  return undefined;
};

/** An id agy gives a conversation: a UUID. */
const CONVERSATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Every conversation a run made: its session's, and each its hook was called from. */
const conversationsOf = (heard: {
  conversations: ReadonlySet<string>;
  sessionId?: string;
}): Set<string> =>
  new Set([
    ...(heard.sessionId === undefined ? [] : [heard.sessionId]),
    ...heard.conversations,
  ]);

/** agy's log of one run, in the run's folder (`--log-file`), so it goes with the folder. */
const RUN_LOG = "agy.log";

/** How long agy is given to end once signalled, before the run lets it go. */
const AGY_END_MS = 10_000;

/** What agy says when it is out of quota, and failed inside Google's service (measured on Plus). */
const QUOTA = /RESOURCE_EXHAUSTED|code 429/u;
const INTERNAL = /INTERNAL \(code 500\)|\b500 INTERNAL\b/u;

/** The last lines of what agy said, for a sentence. */
const tailOf = (text: string): string =>
  cutShort(lastLines(Bun.stripANSI(text).trim().split("\n"), 4, " / "), 600);

/** How a run that made no image ended: its stop reason, its error, and what agy said. */
interface RunEnd {
  /** The turn's error in agy's or Google's words, when it ended on one. */
  readonly error: string;
  /** Whether the account's quota is spent, as agy's store says (agy-outcome.ts `turnFault`). */
  readonly limit: boolean;
  /** What the agent answered, and the tail of agy's stderr. */
  readonly said: string;
  readonly stopReason: string;
}

/**
 * A run that ended with no image, as a refusal in words, by what agy said,
 * so a limit of agy's own (a tool call it refused) reaches the person in
 * its words.
 */
const noImage = (end: RunEnd): Error => {
  const all = `${end.error}\n${end.said}`;
  if (end.limit || QUOTA.test(all)) {
    return new Error(imageGenerationWords.agyQuota(end.error || end.said));
  }
  if (INTERNAL.test(all)) {
    return new Error(imageGenerationWords.agyInternal(end.error || end.said));
  }
  return new Error(
    imageGenerationWords.agyNoImage(end.stopReason, end.error, end.said)
  );
};

/** An error an ACP request ended on, in its words and the data it carries. */
const errorWords = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const data = "data" in error ? error.data : undefined;
  return data === undefined
    ? error.message
    : `${error.message} ${typeof data === "string" ? data : JSON.stringify(data)}`;
};

/**
 * One run on account `accountId`: a folder of its own with the job's
 * references in it ({@link writeReferences}), the account's agy started
 * over ACP as its sessions are, the run's judge answering its hook, one
 * session asked for one image. The image is found where agy wrote it
 * ({@link madeImage}), whatever the turn's end; a turn that ended in an
 * error after writing it is said in a note. agy, its judge, the run's
 * folder and the conversation it made are all gone as the run ends, done
 * or interrupted.
 */
const runAgy = Effect.fn("runAgy")(function* (
  accountId: string,
  job: ImageJob
): Effect.fn.Return<MadeImage, ImageRunFailed, Scope.Scope> {
  const cwd = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => mkdtemp(join(tmpdir(), "cawco-agy-image-")),
      catch: imageRunFailed,
    }),
    (folder) =>
      fromPromise(() => rm(folder, { recursive: true, force: true })).pipe(
        Effect.catch((error) =>
          Effect.logWarning(
            `[image] the run's folder ${folder} was not removed: ${error.message}`
          )
        )
      )
  );
  const since = (yield* Clock.currentTimeMillis) - 1000;
  const paths = yield* Effect.tryPromise({
    try: () => writeReferences(cwd, job.references),
    catch: imageRunFailed,
  });
  // The account's hook, proven before agy starts, as a session's is: an
  // account whose hook does not hold runs no image either.
  yield* agyHookHeld(accountId).pipe(Effect.mapError(imageRunFailed));
  const store = accountStore(accountId);
  const log = join(cwd, RUN_LOG);
  const launch = yield* agyLaunch(
    accountId,
    `image-${crypto.randomUUID()}`,
    {},
    false,
    undefined
  ).pipe(Effect.mapError(imageRunFailed));
  /**
   * What the run heard: its session once opened, every conversation its
   * hook was called from (its own and its subagent's), the implicit
   * trajectories that appeared as its agy started, the agent's words, agy's
   * last stderr line.
   */
  const heard: {
    conversations: Set<string>;
    implicit: Set<string>;
    sessionId?: string;
    stderr: string;
    text: string;
  } = { conversations: new Set(), implicit: new Set(), text: "", stderr: "" };
  yield* serveAgyJudge(launch.judgeSocket, (line) =>
    // An answer of the run's own, at once (the server takes a promise).
    Promise.resolve(
      agyImageRunAnswerTo(line, cwd, (conversationId) => {
        // Only an id agy makes names a folder the run removes.
        if (CONVERSATION_ID.test(conversationId)) {
          heard.conversations.add(conversationId);
        }
      })
    )
  ).pipe(Effect.mapError(imageRunFailed));
  // The conversations and implicit trajectories the run made, gone once agy
  // has ended (the finalizer below this one runs first): none is a
  // session's of the person's. Set before the session opens, so a run
  // interrupted mid-turn removes them too. Each conversation is kept out of
  // the home's shared files from now on, as a session's agy running on the
  // same home may write it back (agy-store-files.ts).
  yield* Effect.addFinalizer(() =>
    fromPromise(async () => {
      await Promise.all(
        [...conversationsOf(heard)].map((id) =>
          deleteAgyConversation(store, id)
        )
      );
      await deleteImplicitTrajectories(store, heard.implicit);
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning(
          `[image] the run's conversations were not removed: ${error.message}`
        )
      )
    )
  );
  // agy writes an implicit trajectory as it starts, before any session
  // opens: the ones that appear from just before its start until its
  // session has opened are the run's (agy-store-files.ts
  // `implicitTrajectories`).
  const implicitBefore = yield* Effect.promise(() =>
    implicitTrajectories(store)
  );
  /** The implicit trajectories new since {@link implicitBefore}, noted as the run's. */
  const noteImplicit = Effect.promise(async () => {
    for (const id of await implicitTrajectories(store)) {
      if (!implicitBefore.has(id)) {
        heard.implicit.add(id);
      }
    }
  });
  // The keyring guard's reading (agy-launch.ts `refuseKeyring`), as agy is
  // about to start.
  const signedIn = yield* fromPromise(() => signedInAt(launch.home)).pipe(
    Effect.mapError(({ cause }) => imageRunFailed(cause))
  );
  const startedAt = Date.now();
  const { child, connection } = yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        startAcp(
          {
            bin: launch.bin,
            args: [...launch.args, "--log-file", log],
            env: launch.env,
            cwd,
          },
          client({ name: "cawco" }).onNotification(
            methods.client.session.update,
            ({ params }: { params: SessionNotification }) => {
              const { update } = params;
              if (
                params.sessionId === heard.sessionId &&
                update.sessionUpdate === "agent_message_chunk" &&
                update.content.type === "text"
              ) {
                heard.text += update.content.text;
              }
            }
          ),
          {
            said: (text) => {
              // A failure quotes agy's last line: its last words before it ended.
              const lines = text.split("\n").filter((line) => line.trim());
              heard.stderr = lines.at(-1) ?? heard.stderr;
            },
            ended: () => undefined,
          }
        ),
      catch: imageRunFailed,
    }),
    (started) =>
      Effect.sync(() => {
        started.connection.close();
        endGroup(started.child);
      }).pipe(
        // Its end waited on, so nothing it still writes outlives the
        // conversation's removal.
        Effect.andThen(Effect.promise(() => started.child.exited)),
        Effect.timeoutOption(AGY_END_MS)
      )
  );
  yield* Effect.tryPromise({
    try: () =>
      signInAcp(connection, launch.methodId, runtimeVersion, {
        end: () => endGroup(child),
        home: launch.home,
        log,
        signedIn,
        since: startedAt,
      }),
    catch: imageRunFailed,
  }).pipe(Effect.ensuring(noteImplicit));
  const opened = yield* Effect.tryPromise({
    try: () =>
      connection.agent.request(methods.agent.session.new, {
        cwd,
        mcpServers: [],
      }),
    catch: imageRunFailed,
  }).pipe(Effect.ensuring(noteImplicit));
  heard.sessionId = opened.sessionId;
  const model = yield* Effect.tryPromise({
    try: () => onCheapestModel(connection, opened),
    catch: imageRunFailed,
  });
  if (model === undefined) {
    return yield* Effect.fail(
      imageRunFailed(new Error(imageGenerationWords.agyNoCheapModel))
    );
  }
  const answered = yield* fromPromise(() =>
    connection.agent.request(methods.agent.session.prompt, {
      sessionId: opened.sessionId,
      prompt: [{ type: "text", text: promptOf(job, paths) }],
    })
  ).pipe(
    Effect.map((answer) => ({ answer, error: "" })),
    Effect.catch(({ cause }) =>
      Effect.succeed({ answer: undefined, error: errorWords(cause) })
    )
  );
  const bytes = yield* Effect.tryPromise({
    try: () =>
      madeImage(
        [
          ...[...conversationsOf(heard)].map((id) =>
            join(launch.home, AGY_APP_DATA, "brain", id)
          ),
          cwd,
        ],
        since,
        job.references
      ),
    catch: imageRunFailed,
  });
  const { stopReason } = promptAnswer(answered.answer);
  const fault = turnFault(
    { home: launch.home, own: false },
    opened.sessionId,
    -1,
    stopReason,
    yield* Clock.currentTimeMillis
  );
  const failure = answered.error || fault?.words || "";
  if (!bytes) {
    return yield* Effect.fail(
      imageRunFailed(
        noImage({
          stopReason,
          error: failure,
          limit: fault?.atLimit === true,
          said: [tailOf(heard.text), tailOf(heard.stderr)]
            .filter(Boolean)
            .join(" / "),
        })
      )
    );
  }
  return {
    bytes,
    notes: failure ? [imageGenerationWords.agyEndedAfterImage(failure)] : [],
  };
}, Effect.scoped);

/**
 * The account a run goes on, the first of this machine's Antigravity
 * accounts whose sign-in method is whole here (agy-launch.ts
 * `readAgySignIn`), of any method; none, and why each is not, in words.
 * Never another account once a run has begun on one: CawCo does not rotate
 * accounts (tsk-340, "Compliance posture").
 */
const accountToRun = async (): Promise<
  { accountId: string } | { reason: string }
> => {
  const accounts = agyAccountIds();
  if (!accounts.length) {
    return { reason: imageGenerationWords.agyNoAccount(hostname()) };
  }
  const refused: string[] = [];
  for (const accountId of accounts) {
    const read = await runPromise(
      readAgySignIn(accountId).pipe(
        Effect.as(undefined),
        Effect.catch((why) => Effect.succeed(why.message))
      )
    );
    if (read === undefined) {
      return { accountId };
    }
    refused.push(read);
  }
  return { reason: imageGenerationWords.agyNoUsableAccount(refused) };
};

/**
 * The pre-flight, spending nothing: agy is installed here at a version
 * CawCo runs, and an Antigravity account of this machine has its sign-in
 * method whole ({@link accountToRun}). Whether agy's sign-in still holds is
 * agy's own answer as the run signs in, and a plan that makes no images
 * (Plus, Free) is refused by the run itself, in words ({@link noImage}).
 */
async function readiness(): ReturnType<ImageProvider["readiness"]> {
  const gate = await toolGate(AGY_SPEC);
  if (gate.refused === "not-installed") {
    return {
      ready: false,
      reason: imageGenerationWords.agyMissing(hostname()),
    };
  }
  if (gate.refused) {
    return {
      ready: false,
      reason: imageGenerationWords.agyNotRunnable(gate.words ?? gate.refused),
    };
  }
  const account = await accountToRun();
  if ("reason" in account) {
    return { ready: false, reason: account.reason };
  }
  return {
    ready: true,
    notes: [imageGenerationWords.agyPlanUnread],
    generate: (job) =>
      runAgy(account.accountId, job).pipe(
        Effect.map((made) => ({
          bytes: made.bytes,
          notes: [
            ...(job.quality === "auto"
              ? []
              : [
                  imageGenerationWords.qualityIgnored(
                    "antigravity",
                    job.quality
                  ),
                ]),
            ...made.notes,
          ],
        }))
      ),
  };
}

/**
 * The most references agy's `generate_image` tool takes: its `ImagePaths`
 * holds at most 3, under the 14 its model takes on the Gemini API. A call
 * with 14 came back from agy 1.5.1 as "Error invalid tool call: invalid
 * arguments: - at '/ImagePaths': maxItems: got 14, want 3" (its
 * image-generator subagent's transcript, obelisk, 2026-11-05).
 */
// @limit external: agy 1.5.1's generate_image `ImagePaths` holds at most 3 (maxItems: got 14, want 3, its subagent's transcript, 2026-11-05)
const AGY_MAX_REFERENCES = 3;

/**
 * agy's model is Gemini's; no limit of agy's own on a reference file is
 * documented, so the Gemini API's inline request of 20 MB stands for one
 * reference and for all of them together.
 */
const AGY_REFERENCE_BYTES = 20 * 1000 * 1000;

/**
 * Gemini through an Antigravity account of this machine: one model, Nano
 * Banana 2 (core `IMAGE_PROVIDER_MODELS`), at most
 * {@link AGY_MAX_REFERENCES} references; JPEG as it makes it.
 */
export const antigravity: ImageProvider = {
  id: "antigravity",
  references: AGY_MAX_REFERENCES,
  referenceBytes: { each: AGY_REFERENCE_BYTES, total: AGY_REFERENCE_BYTES },
  readiness,
};
