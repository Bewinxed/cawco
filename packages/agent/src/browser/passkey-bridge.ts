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
 *
 * The bridge opens with its take-over, before any ceremony: no ceremony is
 * seen until the extension runs. It loads the extension over DevTools
 * (`Extensions.loadUnpacked`) unless its worker already runs, and finds the
 * worker by the browser's own target events for service workers
 * (`Target.setDiscoverTargets`), attaching to it as it starts.
 */
import { createHash } from "node:crypto";
import { boundedRead } from "@cawco/core/effect/bounded";
import { Deferred, Effect } from "effect";
import { z } from "zod";
import { every, runPromise } from "../daemon-runtime";
import {
  type CableAssertionResponse,
  type CableInitiatorOptions,
  type CableInitiatorResult,
  completeCeremony,
  generateQr,
  isOwnAdvert,
} from "./cable-initiator";
import { CdpLink } from "./cdp-takeover";

/** The extension's id, which its manifest's key gives it (chromium.conf). */
const EXTENSION_ID = "ggmghgopcefkanlpdhbbjogokighkbgc";

/** Where the image puts the extension (Dockerfile). */
const EXTENSION_PATH = "/opt/cawco/passkey-extension";

/** The extension's service worker. */
const WORKER_URL = `chrome-extension://${EXTENSION_ID}/background.js`;

/** How long the bridge waits for the worker to run once the extension is loaded. */
const WORKER_MS = 10_000;

/** How long `Extensions.loadUnpacked` has to read the extension and install it. */
const LOAD_MS = 10_000;

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

/** `Target.targetCreated` and `Target.targetInfoChanged`'s target. */
const TargetEvent = z.object({
  targetInfo: z.object({ targetId: z.string(), url: z.string() }),
});

/** `Target.targetDestroyed`'s target. */
const TargetGone = z.object({ targetId: z.string() });

/** `Extensions.loadUnpacked`'s answer. */
const Loaded = z.object({ id: z.string() });

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
  /** The storage's reads every {@link POLL_MS}: their stop. */
  #reads: (() => void) | undefined;
  /** The worker's target while it runs, as the browser's target events say. */
  #target: string | undefined;
  /** Settled when {@link #target} is found; made new when the worker stops. */
  #found = Deferred.makeUnsafe<void>();
  /** The service worker's session on {@link #link}; it goes when the worker stops. */
  #session: string | undefined;
  /** Requests already taken up, so one standing across reads is taken once. */
  readonly #taken = new Set<number>();
  #ceremony: Ceremony | undefined;
  #closed = false;

  private constructor(
    link: CdpLink,
    onQr: (qr: BridgeQr) => void,
    onFail: (error: unknown) => void
  ) {
    this.#link = link;
    this.#onQr = onQr;
    this.#onFail = onFail;
    link.onEvent = ({ method, params }) => {
      if (
        method === "Target.targetCreated" ||
        method === "Target.targetInfoChanged"
      ) {
        const event = TargetEvent.safeParse(params);
        if (event.success && event.data.targetInfo.url === WORKER_URL) {
          this.#target = event.data.targetInfo.targetId;
          Deferred.doneUnsafe(this.#found, Effect.void);
        }
      } else if (method === "Target.targetDestroyed") {
        const gone = TargetGone.safeParse(params);
        if (gone.success && gone.data.targetId === this.#target) {
          this.#target = undefined;
          this.#session = undefined;
          this.#found = Deferred.makeUnsafe<void>();
        }
      } else if (
        method === "Target.detachedFromTarget" &&
        params?.sessionId === this.#session
      ) {
        this.#session = undefined;
      }
    };
    link.onClose = () => {
      this.close();
    };
  }

  /**
   * A bridge to the Chromium whose DevTools answer at `devtools`, with the
   * extension loaded and its worker attached. A worker that does not run
   * within {@link WORKER_MS} is said through `onFail`, and the bridge stays
   * open: a loaded extension's worker stops when idle and starts again at
   * its next WebAuthn ceremony, and is attached then.
   */
  static async open(
    devtools: string,
    onQr: (qr: BridgeQr) => void,
    onFail: (error: unknown) => void
  ): Promise<PasskeyBridge> {
    const bridge = new PasskeyBridge(
      await CdpLink.open(devtools),
      onQr,
      onFail
    );
    try {
      await bridge.#start();
    } catch (error) {
      bridge.close();
      throw error;
    }
    return bridge;
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
    this.#reads?.();
    this.#ceremony?.abort.abort();
    this.#ceremony = undefined;
    this.#link.close();
  }

  /**
   * The browser's service workers watched (`Target.setDiscoverTargets`
   * names each that runs now, and each that starts or stops after), the
   * extension loaded unless its worker runs already, the worker waited for
   * and attached, and the storage read from then on.
   */
  async #start(): Promise<void> {
    await this.#link.call("Target.setDiscoverTargets", {
      discover: true,
      filter: [{ type: "service_worker" }],
    });
    const load = this.#target ? undefined : await this.#load();
    const found = await runPromise(
      boundedRead(WORKER_MS, Deferred.await(this.#found)).pipe(
        Effect.as(true),
        Effect.catchTag("Unanswered", () => Effect.succeed(false))
      )
    );
    if (found) {
      await this.#worker();
    } else {
      this.#onFail(
        new Error(
          `the extension's worker (${WORKER_URL}) did not run within ${WORKER_MS / 1000} s${load ? `, and ${load}` : ""}; it is attached when it starts`
        )
      );
    }
    // The browser's DevTools connection closed meanwhile: nothing to read.
    if (!this.closed) {
      // Each read a poll's wait after the one before ended.
      this.#reads = every(
        "passkey extension reads",
        POLL_MS,
        Effect.promise(() =>
          this.#read().catch((error: unknown) => {
            // The worker stopped or went: attached again once it runs.
            this.#session = undefined;
            this.#onFail(error);
          })
        )
      );
    }
  }

  /**
   * The extension loaded from the image (`Extensions.loadUnpacked`), which
   * starts its worker. Undefined once loaded; else why not, for a build
   * whose DevTools refuse the call (before Chromium 149 a client on
   * --remote-debugging-port gets "Method not available.": the call wanted
   * --remote-debugging-pipe and --enable-unsafe-extension-debugging,
   * chrome/browser/devtools/chrome_devtools_session.cc), where
   * chromium.conf's --load-extension is what loads it.
   */
  async #load(): Promise<string | undefined> {
    let id: string;
    try {
      ({ id } = Loaded.parse(
        await this.#link.call(
          "Extensions.loadUnpacked",
          { path: EXTENSION_PATH },
          undefined,
          LOAD_MS
        )
      ));
    } catch (error) {
      return `Extensions.loadUnpacked did not load it (${error instanceof Error ? error.message : String(error)})`;
    }
    if (id !== EXTENSION_ID) {
      return `Extensions.loadUnpacked loaded ${EXTENSION_PATH} as ${id}, not ${EXTENSION_ID}: its manifest's key changed`;
    }
    return undefined;
  }

  /** The worker's session, attached when it runs and is not yet; undefined while it does not run. */
  async #worker(): Promise<string | undefined> {
    if (this.#session || !this.#target) {
      return this.#session;
    }
    this.#session = await this.#link.attach(this.#target);
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
