import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, stat } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { basename, dirname, extname, resolve } from "node:path";
import {
  type GeneratedImage,
  IMAGE_GENERATION_TIMEOUT_MS,
  IMAGE_QUALITIES,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { credentialAccountIds } from "@cawco/core/paths";
import { unhandled } from "@cawco/core/unhandled";
import { chatgptBaseUrl, chatgptClaims } from "@cawco/core/usage/chatgpt";
import {
  type BlockedLogin,
  imageGenerationWords,
} from "@cawco/core/words/image-generation";
import { z } from "zod";
import { isWorkspaceRef } from "./hub-command";
import { admitFiles, type Kept, placeInWorkspace, writeKept } from "./inputs";
import { chatgptStanding, freshen, readHeld } from "./provider-accounts";

/** Native Codex's image model and edit-image cap (codex-rs/ext/image-generation/src/tool.rs). */
const IMAGE_MODEL = "gpt-image-2";
const MAX_EDIT_IMAGES = 5;
const requestSchema = z
  .object({
    prompt: z.string().trim().min(1),
    output_path: z.string().min(1),
    reference_images: z
      .array(z.string().min(1))
      .max(MAX_EDIT_IMAGES)
      .optional(),
    size: z.string().default("auto"),
    quality: z.enum(IMAGE_QUALITIES).default("auto"),
  })
  .strict();
/** The ChatGPT sign-in a request goes out on: its access token and ChatGPT account. */
interface ChatgptAuth {
  access: string;
  accountId?: string;
}
/** Codex's image backend: CHATGPT_CODEX_BASE_URL + images/{generations,edits} (openai/codex codex-api). */
const codexImages = (): string => `${chatgptBaseUrl()}/codex/images`;
const SIZE = /^(\d+)x(\d+)$/u;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const activeOutputs = new Set<string>();

async function requireNewOutput(output: string): Promise<void> {
  try {
    await lstat(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error(
    `output_path already exists: ${output}. Choose a new .png filename; existing images are never overwritten.`
  );
}

/**
 * Where `output_path` lands, relative from the session's working dir `cwd`:
 * for a session `bound` to a workspace, inside its clone or its $TMPDIR, by
 * the rule every file a workspace's session asks CawCo to write answers to
 * (inputs.ts `placeInWorkspace`), refused in words elsewhere; for a session
 * in no workspace, which no boundary holds, wherever it names.
 */
function outputOf(cwd: string, named: string, bound: unknown): Kept {
  if (isWorkspaceRef(bound)) {
    const kept = placeInWorkspace(bound, named, cwd);
    if (typeof kept === "string") {
      throw new Error(`output_path ${kept}. No image was generated.`);
    }
    return kept;
  }
  const output = resolve(cwd, named);
  if (extname(output).toLowerCase() !== ".png") {
    throw new Error(
      "output_path must end in .png, for example assets/illustration.png."
    );
  }
  return {
    root: dirname(output),
    rel: basename(output),
    said: output,
    shown: output,
    what: "the folder it was asked in",
  };
}

function validateSize(size: string): void {
  if (size === "auto") {
    return;
  }
  const match = SIZE.exec(size);
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  if (
    !match ||
    width % 16 ||
    height % 16 ||
    Math.max(width, height) > 3840 ||
    Math.max(width, height) > Math.min(width, height) * 3 ||
    width * height < 655_360 ||
    width * height > 8_294_400
  ) {
    throw new Error(
      "Invalid size. Use auto or WIDTHxHEIGHT (e.g. 1024x1536): multiples of 16, max side 3840, max aspect ratio 3:1, 655360–8294400 pixels."
    );
  }
}

function imageMime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(PNG)) {
    return "image/png";
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return "image/jpeg";
  }
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) {
    return "image/gif";
  }
  throw new Error(
    "Unsupported reference image. Use a PNG, JPEG, WebP, or GIF file."
  );
}

/**
 * The CawCo accounts on this machine holding a ChatGPT sign-in (OAuth only:
 * an OpenAI key is never one), those whose token claims a plan other than
 * Free first, so a paid login is tried before a free one. The claim only
 * orders them; {@link usableLogin} judges each on its plan as it is now. The
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
  accountId: string
): Promise<{ auth: ChatgptAuth } | { blocked: BlockedLogin }> {
  const before = readHeld(accountId);
  const claims = chatgptClaims(
    before?.credential.type === "oauth" ? before.credential.access : ""
  );
  const blocked = (block: BlockedLogin["block"], plan = claims.plan) => ({
    blocked: { block, email: claims.email, plan },
  });
  try {
    await freshen(accountId);
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

/**
 * The first held sign-in that can make an image ({@link chatgptAccounts}'
 * order, each judged by {@link standingOf}); none, and it throws naming each
 * login, what stops it and its fix, before any image request is sent.
 */
async function usableLogin(): Promise<ChatgptAuth> {
  const accounts = chatgptAccounts();
  if (!accounts.length) {
    throw new Error(imageGenerationWords.noLogin());
  }
  const blocked: BlockedLogin[] = [];
  for (const accountId of accounts) {
    const standing = await standingOf(accountId);
    if ("auth" in standing) {
      return standing.auth;
    }
    blocked.push(standing.blocked);
  }
  throw new Error(imageGenerationWords.noUsableLogin(blocked));
}

