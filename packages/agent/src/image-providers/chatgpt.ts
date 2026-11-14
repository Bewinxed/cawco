import { randomUUID } from "node:crypto";
import { arch, platform, release } from "node:os";
import { credentialAccountIds } from "@cawco/core/paths/claude";
import { cutShort } from "@cawco/core/words/helpers";
import {
  type BlockedLogin,
  imageGenerationWords,
} from "@cawco/core/words/image-generation";
import { z } from "zod";
import type { AgentPorts } from "../agent-ports";
import { chatgptStanding, freshen, readHeld } from "../provider-accounts";
import { chatgptBaseUrl, chatgptClaims } from "../usage/chatgpt";
import type { ImageJob, ImageProvider, MadeImage } from "./provider";

/** Native Codex's edit-image cap (codex-rs/ext/image-generation/src/tool.rs). */
const MAX_EDIT_IMAGES = 5;

/** The ChatGPT sign-in a request goes out on: its access token and ChatGPT account. */
interface ChatgptAuth {
  access: string;
  accountId?: string;
}
/** Codex's image backend: CHATGPT_CODEX_BASE_URL + images/{generations,edits} (openai/codex codex-api). */
const codexImages = (): string => `${chatgptBaseUrl()}/codex/images`;

/**
 * The CawCo accounts on this machine holding a ChatGPT sign-in (OAuth only:
 * an OpenAI key is never one), those whose token claims a plan other than
 * Free first, so a paid login is tried before a free one. The claim only
 * orders them; {@link readiness} judges each on its plan as it is now. The
 * machine's own OpenCode login is one of them once CawCo has moved it in.
 */
function chatgptAccounts(): string[] {
  const held = credentialAccountIds().flatMap((accountId) => {
    const one = readHeld(accountId);
    return one?.provider === "openai-codex" && one.credential.type === "oauth"
      ? [
          {
            accountId,
            free: chatgptClaims(one.credential.access).plan === "free",
          },
        ]
      : [];
  });
  return [
    ...held.filter((one) => !one.free),
    ...held.filter((one) => one.free),
  ].map((one) => one.accountId);
}

/**
 * The one plan known to make no images: "Image generation isn't available
 * on the Free plan" (https://learn.chatgpt.com/docs/pricing). Codex's own
 * plan names (codex-rs/protocol/src/account.rs `PlanType`) are `free`,
 * `go`, `plus`, `pro`, `team`, `business`, `enterprise`, `edu` and more;
 * any plan but this one, or none, goes on to the request, whose answer is
 * ChatGPT's final word.
 */
const NO_IMAGES_PLAN = "free";

/**
 * One account's sign-in a request may go out on, or what stops it, decided
 * before any image request: its token renewed first when near its expiry by
 * the account machinery's one refresher ({@link freshen}: pi-ai's ChatGPT
 * refresh, on OpenCode's own client id `app_EMoamEEZ73f0CkXaXp7hrann`, pi-ai
 * auth/oauth/openai-codex.js 18), which writes the rotated tokens back to
 * that store and the account's OpenCode store; then its plan as ChatGPT's
 * usage endpoint answers it now ({@link chatgptStanding}), so an upgrade or
 * a downgrade since the token was issued counts. No second copy of the
 * grant is kept or refreshed here.
 */
