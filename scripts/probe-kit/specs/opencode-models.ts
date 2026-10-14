/**
 * An OpenCode session CawCo starts runs on the model catalog as it is now,
 * with the same result as OpenCode run on that catalog, and a delegate on a
 * model the machine does not offer is refused at once, naming what it does.
 *
 * A scratch fleet (real hub, agent, sessiond, and CawCo's OpenCode server
 * with its plugin) whose agent reads OpenCode's catalog from a stand-in on
 * loopback (`OPENCODE_MODELS_URL`, which CawCo reads as OpenCode does): the
 * live catalog, or the same with Zen's models still at
 * `https://opencode.ai/zen/v1`, as the catalog was before 2026-10-12 and as a
 * server that kept an old copy still ran it on 2026-10-14. Zen's free tier is
 * real and keyless (`opencode/big-pickle`).
 *
 * (a) On the old catalog, a session's first turn is refused by Zen: "free
 *     tier can only be used from within OpenCode" (the owner's failure).
 * (b) The stand-in serves the live catalog: the next new session confirms
 *     it, the machine's server is replaced on it, and the session answers.
 * (c) The stand-in down: a new session is refused, in words naming the
 *     catalog it could not read, and runs nothing.
 * (d) A delegate on a model the machine does not offer is refused (400)
 *     naming the models it offers; one on a model it offers passes that
 *     check (its workspace may still fail to start where this runs).
 *
 *   bun scripts/probe-kit/run.ts opencode-models
 */
import { createHash } from "node:crypto";
import { MACHINE, MODEL, until } from "../../scratch-fleet";
import type { KitFleet, Spec } from "../kit";

/** Zen's free model: keyless. */
const FREE_MODEL = "opencode/big-pickle";

/** The proxy settings a CawCo workspace's processes reach public hosts through, passed on when this runs in one. */
const PROXY_ENV = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
];

/** A warning or error line of the OpenCode server's log. */
const SERVER_WARNING = /level=(WARN|ERROR)/;

/** How long a free-tier answer may take. */
const ANSWER_MS = 240_000;

/** Zen's endpoint today, and the one it refuses its free tier on. */
const INFERENCE = "https://opencode.ai/inference/v1";
const ZEN = "https://opencode.ai/zen/v1";

interface Block {
  content?: string;
  type?: string;
}

/** A word only this prompt carries. */
const freshWord = () => `PROBE${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

const ask = (word: string) =>
  `Reply with exactly this word and nothing else, and use no tools: ${word}`;

/** What became of a session's prompt: its answer carrying the word, or its error with what there was to see. */
type Outcome = { reply: string } | { error: string; seen: unknown };

const outcomeOf = async (
  fleet: KitFleet,
  instanceId: string,
  word: string
): Promise<Outcome> => {
  const transcript = () =>
    fleet.api<{ blocks: Block[] }>(`/api/instances/${instanceId}/transcript`);
  try {
    return await until<Outcome | undefined>(
      `${instanceId}'s answer`,
      async () => {
        const lastError = fleet.instance(instanceId)?.last_error;
        if (lastError) {
          return { error: lastError, seen: null };
        }
        const { blocks } = await transcript();
        const reply = blocks.find(
          (block) =>
            block.type === "assistant" && (block.content ?? "").includes(word)
        );
        if (reply) {
          return { reply: reply.content ?? "" };
        }
        // A turn's error is drawn on the send it failed, not as a block of its own.
        const failed = blocks.find((block) =>
          JSON.stringify(block).includes("free tier")
        );
        return failed
          ? { error: JSON.stringify(failed).slice(0, 600), seen: null }
          : undefined;
      },
      Boolean,
      ANSWER_MS
    ).then((found) => found as Outcome);
  } catch (error) {
    const page = await transcript().catch(() => ({ blocks: [] as Block[] }));
    return {
      error: String(error),
      seen: {
        transcript: page.blocks.map(blockLine),
        server: (
          await Bun.file(`${fleet.home}/.local/share/opencode/log/opencode.log`)
            .text()
            .catch(() => "")
        )
          .split("\n")
          .filter((line) => SERVER_WARNING.test(line))
          .slice(-10)
          .map((line) => line.slice(0, 300)),
      },
    };
  }
};

const blockLine = (one: Block) =>
  `${one.type}: ${(one.content ?? "").slice(0, 300)}`;

/** A person's spawn, read back as soon as the session runs or its start failed. */
const spawnRead = async (
  fleet: KitFleet,
  title: string,
  model: string
): Promise<{ instanceId: string; failed: string | null }> => {
  const instanceId = crypto.randomUUID();
  await fleet.post({
    verb: "spawn",
    machineId: MACHINE,
    instanceId,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId,
      cwd: fleet.workdir,
      harness: "opencode",
      model,
      title,
      permissionMode: "bypassPermissions",
    },
  });
  const row = await until(
    `${title} running or refused`,
    () => fleet.instance(instanceId),
    (one) => one?.status === "running" || Boolean(one?.last_error),
    240_000
  );
  return {
    instanceId,
    failed: row.status === "running" ? null : row.last_error,
  };
};

/** The machine's OpenCode models as the hub holds its last report. */
const reportedModels = async (fleet: KitFleet): Promise<string[]> => {
  const rows =
    await fleet.api<
      {
        machineId: string;
        harnesses?: { harness: string; models?: { value: string }[] }[];
      }[]
    >("/api/agents");
  return (
    rows
      .find((row) => row.machineId === MACHINE)
      ?.harnesses?.find((one) => one.harness === "opencode")
      ?.models?.map((one) => one.value) ?? []
  );
};

