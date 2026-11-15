/**
 * A tool call's keyed digest: what a permit (core asks.ts) matches the call
 * its session makes again by, so the call as it was asked is kept nowhere,
 * neither on a permit's row nor anywhere the hub reads it back. The same
 * call (core `callKey`: its tool and canonical input, a shell command's
 * description aside) gives the same digest while the hub's key file stands
 * (secret-box.ts `keyedDigest`, under its own derived key).
 */
import { callKey } from "@cawco/core/asks";
import { keyedDigest } from "./secret-box";

/** The derived key's label: its own, for this use alone. */
const LABEL = "cawco permit call v1";

/** The digest of `tool` called with `input`. */
export const callDigest = (
  tool: string,
  input: Record<string, unknown>
): string => keyedDigest(LABEL, `${tool}\n${callKey({ tool, input })}`);