async function standingOf(
  accountId: string,
  ports: Pick<AgentPorts, "borrowAsk">
): Promise<{ auth: ChatgptAuth } | { blocked: BlockedLogin }> {
  const before = readHeld(accountId);
  const claims = chatgptClaims(
    before?.credential.type === "oauth" ? before.credential.access : ""
  );
  const blocked = (block: BlockedLogin["block"], plan = claims.plan) => ({
    blocked: { block, email: claims.email, plan },
  });
  try {
    await freshen(accountId, ports);
  } catch (cause) {
    return blocked({
      kind: "renew",
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
  const held = readHeld(accountId);
  if (held?.credential.type !== "oauth") {
    return blocked({ kind: "gone" });
  }
  const { credential } = held;
  const accountIdClaim =
    (typeof credential.accountId === "string" ? credential.accountId : null) ??
    chatgptClaims(credential.access).accountId;
  const standing = await chatgptStanding(credential.access, accountIdClaim);
  if (standing.rejected) {
    return blocked({ kind: "rejected" }, standing.plan);
  }
  if (standing.plan === NO_IMAGES_PLAN) {
    return blocked({ kind: "free" }, standing.plan);
  }
  return {
    auth: {
      access: credential.access,
      ...(accountIdClaim ? { accountId: accountIdClaim } : {}),
    },
  };
}

const TOKEN_CLAIMS = z.object({
  "https://api.openai.com/auth": z
    .object({
      chatgpt_data_residency: z.unknown(),
      chatgpt_compute_residency: z.unknown(),
    })
    .optional(),
  chatgpt_compute_residency: z.unknown(),
});

/** The residency the access token's ChatGPT account asks of a request; never the token itself. */
function accountFacts(access: string): { residency?: string } {
  let said: unknown;
  try {
    said = JSON.parse(
      Buffer.from(access.split(".")[1] ?? "", "base64url").toString()
    );
  } catch {
    return {};
  }
  const parsed = TOKEN_CLAIMS.safeParse(said);
  const claims = parsed.success ? parsed.data : undefined;
  const text = (value: unknown) =>
    typeof value === "string" && value ? value : undefined;
  const auth = claims?.["https://api.openai.com/auth"];
  // Residency-enforced workspaces require the data (else compute) residency.
  const residency =
    text(auth?.chatgpt_data_residency) ??
    text(auth?.chatgpt_compute_residency) ??
    text(claims?.chatgpt_compute_residency);
  return {
    residency: residency === "no_constraint" ? undefined : residency,
  };
}

/** The server's own error text: `error.message` when JSON, else the body's start. */
async function errorDetail(response: Response): Promise<string> {
  const text = (await response.text()).trim();
  try {
    const body = JSON.parse(text);
    const message = body?.error?.message ?? body?.detail;
    if (typeof message === "string" && message) {
      return message;
    }
  } catch {
    // Not JSON: report the text as sent.
  }
  return cutShort(text, 1000) || "(empty body)";
}

/**
 * Names the cause of a refused request: only what {@link readiness} could
 * not know beforehand reaches here (a login revoked since the check, a
 * refusal of the plan or quota ChatGPT alone decides), so a 401 asks for a
 * new sign-in and anything else is the server's own words.
 */
async function failure(response: Response): Promise<string> {
  const detail = await errorDetail(response);
  return response.status === 401
    ? imageGenerationWords.requestRejected(detail)
    : imageGenerationWords.requestRefused(response.status, detail);
}

/**
 * One request to native Codex's Images client (openai/codex codex-api
 * endpoint/images.rs): generations for text alone, edits when images are
 * given, each reference as a data URL. Read until `signal` lets it go.
 */
async function askImage(
  auth: ChatgptAuth,
  job: ImageJob,
  signal: AbortSignal
): Promise<MadeImage> {
  const account = accountFacts(auth.access);
  const images = job.references.map((reference) => ({
    image_url: `data:${reference.mime};base64,${reference.bytes.toString("base64")}`,
  }));
  const response = await fetch(
    `${codexImages()}/${images.length ? "edits" : "generations"}`,
    {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${auth.access}`,
        ...(auth.accountId ? { "ChatGPT-Account-Id": auth.accountId } : {}),
        ...(account.residency
          ? { "x-openai-internal-codex-residency": account.residency }
          : {}),
        "x-codex-image-turn-id": randomUUID(),
        // The login is OpenCode's, so the request carries OpenCode's identity.
        originator: "opencode",
        "User-Agent": `opencode (${platform()} ${release()}; ${arch()})`,
      },
      body: JSON.stringify({
        ...(images.length ? { images } : {}),
        prompt: job.prompt,
        model: job.model,
        quality: job.quality,
        size: job.size,
      }),
    }
  );
  if (!response.ok) {
    throw new Error(await failure(response));
  }
  const result = z
    .object({
      data: z.array(z.object({ b64_json: z.string().min(1) })).min(1),
    })
    .safeParse(await response.json().catch(() => undefined));
  if (!result.success) {
    throw new Error(imageGenerationWords.noImage());
  }
  return {
    bytes: Buffer.from(result.data.data[0].b64_json, "base64"),
    notes: [],
  };
}

/**
 * The first held sign-in that can make an image ({@link chatgptAccounts}'
 * order, each judged by {@link standingOf}); none, and the refusal names
 * each login, what stops it and its fix, before any image request is sent.
 */
async function readiness(
  ports: Pick<AgentPorts, "borrowAsk">
): ReturnType<ImageProvider["readiness"]> {
  const accounts = chatgptAccounts();
  if (!accounts.length) {
    return { ready: false, reason: imageGenerationWords.noLogin() };
  }
  const blocked: BlockedLogin[] = [];
  for (const accountId of accounts) {
    const standing = await standingOf(accountId, ports);
    if ("auth" in standing) {
      const { auth } = standing;
      return {
        ready: true,
        notes: [],
        generate: (job, signal) => askImage(auth, job, signal),
      };
    }
    blocked.push(standing.blocked);
  }
  return { ready: false, reason: imageGenerationWords.noUsableLogin(blocked) };
}

/**
 * ChatGPT, through a ChatGPT login a CawCo account on this machine holds:
 * the owner's subscription, never an API key.
 */
export const chatgpt: ImageProvider = {
  id: "chatgpt",
  references: MAX_EDIT_IMAGES,
  readiness,
};
