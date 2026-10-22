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
  (await Bun.file(`/proc/${await fleet.sessionPid(parent)}/environ`).text())
    .split("\0")
    .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
    ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";

/** A CawCo tool called as the parent, through the door its MCP server and the CLI share. */
const callAs = async (
  fleet: KitFleet,
  parent: string,
  name: string,
  args: object
): Promise<{ structured: Record<string, unknown>; text: string }> => {
  const response = await fetch(`${fleet.base}/api/delegation/call/${parent}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${await credentialOf(fleet, parent)}`,
    },
    body: JSON.stringify({ name, arguments: args }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    content?: { text?: string }[];
    structuredContent?: Record<string, unknown>;
  };
  return {
    structured: result.structuredContent ?? {},
    text: (result.content ?? []).map((block) => block.text ?? "").join("\n"),
  };
};

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
    const cut = await callAs(fleet, parent, "delegate", {
      prompt: `${BRIEF}: write your plan.`,
      title: "Plan writer",
      harness: "claude",
      lands: "none",
    });
    const delegate = String(cut.structured.delegateInstanceId ?? "");
    const listed = await until(
      "delegate_list naming the delegate with its plan",
      async () => (await callAs(fleet, parent, "delegate_list", {})).text,
      (text) => text.includes(`cawco:plan/${delegate}`),
      120_000
    ).catch(
      async () => (await callAs(fleet, parent, "delegate_list", {})).text
    );
    kit.check(
      "delegate_list answers each delegate with its session's link and, once it has written a plan, its plan's",
      !!delegate &&
        listed.includes(`](cawco:session/${delegate})`) &&
        listed.includes(`](cawco:plan/${delegate})`),
      `delegate ${delegate}; ${listed.slice(0, 800)}`
    );
  },
};
export default spec;
