/**
 * A decision page's pictures are read on the machine their files are on
 * (hub artifacts/service.ts `revisionReadsOn`, artifact-pages.ts `imageFile`): a
 * path names a file on one machine. A page published by a session on one
 * machine and revised by a session of its project on another reads its
 * relative Image in the folder it was published from, and its absolute
 * Image at that path, on the publishing machine, never the reviser's; with
 * that machine away, the page keeps the pictures it shows.
 *
 * On a scratch fleet of two machines on one host (real hub; every machine
 * sees the host's files, so a file stands at each path for both): a page
 * published on the first machine from a work folder with Image("line.png")
 * and an absolute Image, both files then drawn again in other bytes.
 *
 * (a) The first machine's agent stopped, the second machine's session
 *     revises a card: the revision builds, and marks neither picture
 *     changed: the reviser's machine, where the new bytes also stand, is
 *     never read, and the pictures the page shows are kept.
 * (b) The first machine back, a second revision reads both files there:
 *     both pictures are marked changed, drawn again.
 *
 *   bun scripts/probe-kit/run.ts picture-machines
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";
import { hubRequest } from "../../../packages/core/src/hub-request";
import { MACHINE } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const OTHER = "picture-machines-other";
/** A picture's file in a change's link: `files/<n>-<name>`. */
const PICTURE_FILE = /files\/\d+-([\w.-]+)/u;

/** A flat PNG of one grey. */
const greyPng = (level: number) => {
  const png = new PNG({ width: 48, height: 32 });
  png.data.fill(level);
  return PNG.sync.write(png);
};

/** A decision page of two cards, the second showing a picture beside its program and one by its absolute path `far`. */
const program = (
  far: string
) => `root = Decisions("Pictures on a machine", [reach, tone])
reach = Decision("reach", "Which channels carry the launch?", [mail, feed], "Both reach a reader.", [], [], false, null, "behaviour")
mail = Option("mail", "Newsletter", "Readers who signed up.", true, [], "A week's wait.")
feed = Option("feed", "Blog feed", "Readers who follow us.", false, [], "Slow to spread.")
tone = Decision("tone", "Which tone does it take?", [plain, warm], "One voice.", [near, away], [], false, null, "behaviour")
near = Image("line.png", "The launch line as it reads", "Today's line")
away = Image("${far}", "The launch line elsewhere", "Its other line")
plain = Option("plain", "Plain", "Says it.", true, [], "Reads cold to some.")
warm = Option("warm", "Warm", "Says it kindly.", false, [], "Takes more words.")`;

/** A rewording of the reach card, the pictured card left as written. */
const reworded = (question: string) =>
  `reach = Decision("reach", "${question}", [mail, feed], "Both reach a reader.", [], [], false, null, "behaviour")`;

interface Revised {
  marked?: string[];
  revision: number;
}

/** The pictures a revision marked changed, by their files' names. */
const picturesMarked = (revised: Revised): string[] =>
  (revised.marked ?? [])
    .filter((one) => one.includes("files/"))
    .map((one) => one.match(PICTURE_FILE)?.[1] ?? one)
    .sort();

/** A revision's answer as a check says it: its revision, the pictures it marked and every change it marked; a refusal's words. */
const said = (answer: Revised | { refused: string }): string =>
  "refused" in answer
    ? answer.refused.slice(0, 400)
    : `revision ${answer.revision}; pictures marked ${JSON.stringify(picturesMarked(answer))}; marked ${(answer.marked ?? []).length}`;

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await fleet.launchMachine(OTHER);
  const { id: projectId } = await fleet.api<{ id: string }>(
    hubRequest("POST /api/projects", {
      body: {
        name: "Pictures",
        machineId: MACHINE,
        cwd: fleet.repo,
        caw: false,
      },
    })
  );
  const writer = await fleet.spawn("claude", "Publisher", fleet.repo, {
    projectId,
  });
  const reviser = await fleet.spawn(
    "claude",
    "Reviser",
    fleet.repo,
    { projectId },
    OTHER
  );

  const folder = join(fleet.sandbox, "published");
  const elsewhere = join(fleet.sandbox, "elsewhere");
  await mkdir(folder, { recursive: true });
  await mkdir(elsewhere, { recursive: true });
  const far = join(elsewhere, "far.png");
  await writeFile(join(folder, "line.png"), greyPng(200));
  await writeFile(far, greyPng(200));
  await writeFile(join(folder, "page.oui"), program(far));
  const page = await fleet.api<{ id: string }>(
    hubRequest("POST /api/instances/:id/artifacts", {
      path: { id: writer },
      body: {
        kind: "page",
        does: "pick",
        title: "Pictures on a machine",
        ask: "Pick for the launch",
        name: "picture-machines",
        dir: folder,
      },
    })
  );
  // Each file drawn again: the bytes the reviser's machine would read at those paths.
  await writeFile(join(folder, "line.png"), greyPng(90));
  await writeFile(far, greyPng(90));

  const revise = (statements: string) =>
    fleet
      .api<Revised>(
        hubRequest("POST /api/instances/:id/artifacts/:artifact/statements", {
          path: { id: reviser, artifact: page.id },
          body: { statements },
        })
      )
      .catch((error: Error) => ({ refused: error.message }));

  await fleet.stop("agent");
  const away = await revise(reworded("Which channels carry the news?"));
  check(
    "a: the publishing machine away, a revision by a session on another machine builds and marks neither picture changed: the files where the reviser runs are not read, the page keeps the pictures it shows",
    "revision" in away &&
      away.revision === 2 &&
      picturesMarked(away).length === 0,
    said(away)
  );

  fleet.launch("agent");
  await fleet.agentUp();
  const back = await revise(reworded("Which channels carry the word?"));
  check(
    "b: the publishing machine back, a revision reads both files there, the one beside the program and the one by its absolute path, and marks both pictures drawn again",
    "revision" in back &&
      back.revision === 3 &&
      JSON.stringify(picturesMarked(back)) ===
        JSON.stringify(["far.png", "line.png"]),
    said(back)
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "picture-machines",
  run,
};
export default spec;
