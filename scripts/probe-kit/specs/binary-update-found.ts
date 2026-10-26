/**
 * An install asked for right after a check takes the release that check
 * found, on the first call, on a machine other than the hub's own; never the
 * build the hub still runs, reported as "update is installed".
 *
 * A scratch fleet whose hub and machine share one binary install (their
 * HOME's `cawco/binary/`, role `agent`): both run nightly N, its signed
 * manifest stored as the running build's (core binary-installation.ts
 * `readRunningManifest`), and the hub reads releases from a release host of
 * the spec's own (`releaseHost`), laid out as a mirror is
 * (`<host>/nightly/release.json` and its `.sig`). The mirror serves real
 * signed nightlies, the two newest published, read from GitHub at the start,
 * so the hub and the machine verify them against the release key embedded
 * in this checkout, exactly as they verify any release. In order:
 *
 * 0. The machine's update state is an earlier build's, carrying the old
 *    `unseen` flag: once the agent runs, neither the hub's record of the
 *    machine nor the state file carries it.
 * 1. The mirror publishes N; a check (`POST /api/binary-updates/check`)
 *    finds N, and the machine polls it: nothing newer.
 * 2. The mirror publishes N+1; a check finds N+1.
 * 3. One install on the machine (`POST /api/agents/<machine>/update` naming
 *    N+1, as `update_machines` sends it): its answer names N+1 as the build
 *    it pulled, and the machine asks the hub for N+1's archive, which the
 *    hub fetches from the mirror.
 *
 * The mirror answers that archive 404: the install stops at its download,
 * so no real build is extracted, its harness pins are never run and no
 * update helper reaches this host's service manager. The answer must say
 * why it installed nothing (the hub could not supply the build), never
 * "update is installed".
 *
 *   bun scripts/probe-kit/run.ts binary-update-found
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE } from "../../scratch-fleet";
import {
  checkoutSchema,
  installedOn,
  newestNightlies,
  nightlyMirror,
  until,
} from "../binary-install";
import type { Spec } from "../kit";

interface UpdateReport {
  installed: boolean;
  pulled: string;
  skipped?: string;
  to?: string;
}

const spec: Spec = {
  group: "Release checks",
  name: "binary-update-found",
  async run(kit) {
    const { check } = kit;
    const [n, next] = await newestNightlies();
    const schema = await checkoutSchema();
    console.log(
      `  N ${n.manifest.version}, N+1 ${next.manifest.version}; this checkout's hub holds ${schema} migrations`
    );
    if (
      !check(
        "N+1 carries at least the migrations this checkout's hub holds",
        next.manifest.schemaVersion >= schema,
        `N+1 carries ${next.manifest.schemaVersion}, the hub ${schema}: a hub ahead of every nightly offers none, and this spec waits for the next nightly`
      )
    ) {
      return;
    }

    // The mirror: what it publishes, and every archive it is asked for.
    const mirror = nightlyMirror(n);
    const { asked } = mirror;
    try {
      const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
      await installedOn(fleet, n, {
        hubUrl: fleet.base,
        releaseHost: mirror.url,
      });
      // 0. The update state as an earlier build left it: carrying `unseen`,
      // the notice's seen flag before the hub kept a record of landings
      // (542c392aa), which a hub machine's state still held on 10-25.
      const statePath = join(
        fleet.env.XDG_DATA_HOME ?? "",
        "cawco",
        "binary",
        "update-state.json"
      );
      await writeFile(
        statePath,
        `${JSON.stringify({
          phase: "installed",
          installedVersion: n.manifest.version,
          channel: "nightly",
          hostsHub: false,
          updatedAt: Date.now(),
          unseen: true,
        })}\n`
      );

      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.launch("agent");
      await fleet.agentUp();

      const machineState = async () =>
        (
          await fleet.api<{
            machines: Record<
              string,
              { availableVersion?: string; channel: string; phase: string }
            >;
          }>("/api/binary-updates/machines")
        ).machines[MACHINE];

      // 1. N published: found, polled, nothing newer.
      const foundN = await fleet.api<{ version: string }>(
        "/api/binary-updates/check",
        {}
      );
      check(
        "N published: the check finds N",
        foundN.version === n.manifest.version,
        `found ${foundN.version}`
      );
      const polled = await until(
        machineState,
        (state) => state?.channel === "nightly",
        60_000
      );
      check(
        "the machine polled the hub on the nightly channel, and N is nothing newer",
        polled?.channel === "nightly" &&
          polled.availableVersion !== n.manifest.version,
        JSON.stringify(polled)
      );
      const stored = JSON.parse(await readFile(statePath, "utf8")) as Record<
        string,
        unknown
      >;
      check(
        "0: the agent carries no `unseen` from an earlier build's state: the hub's record of the machine holds none, and neither does the state file",
        polled !== undefined && !("unseen" in polled) && !("unseen" in stored),
        JSON.stringify({ hub: polled, file: stored })
      );

      // 2. N+1 published: the check finds it.
      mirror.publish(next);
      const foundNext = await fleet.api<{ version: string }>(
        "/api/binary-updates/check",
        {}
      );
      check(
        "N+1 published: the check finds N+1",
        foundNext.version === next.manifest.version,
        `found ${foundNext.version}`
      );

      // 3. One install on the machine, as update_machines sends it.
      const before = asked.length;
      const report = await fleet.api<UpdateReport>(
        `/api/agents/${MACHINE}/update`,
        { version: foundNext.version, commandId: crypto.randomUUID() }
      );
      const archive = next.manifest.artifacts.find(
        (row) => row.target === `${process.platform}-${process.arch}`
      )?.archive;
      const fetched = asked.slice(before);
      check(
        "the first install pulls N+1",
        report.to === next.manifest.version &&
          report.pulled === `signed release ${next.manifest.version}`,
        JSON.stringify(report)
      );
      check(
        "the first install downloads N+1's archive, through the hub, from the release host",
        archive !== undefined && fetched.includes(`/nightly/${archive}`),
        `the mirror was asked for ${fetched.join(", ") || "nothing"}`
      );
      check(
        "its answer says why it installed nothing (the mirror holds no archive), never that the update is installed",
        !report.installed &&
          report.skipped !== undefined &&
          report.skipped.includes("could not supply the build"),
        report.skipped ?? "no reason given"
      );
    } finally {
      await mirror.stop();
    }
  },
};

export default spec;
