/**
 * A take-over's passkey bridge: the daemon's end of the agent browser's
 * WebAuthn proxy extension (browser/passkey-extension/background.js).
 *
 * The extension takes every WebAuthn ceremony from Chromium's dialog and
 * stands it in its `chrome.storage.session` as `passkey-request:<id>`. The
 * bridge reads that storage over the daemon's own DevTools connection, by
 * evaluating in the extension's service worker every {@link POLL_MS}. For a
 * `get`, it makes a hybrid QR of its own (cable-initiator.ts) and hands its
 * `FIDO:/` URI on for the hub to show; the person's phone scans it and
 * advertises, the advert is relayed back here ({@link PasskeyBridge.advert}),
 * and the bridge meets the phone on the caBLE tunnel, gets the assertion, and
 * writes `passkey-response:<id>` with the credential as
 * `PublicKeyCredential.toJSON()` gives it. The extension answers the page.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  type CableAssertionResponse,
  type CableInitiatorOptions,
  type CableInitiatorResult,
  completeCeremony,
  generateQr,
  isOwnAdvert,
} from "./cable-initiator";
import { CdpLink } from "./cdp-takeover";

/** The extension's service worker, by the id its manifest's key gives it (chromium.conf). */
const WORKER_URL =
  "chrome-extension://ggmghgopcefkanlpdhbbjogokighkbgc/background.js";

const REQUEST = "passkey-request:";
const RESPONSE = "passkey-response:";

/** How often the extension's storage is read for a ceremony. */
const POLL_MS = 1000;

/** What the extension stands for one ceremony (background.js `stand`). */
const StoodRequest = z.object({
  type: z.enum(["get", "create"]),
  requestId: z.number(),
  requestDetailsJson: z.string(),
});

/**
 * A `get`'s options as Chromium hands them to the proxy (components/webauthn/
 * json/value_conversions.cc `ToValue`): binary fields base64url, and the
 * calling page's origin in `remoteDesktopClientOverride`, which Chromium adds
 * to every proxied request (content authenticator_common_impl.cc).
 */
const RequestDetails = z.object({
  challenge: z.string(),
  rpId: z.string().optional(),
  allowCredentials: z
    .array(z.object({ type: z.string(), id: z.string() }))
    .optional(),
  userVerification: z.enum(["required", "preferred", "discouraged"]).optional(),
  extensions: z.object({
    remoteDesktopClientOverride: z.object({
      origin: z.string(),
      sameOriginWithAncestors: z.boolean(),
    }),
  }),
});

/** `Runtime.evaluate`'s answer: the storage, or what the worker threw reading it. */
const StorageRead = z.object({
  result: z.object({ value: z.record(z.string(), z.unknown()).optional() }),
  exceptionDetails: z.object({ text: z.string() }).optional(),
});

const TargetList = z.object({
  targetInfos: z.array(z.object({ targetId: z.string(), url: z.string() })),
});

/** A DOMException the extension hands the page in place of a credential. */
interface CeremonyError {
  message: string;
  name: "NotAllowedError" | "NotSupportedError";
}

/** A `get` the bridge made a QR for, waiting for its phone's advert or meeting it. */
interface Ceremony {
  /** Aborts the tunnel when the page lets the ceremony go. */
  abort: AbortController;
  clientDataJson: Buffer;
  /** Whether its phone's advert came and the tunnel is being met. */
  meeting: boolean;
  options: CableInitiatorOptions;
  qr: CableInitiatorResult;
  requestId: number;
}

/** A QR the bridge made, for the hub to show. */
export interface BridgeQr {
  fidoUri: string;
  /** The page's origin (`https://github.com`). */
  rpOrigin: string;
}

const base64url = (data: Buffer): string => data.toString("base64url");

/** The credential as `PublicKeyCredential.toJSON()` gives it, the shape the proxy reads back (value_conversions.cc `GetAssertionResponseFromValue`). */
const credentialJson = (
  assertion: CableAssertionResponse,
  clientDataJson: Buffer
): string =>
  JSON.stringify({
    type: "public-key",
    id: base64url(assertion.credentialId),
    rawId: base64url(assertion.credentialId),
    authenticatorAttachment: "cross-platform",
    response: {
      clientDataJSON: base64url(clientDataJson),
      authenticatorData: base64url(assertion.authenticatorData),
      signature: base64url(assertion.signature),
      ...(assertion.userHandle
        ? { userHandle: base64url(assertion.userHandle) }
        : {}),
    },
    clientExtensionResults: {},
  });

