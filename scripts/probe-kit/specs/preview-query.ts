/**
 * A request through a preview reaches the server behind it with its query
 * byte-identical (the owner's sheet "pairing-round-2", 2026-10-17: its stage
 * failed every module with `idle.riv?url=` and `PairingQr.svelte … Invalid
 * declaration`; Vite matches `?import` and `?url` only without the `=` that
 * a URLSearchParams round trip adds).
 *
 *   bun scripts/probe-kit/run.ts preview-query
 *
 * Drives the real hops in-process: the hub's preview listener
 * (`createPreviewListeners`, its relay) in front of the agent's listener
 * (`startPreview` of a port), in front of a raw TCP server that records each
 * request line as it came off the wire. The client writes its request line
 * on a raw socket too, as a browser sends it, so nothing on either end
 * parses or rebuilds the URL. Needs no boundary: it runs anywhere.
 *
 * For each query form a page sends (Vite's `?import&url`, a glob's `?url`,
 * `?a&b=1`, vite-plugin-svelte's `?svelte&type=style&lang.css`), the request
 * line the server reads names the path and query the client wrote, to the
 * byte:
 * 1. in port mode, through the session's own port;
 * 2. in host mode, through the session's name on the first port, past its
 *    lock with the pass a ticket gives (preview-access.ts): the entry
 *    answers 302 and sets `__Secure-cawco-pass` on the names' domain,
 *    `Secure; HttpOnly; SameSite=Lax`.
 *
 * Host mode's lock, on the same hops:
 * 3. the server behind never reads the pass: no request head it read
 *    carries `__Secure-cawco-pass`, while each one the client sent did;
 * 4. a name nobody holds answers a live pass 404 with the closed page, and
 *    a stranger (no pass) 401 with the locked page, as a held name does;
 * 5. the pass revoked (its row gone), the held name answers it 401 with the
 *    locked page;
 * 6. Settings › Previews' save refuses, with the sentence it shows and
 *    changing nothing, a pattern whose names stand under an ending the
 *    Public Suffix List doesn't know (`.cawco.localhost`: Chromium takes
 *    each such name for a site of its own, so no frame carries the pass),
 *    one under a public suffix (`ts.net`), and an http:// one;
 * 7. a session's own pass (`artifact_browse`): its ticket entered on a name
 *    of its scope sets `__Secure-cawco-session-pass-<session>` for 15
 *    minutes, beside the person's pass and never in its place; it opens
 *    that name, and answers another session's name and a name nobody holds
 *    as a stranger is answered; a ticket spent outside its scope, or once
 *    its session ended, sets nothing; past its end it opens nothing; and
 *    revoking by the session takes it.
 *
 * The names are localtest.me's, which resolve to 127.0.0.1 ("The entire
 * domain name localtest.me—and all wildcard entries—point to 127.0.0.1",
 * weblogs.asp.net/owscott/introducing-testing-domain-localtest-me): the hub
 * is asked for them here as DNS answers them, so it runs where none does.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one request at a time, each read off the wire before the next
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Socket } from "bun";
import type { Kit, Spec } from "../kit";

/** Host mode's listener: the first of the preview ports this spec gives its hub. Our pick, clear of a hub's default range. */
const HOST_PORT = 47_460;
const FORMS = [
  "/src/lib/assets/caw/idle.riv?import&url",
  "/src/lib/assets/caw/idle.riv?url",
  "/src/x.ts?a&b=1",
  "/src/lib/cawco/Sidebar.svelte?svelte&type=style&lang.css",
];
const INSTANCE = "00000000-0000-4000-8000-0000000a0e71";
/** Another session the hub holds a name for, showing nothing. */
const OTHER = "00000000-0000-4000-8000-0000000a0e72";
/** The sessions that still run, as the hub reads them (preview.ts `sessionLive`). */
const live = new Set([INSTANCE, OTHER]);
const TOKEN = "preview-query-probe-relay-token-0";

/** Each request line the server read, its target alone. */
const arrived: string[] = [];
/** Each request head the server read, whole. */
const heads: string[] = [];

