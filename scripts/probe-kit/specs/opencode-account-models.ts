/**
 * A machine given an account of a provider OpenCode runs offers that
 * provider's models with no session started, and a session on one of them
 * sends. On 2026-11-06 niftybot.art, given the fleet's OpenCode Go key, kept
 * offering OpenCode's free models alone: an account's provider was listed
 * only as a session on the account started the account's server (agent
 * opencode.ts `#catalog`), and the hub refuses a start on a model the
 * machine does not list (server.ts `modelRefusal`), so none ever started.
 *
 * An OpenCode Go key is a key of OpenCode's Console, which opens Go's
 * models and Zen's pay-per-use ones (`opencode/…`) alike ("Point a harness
 * at the Console gateway with an API key to use any paid or Go model",
 * https://opencode.ai/docs/console/harnesses/), and the owner chose
 * (2026-11-06) that a Go key account opens both. Before it, a session on
 * `opencode/deepseek-v4.1-flash` ran on the machine's own server with no
 * key and failed `provider.no-route` (niftybot.art).
 *
 * On a scratch fleet (real hub, agent and sessiond; OpenCode against the
 * mock model), whose OpenCode reads a catalog of OpenCode's two providers
 * as models.dev names them, `opencode-go` and `opencode` (Zen), each with
 * one model, both keyed from `OPENCODE_API_KEY` and served by the mock; the
 * machine has no key for either, so OpenCode lists Zen keyless, its paid
 * models left out:
 *
 * (a) the machine's OpenCode offers neither model before any account;
 * (b) a key account of `opencode-go`, its key written on the machine as the
 *     dashboard writes it (`POST /api/accounts/:id/key`), and the machine's
 *     OpenCode report offers both providers' models, no session started;
 * (c) a session started on the Go model runs on that account, its first
 *     send reaches the provider with the account's key, and is read;
 * (g) so does one started on the Zen model, on the same account and key;
 * (h) an agent whose kept account lists hold Go's alone (as an agent before
 *     a Go key opened Zen left them) lists Zen's from the account's server
 *     once it restarts, no key entered again;
 * (i) the account's usage is read from the fleet's stand-in, with its key:
 *     nothing of the fleet asks opencode.ai (agent usage/opencode-go.ts,
 *     `CAWCO_OPENCODE_BASE_URL`);
 *
 * and the same for pi, whose models.json points pi-ai's built-in `opencode`
 * provider at the mock with one more model, `opencode/mock-zen`:
 *
 * (j) with no account, the machine's pi offers no `opencode/mock-zen`;
 * (k) with the Go key account, it offers it;
 * (l) a pi session on it runs on the Go account, and its first send reaches
 *     the provider with the account's key and is read;
 * (d) with the machine's OpenCode list unread (as a machine that just
 *     installed OpenCode reports it: no `models`, its `modelsUnread`), a
 *     start on a model it does not list is refused at once, saying the
 *     list is unread, and makes no session. On 2026-11-06 niftybot.art's
 *     fresh OpenCode took `opencode/deepseek-v4.1-flash` so, and the
 *     session failed at its first send (`provider.no-route`): the hub
 *     admitted any model on a machine whose rows were empty (core
 *     `unlistedModelRefusal`);
 * (e) with its list read and empty, the same start is refused, saying it
 *     lists none;
 * (f) none of it left OpenCode's shared background service (`opencode
 *     serve --service`, which OpenCode 2.0's CLI starts for any command
 *     that talks to a server without `--standalone`) running under the
 *     fleet's HOME.
 *
 * Before 3aeb09a8e main failed (b), and (c) was refused as unlisted; before
 * 81c35f9e5 it failed (d) and (e); before a Go key opened Zen it failed (b)
 * for the Zen model, and (g) was refused as unlisted ("has no sign-in or
 * key for opencode"); before pi's account runtime opened Zen too it failed
 * (k) and (l), and the Go key's usage read went to opencode.ai.
 *
 *   bun scripts/probe-kit/run.ts opencode-account-models
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hubRequest } from "../../../packages/core/src/hub-request";
import { spawnWords } from "../../../packages/core/src/words/spawn";
import { envOf, MACHINE, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** The account's provider: OpenCode Go, as models.dev and pi-ai name it. */
const PROVIDER = "opencode-go";
/** Go's one model, as OpenCode names it. */
const MODEL = `${PROVIDER}/mock-go`;
/** Zen's one model: a paid one, which OpenCode lists only with a key. */
const ZEN_MODEL = "opencode/mock-zen";
/** The account's key: what the mock must see on the provider's request. */
const KEY = `probe-${crypto.randomUUID()}`;
/** Each send's words, found again in the mock's log. */
const WORDS = "PROBE-ACCOUNT-MODELS say ok";
const ZEN_WORDS = "PROBE-ACCOUNT-MODELS-ZEN say ok";
const PI_WORDS = "PROBE-ACCOUNT-MODELS-PI say ok";

