/**
 * The tracker sync (hub tracker.ts, Projects spec D2 and §5.2): a project's
 * tasks one record with GitHub Issues or Linear, through each service's own
 * SDK, against stand-ins built from their documented answers
 * (tracker-stubs.ts), on a scratch fleet's real hub and the built dashboard.
 * No live token: the stand-ins hand out their own.
 *
 * GitHub, a fine-grained token (G):
 *  G1 the tracker asked for alone (the body an older app may send) is
 *     refused in words, nothing bound.
 *     A token without Issues: write is bound; a task filed in CawCo is
 *     refused on GitHub, and the task, the binding and the dashboard's task
 *     pane say GitHub's words ("Resource not accessible by personal access
 *     token", issues: write); nothing is made.
 *  G2 the connection's key set to one with Issues: write, the next sync
 *     makes the issue: its title, its labels, its body with the task's
 *     "### " heading as "## "; the task file names it (`issue:`), the pane
 *     links "#1 on GitHub Issues".
 *  G3 a change in CawCo (title, stage to done, a comment) reaches the
 *     issue: renamed, closed as completed, the comment saying who.
 *  G4 a change on GitHub (title, reopened, a label, a comment with a "## "
 *     heading) reaches the task: renamed, back in ready, the label, the
 *     comment by its author with its heading two levels deeper.
 *  G5 both change the title: GitHub's stands.
 *  G6 an issue opened on GitHub becomes a task, linked.
 *  G8 an issue opened by someone with no standing on the repository
 *     (`author_association` NONE) is filed in review, a `you` stage, off the
 *     dispatcher's frontier, saying why; moved to ready by you, its opener's
 *     rewrite puts it back in review; closed it is done; reopened, review.
 *  G9 a comment by someone with no standing on a member's issue is carried,
 *     and its task, in ready, waits in review saying why.
 *  G7 a sync with nothing changed writes nothing, and both lists answer 304.
 * GitHub, a GitHub App (A):
 *  A1 its registration set (its private key pasted on one line, as a
 *     password field takes it): the hub mints an installation token with a
 *     JWT the app's key signed, and GitHub's MCP endpoint is sent that token;
 *     the connection is signed in.
 *  A2 a project bound through it files its task's issue as the app.
 * Linear, an API key (L):
 *  L1 a key with read, issues:create and comments:create binds to its team
 *     and files a task's issue in the stage's state, with its label.
 *  L2 the task moved on is refused by Linear ("Invalid scope: `write`
 *     required"), on the task and the binding.
 *  L3 the key set to one with write: the issue moves to In Progress.
 *  L4 a change in Linear (Done, a title, a description with "## ") reaches
 *     the task, and a comment each way.
 *  L5 an issue opened in the team becomes a task.
 *  L6 an integration's issue (Sentry, no member behind it) waits in review
 *     saying why; a member's in Triage waits in review until accepted on
 *     Linear, then it is ready.
 *  L7 a member's move to In Progress on Linear puts the task in an active
 *     stage with `runs:`, which starts as your move would.
 * Linear, a Linear app (N):
 *  N1 its client set, its sign-in opens Linear's authorize page with
 *     actor=app, scope read,write, PKCE and the hub's callback; the code is
 *     exchanged and the connection is signed in, its MCP side sent the token.
 *  N2 a bound project's task becomes an issue as the app, a comment named
 *     "(CawCo)" by createAsUser.
 *  N3 its token past its time is refreshed (the refresh token rotated) and
 *     the next request carries the new one.
 * Secrets (S): no token, key or client secret is on disk in the fleet.
 * The dashboard (U), at the desk and on a phone:
 *  U1 a linked task's pane shows its issue line, a link, inside the pane.
 *  U2 a refused task's pane says the tracker's words with Sync now.
 *  U3 the project's details show the tracker bound; Change opens the form
 *     on the binding as it stands; another project binds from its Tasks row.
 *  U4 Connections makes a GitHub App through its form, the private key in
 *     a password field with show and hide, and the app mints its
 *     installation token with that key (the form names GitHub's own MCP
 *     address, which no stand-in answers; A1 signs in at the stand-in's).
 *  U5 a task's pane open, a fourth comment and a hand edit of its title
 *     land in one second: the pane shows both (the hub's frame names the
 *     project's tasks; their times are whole seconds), the page stands, the
 *     third comment on its own line still (a comment keys by its time and
 *     author).
 *  U6 a comment taken out of the file by hand comes back, as the hub keeps
 *     comments append-only; the pane shows every comment in order.
 *  U  none of these pages threw.
 *
 *   bun scripts/probe-kit/run.ts tracker-sync
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person makes them.
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the scenario runs in order, one leg after the last.
import { generateKeyPairSync } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";
import { githubStub, linearStub } from "../tracker-stubs";

const OWNER = "probe-owner";
const REPO = "probe-app";
const FULL = `${OWNER}/${REPO}`;
const PAT = `github_pat_probe_${crypto.randomUUID().replaceAll("-", "")}`;
const READ_PAT = `github_pat_reader_${crypto.randomUUID().replaceAll("-", "")}`;
const LINEAR_KEY = `lin_api_probe${crypto.randomUUID().replaceAll("-", "")}`;
const LINEAR_LIMITED = `lin_api_limited${crypto.randomUUID().replaceAll("-", "")}`;
const CLIENT_SECRET = `lin_secret_${crypto.randomUUID().replaceAll("-", "")}`;
const TEAM = { id: "team-eng", key: "ENG", name: "Engineering" };
const APP_ID = "424242";
const INSTALLATION = "7777";

interface IssueLink {
  problem: string | null;
  provider: string;
  ref: string;
  syncedAt: number | null;
  url: string;
}
interface Task {
  comments: {
    at: number;
    author: { mover: string | null; name: string };
    text: string;
  }[];
  description: string;
  id: string;
  issue: IssueLink | null;
  /** Its stage's kind: `todo` is the dispatcher's to start, `you` waits for you. */
  kind: string;
  labels: string[];
  path: string;
  stage: string;
  /** Why the hub last could not start an attempt at it. */
  startProblem: string | null;
  title: string;
}
interface TrackerView {
  binding: {
    connection: string;
    linked: number;
    reason: string | null;
    state: string;
    targetName: string;
  } | null;
  tracker: string;
}
interface Connection {
  app?: Record<string, string>;
  auth: string;
  /** A key, token or app secret is kept for it, sealed. */
  hasSecret?: boolean;
  name: string;
  reason?: string;
  state: string;
}