/** A server that answers every request `ok`, keeping its request line's target as the bytes said it. */
const recorder = () =>
  Bun.listen<{ head: string }>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(socket) {
        socket.data = { head: "" };
      },
      data(socket: Socket<{ head: string }>, chunk) {
        socket.data.head += chunk.toString("latin1");
        if (!socket.data.head.includes("\r\n\r\n")) {
          return;
        }
        arrived.push(socket.data.head.split("\r\n")[0]?.split(" ")[1] ?? "");
        heads.push(socket.data.head);
        socket.data.head = "";
        socket.write(
          "HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\ncontent-length: 2\r\n\r\nok"
        );
      },
    },
  });

/**
 * One GET of `target` on `port`, its request line written as given, under
 * `host` (the port's own address unless named) with `headers`; the whole
 * response as it came.
 */
const rawText = (
  port: number,
  target: string,
  host = `127.0.0.1:${port}`,
  headers = ""
): Promise<string> =>
  new Promise((done, fail) => {
    let got = "";
    Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        open(socket) {
          socket.write(
            `GET ${target} HTTP/1.1\r\nhost: ${host}\r\n${headers}connection: close\r\n\r\n`
          );
        },
        data(_socket, chunk) {
          got += chunk.toString("latin1");
        },
        close() {
          done(got);
        },
        error(_socket, error) {
          fail(error);
        },
      },
    }).catch(fail);
  });

/** {@link rawText}'s head alone, its status line first. */
const rawGet = async (...args: Parameters<typeof rawText>): Promise<string[]> =>
  (await rawText(...args)).split("\r\n\r\n")[0]?.split("\r\n") ?? [];

/**
 * Host mode's names, under localtest.me (a domain a cookie may be set on,
 * under an ending the Public Suffix List knows), on the range's first port
 * (TLS is a proxy's in front of it, never the hub's).
 */
const DOMAIN = "localtest.me";
const PATTERN = `https://p-{session}.${DOMAIN}:${HOST_PORT}`;
const NAME = `p-${INSTANCE}.${DOMAIN}:${HOST_PORT}`;
const OTHER_NAME = `p-${OTHER}.${DOMAIN}:${HOST_PORT}`;
/** A name of the pattern no origin holds. */
const UNHELD = `p-00000000-0000-4000-8000-00000000dead.${DOMAIN}:${HOST_PORT}`;
/** The patterns Settings' save refuses, and a phrase of each refusal. */
const REFUSED = [
  {
    pattern: `https://p-{session}.cawco.localhost:${HOST_PORT}`,
    says: "whose ending .localhost no public registry holds",
  },
  { pattern: "https://p-{port}.ts.net", says: "ts.net, a public suffix" },
  { pattern: `http://p-{port}.${DOMAIN}`, says: "A host pattern is https://" },
];

/** The pass host mode's lock gives for a ticket, as the browser sends it back: `name=value`. */
const PASS = /^set-cookie:\s*([^;]+)/im;
/** What the closed page and the locked page carry (core preview-proxy `downResponse`, hub preview-access `lockedResponse`). */
const CLOSED_PAGE = '<meta name="cawco-preview-down" content="closed">';
const LOCKED_PAGE = '<meta name="cawco-preview-locked" content="1">';
/** A request head's Cookie line. */
const COOKIE_LINE = /^cookie:.*$/im;
/** The pass's whole `Set-Cookie`, its attributes after its value. */
const PASS_ATTRIBUTES = /^set-cookie:\s*__Secure-cawco-pass=[^;]+;(.*)$/im;
/** A session's pass's whole `Set-Cookie`, its attributes after its value. */
const SESSION_ATTRIBUTES =
  /^set-cookie:\s*__Secure-cawco-session-pass-[^=]+=[^;]+;(.*)$/im;

/** What leg 7 reads of the hub: its tickets, its passes as kept, and a status line's reader. */
interface SessionLegHub {
  /** core `PREVIEW_ENTER_PATH`. */
  enterPath: string;
  mintSessionTicket: (
    instanceId: string,
    scope: string[]
  ) => { ticket: string };
  mintTicket: (deviceId: string | null) => { ticket: string };
  passRows: Map<
    string,
    { expiresAt: Date; instanceId: string | null; scope: string[] | null }
  >;
  revoke: (by: { instanceId: string }) => number;
  sessionPassCookie: (instanceId: string) => string;
  status: (text: string) => string;
}

