/**
 * A machine given an account of a provider OpenCode runs offers that
 * provider's models with no session started, and a session on one of them
 * sends. On 2026-11-06 niftybot.art, given the fleet's OpenCode Go key, kept
 * offering OpenCode's free models alone: an account's provider was listed
 * only as a session on the account started the account's server (agent
 * opencode.ts `#catalog`), and the hub refuses a start on a model the
 * machine does not list (server.ts `modelRefusal`), so none ever started.
 *
 * On a scratch fleet (real hub, agent and sessiond; OpenCode against the
 * mock model), whose OpenCode reads a catalog naming one more provider,
 * `mockgo` (its key from `MOCKGO_API_KEY`, its endpoint the mock), which the
 * machine has no key for:
 *
 * (a) the machine's OpenCode offers no `mockgo` model before any account;
 * (b) a key account of `mockgo`, its key written on the machine as the
 *     dashboard writes it (`POST /api/accounts/:id/key`), and the machine's
 *     OpenCode report offers `mockgo/mock-go`, no session started;
 * (c) a session started on `mockgo/mock-go` runs on that account, its
 *     first send reaches the provider with the account's key, and is read.
 *
 * Main fails (b), and (c) is refused as unlisted.
 *
 *   bun scripts/probe-kit/run.ts opencode-account-models
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hubRequest } from "../../../packages/core/src/hub-request";
import { MACHINE, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** The provider only the account's key opens, as models.dev names a provider. */
const PROVIDER = "mockgo";
/** Its one model, as OpenCode names it. */
const MODEL = `${PROVIDER}/mock-go`;
/** The account's key: what the mock must see on the provider's request. */
const KEY = `probe-${crypto.randomUUID()}`;
/** The send's words, found again in the mock's log. */
const WORDS = "PROBE-ACCOUNT-MODELS say ok";

/** The fleet's OpenCode report as the hub holds it: the models it offers. */
const offered = async (fleet: KitFleet): Promise<string[]> => {
  const agents = await fleet.api<
    {
      machineId: string;
      harnesses?: { harness: string; models?: { value: string }[] }[];
    }[]
  >(hubRequest("GET /api/agents"));
  return (
    agents
      .find((row) => row.machineId === MACHINE)
      ?.harnesses?.find((one) => one.harness === "opencode")
      ?.models?.map((model) => model.value) ?? []
  );
};

/**
 * A models.dev catalog of {@link PROVIDER} alone, its endpoint the fleet's
 * mock (read off the fleet's own OpenCode config, which points its `mockoc`
 * provider there), in the shape OpenCode reads `OPENCODE_MODELS_PATH` in.
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
  await writeFile(
    file,
    JSON.stringify({
      [PROVIDER]: {
        id: PROVIDER,
        name: "Mock Go",
        env: ["MOCKGO_API_KEY"],
        npm: "@ai-sdk/openai-compatible",
        api: config.providers.mockoc.settings.baseURL,
        doc: "https://example.invalid",
        models: {
          "mock-go": {
            id: "mock-go",
            name: "Mock Go",
            attachment: false,
            reasoning: false,
            tool_call: true,
            temperature: true,
            release_date: "2026-01-01",
            last_updated: "2026-01-01",
            modalities: { input: ["text"], output: ["text"] },
            open_weights: false,
            cost: { input: 0, output: 0 },
            limit: { context: 100_000, output: 4000 },
          },
        },
      },
    })
  );
  return file;
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.env.OPENCODE_MODELS_PATH = await catalogFor(fleet);
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
    `(a) with no account, the machine's OpenCode offers no ${PROVIDER} model`,
    !before.some((value) => value.startsWith(`${PROVIDER}/`)),
    before.join(", ")
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
    `the machine's OpenCode offering ${MODEL}`,
    () => offered(fleet),
    (models) => models.includes(MODEL),
    180_000
  ).catch(() => offered(fleet));
  kit.check(
    `(b) with the account's key there, the machine's OpenCode offers ${MODEL}, no session started`,
    after.includes(MODEL),
    after.join(", ")
  );

  const id = await fleet.spawn("opencode", "Account models", fleet.workdir, {
    model: MODEL,
  });
  const [row] = fleet.query<{ account_id: string | null }>(
    "SELECT account_id FROM instances WHERE id = ?",
    id
  );
  const sent = await fleet.send(id, WORDS);
  const read = await until(
    "the send read",
    () => fleet.sendRow(sent),
    (one) => one?.state === "read" || one?.state === "failed",
    180_000
  ).catch(() => fleet.sendRow(sent));
  const asked = fleet.seen.find((one) => one.all.includes(WORDS));
  kit.check(
    `(c) a session on ${MODEL} runs on the account, and its first send reaches the provider with the account's key and is read`,
    row?.account_id === account.id &&
      read?.state === "read" &&
      asked?.auth === `Bearer ${KEY}`,
    `account ${row?.account_id ?? "none"} (wanted ${account.id}); send ${read?.state ?? "none"}${read?.reason ? ` (${read.reason})` : ""}; provider asked ${asked ? `with ${asked.auth === `Bearer ${KEY}` ? "the account's key" : "another credential"}` : "never"}`
  );
};

const spec: Spec = {
  group: "The hub and machines",
  name: "opencode-account-models",
  run,
};
export default spec;
