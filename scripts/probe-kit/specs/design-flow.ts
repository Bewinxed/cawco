/**
 * The design-system flow (Projects spec §5.7) from a project's first minute
 * to its system in use, on a scratch fleet (real hub, agent and sessiond;
 * Claude Code against the mock model; Jev a stand-in on
 * `standIns.typesafeUrl`), read from the hub's answers, Jev's inputs and the
 * files on disk. One leg per defect the nightly-3903 run found:
 *
 * 1. A system that landed on origin's default branch, the person's checkout
 *    still behind it, is the project's: Caw's offer is not raised, and the
 *    starters read `has_design_system: true`.
 * 2. A project whose only place is its folder on the hub, with no design/,
 *    reads `has_design_system: false` from its first starters, and is
 *    offered the design-system starter.
 * 3. "Build the design system" filed through task_create carries the hub's
 *    words, its decision page among them, never the filer's acceptance.
 * 4. tokens.css quotes no generic family, and a light-only system declares
 *    `color-scheme: light`.
 * 5. A colour token typed only by its group, with a value no colour is, is
 *    refused by design_write's DTCG check.
 * 6. A 307 KB asset reaches design/ whole: through `cawco tool design_write -`
 *    on stdin, and through `from`, a file where the session works.
 * 7. Not now on Caw's design-system offer (nightly 3944): the project's
 *    starters are written again for it (its set's trigger) and suggest no
 *    design-system build after it
 *    (spec §5.7: "Not now is recorded and he does not ask that project
 *    again unless the person does").
 * 8. A set written before Not now counted (nightly 3944's ds-probe-design,
 *    answered before the deploy): past the starters' gap a read checks its
 *    inputs again, and the set is written without the design starter.
 *
 * The send-back of a landed design build is design-approve's 3a and 3b.
 *
 *   bun scripts/probe-kit/run.ts design-flow
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Fleet,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { jevMock, jevOn } from "../jev-mock";
import { type Kit, ROOT, type Spec } from "../kit";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

const BUILD = "Build the design system";
/** What tsk-1's acceptance said on nightly 3903, in place of the decision page. */
const CAW_ACCEPTANCE =
  "Anything the code leaves open is listed for the person to decide in review";
/** The size of Caw's largest animation clip on nightly 3903. */
const CLIP_BYTES = 307_000;

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const oklch = (l: number, c: number, h: number) => ({
  colorSpace: "oklch",
  components: [l, c, h],
});

/** A light-only system's tokens: colours typed by their group, a scene face that ends in generic families. */
const LIGHT_TOKENS = {
  color: {
    $type: "color",
    paper: { $value: oklch(0.984, 0.004, 85) },
    ink: { $value: oklch(0.264, 0.022, 265) },
  },
  font: {
    scene: {
      $type: "fontFamily",
      $value: ["Figtree Variable", "ui-sans-serif", "system-ui", "sans-serif"],
    },
  },
};

/** The light-only system whole, every token sourced. */
const LIGHT_SYSTEM = [
  {
    path: "manifest.json",
    content: json({
      sources: {
        "color.paper": "styles/base.css:2",
        "color.ink": "styles/base.css:3",
        "font.scene": "styles/base.css:4",
      },
    }),
  },
  {
    path: "tokens.resolver.json",
    content: json({
      version: "2025.10",
      sets: { base: { sources: [{ $ref: "tokens.json" }] } },
      resolutionOrder: [{ $ref: "#/sets/base" }],
    }),
  },
  { path: "tokens.json", content: json(LIGHT_TOKENS) },
];

interface Stage {
  kind: string;
  name: string;
}

/** The pace the spec sets (`standIns.startersPace`): quiet, then the gap between asks. */
const PACE = { quiet: 1500, gap: 5000 };

/**
 * 8: a project whose offer was answered Not now before the starters counted
 * it (nightly 3944's ds-probe-design): its stored set still suggests a
 * design system. Past the gap, a read checks its inputs again, and the set
 * is written again without it.
 */