/** The browser's end of a `get` (`webauthn.get` clientDataJSON in Chromium's key order, content client_data_json.cc) and the phone's options. */
const ceremonyOf = (
  requestId: number,
  details: z.infer<typeof RequestDetails>
): Ceremony => {
  const { origin, sameOriginWithAncestors } =
    details.extensions.remoteDesktopClientOverride;
  const clientDataJson = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge: details.challenge,
      origin,
      crossOrigin: !sameOriginWithAncestors,
    })
  );
  const abort = new AbortController();
  return {
    requestId,
    qr: generateQr(),
    clientDataJson,
    abort,
    meeting: false,
    options: {
      rpId: details.rpId ?? new URL(origin).hostname,
      clientDataHash: createHash("sha256").update(clientDataJson).digest(),
      ...(details.allowCredentials
        ? {
            allowCredentials: details.allowCredentials.map(({ type, id }) => ({
              type,
              id: Buffer.from(id, "base64url"),
            })),
          }
        : {}),
      ...(details.userVerification
        ? { userVerification: details.userVerification }
        : {}),
      signal: abort.signal,
    },
  };
};

/**
 * One take-over's bridge: its own DevTools connection to the browser,
 * reading the extension's storage while it is open, calling `onQr` with each
 * QR it makes.
 */
export class PasskeyBridge {
  readonly #link: CdpLink;
  readonly #onQr: (qr: BridgeQr) => void;
  readonly #onFail: (error: unknown) => void;
  readonly #timer: ReturnType<typeof setInterval>;
  /** The service worker's session on {@link #link}; it goes when the worker sleeps. */
  #session: string | undefined;
  /** Requests already taken up, so one standing across reads is taken once. */
  readonly #taken = new Set<number>();
  #ceremony: Ceremony | undefined;
  /** The read under way, if one is: a tick that finds one leaves it be. */
  #reading: Promise<void> | undefined;
  #closed = false;

  private constructor(
    link: CdpLink,
    onQr: (qr: BridgeQr) => void,
    onFail: (error: unknown) => void
  ) {
    this.#link = link;
    this.#onQr = onQr;
    this.#onFail = onFail;
    link.onEvent = (message) => {
      if (
        message.method === "Target.detachedFromTarget" &&
        message.params?.sessionId === this.#session
      ) {
        this.#session = undefined;
      }
    };
    link.onClose = () => {
      this.close();
    };
    this.#timer = setInterval(() => this.#tick(), POLL_MS);
  }

  /** A bridge to the Chromium whose DevTools answer at `devtools`. */
  static async open(
    devtools: string,
    onQr: (qr: BridgeQr) => void,
    onFail: (error: unknown) => void
  ): Promise<PasskeyBridge> {
    return new PasskeyBridge(await CdpLink.open(devtools), onQr, onFail);
  }

  /** Whether it closed (the browser's DevTools connection did): a new one is opened. */
  get closed(): boolean {
    return this.#closed;
  }

