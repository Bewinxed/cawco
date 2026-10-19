/**
 * iOS: a Caw thread's composer carries what rides with your words, as the
 * web's thread does (ThreadPane.svelte's Composer with `attach`, client.svelte.ts
 * `sayInThread` / `carriedOf`): the app's ThreadViewController through the
 * shared ComposerAttacher and `ThreadsStore.say`. On a scratch fleet (real
 * hub, agent and sessiond; Claude Code against the mock model) and the built
 * app on an iPhone, iOS 18.5 and 27.2, each reading the app's DEBUG log:
 *
 * 1. Opened at `thread:<id>` with `-thread-carry <words>`, the composer takes
 *    a pasted picture and a pasted PDF (ComposerAttacher `pasted`: the picture
 *    read, the file uploaded to the hub until its chip is ready), then the
 *    words are typed and Send pressed. The send carries one image and the
 *    file (`thread send … images=1 … files=probe-brief.pdf`), the hub keeps
 *    it, and the hub's thread holds your message with its picture (a media
 *    address) and the file by its reference.
 * 2. Opened again with no words, the picture and the file go alone: the hub
 *    refuses them ("A message needs words.", caw.ts `bodyOf`), and the app
 *    gives both back to the composer (`draft.restore(text, extras)`), with
 *    the hub's words under the field.
 *
 * Caw's own start is refused inside a workspace boundary (his place's
 * EPERM): neither step needs him; your words are kept before he is woken.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-thread-carry
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim, type SimChoice } from "../../lib/mac-sim";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, ROOT, type Spec } from "../kit";

const RUNTIMES: { choice: SimChoice; tag: string }[] = [
  {
    tag: "ios-18.5",
    choice: {
      runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
      device: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
    },
  },
  {
    tag: "ios-27.2",
    choice: {
      runtime: "com.apple.CoreSimulator.SimRuntime.iOS-27-2",
      device: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
    },
  },
];
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
/** ThreadViewController's `thread send <id> …` lines. */
const SEND =
  /^thread send ([0-9a-f-]{36}) images=(\d+) texts=(\d+) files=(\S*)$/;
const ATTACHED = "image:probe.png,file:probe-brief.pdf:ready";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

/** One of your messages as the hub's thread read holds it. */
interface Said {
  attachments?: { kind: string; name: string; ref?: string }[];
  author: string;
  body: string;
  id: string;
  images?: { mediaType: string; src: string }[];
}

/** A simulator with the app installed, its Probe lines heard as they come. */
async function openSim(
  choice: SimChoice,
  app: string
): Promise<{ heard: string[]; sim: MacSim; stream: Subprocess }> {
  const sim = await macSim(choice);
  const { udid } = sim;
  await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
  await sh(`xcrun simctl install ${udid} "${app}"`);
  const heard: string[] = [];
  const stream = Bun.spawn(
    [
      "bash",
      "-c",
      `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Probe"'`,
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
  return { sim, stream, heard };
}

const run = async (kit: Kit) => {
  const { path: app, problem } = freshApp(ROOT);
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  for (const { choice, tag } of RUNTIMES) {
    // biome-ignore lint/performance/noAwaitInLoops: one simulator at a time, as the Mac's slots hold them
    await onRuntime(kit, fleet, app, choice, tag);
  }
};

/** A project with a thread of its own, opened through the hub as the web opens one. */
async function threadOf(
  fleet: KitFleet,
  tag: string
): Promise<{ projectId: string; threadId: string }> {
  const src = join(fleet.sandbox, `carry-${tag}`);
  await mkdir(src, { recursive: true });
  await Bun.$`git init -q -b main && echo carry > README.md && git add -A && git -c user.email=p@p -c user.name=p commit -qm 'First commit'`
    .cwd(src)
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: `Carry ${tag}`,
    machineId: MACHINE,
    cwd: src,
    caw: true,
  });
  const said = await fleet.api<{ thread: { id: string } }>(
    `/api/projects/${project.id}/threads`,
    {
      body: "A thread to carry files in",
    }
  );
  return { projectId: project.id, threadId: said.thread.id };
}

async function onRuntime(
  kit: Kit,
  fleet: KitFleet,
  app: string,
  choice: SimChoice,
  tag: string
): Promise<void> {
  const { projectId, threadId } = await threadOf(fleet, tag);
  const words = `Carry check ${tag}: a picture and a file`;
  let phone: Awaited<ReturnType<typeof openSim>> | undefined;
  try {
    phone = await openSim(choice, app);
    const { heard } = phone;
    const { udid } = phone.sim;
    const launch = (said: string) =>
      sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session thread:${threadId} -preview-probe -thread-carry '${said}' >/dev/null`
      );

    // 1. Words, a picture and a file: kept, and the hub's thread holds all three.
    let mark = heard.length;
    await launch(words);
    const sent = await until(
      `${tag}: the carried send`,
      () => heard.slice(mark).find((line) => SEND.test(line)),
      Boolean,
      120_000
    ).catch(() => undefined);
    const id = sent?.match(SEND)?.[1];
    const kept = await until(
      `${tag}: the hub kept it`,
      () => heard.slice(mark).find((line) => line === `thread send ${id} kept`),
      Boolean,
      60_000
    ).catch(() => undefined);
    const attached = heard
      .slice(mark)
      .find((line) => line.startsWith("thread carry attached"));
    const read = await fleet.api<{ messages: Said[] }>(
      `/api/projects/${projectId}/threads/${threadId}`
    );
    const mine = read.messages.find((message) => message.id === id);
    const file = mine?.attachments?.find((one) => one.kind === "file");
    kit.check(
      `${tag} 1: a thread send from the app carries one picture and one file, and the hub's thread holds both with the words`,
      attached === `thread carry attached ${ATTACHED}` &&
        sent?.match(SEND)?.[2] === "1" &&
        sent?.match(SEND)?.[4] === "probe-brief.pdf" &&
        !!kept &&
        mine?.body === words &&
        mine.images?.length === 1 &&
        !!mine.images[0]?.src &&
        file?.name === "probe-brief.pdf" &&
        !!file.ref?.startsWith("/api/files/"),
      `${attached ?? "nothing attached"}; ${sent ?? "no send"}; ${kept ?? "not kept"}; hub: ${JSON.stringify(mine ?? null).slice(0, 400)}`
    );

    // 2. The picture and the file with no words: refused, and both given back to the composer.
    mark = heard.length;
    await launch("");
    const refused = await until(
      `${tag}: the refused send`,
      () => heard.slice(mark).find((line) => line.includes(" refused why=")),
      Boolean,
      120_000
    ).catch(() => undefined);
    const after = await fleet.api<{ messages: Said[] }>(
      `/api/projects/${projectId}/threads/${threadId}`
    );
    // Yours only: a wake Caw could not take may add its note meanwhile.
    const yours = (messages: Said[]) =>
      messages.filter((message) => message.author === "you").length;
    kit.check(
      `${tag} 2: a send the hub refuses gives its picture and its file back to the composer, with the hub's words`,
      !!refused?.includes("why=A message needs words.") &&
        !!refused?.endsWith(`restored words= attachments=${ATTACHED}`) &&
        yours(after.messages) === yours(read.messages),
      `${refused ?? "no refusal"}; your messages in the hub ${yours(read.messages)} → ${yours(after.messages)}`
    );
    await Bun.write(
      join(kit.out, `ios-thread-carry-${tag}.log`),
      heard.join("\n")
    );
  } finally {
    phone?.stream.kill();
    await phone?.sim.release();
  }
}

const spec: Spec = { name: "ios-thread-carry", run };
export default spec;
