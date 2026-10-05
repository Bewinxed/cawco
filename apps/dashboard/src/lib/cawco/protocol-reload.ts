/**
 * A tab built for an older wire than the hub's reloads itself.
 *
 * Every other deploy asks first (deploy-toast.ts): "nobody gets a page pulled
 * out from under them mid-task" (440bdbc6). A tab whose wire is older than
 * the hub's (`WIRE_PROTOCOL`, named on the board snapshot) is past that: it
 * misreads what the hub sends. So it reads nothing more (client.svelte.ts,
 * `olderThanHub`) and reloads, and what the toast protects is kept another
 * way. Every composer writes its unsent words down first (`keepsDrafts`); a
 * field that keeps nothing across a reload holds the reload until it is left.
 * It only reloads once the dashboard serving it has the newer build, or the
 * reload would load this one again. Either wait is told to the caller, which
 * says so in the connection band: a page that has stopped reading says why.
 */
import { updated } from "$app/state";

/** Writes each composer's unsent words down; each resolves once they are stored. */
const flushes = new Set<() => Promise<void>>();

/**
 * Registers what writes a composer's unsent words down before a reload, and
 * marks its field with `data-keeps-draft`. Returns the release.
 */
export function keepsDrafts(flush: () => Promise<void>): () => void {
  flushes.add(flush);
  return () => {
    flushes.delete(flush);
  };
}

const TEXT_INPUTS = new Set([
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url",
]);

/** The field being typed in, when it keeps nothing across a reload. */
function unkeptField(): HTMLElement | null {
  const field = document.activeElement;
  if (!(field instanceof HTMLElement) || field.closest("[data-keeps-draft]")) {
    return null;
  }
  const typed =
    field.isContentEditable ||
    field instanceof HTMLTextAreaElement ||
    (field instanceof HTMLInputElement && TEXT_INPUTS.has(field.type));
  return typed ? field : null;
}

/**
 * What a due reload is waiting on: the dashboard does not serve the newer
 * build yet, or a field that keeps nothing across a reload is being typed in.
 */
export type ReloadHold = "build" | "field";

let reloading = false;

/**
 * Reloads a tab built for an older wire than the hub's; the caller has
 * already established that it is. Called again on every snapshot the hub
 * sends, so a dashboard that was not serving the newer build yet is asked
 * again.
 */
export async function reloadForProtocol(
  held: (hold: ReloadHold) => void
): Promise<void> {
  if (reloading) {
    return;
  }
  if (!(await updated.check())) {
    held("build");
    return;
  }
  if (reloading) {
    return;
  }
  reloading = true;
  for (let field = unkeptField(); field; field = unkeptField()) {
    held("field");
    const left = field;
    // biome-ignore lint/performance/noAwaitInLoops: one field at a time — focus moves from one to the next
    await new Promise((resolve) =>
      left.addEventListener("blur", resolve, { once: true })
    );
  }
  await Promise.allSettled([...flushes].map((flush) => flush()));
  location.reload();
}
