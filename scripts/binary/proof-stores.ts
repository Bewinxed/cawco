/**
 * The agent's stores thread (packages/agent/src/stores/), asked inside the
 * compiled binary as `cawco proof-stores` (proof-runtime.ts): the thread
 * starts from the binary's embedded entry (build-binary.ts,
 * ./scripts/binary/stores-worker.js), and the transcript index it holds
 * parses new transcripts on worker threads of its own, started from inside
 * it (jsonl-parser pool.ts `workerUrl`), as in a shipped agent.
 *
 * In its scratch HOME: {@link FILES} stored Claude transcripts, each saying
 * {@link WORD}. Asked: OpenCode's own sign-ins (none here: "absent"), the
 * index opened, synced and searched for the word, and a usage scan. Exits
 * 0 with one JSON line of what each answered, or throws.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { storeRead, storeWork } from "../../packages/agent/src/stores/client";
import { claudeHome } from "../../packages/core/src/paths";

/** Transcripts written: more than one, so the index parses them on threads of its own. */
export const FILES = 4;
/** A word only these transcripts say. */
export const WORD = "wombatquill";

const transcript = (sessionId: string): string =>
  `${[0, 1]
    .map((at) =>
      JSON.stringify({
        type: at === 0 ? "user" : "assistant",
        uuid: crypto.randomUUID(),
        parentUuid: null,
        sessionId,
        cwd: "/proof",
        timestamp: new Date(Date.UTC(2026, 9, 25) + at * 1000).toISOString(),
        isSidechain: false,
        message:
          at === 0
            ? { role: "user", content: `find the ${WORD} here` }
            : {
                id: `msg_${sessionId}`,
                type: "message",
                role: "assistant",
                model: "claude-haiku-4-5",
                content: [{ type: "text", text: "found" }],
                usage: { input_tokens: 10, output_tokens: 20 },
              },
      })
    )
    .join("\n")}\n`;

export const proveStores = async (): Promise<void> => {
  const project = join(claudeHome(), "projects", "-proof-stores");
  await mkdir(project, { recursive: true });
  const ids = Array.from({ length: FILES }, () => crypto.randomUUID());
  await Promise.all(
    ids.map((id) => writeFile(join(project, `${id}.jsonl`), transcript(id)))
  );
  const rows = await storeRead("opencode.ownRows", undefined, 10_000);
  const through = await storeWork("search.open", undefined);
  await storeWork("search.sync", Date.now());
  const found = await storeRead(
    "search.search",
    { query: WORD, options: { limit: 20 } },
    10_000
  );
  const usage = await storeWork("usage.scan", Date.now());
  const sessions =
    found.kind === "answered"
      ? new Set(found.value.map((hit) => hit.sessionId))
      : new Set<string>();
  const said = {
    signIns: rows.kind === "answered" ? rows.value : rows,
    indexedThroughBefore: through,
    found: ids.filter((id) => sessions.has(id)).length,
    usageBuckets: usage.buckets.length,
  };
  console.log(JSON.stringify(said));
  if (said.signIns !== "absent" || said.found !== FILES) {
    throw new Error(
      `the stores thread answered wrong: ${JSON.stringify(said)}`
    );
  }
};