/** The residency the access token's ChatGPT account asks of a request; never the token itself. */
function accountFacts(access: string): { residency?: string } {
  let claims: Record<string, unknown> | undefined;
  try {
    claims = JSON.parse(
      Buffer.from(access.split(".")[1] ?? "", "base64url").toString()
    );
  } catch {
    return {};
  }
  const text = (value: unknown) =>
    typeof value === "string" && value ? value : undefined;
  const auth = claims?.["https://api.openai.com/auth"] as
    Record<string, unknown> | undefined;
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
  return text.slice(0, 1000) || "(empty body)";
}

/**
 * Names the cause of a refused request: only what {@link usableLogin} could
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
 * Each reference as a data URL, checked before its bytes are read, relative
 * from `cwd`. For a session `bound` to a workspace, only what the inputs'
 * gate admits (inputs.ts `admitFiles`: its clone, its scratch dir, its
 * project's folder) is read, refused in words before anything is uploaded;
 * a session in no workspace reads what it names.
 */
async function referenceImages(
  cwd: string,
  references: string[],
  bound: unknown,
  project: unknown
): Promise<{ image_url: string }[]> {
  const named = references.map((reference) => resolve(cwd, reference));
  const paths = isWorkspaceRef(bound)
    ? await admitFiles(
        named,
        bound,
        typeof project === "string" ? project : null
      )
    : named;
  if (typeof paths === "string") {
    throw new Error(
      `reference_images: ${paths}. Nothing was uploaded and no image was generated.`
    );
  }
  const images: { image_url: string }[] = [];
  let total = 0;
  for (const referencePath of paths) {
    const info = await stat(referencePath);
    total += info.size;
    if (
      !info.isFile() ||
      info.size > 50 * 1024 * 1024 ||
      total > 100 * 1024 * 1024
    ) {
      throw new Error(
        "References must be image files of at most 50 MiB each and 100 MiB combined."
      );
    }
    const image = await readFile(referencePath);
    images.push({
      image_url: `data:${imageMime(image)};base64,${image.toString("base64")}`,
    });
  }
  return images;
}

/**
 * One request to native Codex's Images client (openai/codex codex-api
 * endpoint/images.rs): generations for text alone, edits when images are given.
 */
async function requestImage(
  auth: ChatgptAuth,
  body: { images?: { image_url: string }[] } & Record<string, unknown>
): Promise<Buffer> {
  const account = accountFacts(auth.access);
  const read = await readWithin(IMAGE_GENERATION_TIMEOUT_MS, (signal) =>
    askImage(auth, account, body, signal)
  );
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(
        `ChatGPT did not answer within ${IMAGE_GENERATION_TIMEOUT_MS / 60_000} minutes. No PNG was published and no automatic retry was submitted.`
      );
    default:
      unhandled("read", read);
  }
}

/** {@link requestImage}'s one request and its answer, read until `signal` lets it go. */
async function askImage(
  auth: ChatgptAuth,
  account: ReturnType<typeof accountFacts>,
  body: { images?: { image_url: string }[] } & Record<string, unknown>,
  signal: AbortSignal
): Promise<Buffer> {
  const response = await fetch(
    `${codexImages()}/${body.images ? "edits" : "generations"}`,
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
      body: JSON.stringify(body),
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
    throw new Error(
      "ChatGPT returned no image. No file was saved. Do not automatically retry an uncertain generation."
    );
  }
  return Buffer.from(result.data.data[0].b64_json, "base64");
}

/**
 * Credentials remain on the caller's machine; the hub receives only the
 * saved path. `bound`: the workspace the session runs in, or null
 * ({@link outputOf}); `project`: its project's id, or null
 * ({@link referenceImages}).
 */
export async function generateImage(
  cwd: string,
  input: unknown,
  bound: unknown = null,
  project: unknown = null
): Promise<GeneratedImage> {
  const args = requestSchema.parse(input);
  validateSize(args.size);
  const kept = outputOf(cwd, args.output_path, bound);
  const output = kept.shown;
  // Before any reference is read or any image request goes out.
  const auth = await usableLogin();
  const images = await referenceImages(
    cwd,
    args.reference_images ?? [],
    bound,
    project
  );
  if (!isWorkspaceRef(bound)) {
    // A workspace's clone and scratch dir are there; its folders under them are made one at a time as it is written.
    await mkdir(kept.root, { recursive: true });
  }
  await requireNewOutput(output);
  if (activeOutputs.has(output)) {
    throw new Error(
      `Image generation is already running for ${output}. Wait for that request; do not submit a duplicate.`
    );
  }
  activeOutputs.add(output);
  try {
    const bytes = await requestImage(auth, {
      ...(images.length ? { images } : {}),
      prompt: args.prompt,
      model: IMAGE_MODEL,
      quality: args.quality,
      size: args.size,
    });
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG)) {
      throw new Error("ChatGPT returned an invalid PNG; no image was saved.");
    }
    // Placed only where nothing is: a concurrent writer's file is never replaced.
    await writeKept(kept, bytes, { exclusive: true, mode: 0o600 });
    return {
      path: output,
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      billing: "chatgpt_subscription",
    };
  } finally {
    activeOutputs.delete(output);
  }
}
