/**
 * Whether pi holds a sign-in for the provider a model runs on, in pi's own
 * words: `ModelRuntime.checkAuth` (@earendil-works/pi-coding-agent 1.0.1,
 * dist/core/model-runtime.d.ts: `checkAuth(providerId, options):
 * Promise<AuthCheck | undefined>`), which answers the credential pi would use
 * (`{ source?, type: "api_key" | "oauth" }`) or undefined when it has none,
 * from pi's own store, its environment and its providers' own checks. An
 * extension's provider is one pi composed, so it answers the same way; no
 * extension's config is read here and no request is made to any proxy.
 */
import { readWithin } from "@cawco/core/bounded";
import { unhandled } from "@cawco/core/unhandled";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

/** How often pi's word on its sign-in is read again beside the watch on its agent dir (daemon.ts). */
export const PI_AUTH_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** How long pi's own check of a provider gets: a provider's key check may ask its service. */
const PI_AUTH_CHECK_MS = 10_000;

export interface PiCredentialState {
  reason?: string;
  state: "signed-in" | "signed-out" | "unknown";
}

/** pi's answer on whether it can sign `provider`'s requests. */
export async function checkPiCredential(
  runtime: ModelRuntime,
  provider: string
): Promise<PiCredentialState> {
  const name = runtime.getProvider(provider)?.name ?? provider;
  const checked = await readWithin(PI_AUTH_CHECK_MS, (signal) =>
    runtime.checkAuth(provider, { signal })
  ).catch((error: unknown) => ({
    kind: "failed" as const,
    error: error instanceof Error ? error.message : String(error),
  }));
  switch (checked.kind) {
    case "answered":
      return checked.value
        ? { state: "signed-in" }
        : {
            state: "signed-out",
            reason: `pi: ${name} is not signed in — sign in with pi`,
          };
    case "unanswered":
      return {
        state: "unknown",
        reason: `pi: ${name} sign-in status unknown — pi's check did not answer within ${Math.round(checked.after / 1000)} s`,
      };
    case "failed":
      return {
        state: "unknown",
        reason: `pi: ${name} sign-in status unknown — ${checked.error}`,
      };
    default:
      unhandled("read", checked);
  }
}
