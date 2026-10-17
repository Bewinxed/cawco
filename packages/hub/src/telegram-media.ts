import type { SendPayload } from "@cawco/core";
import { CAWCO_ENV, readEnv } from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";

/** "<who> did not answer within N s". */
const silent = (who: string, after: number): string =>
  `${who} did not answer within ${Math.round(after / 1000)} s`;

/** Telegram's own ceiling on what a bot may fetch, and how long fetching may take. */
const FILE_LIMIT = 20 * 1024 * 1024;
const FILE_TIMEOUT_MS = 60_000;
const TOO_BIG =
  "That file is over 20 MB — more than a bot is allowed to fetch.";

/** What a paste may weigh before it stops being something to read in a turn. */
const TEXT_LIMIT = 256 * 1024;
const TOO_MUCH_TEXT =
  "That text file is over 256 KB — too much to paste into a turn.";

/** A document is text if its type says so, or if its name does. */
const TEXT_MIME =
  /^text\/|^application\/(json|xml|yaml|javascript|typescript|toml)$/;
const TEXT_EXT = new Set([
  "md",
  "txt",
  "json",
  "ts",
  "js",
  "py",
  "yml",
  "toml",
  "css",
  "html",
  "svelte",
]);

/** Strips a trailing slash (or several) off a configured router URL. */
const TRAILING_SLASH_RE = /\/+$/;

/** Which model transcribes, when the environment names no other. */
const DEFAULT_MODEL = "transcribe";
/** How long a handle's resolution to an exact model name is trusted. */
const MODEL_TTL_MS = 10 * 60_000;

/** How the wake is watched, and how long it is waited out. */
const WARM_POLL_MS = 3000;
const WARM_LIMIT_MS = 120_000;
/** The states a model answers from without a cold start behind it. */
const LOADED = new Set(["running", "sleeping"]);

/** Under the router's own 255s socket cap, and what a management call may take. */
const TRANSCRIBE_TIMEOUT_MS = 240_000;
const ROUTER_TIMEOUT_MS = 15_000;

interface TelegramFile {
  file_id: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
}

interface TelegramPhoto {
  file_id: string;
  file_size?: number;
  height: number;
  width: number;
}

/** The media a message may carry, and the words sent alongside it. */
export interface TelegramMedia {
  audio?: TelegramFile;
  caption?: string;
  document?: TelegramFile;
  photo?: TelegramPhoto[];
  video_note?: TelegramFile;
  voice?: TelegramFile;
}

/**
 * What a message's media turned out to be. `text` is words the bridge routes
 * exactly as it routes typed ones — a voice note is its transcript; `media` is
 * what only a session can read, and rides a turn's `images`/`attachments`.
 */
export type Intake =
  | { kind: "text"; text: string; transcript: string }
  | {
      kind: "media";
      text: string;
      images?: SendPayload["images"];
      attachments?: SendPayload["attachments"];
    }
  | { kind: "refused"; reason: string }
  /** Telegram or the router did not answer in time: the words say which. */
  | { kind: "unanswered"; reason: string };

export interface MediaServices {
  /** The bridge's own Bot API caller, for `getFile`. */
  readonly call: <T>(
    method: string,
    body: unknown
  ) => Promise<Bounded<T | undefined>>;
  /** The bridge's logger for a transport failure, which keeps the token out of the log. */
  readonly failed: (what: string, error: unknown) => void;
  /** Where a `file_path` is fetched from, bot token already in it. */
  readonly filesBase: string;
}

export interface MediaIntake {
  readonly intake: (message: TelegramMedia) => Promise<Intake | undefined>;
}

/** Whether a message carries anything the bridge would have to go and fetch. */
export const carriesMedia = (message: TelegramMedia): boolean =>
  Boolean(
    message.voice ??
    message.audio ??
    message.video_note ??
    message.photo?.length ??
    message.document
  );

const extensionOf = (name: string): string =>
  name.split(".").pop()?.toLowerCase() ?? "";

/** The biggest of the sizes Telegram cut one photo into — the one worth reading. */
const largest = (sizes: TelegramPhoto[]): TelegramPhoto =>
  sizes.reduce((best, size) =>
    size.width * size.height > best.width * best.height ? size : best
  );

const catalogued = (models: { id: string }[]): string =>
  models.map((model) => model.id).join(", ") || "nothing";

/**
 * Everything a Telegram message can carry that is not typed words, turned into
 * something a session can be handed: a voice note into its transcript, a photo
 * into an image, a text file into a paste. Whatever it cannot carry it says so
 * about, because silence here reads as the bridge having dropped it.
 */