const staleSet = async (fleet: Fleet, kit: Kit): Promise<void> => {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "ds-stale",
    caw: true,
    template: "design",
  });
  const stages = () =>
    fleet.api<{ stages: Stage[]; starters: { text: string }[] }>(
      `/api/projects/${project.id}/stages`
    );
  const active = (await stages()).stages.find(
    (stage) => stage.kind === "active"
  );
  await fleet.api(`/api/projects/${project.id}/tasks`, {
    title: "Tighten the hero on small screens",
    stage: active?.name,
    labels: ["ui"],
  });
  const builds = (texts: string[]) =>
    texts.some((text) => text.startsWith("Build a design system"));
  const starters = async () =>
    (await stages()).starters.map((starter) => starter.text);
  const offer = async () => {
    const answer = await fetch(
      `${fleet.base}/api/projects/${project.id}/design-offer`
    );
    return answer.ok ? ((await answer.json()) as { answer: string }) : null;
  };
  const before = await until(
    "ds-stale's offer and its design-system starter",
    async () => ({ offer: await offer(), starters: await starters() }),
    (now) => now.offer?.answer === "open" && builds(now.starters),
    60_000
  ).catch(() => undefined);
  // The asks the project's making and its task's filing left waiting run
  // out first, so only a read can write the set again.
  await Bun.sleep(PACE.gap + PACE.quiet + 1000);
  // Not now as the hub kept it before the starters counted it: the offer's
  // row answered, and no ask of the starters after it.
  fleet.write(
    "UPDATE design_offers SET answer = 'dismissed', answered_at = ? WHERE project_id = ?",
    Date.now(),
    project.id
  );
  const stale = await starters();
  await Bun.sleep(PACE.gap + 1000);
  const after = await until(
    "ds-stale's starters checked again on read",
    starters,
    (texts) => !builds(texts),
    60_000
  ).catch(() => undefined);
  const trigger =
    fleet.query<{ trigger: string }>(
      "SELECT trigger FROM project_starter_sets WHERE project_id = ? AND place = 'board'",
      project.id
    )[0]?.trigger ?? "";
  kit.check(
    "8: a starter set written before Not now counted still suggests a design system; past the gap a read checks its inputs again, and the set written for that read suggests none",
    before !== undefined &&
      builds(stale) &&
      after !== undefined &&
      trigger.includes("read"),
    `before: offer ${JSON.stringify(before?.offer)}, starters ${before?.starters.join(" | ")}; stale set ${stale.join(" | ")}; after: [${after?.join(" | ") ?? "still offered"}]; trigger “${trigger}”`
  );
};

