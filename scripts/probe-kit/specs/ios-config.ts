/**
 * Apple: Configure's project sections are the app's own, at parity with the
 * web's /config pages (PRD audit B5): Spend, Delegate types, MCP (with Where
 * it applies), Connections, Skills and Memory. The app's ConfigProbe (DEBUG,
 * `-config-probe`) opens each section through the shell, makes one change
 * through the function its control runs, and says what the section draws;
 * this spec stands up a scratch fleet, launches the app on it and reads the
 * hub afterwards, which is what the web reads:
 *
 * 1. Spend: "Stop waking Caw" chosen; the hub's spend settings say `quiet`.
 * 2. Delegate types: the project's own types (its `delegates/` files)
 *    under its name, each with its path, the one named like a fleet type
 *    saying it shadows it, and a file that made no type said in the hub's
 *    words; a row opens its file. Then a new type made in its editor; the
 *    hub lists it, its model and effort as typed.
 * 3. MCP: a command server for one project, made in its editor, then
 *    switched off from its row; the hub's fleet holds it so.
 * 4. Connections: GitHub signed in to with a key from the form, then one
 *    project allowed; the hub holds the key and the project. Then its
 *    Server address, as the web's (specs/connections-server-address.ts):
 *    (a) the field in Gitea's and GitLab's form and no other's; (b) GitLab's
 *    on its hosted address; (c) an address that is no http(s) URL refused
 *    under the field, nothing sent; (d) a long one fitting a window 320pt
 *    wide, as wide as the account field; (e) Sign in sending the typed
 *    address as the connection's `url`, which the hub holds. Read from the
 *    app's log: the field's frames and the body it sends.
 * 5. Skills: a skill the machine has, adopted from "On each machine", then
 *    switched off; the hub's fleet holds it so.
 * 6. Memory: a new document, written in the editor and loaded into leaf
 *    sessions; the hub holds its words and its scope.
 *
 * On an iPhone 16 Pro and an iPad Pro 11-inch (M4), iOS 18.5, each in a
 * mac-slot.sh slot, once in light and once in dark.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-config
 *
 * `PROBE_DEVICE=iPhone` (or `iPad`) runs one device.
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each device's steps are read in order.
import { generateKeyPairSync } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import { connectionsWords } from "../../../packages/core/src/words/connections";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
const DEVICES = [
  {
    tag: "iPhone",
    type: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
  },
  {
    tag: "iPad",
    type: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB",
  },
] as const;
const APPEARANCES = ["light", "dark"] as const;
const SKILL = "probe-skill";
const TYPE = "probe-type";
const SERVER = "probe-mcp";
const CONNECTION = "github-probe";
/** The GitHub App the probe registers through the form's app way. */
const APP_CONNECTION = "github-probe-app";
const DOC = "probe/notes.md";
/** A file in the project's `delegates/` that makes no type, and what the hub says of it (project-delegate-types.ts). */
const BROKEN_TYPE = "delegates/broken.md";
const NO_FRONT_MATTER = `${BROKEN_TYPE}: the file has no front matter (a --- block on top)`;
/** One line of a `config geometry <stage>` report: its stage and its words (a long one comes in parts). */
const GEOMETRY_PART = /config geometry (\S+?)(?: \[part \d+\/\d+\])?: (.*)$/;
/** A stage's report whole: `<stage>: card <w>×<h> in <pane> | …`. */
const GEOMETRY = /^(\S+): card (\d+)×\d+ in (\d+)(.*)$/;
/** A label in a geometry line: its words, its width and its height. */
const LABEL_BOX = /'([^']*)'\[\d+,\d+ (\d+)×(\d+)\]/g;
/** `mcp reach`: a touch just above the row's ⋯, and its switch, went to that control. */
const MORE_REACHED = /more \S+ \d+pt above→itself/;
const SWITCH_REACHED = /switch \S+ \d+pt above→itself/;
/** A GitHub App's private key, real so the hub's own check takes it, base64 for the launch argument. */
const APP_KEY = Buffer.from(
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  }).privateKey
).toString("base64");
/** The compact log's head, up to the `[subsystem:category] ` tag. */
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
/** The width of the form's parent in a ConfigProbe line: ` of <w>`. */
const PARENT_WIDTH = / of (\d+)/;
/** The Gitea connection the Server address leg makes. */
const GITEA_CONNECTION = "gitea-probe";
/** The long address the app types (ConfigProbe `longAddress`). */
const LONG_ADDRESS =
  "https://gitea.a-very-long-subdomain-for-a-self-hosted-forge.example.internal.company.com/mcp/servers/gitea-mcp-instance-with-a-long-name";
