/**
 * `delegate_list` names each delegate by its links (core references.ts): its
 * session's (`cawco:session/<id>`, drawn as its chip), and its plan's
 * (`cawco:plan/<id>`) once it has written one. On a scratch fleet (real
 * hub, agent and sessiond; Claude Code against the mock model) a parent in a
 * project delegates once; its delegate writes a plan of two steps
 * (todo_write); the parent's delegate_list answers the delegate with both
 * links. It delegates, so its fleet cuts workspaces: it runs on the host,
 * outside every boundary (the references spec proves the other kinds'
 * links inside one).
 *
 *   bun scripts/probe-kit/run.ts references-delegate
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toolRecord, toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** What the delegate is briefed with: the mock model writes its plan on it. */
const BRIEF = "REFERENCES-DELEGATE-BRIEF";
const PLAN = {
  steps: [
    { content: "Read the brief", status: "completed" },
    { content: "Do the work", status: "in_progress" },
  ],
};

/** The delegate writes its plan on its brief, once; every other turn says ok. */
const planned = new Set<string>();
const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(BRIEF) && !planned.has(request.all.slice(0, 200))) {
    if (request.toolNames.includes("mcp__cawco__todo_write")) {
      planned.add(request.all.slice(0, 200));
      return {
        everyMs: 5,
        words: [],
        tool: { name: "mcp__cawco__todo_write", input: PLAN },
      };
    }
    if (request.toolNames.includes("ToolSearch")) {
      return {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: "select:mcp__cawco__todo_write", max_results: 1 },
        },
      };
    }
  }
  return text("ok");
};

/** The parent's own credential, as its tools call the hub with it. */
const credentialOf = async (fleet: KitFleet, parent: string): Promise<string> =>
  await fleet.sessionCredential(parent);

/** The parent as a tool caller, through the door its MCP server and the CLI share (scripts/lib/tool-call.ts). */
const parentSession = async (fleet: KitFleet, parent: string) => ({
  base: fleet.base,
  id: parent,
  credential: await credentialOf(fleet, parent),
});

const spec: Spec = {
  name: "references-delegate",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const home = fleet.env.HOME as string;
    const src = join(fleet.sandbox, "src");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`sh -c ${"git init -q -b main && echo refs > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "References delegate",
      machineId: MACHINE,
      cwd: src,
    });
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });
    const me = await parentSession(fleet, parent);
    // The delegate's session id, from delegate's record (DelegateResult).
    const cut = await toolRecord<{ instanceId?: string; text?: string }>(
      me,
      "delegate",
      {
        prompt: `${BRIEF}: write your plan.`,
        title: "Plan writer",
        harness: "claude",
        lands: "none",
      }
    );
    const delegate = cut.refused ? "" : String(cut.record.instanceId ?? "");
    // delegate's concise answer is the hub's sentence (presenters/sessions.ts
    // `delegateWords`): it leads with the delegate's link, labelled by its
    // title, which is what the parent's agent copies to the person.
    const [head = ""] = (
      cut.refused ? "" : String(cut.record.text ?? "")
    ).split("\n");
    kit.check(
      "delegate answers with the delegate's link, labelled by its title, at the head of its first line",
      !!delegate &&
        head.startsWith(`Started [Plan writer](cawco:session/${delegate})`),
      `delegate ${delegate}; first line: ${head.slice(0, 400)}`
    );
    // delegate_list's words, as the parent's agent reads them.
    const words = async () => (await toolWords(me, "delegate_list")).text;
    const listed = await until(
      "delegate_list naming the delegate with its plan",
      words,
      (text) => text.includes(`cawco:plan/${delegate}`),
      120_000
    ).catch(words);
    // Its session link carries the handle handoff takes (`<dir>#<id8>`,
    // hub presenters/sessions.ts), which the dashboard resolves; its plan's
    // link carries the session's id.
    const sessionLinked = new RegExp(
      `\\]\\(cawco:session/[^)#\\s]+#${delegate.slice(0, 8)}\\)`
    );
    kit.check(
      "delegate_list answers each delegate with its session's link and, once it has written a plan, its plan's",
      !!delegate &&
        sessionLinked.test(listed) &&
        listed.includes(`](cawco:plan/${delegate})`),
      `delegate ${delegate}; ${cut.refused ? `delegate refused: ${cut.text.slice(0, 300)}; ` : ""}${listed.slice(0, 800)}`
    );
  },
};
export default spec;
