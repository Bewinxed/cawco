/**
 * `generate_image` checks whether this machine's ChatGPT logins can make an
 * image before it sends an image request (agent image-generation.ts
 * through the ChatGPT provider's `readiness`, image-providers/chatgpt.ts):
 * a login ChatGPT's usage endpoint says is on the Free plan
 * is skipped without a call, a paid one wins over a free one, and when none
 * can, the error names each login with its plan, what stops it and its fix.
 *
 * Each leg holds its own CawCo accounts under a scratch HOME (`ownHome`),
 * each a ChatGPT sign-in whose token is far from expiry (so no renewal is
 * asked), and points `CAWCO_CHATGPT_BASE_URL` at a mock of ChatGPT's backend
 * that answers `/wham/usage` with each token's plan and the image endpoints
 * with a 1×1 PNG, recording every request. Nothing reaches ChatGPT.
 *
 * - a. Free only: the error names the login's email and the Free plan with
 *   the upgrade and sign-in fix, and no request reaches an image endpoint.
 * - b. Free and paid, the free one's account first on disk: the image
 *   request goes out on the paid login's token, and the image is saved.
 * - c. A plan the check does not know (`zz_new_plan`): the request goes
 *   ahead on it.
 * - d. No account: the error says no login is held, and no request reaches
 *   the mock at all.
 * - e. A token whose claim says free but whose account ChatGPT now says is
 *   on Plus (an upgrade since the token was issued): the request goes ahead.
 * - f. A token the usage endpoint refuses with 401: the error says ChatGPT
 *   rejected the login, and no image request goes out.
 *
 *   bun scripts/probe-kit/run.ts image-login-check
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { generateImage } from "../../../packages/agent/src/image-generation";
import { accountCredentialPath } from "../../../packages/core/src/paths/claude";
import { DAY_MS } from "../../../packages/core/src/time";
import { imageGenerationWords } from "../../../packages/core/src/words/image-generation";
import type { Kit, Spec } from "../kit";

/** A 1×1 PNG, as ChatGPT's image endpoints answer one. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** An unsigned JWT carrying the claims a ChatGPT access token has. */
const token = (email: string, plan: string): string => {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none" })}.${part({
    "https://api.openai.com/auth": {
      chatgpt_account_id: `acct-${email}`,
      chatgpt_plan_type: plan,
    },
    "https://api.openai.com/profile": { email },
  })}.sig`;
};

/** One login: its email, the plan its token claims, and what ChatGPT says now. */
interface Login {
  claimed: string;
  email: string;
  /** The usage endpoint's plan, or a status it refuses with. */
  now: string | number;
}

const LOGINS = "logins";

/** Each held account's store, written as the agent writes one. */
async function hold(logins: Login[]): Promise<void> {
  await rm(join(homedir(), ".cawco", "accounts"), {
    recursive: true,
    force: true,
  });
  for (const [index, login] of logins.entries()) {
    const path = accountCredentialPath(`${index}-${login.email}`);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: token(login.email, login.claimed),
          refresh: "refresh",
          expires: Date.now() + DAY_MS,
          accountId: `acct-${login.email}`,
        },
      })
    );
  }
}

/** What the mock was asked: each path and the token's email. */
interface Asked {
  email: string;
  path: string;
}

export default {
  group: "The hub and machines",
  name: "image-login-check",
  ownHome:
    "it holds CawCo accounts of its own under ~/.cawco/accounts, which the agent's account store reads from HOME",
  run: async (kit: Kit) => {
    const { check } = kit;
    let logins: Login[] = [];
    const asked: Asked[] = [];
    const server = Bun.serve({
      port: 0,
      fetch: (request) => {
        const path = new URL(request.url).pathname;
        const claims = JSON.parse(
          Buffer.from(
            (request.headers.get("authorization") ?? "").split(".")[1] ?? "",
            "base64url"
          ).toString() || "{}"
        );
        const email: string =
          claims["https://api.openai.com/profile"]?.email ?? "";
        asked.push({ email, path });
        const login = logins.find((one) => one.email === email);
        if (path === "/wham/usage") {
          return typeof login?.now === "number"
            ? new Response("refused", { status: login.now })
            : Response.json({ plan_type: login?.now ?? null });
        }
        if (path.startsWith("/codex/images/")) {
          return Response.json({ data: [{ b64_json: PNG_1X1 }] });
        }
        return new Response("not found", { status: 404 });
      },
    });
    process.env.CAWCO_CHATGPT_BASE_URL = `http://127.0.0.1:${server.port}`;
    const out = join(kit.out, LOGINS);
    await mkdir(out, { recursive: true });
    let n = 0;
    /** One generation against `held`: its saved path, or its error's words. */
    const attempt = async (
      held: Login[]
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      logins = held;
      asked.length = 0;
      await hold(held);
      n += 1;
      try {
        await generateImage(out, {
          prompt: "a probe",
          output_path: `image-${n}.png`,
        });
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
    const imageAsks = () =>
      asked.filter((one) => one.path.startsWith("/codex/images/"));
    try {
      const freeOnly = await attempt([
        { email: "free@probe.test", claimed: "free", now: "free" },
      ]);
      const freeError = freeOnly.ok ? "" : freeOnly.error;
      kit.note(`a: ${freeError}`);
      check(
        "a. free only: refused, naming the login's email and the Free plan with its fix",
        freeError ===
          imageGenerationWords.refused(
            "chatgpt",
            imageGenerationWords.noUsableLogin([
              {
                block: { kind: "free" },
                email: "free@probe.test",
                plan: "free",
              },
            ])
          ),
        freeError
      );
      check(
        "a. free only: no request reached an image endpoint",
        imageAsks().length === 0,
        JSON.stringify(asked)
      );

      const both = await attempt([
        { email: "free@probe.test", claimed: "free", now: "free" },
        { email: "paid@probe.test", claimed: "plus", now: "plus" },
      ]);
      check(
        "b. free and paid: the image request went out on the paid login",
        both.ok &&
          imageAsks().length === 1 &&
          imageAsks()[0]?.email === "paid@probe.test",
        JSON.stringify({ both, asked })
      );

      const unknown = await attempt([
        { email: "new@probe.test", claimed: "zz_new_plan", now: "zz_new_plan" },
      ]);
      check(
        "c. a plan the check does not know: the request goes ahead",
        unknown.ok && imageAsks().length === 1,
        JSON.stringify({ unknown, asked })
      );

      const none = await attempt([]);
      const noneError = none.ok ? "" : none.error;
      kit.note(`d: ${noneError}`);
      check(
        "d. no account: says no login is held, and nothing reached the mock",
        noneError ===
          imageGenerationWords.refused(
            "chatgpt",
            imageGenerationWords.noLogin()
          ) && asked.length === 0,
        JSON.stringify({ noneError, asked })
      );

      const upgraded = await attempt([
        { email: "up@probe.test", claimed: "free", now: "plus" },
      ]);
      check(
        "e. a token claiming free on an account ChatGPT now says is Plus: the request goes ahead",
        upgraded.ok &&
          imageAsks().length === 1 &&
          imageAsks()[0]?.email === "up@probe.test",
        JSON.stringify({ upgraded, asked })
      );

      const rejected = await attempt([
        { email: "gone@probe.test", claimed: "plus", now: 401 },
      ]);
      const rejectedError = rejected.ok ? "" : rejected.error;
      kit.note(`f: ${rejectedError}`);
      check(
        "f. a token the usage endpoint refuses (401): says ChatGPT rejected it, no image request",
        rejectedError ===
          imageGenerationWords.refused(
            "chatgpt",
            imageGenerationWords.noUsableLogin([
              {
                block: { kind: "rejected" },
                email: "gone@probe.test",
                plan: "plus",
              },
            ])
          ) && imageAsks().length === 0,
        JSON.stringify({ rejectedError, asked })
      );
    } finally {
      server.stop(true);
      delete process.env.CAWCO_CHATGPT_BASE_URL;
    }
  },
} satisfies Spec;
