/**
 * A machine's own OpenCode sign-in that does not work stands on the
 * machine's row, with its fix: found by the agent's own check before any
 * turn uses it, and by a turn its provider refuses; gone once it works.
 *
 * The owner's case (the Mac, 2026-10-14): OpenCode's own Anthropic sign-in
 * there, an OAuth login 1.x kept and 2.0 imported, answered "401 OAuth access
 * token is invalid", and nothing said so until a delegate on `anthropic/…`
 * failed. OpenCode 2.0.28 cannot refresh an Anthropic OAuth sign-in (its
 * Anthropic integration has no OAuth method), so one past its expiry is dead.
 * CawCo never moves an Anthropic sign-in out of OpenCode's own store.
 *
 * A scratch fleet whose machine's OpenCode holds its own `anthropic`
 * credential (put and replaced by a standalone server on the same data dir),
 * its Anthropic provider pointed at the mock, and the agent holding the live
 * catalog (models.opencode.ai) as a machine does:
 *
 * 1. An OAuth sign-in past its expiry with a refresh token OpenCode cannot
 *    use: once the agent is up, before any session, the machine's report and
 *    its row in the dashboard say it, with the fix ("Run `opencode auth
 *    login` on … and pick Anthropic").
 * 2. Signed in again with a valid one: the report and the row carry it no
 *    more.
 * 3. The mock refuses with 401: a session's turn on
 *    `anthropic/claude-haiku-4-5` fails, and the report and the row say it.
 * 4. The mock answers: the next turn answers, and they carry it no more.
 * 5. A key Anthropic refuses: found by one request to its list of models,
 *    before any turn; told to paste a key that works.
 * 6. A key it takes: no fault.
 * 7. An expired xAI sign-in with no refresh token (xAI's integration offers
 *    OAuth): told to sign in again, not to paste a key.
 *
 * The fix in each sentence is the one the installed OpenCode offers, read
 * from its integration's methods: Anthropic's takes only a key on 2.0.28, so
 * a dead subscription sign-in is told to paste a key or log out.
 *
 *   bun scripts/probe-kit/run.ts web opencode-sign-in-fault
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  type OpencodeClient,
  opencodeClient,
} from "../../../../packages/agent/src/harnesses/opencode-client";
import { MACHINE, until } from "../../../scratch-fleet";
import type { KitFleet, Spec } from "../../kit";
import { open, settle } from "../../kit";

const MODEL = "anthropic/claude-haiku-4-5";
/** What the mock answers while the sign-in is refused, as Anthropic answered the Mac. */
const REFUSAL = "OAuth access token is invalid";
const MACHINES_BUTTON = /^\d+ machines?/;
const SERVER_LINE = /listening on (http:\/\/\S+)/;
const PASSWORD_LINE = /server password (\S+)/;
const DAY_MS = 24 * 60 * 60_000;
/** The sentence's fix, as every fault ends. */
const FIX = "opencode auth login";

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

/** The machine's OpenCode sign-in fault's words for `provider`, as the hub holds its report; empty when none. */
const faultOf = async (
  fleet: KitFleet,
  provider = "anthropic"
): Promise<string> =>
  (
    await fleet.api<{ machineId: string; harnesses?: Report[] }[]>(
      "/api/agents"
    )
  )
    .find((row) => row.machineId === MACHINE)
    ?.harnesses?.find((one) => one.harness === "opencode")
    ?.signInFaults?.find((one) => one.provider === provider)?.words ?? "";

/** The fix for a subscription sign-in OpenCode 2.0.28 cannot renew: Anthropic's integration takes only a key. */
const KEY_ONLY_RENEWAL =
  "OpenCode there takes only an API key for Anthropic, so this subscription sign-in cannot be renewed. Run `opencode auth login anthropic` on";
const KEY_OR_LOGOUT =
  "and paste an Anthropic API key, or run `opencode auth logout anthropic` there to remove the dead sign-in (Claude subscriptions run in Claude Code).";
/** The fix for a key Anthropic refuses. */
const KEY_THAT_WORKS = "and paste an Anthropic API key that works.";

/** `work` with a standalone OpenCode server on the machine's data dir, ended after. */
async function standalone(
  fleet: KitFleet,
  work: (client: OpencodeClient) => Promise<void>
): Promise<void> {
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
    await work(
      opencodeClient({
        url: SERVER_LINE.exec(said)?.[1] ?? "",
        password: PASSWORD_LINE.exec(said)?.[1] ?? "",
      } as never)
    );
  } finally {
    server.kill();
    await server.exited;
  }
}