export const createMediaIntake = ({
  call,
  failed,
  filesBase,
}: MediaServices): MediaIntake => {
  /** The handle's exact model name, so every voice note is not two round trips. */
  let resolved: { handle: string; name: string; at: number } | undefined;

  const fetched = async (
    file: TelegramFile
  ): Promise<
    | { bytes: Uint8Array; path: string }
    | { error: string }
    | { unanswered: string }
  > => {
    if ((file.file_size ?? 0) > FILE_LIMIT) {
      return { error: TOO_BIG };
    }
    const asked = await call<{ file_path?: string }>("getFile", {
      file_id: file.file_id,
    });
    let found: { file_path?: string } | undefined;
    switch (asked.kind) {
      case "answered":
        found = asked.value;
        break;
      case "unanswered":
        return { unanswered: `${silent("Telegram", asked.after)}.` };
      default: {
        const unhandled: never = asked;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    const path = found?.file_path;
    if (!path) {
      return { error: "Telegram would not hand that file over." };
    }
    let read: Bounded<Uint8Array | { error: string }>;
    try {
      read = await readWithin(FILE_TIMEOUT_MS, async (signal) => {
        const response = await fetch(`${filesBase}/${path}`, { signal });
        if (!response.ok) {
          return {
            error: `Telegram would not hand that file over (${response.status}).`,
          };
        }
        return new Uint8Array(await response.arrayBuffer());
      });
    } catch (error) {
      failed("file download", error);
      return { error: "Telegram could not be reached for that file." };
    }
    let bytes: Uint8Array;
    switch (read.kind) {
      case "answered":
        if (!(read.value instanceof Uint8Array)) {
          return read.value;
        }
        bytes = read.value;
        break;
      case "unanswered":
        return {
          unanswered: `${silent("Telegram", read.after)} while sending that file over.`,
        };
      default: {
        const unhandled: never = read;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    if (bytes.byteLength > FILE_LIMIT) {
      return { error: TOO_BIG };
    }
    return { bytes, path };
  };

  /** A file not handed over: Telegram's refusal, or its silence, each as its own intake. */
  const withheld = (
    file: { error: string } | { unanswered: string }
  ): Intake =>
    "unanswered" in file
      ? { kind: "unanswered", reason: file.unanswered }
      : { kind: "refused", reason: file.error };

  /** The router's models; answered [] when it refused or could not be reached. */
  const catalog = async (
    url: string
  ): Promise<Bounded<{ id: string; aliases?: string[] }[]>> => {
    try {
      return await readWithin(ROUTER_TIMEOUT_MS, async (signal) => {
        const response = await fetch(`${url}/v1/models`, { signal });
        if (!response.ok) {
          return [];
        }
        const { data } = (await response.json().catch(() => ({}))) as {
          data?: { id: string; aliases?: string[] }[];
        };
        return data ?? [];
      });
    } catch {
      return { kind: "answered", value: [] };
    }
  };

  /** The models a router offers, in words; its silence said as such. */
  const offered = async (url: string): Promise<string> => {
    const listed = await catalog(url);
    switch (listed.kind) {
      case "answered":
        return `it offers ${catalogued(listed.value)}`;
      case "unanswered":
        return `its list of models did not come within ${Math.round(listed.after / 1000)} s`;
      default: {
        const unhandled: never = listed;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  };

  /**
   * The router's exact name for the configured handle. A multipart body is
   * forwarded to the backend byte for byte, so an alias — which the router
   * rewrites only on a JSON call — would reach the backend unresolved.
   */
  const named = async (
    url: string,
    handle: string
  ): Promise<string | { error: string } | { unanswered: string }> => {
    if (
      resolved?.handle === handle &&
      Date.now() - resolved.at < MODEL_TTL_MS
    ) {
      return resolved.name;
    }
    const asked = await catalog(url);
    let listed: { id: string; aliases?: string[] }[];
    switch (asked.kind) {
      case "answered":
        listed = asked.value;
        break;
      case "unanswered":
        return {
          unanswered: `${silent(`The router at ${url}`, asked.after)}.`,
        };
      default: {
        const unhandled: never = asked;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    if (listed.length === 0) {
      return { error: `The router at ${url} is not answering.` };
    }
    const found =
      listed.find((model) => model.id === handle) ??
      listed.find((model) => model.aliases?.includes(handle));
    if (!found) {
      return {
        error: `The router has no "${handle}" — it offers ${catalogued(listed)}.`,
      };
    }
    resolved = { handle, name: found.id, at: Date.now() };
    return found.id;
  };

  /** The router's no, in words for the reader. */
  const refusal = async (
    url: string,
    response: Response,
    name: string
  ): Promise<string> => {
    if (response.status === 404) {
      resolved = undefined;
      return `The router has no "${name}" — ${await offered(url)}.`;
    }
    if (response.status === 507) {
      return `The router has no VRAM left for "${name}".`;
    }
    if (response.status === 503) {
      const after = response.headers.get("retry-after");
      return `The router is cooling down${after ? ` — try again in ${after}s` : ""}.`;
    }
    // The chat/completions endpoint answers `{ error }`, but the transcriptions
    // endpoint answers `{ detail }` — both carry the sentence worth relaying.
    const { error, detail } = (await response.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
    };
    return `The router refused: ${error ?? detail ?? response.status}.`;
  };

  /**
   * Loads the model before the audio is posted: a cold start can outlast the
   * socket the transcription would be waiting on. The start call is watched
   * rather than awaited, since it is also what reports the failures worth
   * relaying — no VRAM left, or an eviction still cooling down.
   */
  const warm = async (
    url: string,
    name: string
  ): Promise<string | undefined> => {
    let refused: string | undefined;
    // Watched, not awaited: the poll loop below is what reports readiness, so
    // a start call that never answers is left to it.
    detach(
      readWithin(WARM_LIMIT_MS, async (signal) => {
        const response = await fetch(
          `${url}/manager/start/${encodeURIComponent(name)}`,
          { method: "POST", signal }
        );
        if (!response.ok) {
          refused = await refusal(url, response, name);
        }
      }).catch(() => undefined),
      "transcription warm-up"
    );

    const deadline = Date.now() + WARM_LIMIT_MS;
    for (;;) {
      if (refused) {
        return refused;
      }
      // biome-ignore lint/performance/noAwaitInLoops: polls until the model loads or the deadline passes; each check depends on the previous sleep
      const asked = await readWithin(ROUTER_TIMEOUT_MS, async (signal) => {
        const response = await fetch(`${url}/manager/status`, { signal });
        return (await response.json()) as {
          models?: { name: string; status: string }[];
        };
      }).catch(() => undefined);
      let status: { models?: { name: string; status: string }[] } | undefined;
      switch (asked?.kind) {
        case "answered":
          status = asked.value;
          break;
        case "unanswered":
        case undefined:
          // No word on its status this round: the poll waits on.
          break;
        default: {
          const unhandled: never = asked;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
      const model = status?.models?.find((entry) => entry.name === name);
      if (model && LOADED.has(model.status)) {
        return undefined;
      }
      // Out of patience rather than out of hope: the post that follows has its
      // own timeout and says why it failed, which is more than this loop knows.
      if (Date.now() >= deadline) {
        return undefined;
      }
      await Bun.sleep(WARM_POLL_MS);
    }
  };

  const transcribe = async (
    bytes: Uint8Array,
    filename: string
  ): Promise<Intake> => {
    const url = readEnv(CAWCO_ENV.telegramAsrUrl)?.replace(
      TRAILING_SLASH_RE,
      ""
    );
    if (!url) {
      return { kind: "refused", reason: "Transcription isn't configured yet." };
    }
    const handle = readEnv(CAWCO_ENV.telegramAsrModel) ?? DEFAULT_MODEL;

    const name = await named(url, handle);
    if (typeof name !== "string") {
      return "unanswered" in name
        ? { kind: "unanswered", reason: name.unanswered }
        : { kind: "refused", reason: name.error };
    }
    const cold = await warm(url, name);
    if (cold) {
      return { kind: "refused", reason: cold };
    }
    return await heard(url, name, bytes, filename);
  };

  /** The loaded model's transcript of `bytes`, within {@link TRANSCRIBE_TIMEOUT_MS}. */
  const heard = async (
    url: string,
    name: string,
    bytes: Uint8Array,
    filename: string
  ): Promise<Intake> => {
    const chat = readEnv(CAWCO_ENV.telegramAsrMode) === "chat";
    const post = (signal: AbortSignal): Promise<Response> =>
      chat
        ? // An audio-capable LLM has no transcription API — it is asked to
          // transcribe the way it is asked anything, with the audio attached.
          fetch(`${url}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: name,
              temperature: 0,
              // Bounded: the serving model is a reasoning family — without a cap
              // a "transcription" can ramble. 1024 covers ~8 minutes of speech;
              // the router caps audio at ~10.5 min anyway.
              max_tokens: 1024,
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "input_audio",
                      input_audio: {
                        data: Buffer.from(bytes).toString("base64"),
                        format: extensionOf(filename) || "ogg",
                      },
                    },
                    {
                      type: "text",
                      text:
                        "Transcribe this audio exactly as spoken. Output only the transcript" +
                        " — no commentary, no quotation marks.",
                    },
                  ],
                },
              ],
            }),
            signal,
          })
        : (() => {
            const form = new FormData();
            // `BlobPart` wants a Uint8Array over a plain ArrayBuffer; `bytes` is
            // typed over ArrayBufferLike, so re-view it — a view copy of the
            // header only, never of the audio payload.
            form.append(
              "file",
              new Blob([
                new Uint8Array(
                  bytes.buffer as ArrayBuffer,
                  bytes.byteOffset,
                  bytes.byteLength
                ),
              ]),
              filename
            );
            form.append("model", name);
            return fetch(`${url}/v1/audio/transcriptions`, {
              method: "POST",
              body: form,
              signal,
            });
          })();
    let asked: Bounded<
      | { refused: string }
      | {
          body: {
            text?: string;
            choices?: { message?: { content?: string } }[];
          };
        }
    >;
    try {
      asked = await readWithin(TRANSCRIBE_TIMEOUT_MS, async (signal) => {
        const response = await post(signal);
        if (!response.ok) {
          return { refused: await refusal(url, response, name) };
        }
        return {
          body: (await response.json().catch(() => ({}))) as {
            text?: string;
            choices?: { message?: { content?: string } }[];
          },
        };
      });
    } catch {
      return { kind: "refused", reason: "The router could not be reached." };
    }
    let body: {
      text?: string;
      choices?: { message?: { content?: string } }[];
    };
    switch (asked.kind) {
      case "answered": {
        const { value } = asked;
        if ("refused" in value) {
          return { kind: "refused", reason: value.refused };
        }
        ({ body } = value);
        break;
      }
      case "unanswered":
        return {
          kind: "unanswered",
          reason: `${silent("The router", asked.after)} with the transcript.`,
        };
      default: {
        const unhandled: never = asked;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    const said = (
      chat ? body.choices?.[0]?.message?.content : body.text
    )?.trim();
    if (!said) {
      return { kind: "refused", reason: "The router heard nothing in that." };
    }
    return { kind: "text", text: said, transcript: said };
  };

  const intake = async (
    message: TelegramMedia
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches an incoming Telegram message across voice/audio/video-note, photo, and document (image/pdf/other) intake paths
  ): Promise<Intake | undefined> => {
    const caption = message.caption?.trim();

    const spoken = message.voice ?? message.audio ?? message.video_note;
    if (spoken) {
      const file = await fetched(spoken);
      if (!("bytes" in file)) {
        return withheld(file);
      }
      // Named for what it holds: a decoder is picked off the extension.
      return transcribe(file.bytes, `voice.${extensionOf(file.path) || "ogg"}`);
    }

    if (message.photo?.length) {
      const file = await fetched(largest(message.photo));
      if (!("bytes" in file)) {
        return withheld(file);
      }
      return {
        kind: "media",
        text: caption || "(image)",
        images: [
          {
            mediaType: "image/jpeg",
            data: Buffer.from(file.bytes).toString("base64"),
          },
        ],
      };
    }

    const { document } = message;
    if (!document) {
      return undefined;
    }
    const mime = document.mime_type ?? "";
    const name = document.file_name ?? "file";

    if (mime.startsWith("image/")) {
      const file = await fetched(document);
      if (!("bytes" in file)) {
        return withheld(file);
      }
      return {
        kind: "media",
        text: caption || "(image)",
        images: [
          { mediaType: mime, data: Buffer.from(file.bytes).toString("base64") },
        ],
      };
    }

    if (TEXT_MIME.test(mime) || TEXT_EXT.has(extensionOf(name))) {
      if ((document.file_size ?? 0) > TEXT_LIMIT) {
        return { kind: "refused", reason: TOO_MUCH_TEXT };
      }
      const file = await fetched(document);
      if (!("bytes" in file)) {
        return withheld(file);
      }
      if (file.bytes.byteLength > TEXT_LIMIT) {
        return { kind: "refused", reason: TOO_MUCH_TEXT };
      }
      const content = new TextDecoder().decode(file.bytes);
      // A NUL is how a binary claiming to be text gives itself away.
      if (content.includes("\0")) {
        return {
          kind: "refused",
          reason: `${name} says it is text, but it is not.`,
        };
      }
      return {
        kind: "media",
        text: caption || `(${name})`,
        attachments: [{ kind: "text", name, content }],
      };
    }

    return {
      kind: "refused",
      reason: `Can't carry ${mime || name} yet — images and text files only.`,
    };
  };

  return { intake };
};
