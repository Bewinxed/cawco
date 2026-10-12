#!/usr/bin/env bun
// biome-ignore-all lint/performance/noAwaitInLoops: one simulator, one appearance and one log poll at a time, in order.
/**
 * iOS glass card probe: Caw's panel, the machines and the Jump palette are
 * what one card on the top bar's glass shows, and it morphs in place from one
 * into the next (DESIGN.md, "The glass's cards"). The app measures itself
 * (ShellController `probeGlassCards`, run by `-hang-probe`): at each stop the
 * card's top on the glass's foot, its trailing edge flush within 1pt, the
 * neck's span the glass's, and the same card throughout (its
 * ObjectIdentifier); at each switch (Caw's panel to the machines to Jump on
 * the iPad, Caw's panel to Jump on the phone, then Jump to Caw's panel) the
 * size tween on `durMorph` and `easeDrawer`, no slide (`transform`) in the
 * card, and the card held at 0, 50 and 100% of the tween flush with the
 * glass's flank and on its foot, fully out of it; Jump's field focused; ⌘K
 * swapping Caw's panel for Jump with no animation in the card, then taking
 * Jump and standing it at once with no frame between. At rest, nothing on the glass reaches past its
 * bounds and no label on it is drawn narrower than its text; the machines'
 * and Jump's rules are printed with their resolved colour against `seam` and
 * `border-hairline`.
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

/** One side of a held card: `w 478.0 (531.0 to 425.0)`, as drawn, from, to. */
const HALF_SIDE = /[wh] ([\d.]+) \(([\d.]+) to ([\d.]+)\)/g;

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
# Jump's field raises the keyboard: its first-use tips ("Speed up your typing…") would cover the card in a capture.
xcrun simctl spawn ${udid} defaults write com.apple.keyboard.preferences DidShowContinuousPathIntroduction -bool true
xcrun simctl spawn ${udid} defaults write com.apple.keyboard.preferences KeyboardDidShowProductivityTutorial -bool true
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
      const glass = lines.find((line) => line.startsWith("hang glass ")) ?? "";
      check(
        `${label}: the glass draws nothing past its bounds, no label cut`,
        glass.includes("outside none narrow none"),
        glass || "no 'hang glass' line"
      );
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
      // One card throughout, whatever it shows.
      const same = lines.filter((line) => line.startsWith("hang card "));
      check(
        `${label}: one card, the same one at every stop`,
        same.length === cards.length + 1 &&
          same.every((line) => line.includes(" the same true ")) &&
          lines.some(
            (line) =>
              line.includes("cmd-k swap:") &&
              line.endsWith("card the same true")
          ),
        same.map((line) => line.slice(5)).join(" | ")
      );
      const morphs =
        device.kind === "ipad"
          ? ["panel-to-machines", "machines-to-jump", "jump-to-panel"]
          : ["panel-to-jump", "jump-to-panel"];
      for (const morph of morphs) {
        const head =
          lines.find((line) => line.startsWith(`hang ${morph} card `)) ?? "";
        check(
          `${label}: ${morph} tweens on the morph's clock`,
          head.includes(" clock true "),
          head || "no line"
        );
        check(
          `${label}: ${morph} slides nothing out of or into the glass`,
          head.endsWith(" slide false"),
          "no transform in the card"
        );
        // Every piece the card draws stands at the card's own size at each
        // stop of the tween: the border (edge path), the clip (cut path), the
        // raised surface (body, shade) and the shadow (each cast, the mask's hole).
        const stops = lines.filter((line) =>
          line.startsWith(`hang ${morph} layers at `)
        );
        check(
          `${label}: ${morph} read at four stops`,
          stops.length === 4,
          `${stops.length} 'layers at' lines`
        );
        for (const stop of stops) {
          const at = stop.slice(
            `hang ${morph} layers at `.length,
            stop.indexOf(":")
          );
          const size = (name: string) => {
            const m = stop.match(
              new RegExp(`${name} (-?[\\d.]+) (-?[\\d.]+) ([\\d.]+) ([\\d.]+)`)
            );
            return m ? [Number(m[3]), Number(m[4])] : null;
          };
          const card = size("card");
          const casts = [
            ...(stop.match(/casts \[([^\]]*)\]/)?.[1] ?? "").matchAll(
              /-?[\d.]+ -?[\d.]+ ([\d.]+) ([\d.]+)/g
            ),
          ].map((m) => [Number(m[1]), Number(m[2])]);
          // The cut clips only at the card's top edge: its box is the card's
          // grown by its room out to each side and down, so it is read as that
          // box less the room (the room from its width, the same below).
          const cutBox = stop.match(
            /cut path (-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)/
          );
          const room = cutBox ? -Number(cutBox[1]) : 0;
          // Its top on the card's top, or it is off (null).
          const cut =
            cutBox && Number(cutBox[2]) === 0
              ? [Number(cutBox[3]) - 2 * room, Number(cutBox[4]) - room]
              : null;
          const parts: [string, number[] | null][] = [
            ["edge path", size("edge path")],
            ["cut path less its room", cut],
            ["body", size("body")],
            ["shade", size("shade")],
            ["mask hole", size("mask hole")],
            ...casts.map((c, k): [string, number[]] => [`cast ${k}`, c]),
          ];
          const off = parts.filter(
            ([, s]) =>
              !(card && s) ||
              Math.abs(s[0] - card[0]) > 1 ||
              Math.abs(s[1] - card[1]) > 1
          );
          check(
            `${label}: ${morph} at ${at} border, clip, surface and shadow at the card's size`,
            card !== null && casts.length > 0 && off.length === 0,
            off.length === 0
              ? `card ${card?.join("×")}, ${parts.length} parts`
              : `card ${card?.join("×")} off: ${off.map(([n, s]) => `${n} ${s?.join("×")}`).join(", ")}`
          );
        }
        // Held at half the size, each side within half a point of its midpoint.
        const hold =
          lines.find((line) =>
            line.startsWith(`hang ${morph} holds half the size`)
          ) ?? "";
        const sides = [...hold.matchAll(HALF_SIDE)].map((m) => [
          Number(m[1]),
          Number(m[2]),
          Number(m[3]),
        ]);
        check(
          `${label}: ${morph} held at half the size`,
          sides.length === 2 &&
            sides.every(
              ([drawn, start, end]) =>
                Math.abs(drawn - (start + end) / 2) <= 0.5
            ),
          hold || "no line"
        );
        const settled =
          lines.find((line) => line.startsWith(`hang ${morph} settled: `)) ??
          "";
        const to = morph.slice(morph.lastIndexOf("-") + 1);
        check(
          `${label}: ${morph} settles on ${to}, standing alone`,
          settled.includes(` shows ${to} hidden false revealed 1.00 `) &&
            settled.includes(` contents [${to} 1.00] moving []`),
          settled || "no line"
        );
        for (const at of ["0.00", "0.50", "1.00"]) {
          const held =
            lines.find((line) => line.startsWith(`hang ${morph} at ${at}:`)) ??
            "";
          check(
            `${label}: ${morph} at ${at} flush with the glass's flank and on its foot`,
            held.includes(" flush true ") &&
              held.includes(" on foot true ") &&
              held.endsWith(" revealed 1.00"),
            held || "no line"
          );
        }
      }
      check(
        `${label}: ⌘K swaps Caw's panel for Jump with no animation`,
        lines.some(
          (line) =>
            line.startsWith("hang cmd-k swap: shows jump revealed 1.0") &&
            line.includes("switch keys []")
        ),
        lines.find((line) => line.startsWith("hang cmd-k swap:")) ?? "no line"
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