/** A harness's report of the fleet's machine as the hub holds it: the models it offers. */
const offered = async (
  fleet: KitFleet,
  harness: "opencode" | "pi" = "opencode"
): Promise<string[]> => {
  const agents = await fleet.api<
    {
      machineId: string;
      harnesses?: { harness: string; models?: { value: string }[] }[];
    }[]
  >(hubRequest("GET /api/agents"));
  return (
    agents
      .find((row) => row.machineId === MACHINE)
      ?.harnesses?.find((one) => one.harness === harness)
      ?.models?.map((model) => model.value) ?? []
  );
};

/** One models.dev model entry, priced `input` per 1M tokens: OpenCode lists a priced Zen model only with a key. */
const modelEntry = (id: string, input: number) => ({
  id,
  name: id,
  attachment: false,
  reasoning: false,
  tool_call: true,
  temperature: true,
  release_date: "2026-01-01",
  last_updated: "2026-01-01",
  modalities: { input: ["text"], output: ["text"] },
  open_weights: false,
  cost: { input, output: input },
  limit: { context: 100_000, output: 4000 },
});

/**
 * A models.dev catalog of OpenCode Go and Zen alone, each with one model,
 * keyed as models.dev keys both (`OPENCODE_API_KEY`), their endpoint the
 * fleet's mock (read off the fleet's own OpenCode config, which points its
 * `mockoc` provider there), in the shape OpenCode reads
 * `OPENCODE_MODELS_PATH` in.
 */
const catalogFor = async (fleet: KitFleet): Promise<string> => {
  const config = JSON.parse(
    await readFile(
      join(fleet.home, ".config", "opencode", "opencode.json"),
      "utf8"
    )
  ) as { providers: { mockoc: { settings: { baseURL: string } } } };
  const file = join(fleet.home, "probe-catalog", "api.json");
  await mkdir(join(fleet.home, "probe-catalog"), { recursive: true });
  const api = config.providers.mockoc.settings.baseURL;
  const provider = (id: string, name: string, model: string) => ({
    id,
    name,
    env: ["OPENCODE_API_KEY"],
    npm: "@ai-sdk/openai-compatible",
    api,
    doc: "https://example.invalid",
    models: { [model]: modelEntry(model, 1) },
  });
  await writeFile(
    file,
    JSON.stringify({
      [PROVIDER]: provider(PROVIDER, "OpenCode Go", "mock-go"),
      opencode: provider("opencode", "OpenCode Zen", "mock-zen"),
    })
  );
  return file;
};

/** A model no machine of the fleet lists: the one niftybot.art's fresh OpenCode took. */
const UNLISTED = "opencode/deepseek-v4.1-flash";

/** The machine's OpenCode report as the hub keeps it, its stored text. */
const keptReport = (fleet: KitFleet): string => {
  const [row] = fleet.query<{ report: string }>(
    "SELECT report FROM agent_harnesses WHERE machine_id = ? AND harness = 'opencode'",
    MACHINE
  );
  if (!row) {
    throw new Error("the hub keeps no OpenCode report of the machine");
  }
  return row.report;
};

/**
 * A dashboard start of OpenCode on {@link UNLISTED} while the hub keeps the
 * machine's OpenCode report as `edit` makes it: the hub's refusal, in its
 * log's words, or "started" when it made the session. The report is put
 * back as it was after.
 */
const startUnder = async (
  fleet: KitFleet,
  edit: (report: Record<string, unknown>) => Record<string, unknown>
): Promise<string> => {
  const kept = keptReport(fleet);
  const write = (report: string) =>
    fleet.write(
      "UPDATE agent_harnesses SET report = ? WHERE machine_id = ? AND harness = 'opencode'",
      report,
      MACHINE
    );
  write(JSON.stringify(edit(JSON.parse(kept) as Record<string, unknown>)));
  try {
    const mark = await fleet.logMark("hub");
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
        model: UNLISTED,
        title: "Unlisted model",
        permissionMode: "bypassPermissions",
      },
    });
    return await until(
      "the hub's word on the start",
      async () =>
        (await mark.since())
          .split("\n")
          .find((line) => line.includes(spawnWords.refused)) ??
        (fleet.instance(instanceId) ? "started" : undefined),
      (said) => said.length > 0,
      60_000
    ).catch(() => "neither refused nor started");
  } finally {
    write(kept);
  }
};

/** What splits a `ps` line into its fields. */
const WHITESPACE = /\s+/u;