/** 7. A session's own pass (artifact_browse) on host mode's names, beside the person's. */
const sessionPassLegs = async (kit: Kit, hub: SessionLegHub) => {
  const { mintSessionTicket, mintTicket, passRows, sessionPassCookie, status } =
    hub;
  const enterWith = (ticket: string, name: string, cookie = "") =>
    rawGet(
      HOST_PORT,
      `${hub.enterPath}?ticket=${encodeURIComponent(ticket)}&next=%2F`,
      name,
      cookie ? `cookie: ${cookie}\r\n` : ""
    );
  const person = (await enterWith(mintTicket(null).ticket, NAME))
    .join("\n")
    .match(PASS)?.[1];
  const sessionEntry = await enterWith(
    mintSessionTicket(INSTANCE, [INSTANCE]).ticket,
    NAME,
    person
  );
  const sessionPass = sessionEntry.join("\n").match(PASS)?.[1] ?? "";
  const sessionAttributes = (
    sessionEntry.join("\n").match(SESSION_ATTRIBUTES)?.[1] ?? ""
  )
    .split(";")
    .map((one) => one.trim())
    .filter(Boolean);
  const maxAge = Number(
    sessionAttributes.find((one) => one.startsWith("Max-Age="))?.slice(8)
  );
  kit.check(
    "7a: a session's ticket entered on a name of its scope: 302, its own cookie __Secure-cawco-session-pass-<session> on the names' domain, Secure, HttpOnly, SameSite=Lax, for 15 minutes",
    sessionEntry[0]?.startsWith("HTTP/1.1 302") === true &&
      sessionPass.startsWith(`${sessionPassCookie(INSTANCE)}=`) &&
      sessionAttributes.includes(`Domain=${DOMAIN}`) &&
      sessionAttributes.includes("Secure") &&
      sessionAttributes.includes("HttpOnly") &&
      sessionAttributes.includes("SameSite=Lax") &&
      maxAge > 890 &&
      maxAge <= 900,
    `answered ${JSON.stringify(sessionEntry[0] ?? "")}; ${sessionPass.split("=")[0]}; attributes ${sessionAttributes.join("; ")}`
  );
  const reached = arrived.length;
  const own = await rawText(
    HOST_PORT,
    FORMS[2] as string,
    NAME,
    `cookie: ${sessionPass}\r\n`
  );
  const other = await rawText(
    HOST_PORT,
    "/",
    OTHER_NAME,
    `cookie: ${sessionPass}\r\n`
  );
  const nobody = await rawText(
    HOST_PORT,
    "/",
    UNHELD,
    `cookie: ${sessionPass}\r\n`
  );
  kit.check(
    "7b: the session's pass opens its own name (the server behind reads the request), and answers another session's name and a name nobody holds 401 with the locked page, as a stranger is",
    status(own).startsWith("HTTP/1.1 200") &&
      arrived.length === reached + 1 &&
      status(other).startsWith("HTTP/1.1 401") &&
      other.includes(LOCKED_PAGE) &&
      status(nobody).startsWith("HTTP/1.1 401") &&
      nobody.includes(LOCKED_PAGE),
    `own: ${status(own)}; another session's: ${status(other)}; nobody's: ${status(nobody)}`
  );
  const personAfter = await rawText(
    HOST_PORT,
    "/",
    OTHER_NAME,
    `cookie: ${person}; ${sessionPass}\r\n`
  );
  kit.check(
    "7c: the session's entry, made in a browser holding the person's pass, leaves it: the person's pass still opens another session's name",
    !!person && status(personAfter).startsWith("HTTP/1.1 404"),
    `the person's pass beside the session's on another session's name: ${status(personAfter)}`
  );
  const outside = await enterWith(
    mintSessionTicket(INSTANCE, [INSTANCE]).ticket,
    OTHER_NAME
  );
  kit.check(
    "7d: a session's ticket spent on a name outside its scope sets nothing and answers the locked page",
    outside[0]?.startsWith("HTTP/1.1 401") === true &&
      !outside.join("\n").match(PASS),
    `answered ${JSON.stringify(outside[0] ?? "")}`
  );
  const sessionToken = createHash("sha256")
    .update(sessionPass.slice(`${sessionPassCookie(INSTANCE)}=`.length))
    .digest("hex");
  const sessionRow = passRows.get(sessionToken);
  if (sessionRow) {
    passRows.set(sessionToken, {
      ...sessionRow,
      expiresAt: new Date(Date.now() - 1000),
    });
  }
  const lapsed = await rawText(
    HOST_PORT,
    FORMS[2] as string,
    NAME,
    `cookie: ${sessionPass}\r\n`
  );
  kit.check(
    "7e: the session's pass past its end: its own name answers 401 with the locked page",
    sessionRow?.instanceId === INSTANCE &&
      JSON.stringify(sessionRow.scope) === JSON.stringify([INSTANCE]) &&
      status(lapsed).startsWith("HTTP/1.1 401") &&
      lapsed.includes(LOCKED_PAGE),
    `row ${JSON.stringify({ instanceId: sessionRow?.instanceId, scope: sessionRow?.scope })}; answered ${status(lapsed)}`
  );
  live.delete(INSTANCE);
  const endedEntry = await enterWith(
    mintSessionTicket(INSTANCE, [INSTANCE]).ticket,
    NAME
  );
  const gone = hub.revoke({ instanceId: INSTANCE });
  kit.check(
    "7f: once the session ends its ticket enters nowhere (401, nothing set), and revoking by the session takes its passes",
    endedEntry[0]?.startsWith("HTTP/1.1 401") === true &&
      !endedEntry.join("\n").match(PASS) &&
      gone === 1 &&
      ![...passRows.values()].some((row) => row.instanceId === INSTANCE),
    `answered ${JSON.stringify(endedEntry[0] ?? "")}; revoked ${gone}`
  );
};

