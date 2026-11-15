/**
 * A take-over's watch for a WebAuthn ceremony, and the passkey QR it brings.
 *
 * Chromium draws a ceremony's hybrid QR in its own dialog, outside every
 * page's DOM, so the page cannot be read for it. The page is told on: a
 * wrapper around `navigator.credentials.get` and `.create`, added to each
 * new document of the page the person sees and to the one open now, logs
 * {@link WEBAUTHN_START} when a ceremony asks for a public key. Heard over
 * the watch's own DevTools connection (`Runtime.consoleAPICalled`), the
 * dialog is given {@link DIALOG_MS} to draw, and the container's X display
 * is read for the QR (passkey-qr-capture.ts).
 */
import { CdpLink } from "./cdp-takeover";
import { captureQrFromDisplay } from "./passkey-qr-capture";

/** The console line the wrapper logs as a ceremony starts. */
const WEBAUTHN_START = "__CAWCO_WEBAUTHN_START__";

/** How long Chromium's dialog is given to draw before the screen is read. */
const DIALOG_MS = 1000;

/**
 * The wrapper, run in the page's own world before its scripts: once per
 * document, it logs {@link WEBAUTHN_START} with the relying party before a
 * `publicKey` ceremony goes on as asked.
 */
const WRAPPER = `(() => {
  const credentials = navigator.credentials;
  if (!credentials || credentials.__cawcoWebauthn) return;
  Object.defineProperty(credentials, "__cawcoWebauthn", { value: true });
  for (const name of ["get", "create"]) {
    const original = credentials[name]?.bind(credentials);
    if (!original) continue;
    credentials[name] = function (options) {
      if (options?.publicKey) {
        console.log(${JSON.stringify(WEBAUTHN_START)}, JSON.stringify({
          rpId: options.publicKey.rpId || options.publicKey.rp?.id || window.location.hostname,
          timestamp: Date.now()
        }));
      }
      return original(options);
    };
  }
})()`;

/** What a `Runtime.consoleAPICalled` event carries that the watch reads. */
interface ConsoleCall {
  args?: { value?: unknown }[];
}

/**
 * One take-over's watch: its own DevTools connection to the browser, on the
 * page the person sees ({@link follow}), calling `onUri` with each passkey
 * QR's FIDO URI read off container `containerId`'s screen.
 */
export class PasskeyWatch {
  readonly #link: CdpLink;
  readonly #containerId: string;
  readonly #onUri: (uri: string) => void;
  readonly #onFail: (error: unknown) => void;
  /** The page watched, and its session on {@link #link}. */
  #page: { targetId: string; session: string } | undefined;
  /** A ceremony's screen being read: another heard meanwhile is the same dialog. */
  #reading = false;
  #closed = false;

  private constructor(
    link: CdpLink,
    containerId: string,
    onUri: (uri: string) => void,
    onFail: (error: unknown) => void
  ) {
    this.#link = link;
    this.#containerId = containerId;
    this.#onUri = onUri;
    this.#onFail = onFail;
    link.onEvent = (message) => {
      if (
        message.method === "Runtime.consoleAPICalled" &&
        message.sessionId === this.#page?.session
      ) {
        this.#heard(message.params as ConsoleCall | undefined);
      }
    };
    link.onClose = () => {
      this.#closed = true;
    };
  }

  /** A watch of the Chromium whose DevTools answer at `devtools`, in container `containerId`. */
  static async open(
    devtools: string,
    containerId: string,
    onUri: (uri: string) => void,
    onFail: (error: unknown) => void
  ): Promise<PasskeyWatch> {
    const link = await CdpLink.open(devtools);
    return new PasskeyWatch(link, containerId, onUri, onFail);
  }

  /** Whether its DevTools connection closed (the browser stopped): a new watch is opened. */
  get closed(): boolean {
    return this.#closed;
  }

  /** Watches page `targetId` from now on, the one before let go. */
  async follow(targetId: string): Promise<void> {
    if (this.#page?.targetId === targetId) {
      return;
    }
    const before = this.#page;
    this.#page = undefined;
    if (before) {
      this.#link
        .call("Target.detachFromTarget", { sessionId: before.session })
        .catch(() => undefined);
    }
    const session = await this.#link.attach(targetId);
    await Promise.all([
      this.#link.call("Runtime.enable", {}, session),
      this.#link.call(
        "Page.addScriptToEvaluateOnNewDocument",
        { source: WRAPPER },
        session
      ),
      this.#link.call("Runtime.evaluate", { expression: WRAPPER }, session),
    ]);
    this.#page = { targetId, session };
  }

  close(): void {
    this.#closed = true;
    this.#link.close();
  }

  #heard(call: ConsoleCall | undefined): void {
    if (call?.args?.[0]?.value !== WEBAUTHN_START || this.#reading) {
      return;
    }
    this.#reading = true;
    this.#read()
      .catch(this.#onFail)
      .finally(() => {
        this.#reading = false;
      });
  }

  async #read(): Promise<void> {
    await Bun.sleep(DIALOG_MS);
    if (this.closed) {
      return;
    }
    const uri = await captureQrFromDisplay(this.#containerId);
    if (uri && !this.closed) {
      this.#onUri(uri);
    }
  }
}
