/**
 * Who may call the hub (hub hub-auth.ts, core hub-auth.ts, machine-key.ts),
 * on a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), boundaries included: a delegate's workspace runs in one, so
 * run it where a workspace boundary can start (a `host` check).
 *
 * Trusted (the default):
 * (t1) an owner request with no credential works;
 * (t2) a request with a session's credential is refused on an owner route,
 *      the dashboard socket included, and is never the person;
 * (t3) the agent records the hub it joined, and a rogue mDNS hub with
 *      another hubId is ignored by its rediscovery.
 *
 * Turning "Require paired devices" on from a browser (Configure › Devices):
 * (o1) that browser is the first paired device, its cookie HttpOnly and
 *      SameSite=Lax, and it keeps working: its socket opens again as it;
 * (o2) the machine connected then is admitted: its key is written, and the
 *      agent restarted connects with its key's proof.
 *
 * Pairing on:
 * (p1) an anonymous request is refused; a register with no proof is held
 *      (no ack, nothing listed online) as waiting;
 * (p2) a forged register with a known machineId is refused and its
 *      connection closed, and the machine's own connection stands;
 * (p3) a new machine waits until it is admitted (an Admit click in the
 *      paired browser's Configure › Devices), then connects with its key's
 *      HMAC;
 * (p3b) that machine is refused the fleet's list (`GET /api/agents`) and
 *      another machine's row, reads its own row, and the CLI's health check
 *      run as it finds it healthy;
 * (p4) a session can't approve its own ask: not a pairing it started, not
 *      its install ask; the person's answer settles the ask;
 * (p5) an unpaired browser sees the pairing code; the paired browser
 *      approves it, and the new browser opens the app;
 * (p5b) a top-level navigation from another site (a Telegram link) renders
 *      the app on first paint, not the pairing screen;
 * (p5c) a cross-site POST to an owner route is refused, at the dashboard
 *      and at the hub, and changes nothing;
 * (p6) `POST /api/session-identities/install` without a machine's proof is
 *      refused (anonymous, the person, a session);
 * (p7) a delegate works with pairing on: its tools reach the hub through
 *      its machine, its item lands, and its workspace retires on its own
 *      (hub work-items.ts `settle`);
 * (p8) turning it off returns to trusted.
 *
 *   bun scripts/probe-kit/run.ts hub-auth
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: one scenario, read in order, one check after another.
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { MACHINE_PROOF_HEADER } from "../../../packages/core/src/hub-auth";
import { RESOLVE_PERMISSION } from "../../../packages/core/src/index";
import { httpProof } from "../../../packages/core/src/machine-key";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, ROOT, type Spec } from "../kit";

const TAG = /PROBE-AUTH-([A-Z])/;
const FINISH = "mcp__cawco__finish_item";
/** A pairing code (RFC 8628 §6.1's base-20 alphabet), as the pairing screen shows it. */
const CODE = /[B-Z]{3}-[B-Z]{3}/;

/** The header proving `machineId` with `key` for one request, as its agent signs one (core machine-key.ts). */
const proofOf = (
  machineId: string,
  key: string,
  hubId: string,
  method: string,
  path: string
): Record<string, string> => {
  const at = Date.now();
  const nonce = crypto.randomUUID();
  return {
    [MACHINE_PROOF_HEADER]: `${machineId} ${at} ${nonce} ${httpProof(key, { at, hubId, machineId, method, nonce, path })}`,
  };
};

/** A file's permission bits as octal digits ("600"), or none when it is not there. */
const modeOf = (path: string): Promise<string> =>
  stat(path).then(
    (info) => info.mode.toString(8).slice(-3),
    () => "none"
  );

const steps: Record<string, { finish?: boolean; searched?: boolean }> = {};

