#!/usr/bin/env bun
// biome-ignore-all lint/performance/noAwaitInLoops: one simulator, one appearance and one log poll at a time, in order.
/**
 * iOS glass cards probe: Caw's panel, the machines and the Jump palette hang
 * from the top bar's glass the same way, one at a time (DESIGN.md, "The
 * glass's cards"). The app measures itself (ShellController
 * `probeGlassCards`, run by `-hang-probe`): each card's top on the glass's
 * foot, its trailing edge flush within 1pt, the neck's span the glass's, one
 * card standing when the machines open over Caw's panel and Jump over the
 * machines, Jump's field focused, and ⌘K standing it and taking it at once
 * with no frame between.
 *
 *   bun scripts/probe-ios-hang-cards.ts <CawCo.app> <hub url> [out dir]
 *
 * Run on the Mac (a CawCo workspace on it is fine): it makes an iPhone 16
 * Pro and an iPad Pro 11-inch (M4) simulator on iOS 18.5, and on each, light
 * then dark, installs the app, launches it with `-hang-probe` on the hub
 * given, reads the app's `hang …` lines from the Probe log, prints `PASS` /
 * `FAIL` per check, and copies the app's captures (`tmp/hang/*.png`) into the
 * out folder (default `$TMPDIR/hang-ios`). It deletes the simulators it made.
 * Exits 0 only if every check passed.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const [app, hub, outArg] = process.argv.slice(2);
if (!(app && hub)) {
  console.error(
    "usage: bun scripts/probe-ios-hang-cards.ts <CawCo.app> <hub url> [out dir]"
  );
  process.exit(2);
}
const out = outArg ?? join(process.env.TMPDIR ?? "/tmp", "hang-ios");
await mkdir(out, { recursive: true });

const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
const DEVICES = [
  {
    kind: "iphone",
    type: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
  },
  {
    kind: "ipad",
    type: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB",
  },
];

let failures = 0;
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok) {
    failures += 1;
  }
};

const sh = async (script: string) =>
  (await Bun.$`bash -c ${script}`.quiet().nothrow()).stdout.toString().trim();

/** The app's `hang …` lines since its launch, once it has printed `hang done`; empty after 90 s. */
async function hangLines(udid: string, since: string): Promise<string[]> {
  for (let i = 0; i < 45; i += 1) {
    const log = await sh(
      `xcrun simctl spawn ${udid} log show --start '${since}' --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Probe" AND eventMessage BEGINSWITH "hang "'`
    );
    const lines = log
      .split("\n")
      .map((line) => line.slice(line.indexOf("hang ")))
      .filter((line) => line.startsWith("hang "));
    if (lines.some((line) => line.startsWith("hang done"))) {
      return lines;
    }
    await Bun.sleep(2000);
  }
  return [];
}

const made: string[] = [];
try {
  for (const device of DEVICES) {
    const udid = await sh(
      `xcrun simctl create "hang-probe-${device.kind}" ${device.type} ${RUNTIME}`
    );
    made.push(udid);
    await sh(`xcrun simctl boot ${udid}; xcrun simctl bootstatus ${udid} -b >/dev/null
xcrun simctl status_bar ${udid} override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3
xcrun simctl install ${udid} "${app}"`);
    for (const style of ["light", "dark"]) {
      const label = `${device.kind} ${style}`;
      await sh(`xcrun simctl ui ${udid} appearance ${style}`);
      const since = await sh(`date '+%Y-%m-%d %H:%M:%S'`);
      await sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${hub} -hang-probe >/dev/null`
      );
      const lines = await hangLines(udid, since);
      check(
        `${label}: the pass ran`,
        lines.length > 0,
        lines.length > 0 ? `${lines.length} lines` : "no 'hang done' in 90 s"
      );
      for (const line of lines) {
        console.log(`  ${line}`);
      }
      const cards =
        device.kind === "ipad"
          ? ["panel", "machines", "jump"]
          : ["panel", "jump"];
      for (const card of cards) {
        const hung =
          lines.find((line) => line.startsWith(`hang ${card} glass`)) ?? "";
        check(
          `${label}: ${card}'s top on the glass's foot`,
          hung.includes("top on the glass's foot true"),
          hung || "no line"
        );
        const flush =
          device.kind === "iphone"
            ? "(screen edge true)"
            : "trailing flush true";
        check(
          `${label}: ${card}'s trailing edge flush`,
          hung.includes(flush),
          flush
        );
        check(
          `${label}: ${card}'s neck span is the glass's`,
          hung.includes("equal true"),
          "neck span against glass span"
        );
        check(
          `${label}: the glass joined under ${card}`,
          hung.includes("glass joined true"),
          "glass joined"
        );
      }
      const standing = lines.filter((line) =>
        line.startsWith("hang cards standing")
      );
      check(
        `${label}: one card at a time`,
        standing.length === cards.length &&
          standing.every((line) => line.endsWith("one at a time true")),
        standing.join(" | ")
      );
      if (device.kind === "ipad") {
        check(
          `${label}: Caw's panel folds for the machines`,
          lines.some(
            (line) => line === "hang caw's panel folded for the machines true"
          ),
          "panel folded"
        );
      }
      check(
        `${label}: the machines fold for Jump`,
        lines.some((line) =>
          line.startsWith(
            "hang the machines folded for Jump true caw's panel shut true"
          )
        ),
        "machines and panel folded"
      );
      check(
        `${label}: Jump's field focused`,
        lines.some((line) => line === "hang jump field focused true"),
        "field focused"
      );
      check(
        `${label}: ⌘K closes at once`,
        lines.some((line) =>
          line.startsWith(
            "hang cmd-k close: jump hidden at once true glass joined false"
          )
        ),
        "hidden in the key's turn"
      );
      check(
        `${label}: ⌘K opens at once`,
        lines.some(
          (line) =>
            line.startsWith("hang cmd-k open: jump standing at once true") &&
            line.includes("glass joined true") &&
            line.includes("field focused true")
        ),
        "standing in the key's turn"
      );
      const data = await sh(
        `xcrun simctl get_app_container ${udid} dev.cawco.app data`
      );
      await sh(`cp "${data}"/tmp/hang/*.png "${out}"/ 2>/dev/null`);
    }
    await sh(
      `xcrun simctl terminate ${udid} dev.cawco.app >/dev/null 2>&1; xcrun simctl shutdown ${udid}`
    );
  }
} finally {
  for (const udid of made) {
    await sh(
      `xcrun simctl shutdown ${udid} >/dev/null 2>&1; xcrun simctl delete ${udid}`
    );
  }
}
console.log(
  `captures in ${out}: ${(await sh(`ls "${out}" | tr '\\n' ' '`)) || "none"}`
);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