const spec: Spec = {
  name: "opencode-models",
  run: async (kit) => {
    // ── The catalog stand-in ─────────────────────────────────────────────
    const live = await (
      await fetch("https://models.opencode.ai/api.json")
    ).text();
    if (!live.includes(INFERENCE)) {
      throw new Error(`the live catalog names no ${INFERENCE}`);
    }
    const old = live.replaceAll(INFERENCE, ZEN);
    let serving: "old" | "live" | "down" = "old";
    const tag = (text: string) =>
      `"${createHash("sha256").update(text).digest("hex").slice(0, 16)}"`;
    const reads: string[] = [];
    const catalog = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        reads.push(serving);
        if (serving === "down") {
          return new Response("stand-in: the catalog is down", {
            status: 503,
          });
        }
        const text = serving === "old" ? old : live;
        const etag = tag(text);
        if (request.headers.get("if-none-match") === etag) {
          return new Response(null, { status: 304, headers: { etag } });
        }
        return new Response(text, {
          headers: { "content-type": "application/json", etag },
        });
      },
    });

    try {
      const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["mock"] }));
      // The agent holds the catalog, from the stand-in: the fleet's own
      // default (the bundled snapshot, for its mock) is not what a machine runs.
      // biome-ignore lint/performance/noDelete: the services get this record as their environment, where a key set to anything (an empty string too) turns the fetch off
      delete fleet.env.OPENCODE_DISABLE_MODELS_FETCH;
      fleet.env.OPENCODE_MODELS_URL = `http://127.0.0.1:${catalog.port}`;
      // A workspace reaches public hosts only through its boundary's proxy.
      for (const name of PROXY_ENV) {
        const value = process.env[name];
        if (value) {
          fleet.env[name] = value;
        }
      }
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.launch("agent");
      await fleet.agentUp();

      // (a) The old catalog: Zen refuses its free tier at /zen/v1.
      const before = freshWord();
      const first = await spawnRead(fleet, "old catalog", FREE_MODEL);
      if (!first.failed) {
        await fleet.send(first.instanceId, ask(before));
      }
      const refused = first.failed
        ? { error: first.failed, seen: null }
        : await outcomeOf(fleet, first.instanceId, before);
      kit.check(
        "(a) on the old catalog, Zen refuses the free model: the owner's failure",
        "error" in refused && refused.error.includes("free tier"),
        JSON.stringify(refused)
      );

      // (b) The live catalog: the next session runs on it.
      serving = "live";
      const after = freshWord();
      const second = await spawnRead(fleet, "live catalog", FREE_MODEL);
      if (!second.failed) {
        await fleet.send(second.instanceId, ask(after));
      }
      const answered = second.failed
        ? { error: second.failed, seen: null }
        : await outcomeOf(fleet, second.instanceId, after);
      kit.check(
        "(b) once the catalog changes, the next session confirms it, its server restarts on it, and it answers",
        "reply" in answered,
        JSON.stringify(answered)
      );
      const applied = (await fleet.logs("agent"))
        .split("\n")
        .filter(
          (line) =>
            line.includes('"config-convergence"') && line.includes("applied")
        );
      kit.check(
        "(b) the machine's server was replaced on the new catalog",
        applied.length >= 2,
        applied.map((line) => line.slice(0, 200)).join(" | ")
      );

      // (c) The catalog cannot be read: nothing runs on the held copy.
      serving = "down";
      const third = await spawnRead(fleet, "catalog down", FREE_MODEL);
      kit.check(
        "(c) with the catalog unreadable, a new session is refused in words and runs nothing",
        (third.failed ?? "").includes("model catalog could not be read") &&
          (third.failed ?? "").includes("nothing was started"),
        `${third.failed ?? "it started"}; catalog reads: ${reads.join(",")}`
      );
      serving = "live";

      // (d) A delegate's model, judged by what the machine offers.
      const offered = await until(
        "the machine's OpenCode models reported",
        () => reportedModels(fleet),
        (models) => models.includes(FREE_MODEL),
        120_000
      );
      const project = await fleet.api<{ id: string }>("/api/projects", {
        name: "OpenCode models",
        machineId: MACHINE,
        cwd: fleet.repo,
      });
      const parent = await fleet.spawn(
        "opencode",
        "models parent",
        fleet.repo,
        { model: MODEL.opencode, projectId: project.id }
      );
      const delegate = async (model: string) => {
        const response = await fetch(`${fleet.base}/api/work-items`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            parentInstanceId: parent,
            title: `Answer on ${model}`,
            prompt: ask(freshWord()),
            harness: "opencode",
            model,
            cwd: fleet.repo,
            checks: [{ name: "Probe check", command: "true" }],
          }),
          signal: AbortSignal.timeout(120_000),
        });
        return { status: response.status, text: await response.text() };
      };
      const gone = await delegate(`${FREE_MODEL}-retired`);
      kit.check(
        "(d) a delegate on a model the machine does not offer is refused, naming what it offers",
        gone.status === 400 &&
          gone.text.includes("does not offer") &&
          gone.text.includes(FREE_MODEL) &&
          gone.text.includes("Nothing was started"),
        `${gone.status} ${gone.text}`
      );
      const kept = await delegate(FREE_MODEL);
      kit.check(
        "(d) a delegate on a model the machine offers passes that check",
        !kept.text.includes("does not offer"),
        `${kept.status} ${kept.text.slice(0, 300)}; offered: ${offered.length} models`
      );
    } finally {
      await catalog.stop(true);
    }
  },
};

export default spec;