  /**
   * A relayed phone advert: taken, and its tunnel met, when it is the
   * waiting ceremony's phone. True while a ceremony owns the browser, so the
   * advert goes nowhere else.
   */
  advert(serviceData: Buffer): boolean {
    const ceremony = this.#ceremony;
    if (!ceremony) {
      return false;
    }
    if (ceremony.meeting || !isOwnAdvert(ceremony.qr, serviceData)) {
      return true;
    }
    ceremony.meeting = true;
    console.info(
      `[passkey] the phone for ${ceremony.options.rpId} advertised: meeting it on the caBLE tunnel`
    );
    completeCeremony(ceremony.qr, serviceData, ceremony.options).then(
      (assertion) =>
        this.#answer(ceremony, {
          responseJson: credentialJson(assertion, ceremony.clientDataJson),
        }),
      (error: unknown) =>
        this.#answer(ceremony, {
          error: {
            name: "NotAllowedError",
            message: error instanceof Error ? error.message : String(error),
          },
        })
    );
    return true;
  }

  close(): void {
    this.#closed = true;
    clearInterval(this.#timer);
    this.#ceremony?.abort.abort();
    this.#ceremony = undefined;
    this.#link.close();
  }

  #tick(): void {
    this.#reading ??= this.#read()
      .catch((error: unknown) => {
        // The worker slept or went: found and attached again next read.
        this.#session = undefined;
        this.#onFail(error);
      })
      .finally(() => {
        this.#reading = undefined;
      });
  }

  async #worker(): Promise<string | undefined> {
    if (this.#session) {
      return this.#session;
    }
    const { targetInfos } = TargetList.parse(
      await this.#link.call("Target.getTargets")
    );
    const worker = targetInfos.find(({ url }) => url === WORKER_URL);
    if (worker) {
      this.#session = await this.#link.attach(worker.targetId);
    }
    return this.#session;
  }

  async #read(): Promise<void> {
    const session = await this.#worker();
    if (!session) {
      return;
    }
    const read = StorageRead.parse(
      await this.#link.call(
        "Runtime.evaluate",
        {
          expression: "chrome.storage.session.get(null)",
          awaitPromise: true,
          returnByValue: true,
        },
        session
      )
    );
    if (read.exceptionDetails) {
      throw new Error(
        `The passkey bridge's storage could not be read: ${read.exceptionDetails.text}`
      );
    }
    const stood = Object.entries(read.result.value ?? {}).flatMap(
      ([key, value]) => {
        const request = StoodRequest.safeParse(value);
        return key.startsWith(REQUEST) && request.success ? [request.data] : [];
      }
    );
    // The page let the waiting ceremony go: the extension removed its request.
    const waiting = this.#ceremony;
    if (
      waiting &&
      !stood.some(({ requestId }) => requestId === waiting.requestId)
    ) {
      waiting.abort.abort();
      this.#ceremony = undefined;
    }
    for (const request of stood) {
      if (!this.#taken.has(request.requestId)) {
        this.#taken.add(request.requestId);
        await this.#take(request);
      }
    }
  }

  async #take(request: z.infer<typeof StoodRequest>): Promise<void> {
    if (request.type === "create") {
      await this.#write(request.requestId, {
        error: {
          name: "NotSupportedError",
          message:
            "CawCo's passkey relay signs in with a passkey the phone holds; it makes none.",
        },
      });
      return;
    }
    const details = RequestDetails.safeParse(
      JSON.parse(request.requestDetailsJson)
    );
    if (!details.success) {
      await this.#write(request.requestId, {
        error: {
          name: "NotSupportedError",
          message: `CawCo's passkey relay could not read the request: ${details.error.message}`,
        },
      });
      return;
    }
    this.#ceremony?.abort.abort();
    const ceremony = ceremonyOf(request.requestId, details.data);
    this.#ceremony = ceremony;
    this.#onQr({
      fidoUri: ceremony.qr.fidoUri,
      rpOrigin: details.data.extensions.remoteDesktopClientOverride.origin,
    });
  }

  async #answer(
    ceremony: Ceremony,
    answer: { responseJson: string } | { error: CeremonyError }
  ): Promise<void> {
    if (this.#ceremony !== ceremony) {
      return;
    }
    this.#ceremony = undefined;
    await this.#write(ceremony.requestId, answer).catch(this.#onFail);
  }

  /** `passkey-response:<id>`, which the extension completes the ceremony with. */
  async #write(
    requestId: number,
    answer: { responseJson: string } | { error: CeremonyError }
  ): Promise<void> {
    const session = await this.#worker();
    if (!session) {
      throw new Error("The passkey bridge extension's worker is not running.");
    }
    const entry = JSON.stringify({ [`${RESPONSE}${requestId}`]: answer });
    await this.#link.call(
      "Runtime.evaluate",
      {
        expression: `chrome.storage.session.set(${entry})`,
        awaitPromise: true,
      },
      session
    );
  }
}