/** An `anthropic` OAuth sign-in as 1.x kept it and 2.0 imported it. */
const oauth = (access: string, expires: number) => ({
  type: "oauth",
  methodID: "claude-pro",
  access,
  refresh: "sk-ant-ort01-not-a-refresh-token",
  expires,
});

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

/** The row's text once `accept` holds, or what it last said. */
const rowUntil = (page: Page, accept: (text: string) => boolean) =>
  until("the machine's row", () => rowText(page), accept, 30_000).catch(() =>
    rowText(page)
  );

const spec: Spec = {
  name: "opencode-sign-in-fault",
  run: async (kit) => {
    let refusing = false;
    let answered = 0;
    let turns = 0;
    const fleet = await kit.fleet((request) => {
      if (!request.tools) {
        return { everyMs: 5, words: ["Probe title"] };
      }
      turns += 1;
      // biome-ignore lint/suspicious/noUnnecessaryConditions: the spec turns it on for step 3, after this closure is made
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
    // OpenCode's Anthropic provider sends to the mock, through a door that
    // answers a key's check (`GET /v1/models`) as Anthropic would, by the key.
    let validKey = "";
    const modelsAsked: string[] = [];
    const door = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname.endsWith("/models")) {
          const key = request.headers.get("x-api-key") ?? "";
          modelsAsked.push(key);
          return key === validKey
            ? Response.json({ data: [] })
            : Response.json(
                {
                  type: "error",
                  error: {
                    type: "authentication_error",
                    message: "invalid x-api-key",
                  },
                },
                { status: 401 }
              );
        }
        return fetch(
          `${fleet.env.ANTHROPIC_BASE_URL}${url.pathname}${url.search}`,
          {
            method: request.method,
            headers: request.headers,
            body: request.body,
          }
        );
      },
    });
    const configFile = join(fleet.home, ".config", "opencode", "opencode.json");
    const config = JSON.parse(await readFile(configFile, "utf8")) as {
      providers?: Record<string, unknown>;
    };
    config.providers = {
      ...config.providers,
      anthropic: {
        settings: { baseURL: `http://127.0.0.1:${door.port}/v1` },
      },
    };
    await writeFile(configFile, JSON.stringify(config));
    // 1. Signed in with an OAuth login past its expiry.
    await standalone(fleet, async (client) => {
      await client.credential.create({
        id: "cred_probe_expired",
        integrationID: "anthropic",
        label: "the machine's own Anthropic sign-in",
        value: oauth("sk-ant-oat01-expired", Date.now() - DAY_MS),
        activate: true,
      } as never);
    });

    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();
    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    await open(page, base, "[data-needs-caw]");

    const checked = await until(
      "the check's fault on the report",
      () => faultOf(fleet),
      Boolean,
      60_000
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
    const expiredRow = await rowUntil(page, (text) => text.includes(checked));
    kit.check(
      "1. before any turn, an expired sign-in OpenCode cannot refresh is on the report and the row, with its fix",
      turns === 0 &&
        checked.includes("does not work: its token expired") &&
        checked.includes(KEY_ONLY_RENEWAL) &&
        checked.endsWith(KEY_OR_LOGOUT) &&
        expiredRow.includes(checked),
      `turns: ${turns}; report: ${checked}; row: ${expiredRow}`
    );

    // 2. Signed in again with a valid one.
    await standalone(fleet, async (client) => {
      await client.credential.create({
        id: "cred_probe_valid",
        integrationID: "anthropic",
        label: "the machine's own Anthropic sign-in",
        value: oauth("sk-ant-oat01-valid", Date.now() + DAY_MS),
        activate: true,
      } as never);
      await client.credential.remove({ credentialID: "cred_probe_expired" });
    });
    const renewed = await until(
      "the report without the fault",
      () => faultOf(fleet),
      (words) => words === "",
      60_000
    ).catch((words: unknown) => String(words));
    const validRow = await rowUntil(page, (text) => !text.includes(FIX));
    kit.check(
      "2. signed in again with a valid one, the report and the row carry it no more",
      renewed === "" && !validRow.includes(FIX) && turns === 0,
      `report: ${renewed || "(none)"}; row: ${validRow}; turns: ${turns}`
    );

    // 3. A turn the provider refuses.
    refusing = true;
    const session = await fleet.spawn(
      "opencode",
      "own sign-in",
      fleet.workdir,
      { model: MODEL }
    );
    await fleet.send(session, "Say hello.");
    const refused = await until(
      "the refused turn's fault on the report",
      () => faultOf(fleet),
      Boolean,
      180_000
    ).catch(() => "");
    const refusedRow = await rowUntil(page, (text) => text.includes(refused));
    kit.check(
      "3. a turn the provider refuses is on the report and the row, with its fix",
      refused.includes(`401 ${REFUSAL}`) &&
        refused.includes(KEY_ONLY_RENEWAL) &&
        refused.endsWith(KEY_OR_LOGOUT) &&
        refusedRow.includes(refused),
      `report: ${refused}; row: ${refusedRow}`
    );

    // 4. A turn that answers.
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
      () => faultOf(fleet),
      (words) => words === "",
      60_000
    ).then(
      () => true,
      () => false
    );
    const answeredRow = await rowUntil(page, (text) => !text.includes(FIX));
    kit.check(
      "4. once a turn on the provider answers, the report and the row carry it no more",
      cleared && !answeredRow.includes(FIX),
      `report cleared: ${cleared}; row: ${answeredRow}`
    );

    // 5. A key Anthropic does not take: found by one request, before a turn.
    const turnsBefore = turns;
    await standalone(fleet, async (client) => {
      await client.credential.create({
        id: "cred_probe_bad_key",
        integrationID: "anthropic",
        label: "the machine's own Anthropic key",
        value: { type: "key", key: "sk-ant-api03-not-taken" },
        activate: true,
      } as never);
      await client.credential.remove({ credentialID: "cred_probe_valid" });
    });
    const badKey = await until(
      "the key check's fault on the report",
      () => faultOf(fleet),
      Boolean,
      60_000
    ).catch(() => "");
    const badKeyRow = await rowUntil(page, (text) => text.includes(badKey));
    kit.check(
      "5. a key its provider refuses is on the report and the row, found by one request to its list of models, before any turn",
      badKey.includes("does not work: 401 invalid x-api-key") &&
        badKey.includes("Run `opencode auth login anthropic` on") &&
        badKey.endsWith(KEY_THAT_WORKS) &&
        badKeyRow.includes(badKey) &&
        turns === turnsBefore &&
        modelsAsked.filter((key) => key === "sk-ant-api03-not-taken").length ===
          1,
      `report: ${badKey}; row: ${badKeyRow}; model list asked with: ${modelsAsked.join(", ")}`
    );

    // 6. A key it takes.
    validKey = "sk-ant-api03-taken";
    await standalone(fleet, async (client) => {
      await client.credential.create({
        id: "cred_probe_good_key",
        integrationID: "anthropic",
        label: "the machine's own Anthropic key",
        value: { type: "key", key: validKey },
        activate: true,
      } as never);
      await client.credential.remove({ credentialID: "cred_probe_bad_key" });
    });
    const goodKey = await until(
      "the report without the fault",
      () => faultOf(fleet),
      (words) => words === "",
      60_000
    ).catch((words: unknown) => String(words));
    const goodKeyRow = await rowUntil(page, (text) => !text.includes(FIX));
    kit.check(
      "6. a key its provider takes carries no fault",
      goodKey === "" &&
        !goodKeyRow.includes(FIX) &&
        modelsAsked.includes(validKey),
      `report: ${goodKey || "(none)"}; row: ${goodKeyRow}; model list asked with: ${modelsAsked.join(", ")}`
    );

    // 7. A provider OpenCode can sign in to again (xAI's integration offers
    // an OAuth method): its dead sign-in is told to sign in again.
    await standalone(fleet, async (client) => {
      await client.credential.create({
        id: "cred_probe_xai",
        integrationID: "xai",
        label: "the machine's own xAI sign-in",
        value: {
          type: "oauth",
          methodID: "device",
          access: "xai-expired",
          refresh: "",
          expires: Date.now() - DAY_MS,
        },
        activate: true,
      } as never);
    });
    const xai = await until(
      "the check's xAI fault on the report",
      () => faultOf(fleet, "xai"),
      Boolean,
      60_000
    ).catch(() => "");
    const xaiRow = await rowUntil(page, (text) => text.includes(xai));
    kit.check(
      "7. a sign-in OpenCode can renew (its integration offers OAuth) is told to sign in again, not to paste a key",
      xai.includes("its token expired") &&
        xai.includes("and it holds no refresh token") &&
        xai.includes("Run `opencode auth login xai` on") &&
        xai.endsWith("to sign in to xAI again.") &&
        !xai.includes("API key") &&
        xaiRow.includes(xai),
      `report: ${xai}; row: ${xaiRow}`
    );
    await door.stop(true);
  },
};

export default spec;