const run = async (kit: Kit) => {
  const jev = jevMock();
  const fleet = await kit.fleet(respond);
  fleet.standIns.typesafeUrl = jev.url;
  fleet.standIns.startersPace = PACE;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await jevOn(fleet.base);

  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const gitEnv = { ...process.env, HOME: home };
  const quietly = (ms: number) => new Promise((done) => setTimeout(done, ms));
  const stagesOf = (id: string) =>
    fleet.api<{ stages: Stage[]; starters: { text: string }[] }>(
      `/api/projects/${id}/stages`
    );
  /** Jev's newest starters ask for a project, once there is one. */
  const startersAsk = (name: string) =>
    until(
      `a starters ask for ${name}`,
      async () => jev.starterCalls(name).at(-1),
      (asked) => asked !== undefined,
      60_000
    );
  const designInput = (asked: { state: Record<string, unknown> }) =>
    (asked.state.repository as { has_design_system?: unknown } | undefined)
      ?.has_design_system;

  // ── 1. a system landed on origin; the checkout is behind ───────────
  const bare = join(fleet.sandbox, "landing.git");
  const builder = join(fleet.sandbox, "landing-builder");
  const checkout = join(fleet.sandbox, "landing");
  await Bun.$`git init -q --bare -b main ${bare}`.env(gitEnv).quiet();
  await Bun.$`git clone -q ${bare} ${builder}`.env(gitEnv).quiet();
  await Bun.$`echo landing > README.md && git add -A && git commit -qm 'First commit' && git push -q origin main`
    .cwd(builder)
    .env(gitEnv)
    .quiet();
  await Bun.$`git clone -q ${bare} ${checkout}`.env(gitEnv).quiet();
  // The landing: a workspace's commits pushed to origin's main. The
  // person's checkout is left as it was.
  await mkdir(join(builder, "design"), { recursive: true });
  await writeFile(
    join(builder, "design", "DESIGN.md"),
    "# Landing design system\n"
  );
  await Bun.$`git add -A && git commit -qm 'design: the system' && git push -q origin main`
    .cwd(builder)
    .env(gitEnv)
    .quiet();
  const landing = await fleet.api<{ id: string }>("/api/projects", {
    name: "ds-landing",
    machineId: MACHINE,
    cwd: checkout,
    caw: true,
    template: "design",
  });
  const active = (await stagesOf(landing.id)).stages.find(
    (stage) => stage.kind === "active"
  );
  await fleet.api(`/api/projects/${landing.id}/tasks`, {
    title: "Design the landing page",
    stage: active?.name,
  });
  const landedAsk = await startersAsk("ds-landing");
  await quietly(5000);
  const offered = await fetch(
    `${fleet.base}/api/projects/${landing.id}/design-offer`
  );
  const landingStarters = (await stagesOf(landing.id)).starters.map(
    (starter) => starter.text
  );
  kit.check(
    "1: a system landed on origin's main, the checkout behind, is the project's: no offer, and the starters read has_design_system true",
    !existsSync(join(checkout, "design")) &&
      offered.status === 404 &&
      designInput(landedAsk) === true &&
      !landingStarters.some((text) => text.startsWith("Build a design system")),
    `checkout has design/: ${existsSync(join(checkout, "design"))}; offer ${offered.status}; has_design_system ${JSON.stringify(designInput(landedAsk))}; starters ${landingStarters.join(" | ")}`
  );

  // ── 2. a project on its hub folder alone ────────────────────────────
  const folderOnly = await fleet.api<{ id: string }>("/api/projects", {
    name: "ds-folder",
    caw: true,
    template: "design",
  });
  const folderAsk = await startersAsk("ds-folder");
  const folderStarters = await until(
    "ds-folder's starters",
    async () =>
      (await stagesOf(folderOnly.id)).starters.map((starter) => starter.text),
    (texts) => texts.length > 0,
    30_000
  ).catch(() => [] as string[]);
  kit.check(
    "2: a folder-only project with no design/ reads has_design_system false from its first starters, and is offered the design-system starter",
    designInput(folderAsk) === false &&
      folderStarters.some((text) => text.startsWith("Build a design system")),
    `has_design_system ${JSON.stringify(designInput(folderAsk))}; starters ${folderStarters.join(" | ")}`
  );

  // ── 7. Not now ends the design-system starter ───────────────────────
  const declined = await fleet.api<{ id: string }>("/api/projects", {
    name: "ds-declined",
    caw: true,
    template: "design",
  });
  const declinedActive = (await stagesOf(declined.id)).stages.find(
    (stage) => stage.kind === "active"
  );
  await fleet.api(`/api/projects/${declined.id}/tasks`, {
    title: "Rework the pricing cards",
    stage: declinedActive?.name,
    labels: ["ui"],
  });
  const buildStarter = (texts: string[]) =>
    texts.some((text) => text.startsWith("Build a design system"));
  const declinedStarters = async () =>
    (await stagesOf(declined.id)).starters.map((starter) => starter.text);
  const declinedOffer = async () => {
    const answer = await fetch(
      `${fleet.base}/api/projects/${declined.id}/design-offer`
    );
    return answer.ok ? ((await answer.json()) as { answer: string }) : null;
  };
  const offeredFirst = await until(
    "ds-declined's offer and its design-system starter",
    async () => ({
      offer: await declinedOffer(),
      starters: await declinedStarters(),
    }),
    (now) => now.offer?.answer === "open" && buildStarter(now.starters),
    60_000
  ).catch(() => undefined);
  const dismissed = await fleet.api<{ answer: string }>(
    `/api/projects/${declined.id}/design-offer/dismiss`,
    {}
  );
  // The set the dismissal wrote, by its trigger: with the design subject
  // gone and nothing else to ask, the hub writes an empty set without
  // asking Jev (jev-placement.ts `jevStarters`: no subjects, no call).
  const rewritten = await until(
    "ds-declined's starters written for Not now",
    async () =>
      fleet.query<{ trigger: string }>(
        "SELECT trigger FROM project_starter_sets WHERE project_id = ? AND place = 'board'",
        declined.id
      )[0]?.trigger ?? "",
    (trigger) => trigger.includes("design offer declined"),
    60_000
  ).catch(() => undefined);
  const afterNotNow = await declinedStarters();
  kit.check(
    "7: after Not now on Caw's design-system offer, the project's starters are written again for it and no longer suggest building a design system",
    offeredFirst !== undefined &&
      dismissed.answer === "dismissed" &&
      rewritten !== undefined &&
      !buildStarter(afterNotNow),
    `before: offer ${JSON.stringify(offeredFirst?.offer)}, starters ${offeredFirst?.starters.join(" | ")}; dismissed ${dismissed.answer}; written for Not now ${rewritten !== undefined}; after: [${afterNotNow.join(" | ")}]`
  );

  await staleSet(fleet, kit);

  // A worker session in a project with a checkout: task_create and
  // design_write, as a session calls them.
  const place = join(fleet.sandbox, "tools");
  await mkdir(place, { recursive: true });
  await Bun.$`git init -q -b main && echo tools > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(place)
    .env(gitEnv)
    .quiet();
  const tools = await fleet.api<{ id: string }>("/api/projects", {
    name: "ds-tools",
    machineId: MACHINE,
    cwd: place,
    caw: false,
    template: "design",
  });
  const session = await fleet.spawn("claude", "Design tools", place, {
    projectId: tools.id,
  });
  const credential = await Bun.file(
    `/proc/${await fleet.sessionPid(session)}/environ`
  )
    .text()
    .then(
      (environ) =>
        environ
          .split("\0")
          .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
          ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? ""
    );
  /** One tool call through the hub's REST door, as the session: its words, and whether it was refused. */
  const call = async (name: string, args: object) => {
    const response = await fetch(
      `${fleet.base}/api/delegation/call/${session}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${credential}`,
        },
        body: JSON.stringify({ name, arguments: args }),
      }
    );
    const raw = await response.text();
    try {
      const result = JSON.parse(raw) as {
        content?: { text?: string }[];
        isError?: boolean;
      };
      return {
        refused: !response.ok || result.isError === true,
        text: (result.content ?? []).map((block) => block.text ?? "").join(""),
      };
    } catch {
      return { refused: true, text: `${response.status} ${raw}` };
    }
  };
  const disk = (path: string) =>
    readFile(join(place, "design", path)).catch(() => undefined);

  // ── 3. the build task carries the hub's words ───────────────────────
  const filed = await call("task_create", {
    title: BUILD,
    description: "Build it from the code.",
    acceptance: `- ${CAW_ACCEPTANCE}`,
  });
  const filedId = filed.refused
    ? undefined
    : (JSON.parse(filed.text) as { id?: string }).id;
  const task = filedId
    ? await fleet.api<{ acceptance: string; description: string }>(
        `/api/projects/${tools.id}/tasks/${filedId}`
      )
    : undefined;
  const acceptance = task?.acceptance ?? "";
  const description = task?.description ?? "";
  kit.check(
    "3: “Build the design system” through task_create carries the hub's words, its decision page among them, and none of the filer's",
    acceptance.includes("decision page") &&
      description.includes("design-system skill") &&
      !acceptance.includes(CAW_ACCEPTANCE) &&
      !description.includes("Build it from the code."),
    `${filed.refused ? `refused: ${filed.text.slice(0, 300)}` : filedId}; acceptance “${task?.acceptance.slice(0, 400)}”`
  );

  // ── 4. tokens.css: generics unquoted, the schemes it has ────────────
  const wroteLight = await call("design_write", { files: LIGHT_SYSTEM });
  const css = (await disk("tokens.css"))?.toString() ?? "";
  const scene = css.split("\n").find((line) => line.includes("--scene:"));
  const scheme = css.split("\n").find((line) => line.includes("color-scheme"));
  kit.check(
    "4: tokens.css quotes no generic family, and a light-only system declares color-scheme: light",
    !wroteLight.refused &&
      (scene ?? "").includes(
        '"Figtree Variable", ui-sans-serif, system-ui, sans-serif'
      ) &&
      scheme?.trim() === "color-scheme: light;",
    `${wroteLight.refused ? `refused: ${wroteLight.text.slice(0, 300)}; ` : ""}${scene?.trim()} / ${scheme?.trim()}`
  );

  // ── 5. a group-typed token's value is checked as its type ──────────
  const tokensBefore = (await disk("tokens.json"))?.toString();
  const wroteBad = await call("design_write", {
    files: [
      {
        path: "tokens.json",
        content: json({
          color: {
            $type: "color",
            paper: { $value: "#fff" },
            ink: { $value: oklch(0.264, 0.022, 265) },
          },
          font: {
            scene: {
              $type: "fontFamily",
              $value: ["Figtree Variable", "sans-serif"],
            },
          },
        }),
      },
    ],
  });
  // A dimension under a group typed number: valid as some type, so the
  // schema's any-type union takes it, and drawn without a crash; only the
  // check by its resolved type refuses it.
  const wroteRatio = await call("design_write", {
    files: [
      {
        path: "manifest.json",
        content: json({
          sources: {
            "color.paper": "styles/base.css:2",
            "color.ink": "styles/base.css:3",
            "font.scene": "styles/base.css:4",
            "scale.ratio": "styles/base.css:5",
          },
        }),
      },
      {
        path: "tokens.json",
        content: json({
          ...LIGHT_TOKENS,
          scale: {
            $type: "number",
            ratio: { $value: { value: 1.25, unit: "rem" } },
          },
        }),
      },
    ],
  });
  kit.check(
    '5: a token typed only by its group is checked as that type: color.paper "#fff" and a 1.25rem scale.ratio under a group typed number are each refused by the DTCG check, naming the token, and tokens.json stays as it was',
    wroteBad.refused &&
      wroteBad.text.includes("not DTCG 2025.10") &&
      wroteBad.text.includes("/color/paper") &&
      wroteRatio.refused &&
      wroteRatio.text.includes("not DTCG 2025.10") &&
      wroteRatio.text.includes("/scale/ratio") &&
      (await disk("tokens.json"))?.toString() === tokensBefore,
    `#fff ${wroteBad.refused ? "refused" : "written"}: ${wroteBad.text.slice(0, 300)}; ratio ${wroteRatio.refused ? "refused" : "written"}: ${wroteRatio.text.slice(0, 300)}`
  );

  // ── 6. a 307 KB clip, on stdin and by `from` ────────────────────────
  const clip = randomBytes(CLIP_BYTES);
  const argsFile = join(fleet.sandbox, "design-write.json");
  await writeFile(
    argsFile,
    JSON.stringify({
      files: [
        {
          path: "assets/caw-cli.bin",
          content: clip.toString("base64"),
          encoding: "base64",
        },
      ],
    })
  );
  // The CLI as a session's shell runs it: its credential, the scratch hub,
  // and none of this shell's own CawCo env (a tool door would win).
  const cliEnv = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("CAWCO_"))
  );
  const cli = Bun.spawnSync(
    [
      "bun",
      join(ROOT, "packages/cli/src/cli.ts"),
      "tool",
      "design_write",
      "-",
      "--hub",
      fleet.base,
      "--session",
      session,
    ],
    {
      stdin: Bun.file(argsFile),
      env: { ...cliEnv, HOME: home, CAWCO_SESSION_CREDENTIAL: credential },
    }
  );
  const fromClip = randomBytes(CLIP_BYTES);
  await mkdir(join(place, "media"), { recursive: true });
  await writeFile(join(place, "media", "caw-idle.bin"), fromClip);
  const wroteFrom = await call("design_write", {
    files: [{ path: "assets/caw-idle.bin", from: "media/caw-idle.bin" }],
  });
  const viaCli = await disk("assets/caw-cli.bin");
  const viaFrom = await disk("assets/caw-idle.bin");
  kit.check(
    "6: a 307 KB clip reaches design/ byte for byte, through `cawco tool design_write -` on stdin and through from",
    cli.exitCode === 0 &&
      viaCli?.equals(clip) === true &&
      !wroteFrom.refused &&
      viaFrom?.equals(fromClip) === true,
    `cli exit ${cli.exitCode} ${cli.stderr.toString().trim().slice(0, 300)}; cli file ${viaCli?.length ?? "none"} bytes, same ${viaCli?.equals(clip)}; from ${wroteFrom.refused ? `refused: ${wroteFrom.text.slice(0, 300)}` : "written"}, ${viaFrom?.length ?? "none"} bytes, same ${viaFrom?.equals(fromClip)}`
  );
  jev.stop();
};

export default { name: "design-flow", run } satisfies Spec;
