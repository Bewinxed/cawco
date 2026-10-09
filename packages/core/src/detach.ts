/**
 * Work started and not awaited: the one way the hub and sessiond let a
 * promise run on its own. A rejection nobody handles ends a Bun process, so
 * every detached promise carries its own handler, and that handler logs the
 * failure and nothing more.
 *
 * The log line is built from the error's name and message only. A fetch error
 * carries the request URL in its other fields (Bun's `path`), and a URL can
 * hold a credential, as Telegram's bot URLs do.
 */
export function detach(work: Promise<unknown>, what: string): void {
  work.catch((error: unknown) => {
    console.warn(`[${what}] failed: ${failureOf(error)}`);
  });
}

/** `<name>: <message>` of a thrown value, and none of its other fields. */
export const failureOf = (error: unknown): string =>
  error instanceof Error
    ? `${error.name}: ${error.message}`
    : `${typeof error}: ${String(error)}`;
