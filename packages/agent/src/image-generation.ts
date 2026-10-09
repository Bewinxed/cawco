import { randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  stat,
  unlink,
} from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { type GeneratedImage, IMAGE_GENERATION_TIMEOUT_MS } from "@cawco/core";
import { credentialAccountIds } from "@cawco/core/paths";
import { chatgptBaseUrl, chatgptClaims } from "@cawco/core/usage/chatgpt";
import { z } from "zod";
import { freshen, readHeld } from "./provider-accounts";

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
    quality: z.enum(["auto", "low", "medium", "high"]).default("auto"),
  })
  .strict();
/** The ChatGPT sign-in a request goes out on: its access token and ChatGPT account. */
interface ChatgptAuth {
  access: string;
  accountId?: string;
}
/** Codex's image backend: CHATGPT_CODEX_BASE_URL + images/{generations,edits} (openai/codex codex-api). */
const codexImages = (): string => `${chatgptBaseUrl()}/codex/images`;
const SIGN_IN =
  "Run `opencode auth login` and choose OpenAI → ChatGPT (CawCo moves that login into a ChatGPT account), or add a ChatGPT account in Configure → Accounts.";
const SIZE = /^(\d+)x(\d+)$/;
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

async function publishImage(output: string, bytes: Buffer): Promise<void> {
  const temporary = join(dirname(output), `.cawco-image-${randomUUID()}.tmp`);
  const file = await open(temporary, "wx", 0o600);
  try {
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    // Publish complete bytes atomically, without replacing a concurrent writer.
    await link(temporary, output);
  } finally {
    await unlink(temporary);
  }
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
 * an OpenAI key is never one), a paid plan's first: a free plan cannot make
 * images. The machine's own OpenCode login is one of them once CawCo has
 * moved it in.
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
 * The sign-in a request goes out on, from the account's own store, renewed
 * first when it is near its expiry by the account machinery's one refresher
 * ({@link freshen}: pi-ai's ChatGPT refresh, on OpenCode's own client id
 * `app_EMoamEEZ73f0CkXaXp7hrann`, pi-ai auth/oauth/openai-codex.js 18), which
 * writes the rotated tokens back to that store and the account's OpenCode
 * store. No second copy of the grant is kept or refreshed here.
 */
async function subscriptionAuth(): Promise<ChatgptAuth> {
  const [accountId] = chatgptAccounts();
  if (!accountId) {
    throw new Error(
      `No ChatGPT subscription login is held by a CawCo account on this machine. ${SIGN_IN} API keys are not accepted.`
    );
  }
  try {
    await freshen(accountId);
  } catch (cause) {
    throw new Error(
      `The ChatGPT login could not be renewed: ${cause instanceof Error ? cause.message : String(cause)} ${SIGN_IN}`,
      { cause }
    );
  }
  const held = readHeld(accountId);
  if (held?.credential.type !== "oauth") {
    throw new Error(
      `The ChatGPT account's sign-in is gone from this machine. ${SIGN_IN}`
    );
  }
  const { credential } = held;
  const accountIdClaim =
    (typeof credential.accountId === "string" ? credential.accountId : null) ??
    chatgptClaims(credential.access).accountId;
  return {
    access: credential.access,
    ...(accountIdClaim ? { accountId: accountIdClaim } : {}),
  };
}

/** What the access token says about its ChatGPT account; never the token itself. */
function accountFacts(access: string): {
  email?: string;
  planType?: string;
  residency?: string;
} {
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
    | Record<string, unknown>
    | undefined;
  const profile = claims?.["https://api.openai.com/profile"] as
    | Record<string, unknown>
    | undefined;
  // Residency-enforced workspaces require the data (else compute) residency.
  const residency =
    text(auth?.chatgpt_data_residency) ??
    text(auth?.chatgpt_compute_residency) ??
    text(claims?.chatgpt_compute_residency);
  return {
    email: text(profile?.email) ?? text(claims?.email),
    planType: text(auth?.chatgpt_plan_type),
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
 * Names the cause of a refused request. An expired token was renewed before
 * the request, so only a 401 asks for a new sign-in; a 403 on the free plan
 * names the plan.
 */
async function failure(
  response: Response,
  account: { email?: string; planType?: string }
): Promise<string> {
  const detail = await errorDetail(response);
  const suffix = "No image was saved and no API-key request was made.";
  if (response.status === 403 && account.planType === "free") {
    return `This machine's ChatGPT login (${account.email ?? "unknown email"}) is on the free plan, which can't generate images. Sign in with a paid ChatGPT account: \`opencode auth login\` → OpenAI → ChatGPT. ${suffix}`;
  }
  if (response.status === 401) {
    return `ChatGPT rejected this machine's login (HTTP 401: ${detail}). Sign in again: \`opencode auth login\` → OpenAI → ChatGPT. ${suffix}`;
  }
  return `ChatGPT image generation returned HTTP ${response.status}: ${detail} ${suffix} No retry was submitted.`;
}

/** Each reference as a data URL, checked before its bytes are read. */
async function referenceImages(
  cwd: string,
  references: string[]
): Promise<{ image_url: string }[]> {
  const images: { image_url: string }[] = [];
  let total = 0;
  for (const reference of references) {
    const referencePath = resolve(cwd, reference);
    // biome-ignore lint/performance/noAwaitInLoops: check each file before allocating its image buffer.
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
  const response = await fetch(
    `${codexImages()}/${body.images ? "edits" : "generations"}`,
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS),
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
    throw new Error(await failure(response, account));
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

/** Credentials remain on the caller's machine; the hub receives only the saved path. */
export async function generateImage(
  cwd: string,
  input: unknown
): Promise<GeneratedImage> {
  const args = requestSchema.parse(input);
  validateSize(args.size);
  const output = resolve(cwd, args.output_path);
  if (extname(output).toLowerCase() !== ".png") {
    throw new Error(
      "output_path must end in .png, for example assets/illustration.png."
    );
  }
  const auth = await subscriptionAuth();
  const images = await referenceImages(cwd, args.reference_images ?? []);
  await mkdir(dirname(output), { recursive: true });
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
    await publishImage(output, bytes);
    return {
      path: output,
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      billing: "chatgpt_subscription",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        "ChatGPT image generation exceeded its ten-minute deadline. No PNG was published and no automatic retry was submitted.",
        { cause: error }
      );
    }
    throw error;
  } finally {
    activeOutputs.delete(output);
  }
}
