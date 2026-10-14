/**
 * A machine's own OpenCode sign-in its provider refuses stands on the
 * machine's row, with its fix, until a turn on that provider answers.
 *
 * The owner's case (the Mac, 2026-10-14): OpenCode's own Anthropic sign-in
 * there answered "401 OAuth access token is invalid", and nothing said so
 * until a delegate on `anthropic/…` failed. CawCo never moves an Anthropic
 * sign-in out of OpenCode's own store, so it stays the machine's.
 *
 * A scratch fleet whose machine's OpenCode holds its own `anthropic`
 * credential (put by a standalone server on the same data dir before the
 * agent starts), its Anthropic provider pointed at the mock, and the agent
 * holding the live catalog (models.opencode.ai) as a machine does:
 *
 * 1. The mock refuses with 401: a session's turn on
 *    `anthropic/claude-haiku-4-5` fails, and the machine's OpenCode report
 *    carries the refusal with its fix ("Run `opencode auth login` on … and
 *    pick Anthropic").
 * 2. The dashboard's machine row says it.
 * 3. The mock answers: the next turn answers, and the report and the row
 *    carry it no more.
 *
 *   bun scripts/probe-kit/run.ts web opencode-sign-in-fault
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { opencodeClient } from "../../../../packages/agent/src/harnesses/opencode-client";
import { MACHINE, until } from "../../../scratch-fleet";
import type { KitFleet, Spec } from "../../kit";
import { open, settle } from "../../kit";

const MODEL = "anthropic/claude-haiku-4-5";
/** What the mock answers while the sign-in is refused, as Anthropic answered the Mac. */
const REFUSAL = "OAuth access token is invalid";
const MACHINES_BUTTON = /^\d+ machines?/;
const SERVER_LINE = /listening on (http:\/\/\S+)/;
const PASSWORD_LINE = /server password (\S+)/;

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

interface Report {
  harness: string;
  signInFaults?: { provider: string; words: string }[];
}

/** The machine's OpenCode sign-in faults, as the hub holds its report. */
const faultsOf = async (fleet: KitFleet) =>
  (
    await fleet.api<{ machineId: string; harnesses?: Report[] }[]>(
      "/api/agents"
    )
  )
    .find((row) => row.machineId === MACHINE)
    ?.harnesses?.find((one) => one.harness === "opencode")?.signInFaults ?? [];

/**
 * The machine's own `anthropic` credential, put on its OpenCode database by
 * a standalone server on the machine's data dir, ended once it is put.
 */
async function putOwnCredential(fleet: KitFleet): Promise<void> {
  const server = Bun.spawn(
    ["opencode", "serve", "--hostname=127.0.0.1", "--port=0"],
    { cwd: fleet.workdir, env: fleet.env, stdout: "pipe", stderr: "pipe" }
  );
  try {
    let said = "";
    const reader = server.stdout.getReader();
    const decoder = new TextDecoder();
    const deadline = Date.now() + 60_000;
    while (!(SERVER_LINE.test(said) && PASSWORD_LINE.test(said))) {
      if (Date.now() > deadline) {
        throw new Error(
          `the standalone OpenCode server did not announce itself: ${said}`
        );
      }
      // biome-ignore lint/performance/noAwaitInLoops: the announcement comes line by line
      const { value, done } = await reader.read();
      if (done) {
        throw new Error(`the standalone OpenCode server ended: ${said}`);
      }
      said += decoder.decode(value);
    }
    reader.releaseLock();
    const client = opencodeClient({
      url: SERVER_LINE.exec(said)?.[1] ?? "",
      password: PASSWORD_LINE.exec(said)?.[1] ?? "",
    } as never);
    await client.credential.create({
      id: "cred_probe_anthropic",
      integrationID: "anthropic",
      label: "the machine's own Anthropic sign-in",
      value: { type: "key", key: "sk-ant-probe-own-sign-in" },
      activate: true,
    } as never);
  } finally {
    server.kill();
    await server.exited;
  }
}