/** A delegate tagged PROBE-AUTH-<x> commits a file and finishes; anything else answers "ok". */
const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  const tag = request.tools ? TAG.exec(request.all)?.[1] : undefined;
  if (!tag) {
    return text("ok");
  }
  steps[tag] ??= {};
  const step = steps[tag];
  const tool = (name: string, input: object): Reply => ({
    everyMs: 5,
    words: [],
    tool: { name, input },
  });
  if (!request.all.includes(`DONE-COMMIT-${tag}`)) {
    return tool("Bash", {
      command: `echo 'made by ${tag}' > auth-${tag}.txt && git add auth-${tag}.txt && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}' && echo DONE-COMMIT-${tag}`,
      description: "Commit",
    });
  }
  if (!step.finish && request.toolNames.includes(FINISH)) {
    step.finish = true;
    return tool(FINISH, {
      headline: `Committed auth-${tag}.txt.`,
      summary: `Committed auth-${tag}.txt.`,
    });
  }
  if (
    !(step.finish || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** A session's credential, read off its own process. */
const credentialOf = async (fleet: Fleet, instanceId: string) =>
  (await Bun.file(`/proc/${await fleet.sessionPid(instanceId)}/environ`).text())
    .split("\0")
    .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
    ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";

/** One request: its status, its text and its headers. */
const ask = async (
  url: string,
  init: RequestInit = {}
): Promise<{ headers: Headers; status: number; text: string }> => {
  const read = await readWithin(60_000, async (signal) => {
    const response = await fetch(url, { ...init, signal });
    return {
      status: response.status,
      text: await response.text(),
      headers: response.headers,
    };
  });
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(
        `${init.method ?? "GET"} ${url} did not answer within ${read.after} ms (${read.reason})`
      );
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

/** A tool call through the REST door, as the session the credential is. */
const callTool = async (
  fleet: Fleet,
  instanceId: string,
  credential: string,
  name: string,
  args: object
) => {
  const answer = await ask(
    `${fleet.base}/api/delegation/call/${instanceId}`,
    json({ name, arguments: args }, { authorization: `Bearer ${credential}` })
  );
  return { ...answer, said: answer.text };
};

/**
 * A raw machine socket: its frames as they come. Bun's client takes
 * headers on its constructor; the DOM's type declares protocols alone.
 */
const machineSocket = async (base: string) => {
  const frames: { payload?: { kind?: string }; verb?: string }[] = [];
  const socket = new WebSocket(`${base.replace("http", "ws")}/ws`);
  let closed: { code: number; reason: string } | null = null;
  socket.addEventListener("message", (event) => {
    frames.push(JSON.parse(String(event.data)));
  });
  socket.addEventListener("close", (event) => {
    closed = { code: event.code, reason: event.reason };
  });
  await new Promise<void>((done, fail) => {
    socket.addEventListener("open", () => done(), { once: true });
    socket.addEventListener(
      "error",
      () => fail(new Error("the machine socket did not open")),
      { once: true }
    );
  });
  return {
    frames,
    closed: () => closed,
    register: (machineId: string) =>
      socket.send(
        JSON.stringify({
          verb: "register",
          machineId,
          payload: {
            machineId,
            hostname: `forger-${machineId}`,
            os: "linux",
            home: "/tmp",
            auth: { state: "signed-out" },
          },
        })
      ),
    close: () => socket.close(),
  };
};

/** Whether a socket with these headers opens on `/ws/dashboard`. */
const dashboardOpens = (base: string, headers: Record<string, string>) =>
  new Promise<boolean>((done) => {
    const socket = new (
      WebSocket as unknown as new (
        url: string,
        options?: { headers: Record<string, string> }
      ) => WebSocket
    )(`${base.replace("http", "ws")}/ws/dashboard`, { headers });
    const timer = setTimeout(() => done(false), 10_000);
    socket.addEventListener("open", () => {
      // Opened, and held for a moment: the hub closes one it refuses in `open`.
      setTimeout(() => {
        clearTimeout(timer);
        done(socket.readyState === WebSocket.OPEN);
        socket.close();
      }, 1500);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      done(false);
    });
    socket.addEventListener("close", () => {
      clearTimeout(timer);
      done(false);
    });
  });

const spec: Spec = {
  name: "hub-auth",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    const home = fleet.env.HOME as string;
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const src = join(fleet.sandbox, "src");
    await Bun.$`mkdir -p ${src}`.quiet();
    await Bun.write(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`sh -c ${"git init -q -b main && echo auth > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Auth",
      machineId: MACHINE,
      cwd: src,
    });
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });
    const parentKey = await until(
      "the parent's credential",
      () => credentialOf(fleet, parent),
      (value) => value.length === 43
    );
    const bearer = { authorization: `Bearer ${parentKey}` };

    // ── Trusted ──────────────────────────────────────────────────────────
    const anonymous = await ask(`${fleet.base}/api/agents`);
    const devicesRead = await ask(`${fleet.base}/api/devices`);
    check(
      "(t1) trusted: an owner request with no credential works (GET /api/agents, GET /api/devices)",
      anonymous.status === 200 &&
        Array.isArray(JSON.parse(anonymous.text)) &&
        devicesRead.status === 200,
      `${anonymous.status}, ${devicesRead.status} ${devicesRead.text.slice(0, 200)}`
    );
    const asSession = await ask(`${fleet.base}/api/agents`, {
      headers: bearer,
    });
    const turnOn = await ask(`${fleet.base}/api/auth/pairing`, {
      ...json({ required: true }, bearer),
      method: "PUT",
    });
    const forged = await ask(`${fleet.base}/api/agents`, {
      headers: { authorization: `Bearer ${"x".repeat(43)}` },
    });
    const mode = JSON.parse((await ask(`${fleet.base}/api/auth`)).text) as {
      mode: string;
    };
    check(
      "(t2) trusted: a session's credential is refused on owner routes (403), and turned nothing on",
      asSession.status === 403 &&
        turnOn.status === 403 &&
        forged.status === 403 &&
        mode.mode === "trusted",
      `GET agents ${asSession.status}; PUT pairing ${turnOn.status} ${turnOn.text.slice(0, 160)}; unknown Bearer ${forged.status}; mode ${mode.mode}`
    );
    check(
      "(t2) trusted: the dashboard socket opens with no credential and not with a session's",
      (await dashboardOpens(fleet.base, {})) &&
        !(await dashboardOpens(fleet.base, bearer)),
      "socket opened with a Bearer"
    );
    const archivedByCurl = await ask(
      `${fleet.base}/api/workspaces/nothing/archive`,
      json({}, bearer)
    );
    check(
      "(t2) trusted: a session's curl to POST /api/workspaces/:id/archive is refused (403): no session archives a workspace",
      archivedByCurl.status === 403,
      `${archivedByCurl.status} ${archivedByCurl.text.slice(0, 200)}`
    );

    // (t3) The agent records the hub it joined; rediscovery takes that hub alone.
    const { hubId } = JSON.parse((await ask(`${fleet.base}/health`)).text) as {
      hubId: string;
    };
    const config = await until(
      "the agent recording the hub it joined",
      async () =>
        JSON.parse(
          await Bun.file(join(home, ".config", "cawco", "config.json")).text()
        ) as { hubId?: string },
      (value) => value.hubId !== undefined
    );
    check(
      "(t3) the agent recorded the id of the hub it joined in config.json",
      config.hubId === hubId,
      `${config.hubId} vs ${hubId}`
    );
    const rogue = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) =>
        new URL(request.url).pathname === "/health"
          ? Response.json({ ok: true, hubId: "rogue-hub" })
          : Response.json([]),
    });
    const rogueUrl = `http://127.0.0.1:${rogue.port}`;
    const script = `
      import { rediscoverHub } from ${JSON.stringify(join(ROOT, "packages/agent/src/discovery.ts"))};
      const lines = [];
      const run = (mdns) => rediscoverHub({
        readCachedHubUrl: async () => "http://127.0.0.1:9",
        browseMdns: async () => mdns,
        tailscaleCandidates: async () => [],
        repin: async () => {},
        log: (line) => lines.push(line),
      });
      const both = await run([${JSON.stringify(rogueUrl)}, ${JSON.stringify(fleet.base)}]);
      const rogueOnly = await run([${JSON.stringify(rogueUrl)}]);
      console.log(JSON.stringify({ both, rogueOnly, lines }));
    `;
    const rediscovered = await Bun.$`${process.execPath} -e ${script}`
      .cwd(ROOT)
      .env({ ...process.env, ...fleet.env })
      .quiet()
      .nothrow();
    rogue.stop(true);
    const found = JSON.parse(
      rediscovered.stdout.toString().trim().split("\n").at(-1) || "{}"
    ) as { both?: string; lines?: string[]; rogueOnly?: string };
    check(
      "(t3) a rogue mDNS hub with another hubId is ignored: with both advertised the joined hub is taken, with the rogue alone none",
      found.both === fleet.base &&
        found.rogueOnly === undefined &&
        (found.lines ?? []).some((line) => line.includes("another hub")),
      `${rediscovered.stdout.toString().slice(-800)} ${rediscovered.stderr.toString().slice(-400)}`
    );

    // ── Turning pairing on from a browser ────────────────────────────────
    const dashboard = await fleet.dashboard();
    const paired = await kit.page("desk");
    const sockets: { closed: boolean; url: string }[] = [];
    paired.on("websocket", (socket) => {
      const entry = { url: socket.url(), closed: false };
      sockets.push(entry);
      socket.on("close", () => {
        entry.closed = true;
      });
    });
    await open(
      paired,
      `${dashboard}/config/devices`,
      "#require-paired-devices"
    );
    await paired.click("#require-paired-devices");
    await paired
      .getByRole("button", { name: "Require paired devices" })
      .click();
    const after = await until(
      "the browser paired",
      () =>
        paired.evaluate(() =>
          fetch("/api/auth").then(
            (response) =>
              response.json() as Promise<{
                caller: string;
                device: { id: string; name: string } | null;
                mode: string;
              }>
          )
        ),
      (value) => value.mode === "pairing" && value.device !== null,
      30_000
    );
    const cookie = (await paired.context().cookies()).find(
      (one) => one.name === "cawco-owner"
    );
    check(
      "(o1) the browser that turned it on is the first paired device, named by its browser; its cookie is HttpOnly and SameSite=Lax",
      after.caller === "owner" &&
        after.device?.name === "Chrome on Linux" &&
        cookie?.httpOnly === true &&
        cookie.sameSite === "Lax",
      JSON.stringify({ after, cookie: cookie && { ...cookie, value: "…" } })
    );
    fleet.authorize(cookie?.value ?? null);
    const settled = await until(
      "the browser's socket open again as its device",
      () =>
        sockets.filter((one) => one.url.includes("/ws") && !one.closed).length,
      (count) => count > 0,
      30_000
    );
    await paired.waitForTimeout(3000);
    check(
      "(o1) and it keeps working: its socket opened again and stays open, and no pairing screen shows",
      settled > 0 &&
        sockets.some((one) => !one.closed) &&
        (await paired.locator('main[data-slot="pairing"]').count()) === 0,
      JSON.stringify(sockets)
    );
    const keyFile = join(home, ".config", "cawco", "machine-key");
    const keyRow = await until(
      "the connected machine's key",
      () =>
        fleet.query<{ machine_id: string }>(
          "SELECT machine_id FROM machine_keys WHERE machine_id = ?",
          MACHINE
        )[0],
      Boolean
    );
    const keyMode = await modeOf(keyFile);
    check(
      "(o2) the machine connected as it turned on is admitted: its key kept by the hub, written for its agent at 0600",
      keyRow?.machine_id === MACHINE && keyMode === "600",
      `row ${JSON.stringify(keyRow)}, mode ${keyMode}`
    );
    await fleet.stop("agent");
    fleet.launch("agent");
    await fleet.agentUp();
    check(
      "(o2) the agent, restarted, connects again with its key's proof and is online with custody",
      true
    );

    // ── Pairing on ───────────────────────────────────────────────────────
    const refused = await ask(`${fleet.base}/api/agents`);
    check(
      "(p1) an anonymous request is refused: 401, marked pairing required",
      refused.status === 401 &&
        refused.headers.get("x-cawco-pairing") === "required",
      `${refused.status} ${refused.text.slice(0, 200)}`
    );
    const held = await machineSocket(fleet.base);
    held.register("probe-anonymous");
    await Bun.sleep(2000);
    const waitingList = await fleet.api<{ machineId: string }[]>(
      "/api/machines/waiting"
    );
    const agentsNow =
      await fleet.api<{ machineId: string; status: string }[]>("/api/agents");
    check(
      "(p1) a register with no proof is held: its first frame the challenge, then waiting, no ack, nothing online",
      held.frames[0]?.verb === "admission" &&
        held.frames[0]?.payload?.kind === "challenge" &&
        held.frames.some((frame) => frame.payload?.kind === "waiting") &&
        !held.frames.some((frame) => frame.verb === "register") &&
        waitingList.some((one) => one.machineId === "probe-anonymous") &&
        !agentsNow.some(
          (one) =>
            one.machineId === "probe-anonymous" && one.status === "online"
        ),
      JSON.stringify(held.frames)
    );
    await ask(`${fleet.base}/api/machines/waiting/probe-anonymous/refuse`, {
      method: "POST",
      headers: { authorization: `Owner ${cookie?.value ?? ""}` },
    });
    held.close();

    const forger = await machineSocket(fleet.base);
    forger.register(MACHINE);
    await until("the forged register closed", () => forger.closed(), Boolean);
    const stillOnline =
      await fleet.api<{ machineId: string; status: string }[]>("/api/agents");
    check(
      "(p2) a forged register with a known machineId is refused and closed (4403); the machine stays online",
      forger.closed()?.code === 4403 &&
        !forger.frames.some((frame) => frame.verb === "register") &&
        stillOnline.some(
          (one) => one.machineId === MACHINE && one.status === "online"
        ),
      `${JSON.stringify(forger.closed())} ${JSON.stringify(forger.frames).slice(0, 400)}`
    );

    // (p3) A new machine waits until it is admitted.
    const joining = fleet.launchMachine("probe-new");
    joining.catch(() => undefined);
    await until(
      "probe-new waiting",
      () => fleet.api<{ machineId: string }[]>("/api/machines/waiting"),
      (list) => list.some((one) => one.machineId === "probe-new"),
      120_000
    );
    const beforeAdmit =
      await fleet.api<{ machineId: string; status: string }[]>("/api/agents");
    check(
      "(p3) a new machine waits: listed waiting, not online",
      !beforeAdmit.some(
        (one) => one.machineId === "probe-new" && one.status === "online"
      ),
      JSON.stringify(beforeAdmit.map((one) => [one.machineId, one.status]))
    );
    await open(
      paired,
      `${dashboard}/config/devices`,
      "#require-paired-devices"
    );
    const admit = paired.locator('button[aria-label^="Admit "]').first();
    await admit.waitFor({ timeout: 30_000 });
    await admit.click();
    const machine = await joining;
    const newKey = await modeOf(
      join(machine.home, ".config", "cawco", "machine-key")
    );
    const logs = await machine.logs();
    check(
      "(p3) admitted with a click, it wrote its key (0600) and connected with its key's HMAC: online with custody",
      newKey === "600" &&
        logs.includes("[admission] admitted") &&
        fleet.query<{ n: number }>(
          "SELECT count(*) AS n FROM machine_keys WHERE machine_id = 'probe-new'"
        )[0]?.n === 1,
      `mode ${newKey}; ${logs
        .split("\n")
        .filter((line) => line.includes("admission"))
        .join(" | ")}`
    );

    // (p3b) The admitted machine reads its own row, never the fleet's list.
    const newMachineKey = (
      await Bun.file(
        join(machine.home, ".config", "cawco", "machine-key")
      ).text()
    ).trim();
    const asMachine = (path: string) =>
      ask(`${fleet.base}${path}`, {
        headers: proofOf("probe-new", newMachineKey, hubId, "GET", path),
      });
    const [fleetList, ownRow, otherRow] = await Promise.all([
      asMachine("/api/agents"),
      asMachine("/api/agents/probe-new"),
      asMachine(`/api/agents/${MACHINE}`),
    ]);
    const own = ownRow.status === 200 ? JSON.parse(ownRow.text) : undefined;
    check(
      "(p3b) the admitted machine is refused the fleet's list and another machine's row (403), and reads its own row: online",
      fleetList.status === 403 &&
        otherRow.status === 403 &&
        own?.machineId === "probe-new" &&
        own.status === "online",
      `list ${fleetList.status}, own ${ownRow.status} ${ownRow.text.slice(0, 120)}, other ${otherRow.status}`
    );
    // The CLI's own health check (core binary-health.ts), run as that machine.
    const healthScript = `
      import { probeHealth } from ${JSON.stringify(join(ROOT, "packages/core/src/binary-health.ts"))};
      console.log(JSON.stringify({ wrong: await probeHealth({
        installation: { hubUrl: ${JSON.stringify(fleet.base)}, role: "agent" },
        machineId: "probe-new",
        version: ${JSON.stringify(own?.build?.version ?? "")},
        sinceMs: 0,
        requireCustody: true,
      }) ?? null }));
    `;
    const health = await Bun.$`${process.execPath} -e ${healthScript}`
      .cwd(ROOT)
      .env({ ...process.env, ...machine.env })
      .quiet()
      .nothrow();
    const healthSaid = health.stdout.toString().trim().split("\n").at(-1) ?? "";
    check(
      "(p3b) the CLI's health check, run as the admitted machine, reads its own row and finds it healthy",
      healthSaid === '{"wrong":null}',
      `${healthSaid} ${health.stderr.toString().slice(-400)}`
    );

    // (p4) A session can't approve its own ask.
    const started = JSON.parse(
      (
        await ask(
          `${fleet.base}/api/pair`,
          json({ kind: "cli", name: "a session" }, bearer)
        )
      ).text
    ) as { userCode: string };
    const selfApprove = await ask(
      `${fleet.base}/api/pair/requests/${started.userCode}/approve`,
      json({}, bearer)
    );
    const anonApprove = await ask(
      `${fleet.base}/api/pair/requests/${started.userCode}/approve`,
      { method: "POST" }
    );
    check(
      "(p4) a session that started a pairing can't approve it: 403 with its credential, 401 without",
      selfApprove.status === 403 && anonApprove.status === 401,
      `${selfApprove.status}, ${anonApprove.status}`
    );
    await fleet.api(`/api/pair/requests/${started.userCode}/deny`, {});
    const installCall = callTool(fleet, parent, parentKey, "update_machines", {
      reason: "probe: an install ask the person denies",
    });
    const asked = await until(
      "the install ask parked",
      () =>
        fleet.api<{ requestId?: string; payload?: { adminWrite?: string } }[]>(
          "/api/pending"
        ),
      (list) =>
        list.some((one) => one.payload?.adminWrite === "update_machines"),
      60_000
    );
    const requestId = asked.find(
      (one) => one.payload?.adminWrite === "update_machines"
    )?.requestId as string;
    check(
      "(p4) the session can't answer its install ask: the person's socket refuses its credential and no credential",
      !(
        (await dashboardOpens(fleet.base, bearer)) ||
        (await dashboardOpens(fleet.base, {}))
      ),
      requestId
    );
    await fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "permission.answer",
      machineId: MACHINE,
      sessionId: parent,
      payload: {
        instanceId: parent,
        requestId,
        method: RESOLVE_PERMISSION,
        args: [requestId, { behavior: "deny", message: "probe says no" }],
      },
    });
    const denied = await installCall;
    check(
      "(p4) the person denies it on their own socket: update_machines answers that the person declined, and nothing ran",
      denied.said.includes("declined installing this build"),
      `${denied.status} ${denied.said.slice(0, 400)}`
    );

    // (p5) An unpaired browser sees the code; the paired browser approves it.
    const stranger = await kit.page("desk");
    await open(
      stranger,
      `${dashboard}/session`,
      'main[data-slot="pairing"] :is([data-slot="code"], [data-account-setup-code], [data-workflow-run-view-code])',
      60_000
    );
    const shown = await stranger
      .locator(
        'main[data-slot="pairing"] :is([data-slot="code"], [data-account-setup-code], [data-workflow-run-view-code])'
      )
      .innerText();
    const code = CODE.exec(shown)?.[0] ?? "";
    // For a reviewer: what an unpaired browser shows.
    await stranger.screenshot({ path: join(kit.out, "pairing-screen.png") });
    check(
      "(p5) an unpaired browser sees the pairing screen with a code",
      code.length === 7,
      shown
    );
    await open(
      paired,
      `${dashboard}/config/devices`,
      "#require-paired-devices"
    );
    // Configure › Devices' Approve (Needs you shows the same ask too).
    const approve = paired
      .locator(`button[aria-label^="Approve "][aria-label$="code ${code}"]`)
      .first();
    await approve.waitFor({ timeout: 30_000 });
    // For a reviewer: Configure › Devices with a pairing waiting.
    await paired.screenshot({ path: join(kit.out, "devices.png") });
    await approve.click();
    const strangerAuth = await until(
      "the new browser paired",
      () =>
        stranger
          .evaluate(() =>
            fetch("/api/auth").then(
              (response) => response.json() as Promise<{ caller: string }>
            )
          )
          .catch(() => undefined),
      (value) => value.caller === "owner",
      60_000
    );
    await stranger.waitForLoadState("domcontentloaded");
    await until(
      "the pairing screen gone",
      () => stranger.locator('main[data-slot="pairing"]').count(),
      (count) => count === 0,
      30_000
    );
    check(
      "(p5) the paired browser approves it: the new browser is the person's now and opens the app",
      strangerAuth.caller === "owner"
    );

    // (p5b) A link from another site opens the app as the paired device:
    // `localhost` is another site than `127.0.0.1`. (p5c) A form on that
    // site posting to an owner route is refused, at the dashboard and at
    // the hub, before any cookie is read.
    const ask2 = JSON.parse(
      (
        await ask(
          `${fleet.base}/api/pair`,
          json({ kind: "cli", name: "a cross-site test" })
        )
      ).text
    ) as { userCode: string };
    const elsewhere = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        new Response(
          `<!doctype html><a id="to" href="${dashboard}/session">Open the fleet</a>
          <form id="via-dashboard" method="POST" action="${dashboard}/api/pair/requests/${ask2.userCode}/approve"><button>go</button></form>
          <form id="via-hub" method="POST" action="${fleet.base}/api/pair/requests/${ask2.userCode}/approve"><button>go</button></form>`,
          { headers: { "content-type": "text/html" } }
        ),
    });
    const site = `http://localhost:${elsewhere.port}/`;
    try {
      await paired.goto(site, { waitUntil: "domcontentloaded" });
      const [landed] = await Promise.all([
        paired.waitForResponse(
          (response) =>
            response.url().startsWith(`${dashboard}/session`) &&
            response.request().resourceType() === "document"
        ),
        paired.click("#to"),
      ]);
      const sent = await landed.request().allHeaders();
      const firstPaint = await landed.text();
      check(
        "(p5b) a top-level navigation from another site renders the app on first paint, not the pairing screen",
        sent["sec-fetch-site"] === "cross-site" &&
          firstPaint.includes('class="shell') &&
          !firstPaint.includes('class="pairing'),
        `sec-fetch-site ${sent["sec-fetch-site"]}; shell ${firstPaint.includes('class="shell')}; pairing ${firstPaint.includes('class="pairing')}`
      );
      const posted: { status: number; text: string }[] = [];
      for (const form of ["#via-dashboard", "#via-hub"]) {
        // biome-ignore lint/performance/noAwaitInLoops: one navigation at a time
        await paired.goto(site, { waitUntil: "domcontentloaded" });
        const [answered] = await Promise.all([
          paired.waitForResponse((response) =>
            response
              .url()
              .endsWith(`/api/pair/requests/${ask2.userCode}/approve`)
          ),
          paired.click(`${form} button`),
        ]);
        posted.push({
          status: answered.status(),
          text: await answered.text(),
        });
      }
      const still =
        await fleet.api<{ userCode: string }[]>("/api/pair/requests");
      check(
        "(p5c) a cross-site POST to an owner route is refused (403 at the dashboard and at the hub) and the pairing still waits",
        posted[0]?.status === 403 &&
          posted[0].text.includes("this request came from another page") &&
          posted[1]?.status === 403 &&
          posted[1].text.includes("this request came from another page") &&
          still.some((one) => one.userCode === ask2.userCode),
        JSON.stringify(posted)
      );
    } finally {
      elsewhere.stop(true);
      await fleet.api(`/api/pair/requests/${ask2.userCode}/deny`, {});
    }

    // (p6) Installing a session's credential takes a machine's proof.
    const install = (headers: Record<string, string>) =>
      ask(
        `${fleet.base}/api/session-identities/install`,
        json({ instanceIds: [parent] }, headers)
      );
    const [byNobody, byOwner, bySession] = await Promise.all([
      install({}),
      install({ authorization: `Owner ${cookie?.value ?? ""}` }),
      install(bearer),
    ]);
    check(
      "(p6) the session-identities install without a machine's proof is refused: anonymous 401, the person 403, a session 403",
      byNobody.status === 401 &&
        byOwner.status === 403 &&
        bySession.status === 403,
      `${byNobody.status}, ${byOwner.status}, ${bySession.status}`
    );

    // (p7) A delegate with pairing on: it lands, and its workspace retires.
    const delegated = await fleet.api<{
      workItemId: string;
      workspaceId: string;
    }>("/api/work-items", {
      parentInstanceId: parent,
      title: "Commit and end A",
      prompt: "PROBE-AUTH-A: commit a file.",
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: src,
    });
    const item = await until(
      "work item A ended",
      () =>
        fleet.query<{ state: string; error: string | null }>(
          "SELECT state, error FROM work_items WHERE id = ?",
          delegated.workItemId
        )[0],
      (row) =>
        row !== undefined &&
        ["done", "failed", "cancelled"].includes(row.state),
      300_000
    );
    check(
      "(p7) a delegate works with pairing on: its tools reach the hub through its machine, its item lands",
      item.state === "done",
      `${item.state} ${item.error ?? ""}`
    );
    const stateOf = () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM workspaces WHERE id = ?",
        delegated.workspaceId
      )[0]?.state;
    const retired = await until(
      "A's workspace retired",
      stateOf,
      (state) => state === "archived",
      120_000
    ).catch(stateOf);
    check(
      "(p7) its work landed, the delegate's workspace retires on its own, no session archiving it",
      retired === "archived",
      `${retired}`
    );

    // (p8) Off is trusted again.
    const off = await ask(`${fleet.base}/api/auth/pairing`, {
      ...json(
        { required: false },
        { authorization: `Owner ${cookie?.value ?? ""}` }
      ),
      method: "PUT",
    });
    fleet.authorize(null);
    const open200 = await ask(`${fleet.base}/api/agents`);
    check(
      "(p8) turning it off returns to trusted: no credential is the person again, and every key is forgotten",
      off.status === 200 &&
        open200.status === 200 &&
        fleet.query<{ n: number }>("SELECT count(*) AS n FROM machine_keys")[0]
          ?.n === 0,
      `${off.status} ${off.text.slice(0, 200)}; ${open200.status}`
    );
  },
};

export default spec;
