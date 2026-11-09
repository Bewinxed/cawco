/**
 * The last step of a published release, shared by release.ts and
 * republish.ts: the hub on this host told the release is up.
 */

import { machineFetch } from "../packages/agent/src/machine-fetch";
import { readInstallation } from "../packages/core/src/binary-installation";
import { readWithin } from "../packages/core/src/bounded";
import { hubInit, hubRequest } from "../packages/core/src/hub-request";
import type { ReleaseManifest } from "../packages/core/src/release-manifest";

/** How long the hub has to look at its release host and answer, each ask. */
export const ANNOUNCE_MS = 30_000;
/** How long the hub has to find the published build before announce fails. */
const ANNOUNCE_FOUND_MS = 60_000;
/** The first wait before asking again; each next one doubles, to {@link ANNOUNCE_WAIT_MAX_MS}. */
const ANNOUNCE_WAIT_MS = 2000;
const ANNOUNCE_WAIT_MAX_MS = 15_000;
/**
 * The hub on this host told to look at its release host now (`POST
 * /api/binary-updates/check`, as this machine), so every machine sees the
 * release at once rather than when the hub's cached release ages out (hub
 * binary-updates.ts `RELEASE_TTL_MS`). Done only when the hub names the build
 * just published: an older one is asked again, each wait longer, until
 * {@link ANNOUNCE_FOUND_MS} has passed, then the step fails naming both. A
 * hub that follows the other channel is told and says so. A host with no
 * installation names no hub, and says so.
 */
export async function announce(published: ReleaseManifest): Promise<void> {
  const installation = await readInstallation();
  if (!installation?.hubUrl) {
    console.log(
      "This host has no CawCo installation naming a hub: no hub was told of the release"
    );
    return;
  }
  const { hubUrl } = installation;
  const check = async (): Promise<{ channel: string; version: string }> => {
    const request = hubRequest("POST /api/binary-updates/check");
    const asked = await readWithin(ANNOUNCE_MS, async (signal) => {
      const response = await machineFetch(
        `${hubUrl}${request.path}`,
        hubInit(request, { signal })
      );
      return {
        ok: response.ok,
        status: response.status,
        text: await response.text(),
      };
    });
    if (asked.kind === "unanswered") {
      throw new Error(
        `The hub at ${hubUrl} did not answer the release check within ${ANNOUNCE_MS / 1000} s`
      );
    }
    const { ok, status, text } = asked.value;
    if (!ok) {
      throw new Error(
        `The hub at ${hubUrl} answered the release check ${status}: ${text}`
      );
    }
    return JSON.parse(text) as { channel: string; version: string };
  };
  const started = Date.now();
  let wait = ANNOUNCE_WAIT_MS;
  for (;;) {
    const { channel: follows, version: found } = await check();
    if (follows !== published.channel) {
      console.log(
        `The hub at ${hubUrl} follows ${follows}, not ${published.channel}: it found ${found}`
      );
      return;
    }
    if (found === published.version) {
      console.log(`The hub at ${hubUrl} found ${found}`);
      return;
    }
    const left = ANNOUNCE_FOUND_MS - (Date.now() - started);
    if (left <= 0) {
      throw new Error(
        `The hub at ${hubUrl} still found ${found} ${Math.round((Date.now() - started) / 1000)} s after ${published.version} was published`
      );
    }
    console.log(
      `The hub at ${hubUrl} found ${found}, not ${published.version} yet: asking again in ${Math.round(Math.min(wait, left) / 1000)} s`
    );
    await Bun.sleep(Math.min(wait, left));
    wait = Math.min(wait * 2, ANNOUNCE_WAIT_MAX_MS);
  }
}
