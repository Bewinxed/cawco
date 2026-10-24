/**
 * Updates › machines of one target asking the hub for a build at once share
 * one download of its archive (core binary-distribution.ts `archiveFor`).
 *
 * 2026-10-23: obelisk and both VPSes (linux-x64 each) asked for the same
 * nightly in one second, and the hub drew three copies of its 120 MB
 * archive from GitHub, which held the first answer long enough for the SSH
 * door's old cut (ssh-forward-download).
 *
 * On a scratch fleet's hub, which reaches GitHub through a proxy that holds
 * every answer for {@link HOLD_MS} (held-proxy.ts) and counts what each host
 * sends back: three asks of the offered build's archive for this host's
 * target, at once, while nothing has it cached.
 *
 * (a) Each ask, answered 503 while the hub fetches and asked again, comes
 *     whole (200, the signed manifest's bytes), and the release host sent
 *     one archive's worth through the proxy, not three.
 *
 *   bun scripts/probe-kit/run.ts archive-once
 */
import { delay } from "../../scratch-fleet";
import { heldProxy } from "../held-proxy";
import type { Kit, Spec } from "../kit";

/** How long the release host's answer is held: every ask is in flight before any is answered. */
const HOLD_MS = 5000;
/** The asks at once: obelisk's and both VPSes'. */
const ASKS = 3;

interface Manifest {
  artifacts: {
    archive: string;
    sha256: string;
    size: number;
    target: string;
  }[];
  version: string;
}

/** What one ask came back with. */
interface Asked {
  sha256: string;
  size: number;
  status: number;
}

/** The bytes the release host's archive downloads came back with: what its asset host (`release-assets.githubusercontent.com`) sent. */
const archiveBytes = (carried: Record<string, number>): number =>
  Object.entries(carried)
    .filter(([target]) => target.startsWith("release-assets."))
    .reduce((sum, [, bytes]) => sum + bytes, 0);

async function run(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  // The asset host alone: what a slow release host is slow to send.
  const proxy = await heldProxy((target) =>
    target.startsWith("release-assets.")
  );
  try {
    const loopback =
      fleet.env.no_proxy ?? fleet.env.NO_PROXY ?? "localhost,127.0.0.1,::1";
    fleet.launch("hub", [], {
      HTTPS_PROXY: proxy.url,
      https_proxy: proxy.url,
      NO_PROXY: loopback,
      no_proxy: loopback,
    });
    await fleet.hubUp();
    const offer = await fleet
      .api<{ manifest?: Manifest }>("/api/binary-updates/latest")
      .catch((error: Error) => ({ manifest: undefined, error: error.message }));
    const target = `${process.platform}-${process.arch}`;
    const artifact = offer.manifest?.artifacts.find(
      (row) => row.target === target
    );
    kit.check(
      `the hub offers a build with a ${target} archive (found on GitHub, through the proxy)`,
      artifact !== undefined,
      `latest ${JSON.stringify(offer).slice(0, 300)}`
    );
    if (!(artifact && offer.manifest)) {
      return;
    }
    const url = `${fleet.base}/api/binary-updates/artifacts/${encodeURIComponent(offer.manifest.version)}/${encodeURIComponent(artifact.archive)}`;
    const before = archiveBytes(proxy.carried());
    const connectsBefore = proxy.targets().length;
    proxy.hold(true);
    const asks = Array.from({ length: ASKS }, async (): Promise<Asked> => {
      // The hub answers at once: 503 while it fetches, as a machine hears it.
      let response = await fetch(url);
      while (response.status === 503) {
        // biome-ignore lint/performance/noAwaitInLoops: one ask at a time, as a machine asks
        await response.arrayBuffer();
        await delay(1000);
        response = await fetch(url);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        status: response.status,
        size: bytes.length,
        sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
      };
    });
    await delay(HOLD_MS);
    proxy.hold(false);
    const got = await Promise.all(asks);
    const drawn = archiveBytes(proxy.carried()) - before;
    kit.check(
      `a: ${ASKS} asks of one archive at once each come whole, and the release host sent one archive's worth (${artifact.size} bytes), not ${ASKS}`,
      got.every(
        (one) =>
          one.status === 200 &&
          one.size === artifact.size &&
          one.sha256 === artifact.sha256
      ) &&
        drawn >= artifact.size &&
        drawn < 2 * artifact.size,
      `asks ${JSON.stringify(got)}; the release host sent ${drawn} bytes (${(drawn / artifact.size).toFixed(2)} archives) through ${proxy.targets().length - connectsBefore} new tunnel(s): ${JSON.stringify(proxy.targets().slice(connectsBefore))}`
    );
  } finally {
    proxy.stop();
  }
}

export default { name: "archive-once", run } satisfies Spec;