/** The text of the machine's row in the dashboard's machines list. */
async function rowText(page: Page): Promise<string> {
  await page.getByRole("button", { name: MACHINES_BUTTON }).first().click();
  const row = page.locator(`li[data-machine="${MACHINE}"] .row`).first();
  await row.waitFor();
  await settle(page);
  const text = (await row.textContent()) ?? "";
  await page.keyboard.press("Escape");
  return text;
}

const spec: Spec = {
  name: "opencode-sign-in-fault",
  run: async (kit) => {
    let refusing = true;
    let answered = 0;
    const fleet = await kit.fleet((request) => {
      if (!request.tools) {
        return { everyMs: 5, words: ["Probe title"] };
      }
      // biome-ignore lint/suspicious/noUnnecessaryConditions: the spec turns it off before step 3, after this closure is made
      if (refusing) {
        return {
          everyMs: 5,
          words: [],
          deny: { status: 401, message: REFUSAL },
        };
      }
      answered += 1;
      return { everyMs: 5, words: ["SIGNED-IN"] };
    });
    // The live catalog, as on a machine, so the provider is named as
    // `opencode auth login` lists it.
    // biome-ignore lint/performance/noDelete: the services get this record as their environment, where a key set to anything turns the fetch off
    delete fleet.env.OPENCODE_DISABLE_MODELS_FETCH;
    for (const name of PROXY_ENV) {
      const value = process.env[name];
      if (value) {
        fleet.env[name] = value;
      }
    }
    // OpenCode's Anthropic provider sends to the mock.
    const configFile = join(fleet.home, ".config", "opencode", "opencode.json");
    const config = JSON.parse(await readFile(configFile, "utf8")) as {
      providers?: Record<string, unknown>;
    };
    config.providers = {
      ...config.providers,
      anthropic: {
        settings: { baseURL: `${fleet.env.ANTHROPIC_BASE_URL}/v1` },
      },
    };
    await writeFile(configFile, JSON.stringify(config));
    await putOwnCredential(fleet);

    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();

    // 1. Refused.
    const session = await fleet.spawn(
      "opencode",
      "own sign-in",
      fleet.workdir,
      {
        model: MODEL,
      }
    );
    await fleet.send(session, "Say hello.");
    const faults = await until(
      "the machine's report of the refused sign-in",
      () => faultsOf(fleet),
      (found) => found.some((one) => one.provider === "anthropic"),
      180_000
    ).catch(async (error: unknown) => {
      throw new Error(
        `${String(error)}; the agent's OpenCode lines: ${(
          await fleet.logs("agent")
        )
          .split("\n")
          .filter((line) => line.includes("[opencode]"))
          .slice(-12)
          .join(" | ")}`
      );
    });
    const words =
      faults.find((one) => one.provider === "anthropic")?.words ?? "";
    kit.check(
      "1. the machine's report carries the refused sign-in with its fix",
      words.includes(`401 ${REFUSAL}`) &&
        words.includes("Run `opencode auth login` on") &&
        words.endsWith("and pick Anthropic."),
      words
    );

    // 2. On the machine's row.
    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    await open(page, base, "[data-needs-caw]");
    const before = await rowText(page);
    kit.check(
      "2. the machine's row in the dashboard says it",
      before.includes(words),
      before
    );

    // 3. Answered: gone from the report and the row.
    refusing = false;
    await fleet.send(session, "Say hello again.");
    await until(
      "the next turn answered",
      () => answered,
      (count) => count > 0,
      120_000
    );
    const cleared = await until(
      "the report without the fault",
      () => faultsOf(fleet),
      (found) => !found.some((one) => one.provider === "anthropic"),
      60_000
    ).then(
      () => true,
      () => false
    );
    const after = await until(
      "the row without the fault",
      () => rowText(page),
      (text) => !text.includes("opencode auth login"),
      30_000
    ).catch(() => "(the row still says it)");
    kit.check(
      "3. once a turn on the provider answers, the report and the row carry it no more",
      cleared && !after.includes("opencode auth login"),
      `report cleared: ${cleared}; row: ${after}`
    );
  },
};

export default spec;