/** Each `opencode serve --service` running under the fleet's HOME, by pid and command. */
const sharedServices = async (fleet: KitFleet): Promise<string[]> => {
  const listed = await Bun.$`ps -eo pid=,args=`.quiet().nothrow().text();
  const found: string[] = [];
  for (const line of listed.split("\n")) {
    const [pid, ...args] = line.trim().split(WHITESPACE);
    const command = args.join(" ");
    if (
      pid &&
      command.includes("serve") &&
      command.includes("--service") &&
      (await envOf(Number(pid), "HOME")) === fleet.home
    ) {
      found.push(`${pid} ${command}`);
    }
  }
  return found;
};

/**
 * pi's models.json with pi-ai's built-in Zen provider (`opencode`) sent to
 * the fleet's mock, and one more model on it, `mock-zen`: its key stays
 * pi-ai's (`OPENCODE_API_KEY`, or a stored credential), which the machine
 * has none of.
 */
const piZen = async (fleet: KitFleet): Promise<void> => {
  const file = join(fleet.home, ".pi", "agent", "models.json");
  const models = JSON.parse(await readFile(file, "utf8")) as {
    providers: Partial<
      Record<string, { baseUrl?: string } & Record<string, unknown>>
    >;
  };
  models.providers.opencode = {
    baseUrl: models.providers.mockpi?.baseUrl,
    api: "openai-completions",
    models: [
      {
        id: "mock-zen",
        name: "Mock Zen",
        reasoning: false,
        input: ["text"],
        cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 100_000,
        maxTokens: 4000,
      },
    ],
  };
  await writeFile(file, JSON.stringify(models));
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.env.OPENCODE_MODELS_PATH = await catalogFor(fleet);
  await piZen(fleet);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();

  const before = await until(
    "the machine's OpenCode report",
    () => offered(fleet),
    (models) => models.length > 0,
    120_000
  );
  kit.check(
    `(a) with no account, the machine's OpenCode offers neither ${MODEL} nor ${ZEN_MODEL}`,
    !(before.includes(MODEL) || before.includes(ZEN_MODEL)),
    before.join(", ")
  );
  const piBefore = await until(
    "the machine's pi report",
    () => offered(fleet, "pi"),
    (models) => models.length > 0,
    120_000
  );
  kit.check(
    `(j) with no account, the machine's pi offers no ${ZEN_MODEL}`,
    !piBefore.includes(ZEN_MODEL),
    piBefore.join(", ")
  );

  // (d) and (e): the hub's word on a start on a model the machine's
  // OpenCode list does not hold, with that list unread and with it read
  // empty.
  const unread = await startUnder(fleet, (report) => {
    const { models: _models, ...rest } = report;
    return {
      ...rest,
      modelsUnread: "OpenCode's server here didn't list its models (probe).",
    };
  });
  kit.check(
    `(d) with the machine's OpenCode list unread, a start on ${UNLISTED} is refused at once, saying so`,
    unread.includes(spawnWords.refused) &&
      unread.includes("hasn't listed its models yet"),
    unread
  );
  const none = await startUnder(fleet, (report) => ({
    ...report,
    models: [],
  }));
  kit.check(
    `(e) with the machine's OpenCode list read and empty, a start on ${UNLISTED} is refused at once, saying it lists none`,
    none.includes(spawnWords.refused) && none.includes("lists no models"),
    none
  );

  const account = await fleet.api<{ id: string }>(
    hubRequest("POST /api/accounts", {
      body: { provider: PROVIDER, kind: "api_key" },
    })
  );
  const keyed = await fleet.api<{
    machines: { machineId: string; error?: string }[];
  }>(
    hubRequest("POST /api/accounts/:id/key", {
      path: { id: account.id },
      body: { key: KEY, machineIds: [MACHINE] },
    })
  );
  kit.check(
    "the key is written on the machine",
    keyed.machines.every((one) => !one.error),
    JSON.stringify(keyed.machines)
  );
  const after = await until(
    `the machine's OpenCode offering ${MODEL} and ${ZEN_MODEL}`,
    () => offered(fleet),
    (models) => models.includes(MODEL) && models.includes(ZEN_MODEL),
    180_000
  ).catch(() => offered(fleet));
  kit.check(
    `(b) with the account's key there, the machine's OpenCode offers ${MODEL} and ${ZEN_MODEL}, no session started`,
    after.includes(MODEL) && after.includes(ZEN_MODEL),
    after.join(", ")
  );

  const piAfter = await until(
    `the machine's pi offering ${ZEN_MODEL}`,
    () => offered(fleet, "pi"),
    (models) => models.includes(ZEN_MODEL),
    180_000
  ).catch(() => offered(fleet, "pi"));
  kit.check(
    `(k) with the account's key there, the machine's pi offers ${ZEN_MODEL}`,
    piAfter.includes(ZEN_MODEL),
    piAfter.join(", ")
  );

  /** A `harness` session started on `model` and one send in it: whether it ran on the account and its send reached the provider with the account's key and was read. */
  const runsOnAccount = async (
    model: string,
    words: string,
    harness: "opencode" | "pi" = "opencode"
  ) => {
    const id = await fleet
      .spawn(harness, `Account models ${model}`, fleet.workdir, { model })
      .catch((error: unknown) => {
        throw new Error(`the start on ${model} was refused: ${error}`);
      });
    const [row] = fleet.query<{ account_id: string | null }>(
      "SELECT account_id FROM instances WHERE id = ?",
      id
    );
    const sent = await fleet.send(id, words);
    const read = await until(
      "the send read",
      () => fleet.sendRow(sent),
      (one) => one?.state === "read" || one?.state === "failed",
      180_000
    ).catch(() => fleet.sendRow(sent));
    const asked = fleet.seen.find((one) => one.all.includes(words));
    return {
      ok:
        row?.account_id === account.id &&
        read?.state === "read" &&
        asked?.auth === `Bearer ${KEY}`,
      said: `account ${row?.account_id ?? "none"} (wanted ${account.id}); send ${read?.state ?? "none"}${read?.reason ? ` (${read.reason})` : ""}; provider asked ${asked ? `with ${asked.auth === `Bearer ${KEY}` ? "the account's key" : "another credential"}` : "never"}`,
    };
  };
  const go = await runsOnAccount(MODEL, WORDS);
  kit.check(
    `(c) a session on ${MODEL} runs on the account, and its first send reaches the provider with the account's key and is read`,
    go.ok,
    go.said
  );
  const zen = await runsOnAccount(ZEN_MODEL, ZEN_WORDS).catch(
    (error: unknown) => ({ ok: false, said: String(error) })
  );
  kit.check(
    `(g) a session on ${ZEN_MODEL} runs on the same account, and its first send reaches the provider with the account's key and is read`,
    zen.ok,
    zen.said
  );

  const pi = await runsOnAccount(ZEN_MODEL, PI_WORDS, "pi").catch(
    (error: unknown) => ({ ok: false, said: String(error) })
  );
  kit.check(
    `(l) a pi session on ${ZEN_MODEL} runs on the Go account, and its first send reaches the provider with the account's key and is read`,
    pi.ok,
    pi.said
  );

  // (h): the account lists as an agent before a Go key opened Zen kept
  // them (agent opencode.ts ACCOUNT_CATALOGS), Go's alone, and the agent
  // started again on them.
  const catalogs = join(
    fleet.home,
    ".config",
    "opencode",
    "cawco-account-catalogs.json"
  );
  const zenListed = async (): Promise<boolean> => {
    const kept = JSON.parse(
      await readFile(catalogs, "utf8").catch(() => "{}")
    ) as Partial<Record<string, { value: string }[]>>;
    return (kept.opencode ?? []).some((one) => one.value === ZEN_MODEL);
  };
  await fleet.stop("agent");
  const goOnly = JSON.parse(await readFile(catalogs, "utf8")) as Record<
    string,
    unknown
  >;
  await writeFile(
    catalogs,
    JSON.stringify({ [PROVIDER]: goOnly[PROVIDER] ?? [] })
  );
  fleet.launch("agent");
  await fleet.agentUp();
  const relisted = await until(
    `the restarted agent listing ${ZEN_MODEL}`,
    zenListed,
    (listed) => listed,
    180_000
  ).catch(() => false);
  const offeredAgain = await until(
    `the restarted agent offering ${ZEN_MODEL}`,
    () => offered(fleet),
    (models) => models.includes(ZEN_MODEL),
    180_000
  ).catch(() => offered(fleet));
  kit.check(
    `(h) an agent that kept Go's list alone lists ${ZEN_MODEL} from the account's server once it restarts, and offers it, no key entered again`,
    relisted && offeredAgain.includes(ZEN_MODEL),
    `kept Zen list ${relisted ? "holds" : "lacks"} ${ZEN_MODEL}; offered: ${offeredAgain.join(", ")}`
  );

  const usage = await until(
    "the account's usage read",
    () =>
      Promise.resolve(
        fleet.usageReads.filter((one) => one.path === "/zen/go/v1/usage")
      ),
    (reads) => reads.length > 0,
    120_000
  ).catch(() => []);
  kit.check(
    "(i) the account's OpenCode Go usage is read from the fleet's stand-in, with the account's key",
    usage.length > 0 && usage.every((one) => one.auth === `Bearer ${KEY}`),
    `${usage.length} read(s) at the stand-in${usage.some((one) => one.auth !== `Bearer ${KEY}`) ? ", one with another credential" : ""}`
  );

  const services = await sharedServices(fleet);
  kit.check(
    "(f) no OpenCode shared background service (`serve --service`) runs under the fleet's HOME",
    services.length === 0,
    services.join("; ") || "none"
  );
};

const spec: Spec = {
  group: "The hub and machines",
  name: "opencode-account-models",
  run,
};
export default spec;