const run = async (kit: Kit) => {
  const { check } = kit;
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  const github = githubStub({
    owner: OWNER,
    repo: REPO,
    app: {
      appId: APP_ID,
      installationId: INSTALLATION,
      publicKey: keys.publicKey,
    },
    tokens: {
      [PAT]: { issuesWrite: true, login: "probe-person" },
      [READ_PAT]: { issuesWrite: false, login: "probe-reader" },
    },
  });
  const linear = linearStub({
    team: TEAM,
    urlKey: "probe",
    keys: {
      [LINEAR_KEY]: { name: "Probe Person", scopes: ["read", "write"] },
      [LINEAR_LIMITED]: {
        name: "Probe Reader",
        scopes: ["read", "issues:create", "comments:create"],
      },
    },
    app: { clientId: "lin-client-probe", clientSecret: CLIENT_SECRET },
  });
  try {
    await legs(kit, github, linear, keys.privateKey);
  } finally {
    github.stop();
    linear.stop();
  }
  check("runs every leg", true);
};

const legs = async (
  kit: Kit,
  github: ReturnType<typeof githubStub>,
  linear: ReturnType<typeof linearStub>,
  privateKey: string
) => {
  const { check } = kit;
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.standIns.githubApi = github.url;
  fleet.standIns.linearApi = linear.url;
  fleet.launch("hub");
  await fleet.hubUp();

  /** A hub request in any method; its status and body, parsed when it is JSON. */
  const hub = async <T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ body: T; status: number }> => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // A refusal is a bare sentence.
    }
    return { status: response.status, body: parsed as T };
  };
  const project = async (name: string) =>
    (await fleet.api<{ id: string }>("/api/projects", { name })).id;
  const connect = (
    name: string,
    service: "github" | "linear",
    auth: "bearer" | "app"
  ) =>
    fleet.api<Connection>("/api/connections", {
      name,
      service,
      account: name,
      transport: "http",
      url: `${service === "github" ? github.url : linear.url}/mcp`,
      auth,
    });
  const setKey = (name: string, key: string) =>
    hub<Connection>("PUT", `/api/connections/${name}/key`, { key });
  const bind = (
    projectId: string,
    tracker: "github" | "linear",
    connection: string,
    target: string
  ) =>
    hub<TrackerView>("PUT", `/api/projects/${projectId}/tracker`, {
      tracker,
      connection,
      target,
    });
  const sync = async (projectId: string) =>
    (await hub<TrackerView>("POST", `/api/projects/${projectId}/tracker/sync`))
      .body;
  const task = async (projectId: string, id: string) =>
    (await hub<Task>("GET", `/api/projects/${projectId}/tasks/${id}`)).body;
  const file = async (projectId: string, path: string) =>
    (
      await hub<{ content: string }>(
        "GET",
        `/api/projects/${projectId}/folder/file?path=${encodeURIComponent(path)}`
      )
    ).body.content;
  const tasksOf = async (projectId: string) =>
    (
      await hub<{ tasks: { id: string; issue?: unknown; title: string }[] }>(
        "GET",
        `/api/projects/${projectId}/tasks`
      )
    ).body.tasks;
  const connectionNamed = async (name: string) =>
    (
      await hub<{ connections: Connection[] }>("GET", "/api/connections")
    ).body.connections.find((each) => each.name === name);
  /** The reason the newest commit of `kind` to a task gave, as its history says it. */
  const reasonOf = async (projectId: string, id: string, kind: string) =>
    (
      await hub<{ events: { kind: string; reason: string | null }[] }>(
        "GET",
        `/api/projects/${projectId}/tasks/${id}/history`
      )
    ).body.events
      .filter((one) => one.kind === kind)
      .at(-1)?.reason ?? null;
  /** A task filed from an issue, found by its title. */
  const filedAs = async (projectId: string, title: string) => {
    const row = (await tasksOf(projectId)).find((one) => one.title === title);
    return row ? await task(projectId, row.id) : undefined;
  };

  // ── GitHub, a fine-grained token ─────────────────────────────────────
  const gh = await project("Tracker GitHub");
  await connect("github-probe", "github", "bearer");
  await setKey("github-probe", READ_PAT);
  // The body an older app may send: the tracker alone, as before binding was built.
  const bare = await hub<{ message?: string }>(
    "PUT",
    `/api/projects/${gh}/tracker`,
    { tracker: "github" }
  );
  check(
    "G1: GitHub Issues asked for without a connection is refused in words, nothing bound",
    bare.status >= 400 &&
      JSON.stringify(bare.body).includes(
        "GitHub Issues needs a connection: pick the one that reaches its repository."
      ) &&
      (await hub<TrackerView>("GET", `/api/projects/${gh}/tracker`)).body
        .tracker === "cawco",
    JSON.stringify(bare)
  );
  const bound = await bind(gh, "github", "github-probe", FULL);
  check(
    "G1: the token's project binds to its repository",
    bound.status === 200 &&
      bound.body.tracker === "github" &&
      bound.body.binding?.targetName === FULL,
    JSON.stringify(bound)
  );
  const created = (
    await hub<Task>("POST", `/api/projects/${gh}/tasks`, {
      title: "Add the export button",
      description: "People export a CSV.\n\n### Steps\n\n- Press it",
      labels: ["ui"],
    })
  ).body;
  const t1 = created.id;
  const refusedView = await sync(gh);
  const refusedTask = await task(gh, t1);
  check(
    "G1: a token without Issues: write makes no issue; the task and the binding say GitHub's words",
    github.issues.length === 0 &&
      refusedTask.issue?.url === "" &&
      (refusedTask.issue?.problem ?? "").includes(
        "Resource not accessible by personal access token"
      ) &&
      (refusedTask.issue?.problem ?? "").includes("issues: write") &&
      refusedView.binding?.state === "refused" &&
      (refusedView.binding.reason ?? "").includes(
        "Resource not accessible by personal access token"
      ),
    JSON.stringify({ issue: refusedTask.issue, binding: refusedView.binding })
  );
  // A project left refused, for the dashboard's U2: a connection of its own
  // keeps the token without Issues: write, whatever G2 gives github-probe.
  const refusedProject = await project("Tracker refused");
  await connect("github-reader", "github", "bearer");
  await setKey("github-reader", READ_PAT);
  await bind(refusedProject, "github", "github-reader", FULL);
  const refusedTaskId = (
    await hub<Task>("POST", `/api/projects/${refusedProject}/tasks`, {
      title: "Write the release notes",
    })
  ).body.id;
  await sync(refusedProject);

  await setKey("github-probe", PAT);
  await sync(gh);
  const linked = await task(gh, t1);
  const [issue1] = github.issues;
  const written = await file(gh, linked.path);
  check(
    "G2: with Issues: write the issue is made: its title, its label, its body's heading raised to ##",
    issue1?.title === "Add the export button" &&
      issue1.labels.map((one) => one.name).join() === "ui" &&
      (issue1.body ?? "").includes("\n## Steps\n") &&
      !(issue1.body ?? "").includes("### Steps"),
    JSON.stringify(issue1)
  );
  check(
    "G2: the task file names its issue and the task is linked, its problem gone",
    written.includes(`issue: "https://github.com/${FULL}/issues/1"`) &&
      linked.issue?.ref === "#1" &&
      linked.issue.url === `https://github.com/${FULL}/issues/1` &&
      linked.issue.problem === null,
    JSON.stringify({
      issue: linked.issue,
      head: written.split("\n").slice(0, 4),
    })
  );

  await hub("PATCH", `/api/projects/${gh}/tasks/${t1}`, {
    title: "Add the CSV export button",
  });
  await hub("POST", `/api/projects/${gh}/tasks/${t1}/stage`, { stage: "done" });
  await hub("POST", `/api/projects/${gh}/tasks/${t1}/comments`, {
    text: "Shipped behind a flag.",
  });
  await sync(gh);
  const ghComment = github.comments.at(-1);
  check(
    "G3: CawCo's title, its move to done and its comment reach the issue: renamed, closed as completed, the comment saying who",
    issue1?.title === "Add the CSV export button" &&
      issue1.state === "closed" &&
      issue1.state_reason === "completed" &&
      ghComment?.body === "**you** on CawCo:\n\nShipped behind a flag.",
    JSON.stringify({ issue: issue1, comment: ghComment })
  );

  if (issue1) {
    github.edit(issue1, {
      title: "Add the CSV and JSON export buttons",
      state: "open",
      labels: ["ui", "export"],
    });
    github.comment(
      issue1,
      "octo-reviewer",
      "Looks good.\n\n## Note\n\nKeep it small."
    );
  }
  await sync(gh);
  const pulled = await task(gh, t1);
  const theirs = pulled.comments.find((one) =>
    one.author.name.startsWith("octo-reviewer")
  );
  check(
    "G4: GitHub's title, reopening and label reach the task: renamed, back in ready, labelled",
    pulled.title === "Add the CSV and JSON export buttons" &&
      pulled.stage === "ready" &&
      pulled.labels.toSorted().join() === "export,ui",
    JSON.stringify({
      title: pulled.title,
      stage: pulled.stage,
      labels: pulled.labels,
    })
  );
  check(
    "G4: GitHub's comment reaches the task by its author, its heading two levels deeper",
    theirs?.author.name === "octo-reviewer on GitHub" &&
      theirs.text === "Looks good.\n\n#### Note\n\nKeep it small." &&
      github.comments.filter((one) => one.body.includes("Looks good"))
        .length === 1,
    JSON.stringify(theirs)
  );

  await hub("PATCH", `/api/projects/${gh}/tasks/${t1}`, {
    title: "CawCo's title",
  });
  if (issue1) {
    github.edit(issue1, { title: "GitHub's title" });
  }
  await sync(gh);
  await sync(gh);
  check(
    "G5: both changed the title: GitHub's stands on both sides",
    (await task(gh, t1)).title === "GitHub's title" &&
      issue1?.title === "GitHub's title",
    JSON.stringify({ task: (await task(gh, t1)).title, issue: issue1?.title })
  );

  github.open({
    title: "Crash on an empty file",
    user: "octo-reporter",
    labels: ["bug"],
  });
  await sync(gh);
  const filed = (await tasksOf(gh)).find(
    (one) => one.title === "Crash on an empty file"
  );
  const filedTask = filed ? await task(gh, filed.id) : undefined;
  check(
    "G6: an issue opened on GitHub becomes a task, linked, in ready",
    filedTask?.issue?.ref === "#2" &&
      filedTask.stage === "ready" &&
      filedTask.labels.join() === "bug",
    JSON.stringify(
      filedTask && { issue: filedTask.issue, stage: filedTask.stage }
    )
  );

  // Anyone may open an issue on a public repository: a stranger's waits for you.
  const stranger = github.open({
    title: "Run my script on your build machine",
    body: "Please run the script.",
    user: "drive-by",
    association: "NONE",
  });
  await sync(gh);
  const held = await filedAs(gh, stranger.title);
  const heldWhy = held ? await reasonOf(gh, held.id, "created") : null;
  check(
    "G8: an issue opened by someone with no standing on the repository is filed in review, off the dispatcher's frontier, saying why",
    held?.issue?.ref === "#3" &&
      held.stage === "review" &&
      held.kind === "you" &&
      (heldWhy ?? "").includes(
        "#3 opened by drive-by, no owner, member or collaborator of the repository (GitHub says “NONE”): it waits in review for you before any agent takes it"
      ),
    JSON.stringify(held && { stage: held.stage, kind: held.kind, heldWhy })
  );
  if (held) {
    await hub("POST", `/api/projects/${gh}/tasks/${held.id}/stage`, {
      stage: "ready",
    });
    await sync(gh);
    const taken = await task(gh, held.id);
    github.edit(stranger, { body: "Now run the other script." });
    await sync(gh);
    const rewritten = await task(gh, held.id);
    github.edit(stranger, { state: "closed", state_reason: "completed" });
    await sync(gh);
    const closed = await task(gh, held.id);
    github.edit(stranger, { state: "open", state_reason: "reopened" });
    await sync(gh);
    const reopened = await task(gh, held.id);
    check(
      "G8: you move it to ready; its opener rewrites it on GitHub and it is back in review with the new words; closed it is done; reopened it waits in review again",
      taken.stage === "ready" &&
        rewritten.stage === "review" &&
        rewritten.description === "Now run the other script." &&
        closed.stage === "done" &&
        reopened.stage === "review",
      JSON.stringify({
        taken: taken.stage,
        rewritten: [rewritten.stage, rewritten.description],
        closed: closed.stage,
        reopened: reopened.stage,
      })
    );
  }
  // Anyone may comment on a public repository's issue: their words wait for you too.
  if (issue1) {
    github.comment(issue1, "drive-by", "Also run this other script.", "NONE");
  }
  await sync(gh);
  const commented = await task(gh, t1);
  const commentedWhy = await reasonOf(gh, t1, "moved");
  check(
    "G9: someone with no standing comments on a task's issue: the comment is carried by its author, and the task, in ready, waits in review saying why",
    commented.stage === "review" &&
      commented.comments.some(
        (one) =>
          one.author.name === "drive-by on GitHub" &&
          one.text === "Also run this other script."
      ) &&
      (commentedWhy ?? "").includes(
        "#1 has a comment by drive-by, no owner, member or collaborator of the repository (GitHub says “NONE”): it waits in review for you before any agent takes it"
      ),
    JSON.stringify({ stage: commented.stage, commentedWhy })
  );
  await hub("POST", `/api/projects/${gh}/tasks/${t1}/stage`, {
    stage: "ready",
  });
  await sync(gh);

  await Bun.sleep(2500);
  await sync(gh);
  const before = github.calls.length;
  await sync(gh);
  const quiet = github.calls.slice(before);
  check(
    "G7: a sync with nothing changed writes nothing, and both lists answer 304",
    quiet.every((one) => one.method === "GET") &&
      quiet.filter((one) => one.status === 304).length === 2,
    JSON.stringify(
      quiet.map((one) => `${one.method} ${one.path} ${one.status}`)
    )
  );

  // ── GitHub, a GitHub App ─────────────────────────────────────────────
  await connect("github-app", "github", "app");
  const oneLine = privateKey.replaceAll("\n", " ");
  const appSet = await hub<Connection>(
    "PUT",
    "/api/connections/github-app/app",
    {
      appId: APP_ID,
      installationId: INSTALLATION,
      privateKey: oneLine,
    }
  );
  const minted = github.calls.filter(
    (one) =>
      one.path === `/app/installations/${INSTALLATION}/access_tokens` &&
      one.status === 201
  );
  check(
    "A1: the app's key, pasted on one line, mints an installation token; GitHub's MCP side is sent it; signed in",
    appSet.status === 200 &&
      appSet.body.state === "signed-in" &&
      appSet.body.app?.appId === APP_ID &&
      appSet.body.app.installationId === INSTALLATION &&
      !JSON.stringify(appSet.body).includes("PRIVATE KEY") &&
      minted.length >= 1 &&
      github.mcpBearers.some((auth) => auth.startsWith("Bearer ghs_probe")),
    JSON.stringify({
      view: appSet.body,
      minted: minted.length,
      mcp: github.mcpBearers.slice(-2),
    })
  );
  const appTargets = await hub<{ targets: { id: string }[] }>(
    "GET",
    "/api/connections/github-app/targets"
  );
  const appProject = await project("Tracker GitHub App");
  await bind(appProject, "github", "github-app", FULL);
  await hub("POST", `/api/projects/${appProject}/tasks`, {
    title: "Ship the app build",
  });
  await sync(appProject);
  const appIssue = github.issues.find(
    (one) => one.title === "Ship the app build"
  );
  check(
    "A2: the app's repositories list, and a bound project's task is filed as the app",
    appTargets.body.targets[0]?.id === FULL &&
      appIssue?.user.login === "probe-app[bot]",
    JSON.stringify({ targets: appTargets.body, issue: appIssue?.user })
  );

  // ── Linear, an API key ───────────────────────────────────────────────
  const ln = await project("Tracker Linear");
  await connect("linear-key", "linear", "bearer");
  await setKey("linear-key", LINEAR_LIMITED);
  const teams = await hub<{ targets: { id: string; name: string }[] }>(
    "GET",
    "/api/connections/linear-key/targets"
  );
  const lBound = await bind(ln, "linear", "linear-key", TEAM.id);
  const t3 = (
    await hub<Task>("POST", `/api/projects/${ln}/tasks`, {
      title: "Write the onboarding email",
      labels: ["ui"],
    })
  ).body.id;
  await sync(ln);
  const [lIssue] = linear.issues;
  check(
    "L1: the key lists its team, binds, and files the task's issue in Todo with its label",
    teams.body.targets[0]?.name === "ENG · Engineering" &&
      lBound.body.binding?.targetName === "ENG · Engineering" &&
      lIssue?.title === "Write the onboarding email" &&
      lIssue.stateId === "st-todo" &&
      lIssue.labels.join() === "ui" &&
      (await task(ln, t3)).issue?.ref === "ENG-1",
    JSON.stringify({ teams: teams.body, issue: lIssue })
  );
  await hub("POST", `/api/projects/${ln}/tasks/${t3}/stage`, {
    stage: "working",
  });
  const lRefused = await sync(ln);
  const lRefusedTask = await task(ln, t3);
  check(
    "L2: a move Linear refuses for scope says its words on the task and the binding",
    lIssue?.stateId === "st-todo" &&
      (lRefusedTask.issue?.problem ?? "").includes(
        "Invalid scope: `write` required"
      ) &&
      lRefused.binding?.state === "refused" &&
      (lRefused.binding.reason ?? "").includes(
        "Invalid scope: `write` required"
      ),
    JSON.stringify({ issue: lRefusedTask.issue, binding: lRefused.binding })
  );
  await setKey("linear-key", LINEAR_KEY);
  const lHealed = await sync(ln);
  check(
    "L3: with write, the issue moves to In Progress and the refusal is gone",
    lIssue?.stateId === "st-progress" &&
      (await task(ln, t3)).issue?.problem === null &&
      lHealed.binding?.state === "synced",
    JSON.stringify({ state: lIssue?.stateId, binding: lHealed.binding })
  );
  if (lIssue) {
    linear.edit(lIssue, {
      stateId: "st-done",
      title: "Write the welcome email",
      description: "For new teams.\n\n## Context\n\nSent on day one.",
    });
    linear.comment(lIssue, "Dana", "Approved.");
  }
  await hub("POST", `/api/projects/${ln}/tasks/${t3}/comments`, {
    text: "Draft is in.",
  });
  await sync(ln);
  await sync(ln);
  const lPulled = await task(ln, t3);
  check(
    "L4: Linear's Done, title and description reach the task, its heading one level deeper",
    lPulled.stage === "done" &&
      lPulled.title === "Write the welcome email" &&
      lPulled.description ===
        "For new teams.\n\n### Context\n\nSent on day one.",
    JSON.stringify({
      stage: lPulled.stage,
      title: lPulled.title,
      description: lPulled.description,
    })
  );
  check(
    "L4: a comment each way: Linear's on the task by its author, CawCo's on the issue saying who",
    lPulled.comments.some(
      (one) => one.author.name === "Dana on Linear" && one.text === "Approved."
    ) &&
      linear.comments.some(
        (one) => one.body === "**you** on CawCo:\n\nDraft is in."
      ),
    JSON.stringify({ task: lPulled.comments, issue: linear.comments })
  );
  linear.open({ title: "Fix the invite link", stateId: "st-todo" });
  await sync(ln);
  const lFiled = (await tasksOf(ln)).find(
    (one) => one.title === "Fix the invite link"
  );
  check(
    "L5: an issue opened in the team becomes a task, linked, in ready",
    lFiled !== undefined && (await task(ln, lFiled.id)).issue?.ref === "ENG-2",
    JSON.stringify(lFiled)
  );

  // An integration's issue, and a member's in Triage, wait for you.
  linear.open({
    title: "Crash in the export",
    stateId: "st-todo",
    bot: "Sentry",
  });
  const triaged = linear.open({
    title: "Add a dark theme",
    stateId: "st-triage",
    creator: "Sam",
  });
  await sync(ln);
  const sentry = await filedAs(ln, "Crash in the export");
  const sentryWhy = sentry ? await reasonOf(ln, sentry.id, "created") : null;
  const inTriage = await filedAs(ln, "Add a dark theme");
  linear.edit(triaged, { stateId: "st-todo" });
  await sync(ln);
  const accepted = inTriage ? await task(ln, inTriage.id) : undefined;
  check(
    "L6: Sentry's issue, no member behind it, waits in review saying why; a member's in Triage waits in review, and accepted on Linear it is ready",
    sentry?.stage === "review" &&
      (sentryWhy ?? "").includes(
        "Sentry, with no member of the workspace behind it: it waits in review for you before any agent takes it"
      ) &&
      inTriage?.stage === "review" &&
      accepted?.stage === "ready",
    JSON.stringify({
      sentry: sentry?.stage,
      sentryWhy,
      triage: inTriage?.stage,
      accepted: accepted?.stage,
    })
  );

  // A move made on Linear is the mover's: it starts what the stage runs.
  const hooks = await project("Tracker Linear hooks");
  await hub("PUT", `/api/projects/${hooks}/folder/file`, {
    path: "stages.md",
    content:
      "---\nready      todo\nworking    active    runs: writer\nreview     you\ndone       done\ndropped    dropped\n---\n",
    message: "Working runs a writer",
  });
  await bind(hooks, "linear", "linear-key", TEAM.id);
  const drafted = linear.open({
    title: "Draft the release post",
    stateId: "st-todo",
  });
  await sync(hooks);
  const toDraft = await filedAs(hooks, "Draft the release post");
  linear.edit(drafted, { stateId: "st-progress" });
  await sync(hooks);
  const entered = toDraft
    ? await until(
        "L7: the move from Linear starts the stage's runs:",
        () => task(hooks, toDraft.id),
        (one) => one.startProblem !== null,
        15_000
      ).catch(() => task(hooks, toDraft.id))
    : undefined;
  check(
    "L7: a member moves the issue to In Progress on Linear: its task enters working and starts what working runs, as your move would (no Caw here, so it says who could take the report)",
    toDraft?.stage === "ready" &&
      entered?.stage === "working" &&
      (entered.startProblem ?? "").includes(
        `${toDraft.id} entered working, which runs writer`
      ),
    JSON.stringify(
      entered && { stage: entered.stage, startProblem: entered.startProblem }
    )
  );

  // ── Linear, a Linear app ─────────────────────────────────────────────
  await connect("linear-app", "linear", "app");
  const clientSet = await hub<Connection>(
    "PUT",
    "/api/connections/linear-app/app",
    {
      clientId: "lin-client-probe",
      clientSecret: CLIENT_SECRET,
    }
  );
  const started = await hub<{ authorizationUrl: string }>(
    "POST",
    "/api/connections/linear-app/sign-in",
    { origin: fleet.base }
  );
  const authorize = new URL(started.body.authorizationUrl);
  const params = authorize.searchParams;
  const callback = `${fleet.base}/api/connections/oauth/callback`;
  check(
    "N1: the app's sign-in opens Linear's authorize page with actor=app, read,write, PKCE and the hub's callback",
    clientSet.body.state === "needs-sign-in" &&
      authorize.origin === "https://linear.app" &&
      authorize.pathname === "/oauth/authorize" &&
      params.get("actor") === "app" &&
      params.get("scope") === "read,write" &&
      params.get("client_id") === "lin-client-probe" &&
      params.get("code_challenge_method") === "S256" &&
      params.get("prompt") === "consent" &&
      params.get("redirect_uri") === callback,
    started.body.authorizationUrl
  );
  const code = linear.grantCode(params.get("code_challenge") ?? "", callback);
  const landed = await fetch(
    `${callback}?code=${code}&state=${params.get("state")}`
  );
  const appConnection = await connectionNamed("linear-app");
  check(
    "N1: the code is exchanged; signed in, Linear's MCP side sent the app's token",
    landed.status === 200 &&
      appConnection?.state === "signed-in" &&
      linear.mcpBearers.some((auth) =>
        auth.startsWith("Bearer lin_oauth_probe")
      ),
    `${landed.status} ${await landed.text()} ${JSON.stringify(appConnection)}`
  );
  const ap = await project("Tracker Linear app");
  await bind(ap, "linear", "linear-app", TEAM.id);
  const t4 = (
    await hub<Task>("POST", `/api/projects/${ap}/tasks`, {
      title: "Plan the launch",
    })
  ).body.id;
  await hub("POST", `/api/projects/${ap}/tasks/${t4}/comments`, {
    text: "Kickoff Monday.",
  });
  await sync(ap);
  await sync(ap);
  const appCreate = linear.calls
    .filter((one) => one.operation === "CawcoIssueCreate")
    .at(-1);
  const appComment = linear.comments.at(-1);
  check(
    "N2: the app files the task's issue with its own token, and its comment is named “you (CawCo)”",
    (appCreate?.auth ?? "").startsWith("Bearer lin_oauth_probe") &&
      appComment?.user === "you (CawCo)" &&
      appComment.body === "Kickoff Monday.",
    JSON.stringify({ auth: appCreate?.auth.slice(0, 22), comment: appComment })
  );
  const firstToken = appCreate?.auth;
  fleet.write(
    "UPDATE connections SET tokens_expire_at = ? WHERE name = ?",
    Date.now() - 1000,
    "linear-app"
  );
  await hub("PATCH", `/api/projects/${ap}/tasks/${t4}`, {
    title: "Plan the launch week",
  });
  await sync(ap);
  const afterRefresh = linear.calls
    .filter((one) => one.operation === "CawcoIssueUpdate")
    .at(-1);
  check(
    "N3: a token past its time is refreshed, and the next write carries the new one",
    afterRefresh?.auth.startsWith("Bearer lin_oauth_probe") === true &&
      afterRefresh.auth !== firstToken &&
      linear.issues.some((one) => one.title === "Plan the launch week"),
    JSON.stringify({
      before: firstToken?.slice(0, 24),
      after: afterRefresh?.auth.slice(0, 24),
    })
  );

  // ── Secrets ──────────────────────────────────────────────────────────
  const secrets = [PAT, READ_PAT, LINEAR_KEY, LINEAR_LIMITED, CLIENT_SECRET];
  const keyLine = privateKey.split("\n")[3] ?? "";
  const holders: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(
      () => []
    )) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        const text = await readFile(path, "latin1").catch(() => "");
        if ([...secrets, keyLine].some((secret) => text.includes(secret))) {
          holders.push(path);
        }
      }
    }
  };
  await walk(fleet.sandbox);
  await walk(fleet.env.HOME as string);
  check(
    "S: no token, key, client secret or private key is on disk in the fleet (the hub's database seals them)",
    holders.length === 0,
    holders.join(", ") || "none"
  );

  // ── The dashboard ────────────────────────────────────────────────────
  const base = await fleet.dashboard();
  // What the pages threw: a sync writing beside you in the same second once
  // gave the activity two lines one key, and the project page fell over.
  const thrown: string[] = [];
  const watch = (page: Page) => {
    page.on("pageerror", (error) => thrown.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        thrown.push(message.text());
      }
    });
  };
  for (const view of ["desk", "phone"] as const) {
    const page = await kit.page(view);
    page.setDefaultTimeout(60_000);
    watch(page);
    await open(page, `${base}/project/${gh}?task=${t1}`, '[data-slot="issue"]');
    await settle(page, 300);
    const line = await readIssueLine(page);
    await page
      .locator('[data-slot="issue"]')
      .first()
      .screenshot({ path: join(kit.out, `issue-line-${view}.png`) });
    check(
      `U1, ${view}: the linked task's pane says “#1 on GitHub Issues”, its ref a link to the issue, inside the pane; nothing scrolls sideways`,
      line?.words === "#1 on GitHub Issues" &&
        line.href === `https://github.com/${FULL}/issues/1` &&
        line.inside &&
        line.sideways === 0,
      JSON.stringify(line)
    );
    await open(
      page,
      `${base}/project/${refusedProject}?task=${refusedTaskId}`,
      "[data-issue-fault]"
    );
    await settle(page, 300);
    const fault = await readIssueLine(page);
    check(
      `U2, ${view}: the refused task's pane says “Not on GitHub Issues yet” and GitHub's words, with Sync now`,
      fault?.words === "Not on GitHub Issues yet" &&
        (fault.fault ?? "").includes(
          "Resource not accessible by personal access token"
        ) &&
        fault.again === "Sync now" &&
        fault.sideways === 0,
      JSON.stringify(fault)
    );
  }

  // A comment taken out of the file by hand between two others, the pane
  // open: the comments left keep their words, in order, on their own lines.
  const plain = await project("Tracker comments");
  const noted = (
    await hub<Task>("POST", `/api/projects/${plain}/tasks`, {
      title: "Three notes",
    })
  ).body;
  for (const text of ["First note.", "Second note.", "Third note."]) {
    await hub("POST", `/api/projects/${plain}/tasks/${noted.id}/comments`, {
      text,
    });
  }
  const notes = await kit.page("desk");
  notes.setDefaultTimeout(60_000);
  watch(notes);
  const COMMENT = '[data-slot="activity"] [data-slot="comment"]';
  const saidNow = () =>
    notes.evaluate(
      (selector) =>
        [...document.querySelectorAll(`${selector} .said`)].map((one) =>
          one.textContent?.trim()
        ),
      COMMENT
    );
  await open(notes, `${base}/project/${plain}?task=${noted.id}`, COMMENT);
  await settle(notes, 300);
  const three = await saidNow();
  // The third note's line, marked: it stays the same line as the pane reads again.
  const markThird = () =>
    notes.evaluate((selector) => {
      const line = [...document.querySelectorAll(selector)].find(
        (one) =>
          one.querySelector(".said")?.textContent?.trim() === "Third note."
      );
      if (line) {
        (line as Element & { kept?: true }).kept = true;
      }
    }, COMMENT);
  const thirdKept = () =>
    notes.evaluate((selector) => {
      const line = [...document.querySelectorAll(selector)].find(
        (one) =>
          one.querySelector(".said")?.textContent?.trim() === "Third note."
      );
      return Boolean((line as (Element & { kept?: true }) | undefined)?.kept);
    }, COMMENT);
  const paneShows = (said: string, title: string) =>
    notes
      .waitForFunction(
        ({ selector, words, heading }) =>
          [...document.querySelectorAll(`${selector} .said`)]
            .map((one) => one.textContent?.trim())
            .join("|") === words &&
          document.querySelector("[data-task-pane] h2")?.textContent?.trim() ===
            heading,
        { selector: COMMENT, words: said, heading: title },
        { timeout: 15_000 }
      )
      .catch(() => undefined);
  const paneTitle = () =>
    notes.evaluate(() =>
      document.querySelector("[data-task-pane] h2")?.textContent?.trim()
    );
  const lastOf = async (count: number) =>
    (
      await hub<{ events: { at: number; kind: string }[] }>(
        "GET",
        `/api/projects/${plain}/tasks/${noted.id}/history`
      )
    ).body.events
      .slice(-count)
      .map((event) => ({ kind: event.kind, at: event.at }));
  await markThird();
  // At a second's start, so a fourth note and a hand edit of the title
  // commit in one second: the list shows no newer time for the edit, and
  // only the hub's frame naming the project's tasks tells the pane.
  await Bun.sleep(1000 - (Date.now() % 1000) + 20);
  await hub("POST", `/api/projects/${plain}/tasks/${noted.id}/comments`, {
    text: "Fourth note.",
  });
  const retitled = (await file(plain, noted.path)).replace(
    "# Three notes",
    "# Four notes"
  );
  await hub("PUT", `/api/projects/${plain}/folder/file`, {
    path: noted.path,
    content: retitled,
    message: "Call it four",
  });
  const FOUR = "First note.|Second note.|Third note.|Fourth note.";
  await paneShows(FOUR, "Four notes");
  await settle(notes, 300);
  const four = await saidNow();
  const sameSecond = await lastOf(2);
  check(
    "U5: a note added and the title changed by hand in one second, the pane open: it shows both, the page stands, the third note on its own line still",
    three.join("|") === "First note.|Second note.|Third note." &&
      four.join("|") === FOUR &&
      (await paneTitle()) === "Four notes" &&
      (await thirdKept()) &&
      sameSecond.length === 2 &&
      sameSecond[0].at === sameSecond[1].at,
    JSON.stringify({
      three,
      four,
      title: await paneTitle(),
      sameSecond,
    })
  );
  // Comments are append-only: one taken out of the file by hand is put back
  // by the hub (tasks.ts strayComments), and the pane keeps every line.
  const lines = (await file(plain, noted.path)).split("\n");
  const from = lines.indexOf("## Comments");
  const heads = lines.flatMap((line, at) =>
    at > from && line.startsWith("### ") ? [at] : []
  );
  await hub("PUT", `/api/projects/${plain}/folder/file`, {
    path: noted.path,
    content: [...lines.slice(0, heads[1]), ...lines.slice(heads[2])].join("\n"),
    message: "Take the second note out",
  });
  const putBack = await until(
    "U6: the hub puts the second note back",
    async () =>
      (
        await hub<{ comments: { text: string }[] }>(
          "GET",
          `/api/projects/${plain}/tasks/${noted.id}`
        )
      ).body.comments.map((one) => one.text),
    (said) => said.join("|") === FOUR,
    15_000
  ).catch(() => [] as string[]);
  await paneShows(FOUR, "Four notes");
  await settle(notes, 300);
  const again = await saidNow();
  check(
    "U6: a comment taken out of the file by hand comes back (comments are append-only); the page stands, every note in order, the third on its own line still",
    putBack.join("|") === FOUR &&
      again.join("|") === FOUR &&
      (await thirdKept()),
    JSON.stringify({ putBack, again, history: await lastOf(3) })
  );

  const desk = await kit.page("desk");
  desk.setDefaultTimeout(60_000);
  watch(desk);
  await open(desk, `${base}/project/${gh}`, "[data-place-line]");
  await desk.locator("[data-place-line]").click();
  await desk.waitForSelector('[data-detail="tracker"] [data-tracker-state]');
  await settle(desk, 300);
  const row = await desk.evaluate(() => {
    const tracker = document.querySelector('[data-detail="tracker"]');
    return {
      picked: [...(tracker?.querySelectorAll("[data-state='on']") ?? [])].map(
        (item) => item.textContent?.trim()
      ),
      target: tracker?.querySelector(".bound-target")?.textContent?.trim(),
      state: tracker
        ?.querySelector("[data-tracker-state]")
        ?.textContent?.replace(/\s+/g, " ")
        .trim(),
    };
  });
  await desk
    .locator('[data-detail="tracker"]')
    .screenshot({ path: join(kit.out, "details-tracker.png") });
  check(
    "U3: the project's details show GitHub Issues picked, its repository, the connection and the tasks linked",
    row.picked.join() === "GitHub Issues" &&
      row.target === FULL &&
      (row.state ?? "").startsWith(
        "Through github-probe · 3 tasks linked · Synced"
      ),
    JSON.stringify(row)
  );
  await desk.locator("[data-change-tracker]").click();
  // An option is never visible to the engine: in the page is what counts.
  await desk.waitForSelector('[data-bind-form="github"] .bind-target option', {
    state: "attached",
  });
  const preset = await desk.evaluate(() => ({
    connection: document.querySelector<HTMLSelectElement>(
      '[data-bind-form="github"] .bind-connection select'
    )?.value,
    target: document.querySelector<HTMLSelectElement>(
      '[data-bind-form="github"] .bind-target select'
    )?.value,
  }));
  check(
    "U3: Change opens the form on the binding as it stands: its connection and repository chosen",
    preset.connection === "github-probe" && preset.target === FULL,
    JSON.stringify(preset)
  );
  await desk
    .locator('[data-bind-form="github"]')
    .getByRole("button", { name: "Cancel" })
    .click();
  const fresh = await project("Tracker bound in the dashboard");
  await open(desk, `${base}/project/${fresh}`, "[data-place-line]");
  // A new project opens on Caw: his panel docks beside its empty board and
  // its head (CawFloat's `[data-caw-dock]`), and a press on his seat puts it
  // away, as a person does before opening the details. (Escape puts it away
  // only from inside it, where the caret lands once his composer is drawn.)
  const caw = desk.locator("[data-caw-dock]");
  await caw.waitFor({ state: "visible" });
  await desk
    .locator('[data-slot="caw-seat"][aria-expanded="true"]')
    .filter({ visible: true })
    .first()
    .click();
  await caw.waitFor({ state: "detached" });
  await desk.locator("[data-place-line]").click();
  await desk.waitForSelector('[data-detail="tracker"]');
  await desk
    .locator(
      '[data-detail="tracker"] [role="radio"], [data-detail="tracker"] button'
    )
    .filter({ hasText: "Linear" })
    .first()
    .click();
  await desk.waitForSelector('[data-bind-form="linear"] .bind-target option', {
    state: "attached",
  });
  await desk.selectOption(
    '[data-bind-form="linear"] .bind-connection select',
    "linear-key"
  );
  // Use stays off while the key's teams read: the click waits for them.
  await desk.waitForSelector('[data-bind-form="linear"] .bind-target option', {
    state: "attached",
  });
  await desk.getByRole("button", { name: "Use Linear" }).click();
  await desk.waitForSelector('[data-detail="tracker"] [data-bound="linear"]');
  const viaUi = (
    await hub<TrackerView>("GET", `/api/projects/${fresh}/tracker`)
  ).body;
  check(
    "U3: Tasks › Linear, its connection and team, then Use Linear binds the project on the hub",
    viaUi.tracker === "linear" &&
      viaUi.binding?.connection === "linear-key" &&
      viaUi.binding.targetName === "ENG · Engineering",
    JSON.stringify(viaUi)
  );

  await open(desk, `${base}/config/connections`, '[aria-label="Connections"]');
  await desk.getByRole("button", { name: "Sign in to a service" }).click();
  await desk.getByRole("menuitem", { name: "GitHub" }).click();
  await desk.waitForSelector('form[aria-label="Sign in to GitHub"]');
  await desk.fill("#connection-account", "ui app");
  await desk.fill("#connection-app-id", APP_ID);
  await desk.fill("#connection-installation", INSTALLATION);
  await desk.fill("#connection-private-key", oneLine);
  const hidden = await desk.getAttribute("#connection-private-key", "type");
  await desk.getByRole("button", { name: "Show the private key" }).click();
  const shown = await desk.getAttribute("#connection-private-key", "type");
  await desk
    .locator('form[aria-label="Sign in to GitHub"]')
    .screenshot({ path: join(kit.out, "connections-github-app.png") });
  const mintsOf = () =>
    github.calls.filter(
      (one) =>
        one.path === `/app/installations/${INSTALLATION}/access_tokens` &&
        one.status === 201
    ).length;
  const mintedBefore = mintsOf();
  await desk
    .locator('form[aria-label="Sign in to GitHub"]')
    .getByRole("button", { name: "Sign in" })
    .click();
  // The form names GitHub's own MCP address, which no stand-in answers:
  // what the form decides is the app it makes and the token its key mints
  // (A1 signs an app in at the stand-in's MCP address).
  const madeInUi = await until(
    "U4: the GitHub App made in the form mints its installation token",
    () => connectionNamed("github-ui-app"),
    (one) => one?.auth === "app" && mintsOf() > mintedBefore,
    30_000
  ).catch(() => connectionNamed("github-ui-app"));
  check(
    "U4: Connections › GitHub › GitHub App: the private key in a password field that shows and hides; the app made from the form mints an installation token with a JWT its one-line key signed",
    hidden === "password" &&
      shown === "text" &&
      madeInUi?.auth === "app" &&
      madeInUi.app?.appId === APP_ID &&
      madeInUi.app.service === "github" &&
      madeInUi.app.installationId === INSTALLATION &&
      madeInUi.hasSecret === true &&
      mintsOf() > mintedBefore,
    JSON.stringify({
      hidden,
      shown,
      minted: mintsOf() - mintedBefore,
      made: madeInUi,
    })
  );
  check(
    "U: the task pane, the project's details and Connections threw nothing",
    thrown.length === 0,
    thrown.join(" | ") || "none"
  );
  kit.note(`captures: ${kit.out}`);
};

/** A task pane's issue line as the engine lays it out: its words, link, fault and box. */
const readIssueLine = (page: Page) =>
  page.evaluate(() => {
    const issue = document.querySelector('[data-slot="issue"]');
    if (!issue) {
      return null;
    }
    const pane = issue.closest("[data-task-pane]");
    const box = issue.getBoundingClientRect();
    const frame = pane?.getBoundingClientRect();
    const fault = issue.querySelector("[data-issue-fault]");
    return {
      words: issue
        .querySelector(".issue-words")
        ?.textContent?.replace(/\s+/g, " ")
        .trim(),
      href: issue.querySelector("a")?.getAttribute("href") ?? null,
      fault: fault?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      // The label shown: the button stacks its pending one beside it, hidden.
      again:
        fault
          ?.querySelector('button .kit-words > [data-active="true"]')
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? null,
      inside: Boolean(
        frame && box.left >= frame.left - 0.5 && box.right <= frame.right + 0.5
      ),
      sideways:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });

export default { name: "tracker-sync", run } satisfies Spec;