const ADDRESS_PROBLEM = connectionsWords.serverAddressProblem;
/** A frame in a ConfigProbe line: `name [x,y w×h]`. */
const frameIn = (line: string, name: string) => {
  const found = new RegExp(
    `${name} \\[(-?\\d+),(-?\\d+) (\\d+)×(\\d+)\\]`
  ).exec(line);
  return found
    ? {
        x: Number(found[1]),
        y: Number(found[2]),
        w: Number(found[3]),
        h: Number(found[4]),
      }
    : null;
};

const respond = (): Reply => ({ words: ["Done."], everyMs: 20 });

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [said, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || said.trim()}`);
  }
  return said;
}

interface Fleet {
  mcp: {
    config: { args?: string[]; command?: string };
    enabled: boolean;
    name: string;
    projectId?: string | null;
  }[];
}

interface FleetRead {
  config: Fleet;
  memoryDocs: {
    content: string;
    path: string;
    scope?: { role?: string } | null;
  }[];
  skills: { enabled: boolean; name: string }[];
}

async function run(kit: Kit): Promise<void> {
  const { path: app, problem } = freshApp(ROOT);
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const fleet = await kit.fleet(respond);
  // A skill somebody wrote on the machine: what "On each machine" offers to adopt.
  const skillDir = join(fleet.home, CLAUDE_DIR_NAME, "skills", SKILL);
  const seedSkill = async () => {
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---\nname: ${SKILL}\ndescription: A skill the probe's machine has.\n---\n\nAnswer the probe.\n`
    );
  };
  await seedSkill();
  fleet.launch("hub");
  await fleet.hubUp();
  const dashboard = await fleet.dashboard();
  fleet.env.CAWCO_DASHBOARD_URL = dashboard;
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();

  // A project the MCP server and the connection are narrowed to.
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(fleet.home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`git init -q -b main && echo probe > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: fleet.home })
    .quiet();
  const made = await fleet.api<{ id?: string; project?: { id: string } }>(
    "/api/projects",
    { name: "Config probe", machineId: MACHINE, cwd: src, caw: false }
  );
  const projectId = made.project?.id ?? made.id ?? "";
  // Its own delegate types: one new, one named like a fleet type, one broken.
  const [shadowed] = (
    await fleet.api<{ types: { name: string }[] }>("/api/delegate-types")
  ).types.map((one) => one.name);
  const typeFile = (description: string) =>
    `---\nharness: claude\nmodel: claude-opus-5-5\neffort: high\nlands: none\n---\n${description}\n`;
  for (const [path, content] of [
    ["delegates/writer.md", typeFile("Draft posts in the brand voice.")],
    [`delegates/${shadowed}.md`, typeFile("The project's own take on it.")],
    [BROKEN_TYPE, "Just a brief, with no front matter.\n"],
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: three files, in order
    const put = await fetch(
      `${fleet.base}/api/projects/${projectId}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, content }),
      }
    );
    if (!put.ok) {
      throw new Error(`${path}: ${put.status} ${await put.text()}`);
    }
  }

  const http = async (method: string, path: string, body?: object) => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, text: await response.text() };
  };
  /** Every change a run makes, taken back, so the next run starts where this one did. */
  const reset = async () => {
    await http("PUT", "/api/spend-settings", { onCap: "pause" });
    await http("DELETE", `/api/delegate-types/${TYPE}`);
    await http("DELETE", `/api/fleet/mcp/${SERVER}`);
    await http("DELETE", `/api/connections/${CONNECTION}`);
    await http("DELETE", `/api/connections/${APP_CONNECTION}`);
    await http("DELETE", `/api/connections/${GITEA_CONNECTION}`);
    await http("DELETE", "/api/fleet/memory/docs", { path: DOC });
    // Deleting the fleet's skill takes it off the machines too: once the
    // machine has let it go, it is written there again, to be adopted anew.
    const adopted = await http("DELETE", `/api/fleet/skills/${SKILL}`);
    if (adopted.status < 300) {
      await until(
        "the machine let the probe's skill go",
        () => existsSync(skillDir),
        (there) => !there,
        30_000
      );
    }
    await seedSkill();
  };

  for (const device of DEVICES) {
    if (process.env.PROBE_DEVICE && process.env.PROBE_DEVICE !== device.tag) {
      continue;
    }
    const { tag } = device;
    let sim: MacSim | undefined;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one simulator at a time, on one fleet
      sim = await macSim({ runtime: RUNTIME, device: device.type });
      const { udid } = sim;
      console.log(`  ${tag}: simulator ${udid}`);
      await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
      await sh(`xcrun simctl install ${udid} "${app}"`);
      for (const appearance of APPEARANCES) {
        // biome-ignore lint/performance/noAwaitInLoops: one appearance after the other
        await reset();
        await sh(`xcrun simctl ui ${udid} appearance ${appearance}`);
        const heard: string[] = [];
        const stream: Subprocess<"ignore", "pipe", "ignore"> = Bun.spawn(
          [
            "bash",
            "-c",
            `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "ConfigProbe"'`,
          ],
          { stdout: "pipe", stderr: "ignore" }
        );
        (async () => {
          const decoder = new TextDecoder();
          const reader = stream.stdout.getReader();
          let rest = "";
          for (;;) {
            // biome-ignore lint/performance/noAwaitInLoops: the stream is read in order
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            rest += decoder.decode(value, { stream: true });
            const split = rest.split("\n");
            rest = split.pop() ?? "";
            for (const line of split) {
              if (line.includes("dev.cawco.app")) {
                heard.push(line.replace(LOG_HEAD, ""));
              }
            }
          }
        })().catch(() => undefined);
        await Bun.sleep(1500);
        const ids = [
          `project=${projectId}`,
          `skill=${SKILL}`,
          `appkey=${APP_KEY}`,
        ].join(",");
        await sh(
          `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -config-probe -config-probe-ids ${ids} >/dev/null`
        );
        const done = await until(
          `${tag} ${appearance}: the probe done`,
          () => heard.find((one) => one.includes("config done")),
          Boolean,
          420_000
        ).catch(() => undefined);
        stream.kill();
        await writeFile(
          join(kit.out, `${tag}-${appearance}.log`),
          heard.join("\n")
        );
        const at = `${tag} ${appearance}`;
        kit.check(
          `${at}: the app's run ends`,
          done !== undefined,
          heard.slice(-3).join(" / ")
        );
        const said = (step: string) =>
          heard.filter((one) => one.includes(`config ${step}`)).join(" ");

        // What the hub now holds, which is what the web reads.
        const spend = await fleet.api<{ onCap: string }>("/api/spend-settings");
        kit.check(
          `${at}: Spend: the choice made in the app is the fleet's`,
          spend.onCap === "quiet",
          `hub ${spend.onCap}; app ${said("spend chosen").slice(0, 300)}`
        );
        const projects = said("delegate-types projects");
        kit.check(
          `${at}: Delegate types: the project's own types under its name, each with its path, one shadowing the fleet's, and its broken file in the hub's words`,
          projects.includes("Config probe") &&
            projects.includes(
              "delegates/writer.md · Draft posts in the brand voice."
            ) &&
            projects.includes(
              `delegates/${shadowed}.md · The project's own take on it.`
            ) &&
            projects.includes(`shadows the fleet's ${shadowed}`) &&
            !projects.includes("shadows the fleet's writer") &&
            projects.includes(NO_FRONT_MATTER),
          projects.slice(0, 600)
        );
        const file = said("delegate-types file");
        kit.check(
          `${at}: Delegate types: a project type's row opens its file`,
          file.includes("opened true") &&
            file.includes("Draft posts in the brand voice."),
          file.slice(0, 300)
        );
        const types = await fleet.api<{
          types: { effort?: string; model: string; name: string }[];
        }>("/api/delegate-types");
        const type = types.types.find((one) => one.name === TYPE);
        kit.check(
          `${at}: Delegate types: the type made in the app's editor is listed, its model and effort as typed`,
          type?.model === "probe-model" && type.effort === "high",
          `hub ${JSON.stringify(type ?? null)}; app ${said("delegate-types saved").slice(0, 300)}`
        );
        kit.check(
          `${at}: Delegate types: the editor left with Back keeps its edits as a draft the rail marks, New finds them again, and the save ends it`,
          said("delegate-types draft").includes("unsaved true") &&
            said("delegate-types reopened").includes(`field '${TYPE}'`) &&
            said("delegate-types saved").includes("unsaved false"),
          `${said("delegate-types draft")} / ${said("delegate-types reopened").slice(0, 200)} / ${said("delegate-types saved").slice(0, 120)}`
        );
        const read = await fleet.api<FleetRead>("/api/fleet");
        const server_ = read.config.mcp.find((one) => one.name === SERVER);
        kit.check(
          `${at}: MCP: the command server, narrowed to the project in Where it applies, then switched off from its row`,
          server_?.config.command === "true" &&
            server_.config.args?.join(" ") === "--probe" &&
            server_.projectId === projectId &&
            server_.enabled === false,
          `hub ${JSON.stringify(server_ ?? null)}; app ${said("mcp saved").slice(0, 300)}`
        );
        const connections = await fleet.api<{
          connections: {
            hasSecret: boolean;
            name: string;
            projects: string[];
          }[];
        }>("/api/connections");
        const connection = connections.connections.find(
          (one) => one.name === CONNECTION
        );
        kit.check(
          `${at}: Connections: GitHub signed in to with a key from the app's form, then the project allowed`,
          connection?.hasSecret === true &&
            connection.projects.includes(projectId),
          `hub ${JSON.stringify(connection ?? null)}; app ${said("connections saved").slice(0, 300)}`
        );
        const skill = read.skills.find((one) => one.name === SKILL);
        const appRows = await fleet.api<{
          connections: {
            app?: { appId?: string; installationId?: string; service: string };
            auth: string;
            name: string;
          }[];
        }>("/api/connections");
        const appRow = appRows.connections.find(
          (one) => one.name === APP_CONNECTION
        );
        kit.check(
          `${at}: Connections: a GitHub App registered through the form's app way, which the hub holds`,
          appRow?.auth === "app" &&
            appRow.app?.service === "github" &&
            appRow.app.appId === "424242" &&
            appRow.app.installationId === "4242",
          `hub ${JSON.stringify(appRow ?? null)}; app ${said("connections app").slice(0, 200)}`
        );
        const linearApp = said("connections linear app");
        kit.check(
          `${at}: Connections: Linear's app way names the callback URL its settings list, then its client's fields`,
          linearApp.includes(connectionsWords.signsInWith) &&
            linearApp.includes(connectionsWords.callbackLine) &&
            linearApp.includes("/api/connections/oauth/callback") &&
            linearApp.includes(connectionsWords.clientId) &&
            linearApp.includes(connectionsWords.clientSecret),
          linearApp.slice(0, 400)
        );

        // Server address: each step's report whole, its parts joined.
        const whole = (step: string) =>
          heard
            .map((one) =>
              new RegExp(
                `config ${step}(?: \\[part \\d+/\\d+\\])?: (.*)$`
              ).exec(one)
            )
            .filter((one): one is RegExpExecArray => one !== null)
            .map((one) => one[1] ?? "")
            .join("");
        const forms = Object.fromEntries(
          ["gitea", "gitlab", "github", "linear", "slack"].map((service) => [
            service,
            whole(`connections address ${service}`),
          ])
        );
        kit.check(
          `${at}: Connections (a): the Server address field is in Gitea's and GitLab's form and no other's`,
          forms.gitea?.startsWith("shown true") === true &&
            forms.gitlab?.startsWith("shown true") === true &&
            ["github", "linear", "slack"].every(
              (one) => forms[one]?.startsWith("shown false") === true
            ),
          JSON.stringify(
            Object.fromEntries(
              Object.entries(forms).map(([k, v]) => [k, v?.slice(0, 120)])
            )
          )
        );
        kit.check(
          `${at}: Connections (b): GitLab's opens on its hosted address; Gitea's empty under its example`,
          (forms.gitlab ?? "").includes(
            "value 'https://gitlab.com/api/v4/mcp'"
          ) &&
            (forms.gitea ?? "").includes(
              "value '' | placeholder 'https://gitea.example.com/mcp'"
            ),
          `${forms.gitlab?.slice(0, 160)} / ${forms.gitea?.slice(0, 160)}`
        );
        const refused = whole("connections address refused");
        const refusedField = frameIn(refused, "field");
        const refusedLine = frameIn(refused, "line");
        kit.check(
          `${at}: Connections (c): an address that is no http(s) URL is refused under the field, and nothing is sent`,
          refused.includes(`problem '${ADDRESS_PROBLEM}'`) &&
            refused.endsWith("posts 0") &&
            refusedField !== null &&
            refusedLine !== null &&
            refusedLine.y >= refusedField.y + refusedField.h &&
            refusedLine.x === refusedField.x,
          refused.slice(0, 600)
        );
        const at320 = whole("connections address 320");
        const n320Form = frameIn(at320, "in parent");
        const n320Width = Number(PARENT_WIDTH.exec(at320)?.[1] ?? "-1");
        const n320Field = frameIn(at320, "field");
        const n320Account = frameIn(at320, "account");
        const n320Box = frameIn(at320, "form");
        kit.check(
          `${at}: Connections (d): in a window 320pt wide the long address fits: the form inside its column, the field as wide as the account field, nothing cut`,
          at320.startsWith("window 320") &&
            at320.includes(`value '${LONG_ADDRESS}'`) &&
            n320Form !== null &&
            n320Form.x >= 0 &&
            n320Form.x + n320Form.w <= n320Width &&
            n320Field !== null &&
            n320Account !== null &&
            n320Box !== null &&
            n320Field.w === n320Account.w &&
            n320Field.x + n320Field.w <= n320Box.w &&
            at320.endsWith("clipped none"),
          at320.slice(0, 700)
        );
        const posted = whole("connections address post");
        const sentBody = (() => {
          try {
            return JSON.parse(posted) as Record<string, unknown>;
          } catch {
            return {};
          }
        })();
        const gitea = (
          await fleet.api<{ connections: { name: string; url?: string }[] }>(
            "/api/connections"
          )
        ).connections.find((one) => one.name === GITEA_CONNECTION);
        kit.check(
          `${at}: Connections (e): Sign in sends the typed address as the connection's url, which the hub holds`,
          sentBody.url === LONG_ADDRESS &&
            sentBody.service === "gitea" &&
            sentBody.transport === "http" &&
            sentBody.auth === "bearer" &&
            whole("connections address sent").includes("posts 1") &&
            gitea?.url === LONG_ADDRESS,
          `body ${posted.slice(0, 300)}; hub ${JSON.stringify(gitea ?? null)}; app ${whole("connections address sent").slice(0, 200)}`
        );
        kit.check(
          `${at}: Skills: the machine's skill adopted from On each machine, then switched off`,
          skill?.enabled === false,
          `hub ${JSON.stringify(skill ?? null)}; app ${said("skills saved").slice(0, 300)}`
        );
        const doc = read.memoryDocs.find((one) => one.path === DOC);
        kit.check(
          `${at}: Memory: the new document's words and its leaf sessions, as the app's editor saved them`,
          doc?.content.includes("Thursdays") === true &&
            doc.scope?.role === "leaf",
          `hub ${JSON.stringify(doc ?? null)}; app ${said("memory saved").slice(0, 300)}`
        );
        const clipped = heard.filter(
          (one) => one.includes("config clipped") && !one.endsWith(": none")
        );
        kit.check(
          `${at}: nothing on the six sections is cut or runs past the window's edge`,
          clipped.length === 0,
          clipped.join(" / ").slice(0, 600) || "none"
        );

        // A touch just above a row's ⋯ and its switch, inside their 44pt
        // reach, is theirs, not the row's that opens the editor.
        const reach = said("mcp reach");
        kit.check(
          `${at}: a touch just beside a row's ⋯ or its switch reaches that control, not the row`,
          MORE_REACHED.test(reach) && SWITCH_REACHED.test(reach),
          reach.slice(0, 200) || "not said"
        );

        // Every card at the pane's width less its gutters, 980 at most, whatever
        // it holds; on each section's page the purpose line stands on one line
        // or across the card's body, never crushed beside the actions.
        // Each stage's report whole: a long one comes in parts.
        const reports = new Map<string, string>();
        for (const one of heard) {
          const part = GEOMETRY_PART.exec(one);
          if (part) {
            const [, stage = "", words = ""] = part;
            reports.set(stage, (reports.get(stage) ?? "") + words);
          }
        }
        const geometry = [...reports]
          .map(([stage, words]) => GEOMETRY.exec(`${stage}: ${words}`))
          .filter((one): one is RegExpExecArray => one !== null);
        const narrow = geometry
          .filter(
            ([, , wide, pane]) =>
              Math.abs(Number(wide) - Math.min(Number(pane) - 36, 980)) > 1
          )
          .map(([, stage, wide, pane]) => `${stage} ${wide} in ${pane}`);
        kit.check(
          `${at}: every Configure card stands at the pane's width less its gutters, 980 at most`,
          geometry.length > 0 && narrow.length === 0,
          narrow.join(", ") || `${geometry.length} cards`
        );
        const crushed = geometry
          .filter(([, stage]) => !(stage ?? "").includes("editor"))
          .flatMap(([, stage, wide, , rest]) => {
            const [, purpose] = [...(rest ?? "").matchAll(LABEL_BOX)];
            const body = Number(wide) - 50;
            return purpose &&
              Number(purpose[2]) < body - 1 &&
              Number(purpose[3]) > 24
              ? [
                  `${stage}: '${purpose[1]}' ${purpose[2]}×${purpose[3]} in ${body}`,
                ]
              : [];
          });
        kit.check(
          `${at}: each section's purpose line stands on one line or across the card, never crushed beside its actions`,
          crushed.length === 0,
          crushed.join(" / ") || "none"
        );
      }
    } finally {
      await sim?.release();
    }
  }
}

const spec: Spec = { name: "ios-config", run };
export default spec;