const run = async (kit: Kit) => {
  // The names as DNS answers them, for the hub's check that one resolves.
  const { lookup } = Bun.dns;
  (Bun.dns as { lookup: unknown }).lookup = (
    name: string,
    ...rest: unknown[]
  ) =>
    name.endsWith(`.${DOMAIN}`)
      ? Promise.resolve([{ address: "127.0.0.1", family: 4, ttl: 0 }])
      : (lookup as (...all: unknown[]) => unknown)(name, ...rest);
  // Before the hub's config is read: its secret key in scratch, its preview ports clear of any hub's.
  const scratch = await mkdtemp(join(tmpdir(), "preview-query-"));
  process.env.CAWCO_DB_PATH = join(scratch, "hub.db");
  process.env.CAWCO_PREVIEW_PORTS = `${HOST_PORT}-${HOST_PORT + 9}`;
  const { startPreview, stopPreview } =
    await import("../../../packages/agent/src/preview");
  const { createPreviewListeners, previewTargets } =
    await import("../../../packages/hub/src/preview");
  const { mintSessionTicket, mintTicket, sessionPassCookie } =
    await import("../../../packages/hub/src/preview-access");
  const { PREVIEW_ENTER_PATH, PREVIEW_PASS_COOKIE } =
    await import("../../../packages/core/src/frames");
  type Deps = Parameters<typeof createPreviewListeners>[1];
  type Db = Parameters<typeof createPreviewListeners>[2];
  type Passes = Parameters<typeof createPreviewListeners>[3];
  type PassRow = Parameters<Passes["open"]>[0];
  const server = recorder();
  const { port: agentPort } = await startPreview({
    instanceId: INSTANCE,
    port: server.port,
    token: TOKEN,
  });
  previewTargets.set(INSTANCE, {
    artifact: { kind: "preview", id: INSTANCE } as never,
    machineId: "probe",
    revision: "probe",
    source: { port: server.port },
  });
  const deps = {
    reach: () =>
      Promise.resolve({
        ok: true,
        upstream: { address: "127.0.0.1", port: agentPort, token: TOKEN },
      }),
    unreachable: () => undefined,
    ownerOf: () => undefined,
    kindOf: () => undefined,
    state: () => "",
    sessionLive: (id: string) => live.has(id),
  } as unknown as Deps;
  // The ports the hub keeps, as its db does: host mode finds an origin by
  // the label of one it keeps (preview.ts `sessionOfHost`). Every origin
  // here is a session the hub holds.
  const kept = new Map<string, number>();
  const db = {
    settings: () => ({ mode: "port", pattern: null }),
    ownerHeld: () => true,
    ports: () => [...kept].map(([key, port]) => ({ key, port })),
    keepPort: (key: string, port: number) => {
      kept.set(key, port);
      return true;
    },
    dropPort: (key: string) => {
      kept.delete(key);
    },
    setSettings: () => undefined,
  } as unknown as Db;
  // The passes the hub keeps, as its db does (db/preview-passes.ts), by token hash.
  const passRows = new Map<string, PassRow>();
  const passes: Passes = {
    live: (hash, now) => {
      const row = passRows.get(hash);
      return row && row.expiresAt > now ? row : undefined;
    },
    open: (row, replacing) => {
      if (replacing) {
        passRows.delete(replacing);
      }
      passRows.set(row.tokenHash, row);
      return true;
    },
    revoke: (by) => {
      const gone = [...passRows].filter(([hash, row]) => {
        if ("deviceId" in by) {
          return row.deviceId === by.deviceId;
        }
        return "instanceId" in by
          ? row.instanceId === by.instanceId
          : hash === by.tokenHash;
      });
      for (const [hash] of gone) {
        passRows.delete(hash);
      }
      return gone.length;
    },
    touch: () => undefined,
  };
  // No tailnet here: no TLS twins, no tailnet origin.
  const listeners = createPreviewListeners("127.0.0.1", deps, db, passes, {
    beside: () => ({ close: () => undefined }),
    origin: () => undefined,
  });
  /** `target` through `port`, then what the server behind read: its check, numbered `leg`. */
  const through = async (
    leg: string,
    port: number,
    target: string,
    host?: string,
    headers?: string
  ) => {
    const before = arrived.length;
    const [status = ""] = await rawGet(port, target, host, headers);
    const got = arrived.length > before ? arrived.at(-1) : undefined;
    kit.check(
      `${leg}: ${target} reaches the server behind the hub and agent listeners byte-identical`,
      status.startsWith("HTTP/1.1 200") && got === target,
      `answered ${JSON.stringify(status)}; the server read ${JSON.stringify(got ?? null)}`
    );
  };
  try {
    // 1. Port mode: the session's own port.
    const sessionPort = listeners.address(INSTANCE).port;
    for (const target of FORMS) {
      await through("1 (port mode)", sessionPort, target);
    }
    // 2. Host mode: the session's name on the first port, behind its lock.
    await listeners.set({ mode: "host", pattern: PATTERN });
    const entered = await rawGet(
      HOST_PORT,
      `${PREVIEW_ENTER_PATH}?ticket=${encodeURIComponent(mintTicket(null).ticket)}&next=%2F`,
      NAME
    );
    const pass = entered.join("\n").match(PASS)?.[1];
    const attributes = (entered.join("\n").match(PASS_ATTRIBUTES)?.[1] ?? "")
      .split(";")
      .map((one) => one.trim())
      .filter(Boolean)
      .sort();
    const wanted = [
      `Domain=${DOMAIN}`,
      "HttpOnly",
      "Max-Age=2592000",
      "Path=/",
      "SameSite=Lax",
      "Secure",
    ];
    kit.check(
      "2: host mode's lock gives a pass for a ticket: 302, __Secure-cawco-pass on the names' domain, Secure, HttpOnly, SameSite=Lax, 30 days",
      entered[0]?.startsWith("HTTP/1.1 302") === true &&
        pass?.startsWith(`${PREVIEW_PASS_COOKIE}=`) === true &&
        attributes.join("; ") === wanted.join("; "),
      `answered ${JSON.stringify(entered[0] ?? "")}; attributes ${attributes.join("; ")}`
    );
    const read = heads.length;
    for (const target of FORMS) {
      await through(
        "2 (host mode)",
        HOST_PORT,
        target,
        NAME,
        `cookie: app=kept; ${pass}\r\n`
      );
    }
    // 3. The server behind never reads the pass; the app's own cookie goes on.
    const behind = heads.slice(read);
    kit.check(
      "3: the server behind never reads the pass: every request head it read lacks __Secure-cawco-pass and keeps the app's own cookie",
      behind.length === FORMS.length &&
        behind.every(
          (head) =>
            !head.includes(PREVIEW_PASS_COOKIE) && head.includes("app=kept")
        ),
      `${behind.length} heads; ${behind.map((head) => head.match(COOKIE_LINE)?.[0] ?? "no cookie").join(" | ")}`
    );
    // 4. A name nobody holds: closed to a live pass, locked to a stranger.
    const status = (text: string) => text.split("\r\n")[0] ?? "";
    const closed = await rawText(HOST_PORT, "/", UNHELD, `cookie: ${pass}\r\n`);
    const stranger = await rawText(HOST_PORT, "/", UNHELD);
    const heldStranger = await rawText(HOST_PORT, "/", NAME);
    kit.check(
      "4: a name nobody holds answers a live pass 404 with the closed page, and a stranger 401 with the locked page, as the held name answers a stranger",
      status(closed).startsWith("HTTP/1.1 404") &&
        closed.includes(CLOSED_PAGE) &&
        status(stranger).startsWith("HTTP/1.1 401") &&
        stranger.includes(LOCKED_PAGE) &&
        status(heldStranger).startsWith("HTTP/1.1 401") &&
        heldStranger.includes(LOCKED_PAGE),
      `unheld with a pass: ${status(closed)}; unheld stranger: ${status(stranger)}; held stranger: ${status(heldStranger)}`
    );
    // 5. Revoked: the held name locks the pass out.
    const token = pass?.slice(`${PREVIEW_PASS_COOKIE}=`.length) ?? "";
    const revoked = passes.revoke({
      tokenHash: createHash("sha256").update(token).digest("hex"),
    });
    const after = await rawText(
      HOST_PORT,
      FORMS[0] as string,
      NAME,
      `cookie: ${pass}\r\n`
    );
    kit.check(
      "5: the pass revoked, the held name answers it 401 with the locked page",
      revoked === 1 &&
        status(after).startsWith("HTTP/1.1 401") &&
        after.includes(LOCKED_PAGE),
      `revoked ${revoked}; answered ${status(after)}`
    );
    // 6. Settings' save refuses what no browser's frames could carry.
    for (const { pattern, says } of REFUSED) {
      const refused = await listeners.set({ mode: "host", pattern }).then(
        () => ({ status: 200, message: "kept" }),
        (error: { message: string; status?: number }) => ({
          status: error.status ?? 0,
          message: error.message,
        })
      );
      const now = listeners.settings();
      kit.check(
        `6: Settings' save refuses ${pattern} with 422 and its sentence, and host mode stands as it was`,
        refused.status === 422 &&
          refused.message.includes(says) &&
          now.mode === "host" &&
          now.pattern === PATTERN &&
          now.passDomain === DOMAIN,
        `${refused.status}: ${refused.message}; settings ${JSON.stringify(now)}`
      );
    }
    // 7. A session's own pass (artifact_browse): its origins alone, beside the person's.
    listeners.address(OTHER);
    await sessionPassLegs(kit, {
      enterPath: PREVIEW_ENTER_PATH,
      mintSessionTicket,
      mintTicket,
      passRows,
      revoke: passes.revoke,
      sessionPassCookie,
      status,
    });
  } finally {
    await listeners.set({ mode: "port" });
    listeners.release(INSTANCE);
    (Bun.dns as { lookup: unknown }).lookup = lookup;
    previewTargets.delete(INSTANCE);
    await stopPreview({ instanceId: INSTANCE });
    server.stop(true);
    await rm(scratch, { recursive: true, force: true });
  }
};

const spec: Spec = { name: "preview-query", run };
export default spec;
