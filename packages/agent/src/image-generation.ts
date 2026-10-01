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
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { type GeneratedImage, IMAGE_GENERATION_TIMEOUT_MS } from "@cawco/core";
import { z } from "zod";

const requestSchema = z
  .object({
    prompt: z.string().trim().min(1),
    output_path: z.string().min(1),
    reference_images: z.array(z.string().min(1)).optional(),
    size: z.string().default("auto"),
    quality: z.enum(["auto", "low", "medium", "high"]).default("auto"),
  })
  .strict();
const oauthSchema = z.object({
  type: z.literal("oauth"),
  access: z.string().min(1),
  accountId: z.string().optional(),
});
const SIZE = /^(\d+)x(\d+)$/;
const SSE_LINES = /\r?\n/;
const SSE_EVENTS = /\r?\n\r?\n/;
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

async function subscriptionAuth() {
  const dataRoot =
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  let data: unknown;
  try {
    data = JSON.parse(
      await readFile(join(dataRoot, "opencode", "auth.json"), "utf8")
    );
  } catch (cause) {
    throw new Error(
      "ChatGPT subscription login is unavailable on this machine. Run `opencode auth login` and choose OpenAI → ChatGPT. API keys are not accepted.",
      { cause }
    );
  }
  const result = z.object({ openai: oauthSchema }).safeParse(data);
  if (!result.success) {
    throw new Error(
      "ChatGPT OAuth is required. Run `opencode auth login` and choose OpenAI → ChatGPT. This tool never uses an OpenAI API key."
    );
  }
  return result.data.openai;
}

function eventImage(event: string): string | undefined {
  const data = event
    .split(SSE_LINES)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data || data === "[DONE]") {
    return;
  }
  const value = JSON.parse(data);
  if (value.type === "error" || value.type === "response.failed") {
    throw new Error(
      "ChatGPT image generation failed. No image was saved; the tool did not switch providers or retry."
    );
  }
  if (
    value.type === "response.output_item.done" &&
    value.item?.type === "image_generation_call" &&
    typeof value.item.result === "string"
  ) {
    return value.item.result;
  }
}

async function imageFromStream(
  body: ReadableStream<Uint8Array>
): Promise<Buffer> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: SSE chunks must be decoded in wire order.
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      pending += decoder.decode(value, { stream: true });
      const events = pending.split(SSE_EVENTS);
      pending = events.pop() ?? "";
      for (const event of events) {
        const image = eventImage(event);
        if (image) {
          return Buffer.from(image, "base64");
        }
      }
    }
    const image = eventImage(pending + decoder.decode());
    if (image) {
      return Buffer.from(image, "base64");
    }
    throw new Error(
      "ChatGPT returned no completed image. No file was saved. Do not automatically retry an uncertain generation."
    );
  } finally {
    // An already-errored stream can reject cancellation; preserve the original result/error.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
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
  const content: (
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string }
  )[] = [{ type: "input_text", text: args.prompt }];
  let total = 0;
  for (const reference of args.reference_images ?? []) {
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
    content.push({
      type: "input_image",
      image_url: `data:${imageMime(image)};base64,${image.toString("base64")}`,
    });
  }
  await mkdir(dirname(output), { recursive: true });
  await requireNewOutput(output);
  if (activeOutputs.has(output)) {
    throw new Error(
      `Image generation is already running for ${output}. Wait for that request; do not submit a duplicate.`
    );
  }
  activeOutputs.add(output);
  try {
    const response = await fetch(
      "https://chatgpt.com/backend-api/codex/responses",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${auth.access}`,
          ...(auth.accountId ? { "ChatGPT-Account-Id": auth.accountId } : {}),
          originator: "opencode",
        },
        body: JSON.stringify({
          model: "gpt-5.5",
          instructions:
            "Generate the requested image by invoking image_generation exactly once. Do not respond with text only.",
          input: [{ role: "user", content }],
          tools: [
            {
              type: "image_generation",
              output_format: "png",
              quality: args.quality,
              size: args.size,
            },
          ],
          tool_choice: { type: "image_generation" },
          stream: true,
          store: false,
        }),
      }
    );
    if (!(response.ok && response.body)) {
      await response.body?.cancel();
      const action =
        response.status === 401 || response.status === 403
          ? "Refresh the machine's ChatGPT login with `opencode auth login`."
          : "Check ChatGPT subscription availability before retrying.";
      throw new Error(
        `ChatGPT image generation returned HTTP ${response.status}. ${action} No API-key request was made.`
      );
    }
    const bytes = await imageFromStream(response.body);
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
