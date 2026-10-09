/**
 * Fires requests the moment a machine's update phase becomes `installing`, and writes down what each got.
 * Run inside a container by the installed binary acting as bun (BUN_BE_BUN=1). It polls the hub's
 * update state every 20 ms with no other sleep, so the window between the machine saying `installing`
 * and the restart it is about to cause is hit by construction, not by luck.
 *
 *   cawco stage2-during-install.ts hub-start <hub url> <machineId> <idPrefix>
 *       asks the hub, over its dashboard socket and as the dashboard does, to start a session on the machine
 *   cawco stage2-during-install.ts keeper-child <hub url> <machineId> <idPrefix>
 *       asks the machine's own session keeper (its socket) to start a held child
 *
 * Output, one line each: `sent <id> before=<phase> after=<phase> answer=<what came back>`, then
 * `accepted <id>` when the hub reported `installing` before and after and nothing refused the request
 * (in keeper-child mode: the keeper acked the spawn `applied`; one it refused for want of room under its
 * task limit was never started, and is reported with its reason),
 * and a last line `done sent=<n> accepted=<n> sawInstalling=<bool> ...`. It ends by itself once the
 * machine has left `installing` (three answers in a row), or after 900 s.
 */
const [, , mode, hub, machineId, prefix] = Bun.argv;
const POLL_MS = 20;
const ANSWER_MS = 150;
const DEADLINE = Date.now() + 900_000;
/** The keeper's socket: where the proof's machines have it, unless its own variable says otherwise. */
const KEEPER_SOCKET =
  process.env.CAWCO_SESSIOND_ENDPOINT ?? "/run/user/1000/cawco/sessiond.sock";

async function phase(): Promise<string | undefined> {
  try {
    const response = await fetch(`${hub}/api/binary-updates/machines`, {
      signal: AbortSignal.timeout(1000),
    });
    const body = (await response.json()) as {
      machines?: Record<string, { phase?: string }>;
    };
    return body.machines?.[machineId]?.phase;
  } catch {
    return undefined;
  }
}

let dashboard: WebSocket | undefined;
let heard: string[] = [];
async function dashboardSocket(): Promise<WebSocket | undefined> {
  if (dashboard?.readyState === WebSocket.OPEN) {
    return dashboard;
  }
  try {
    const socket = new WebSocket(`${hub.replace("http", "ws")}/ws/dashboard`);
    socket.onmessage = (event) => {
      heard.push(String(event.data));
    };
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("socket"));
    });
    dashboard = socket;
    return socket;
  } catch {
    return undefined;
  }
}

/**
 * The hub's refusal of the start of `id`, in its words: the frame it answers a
 * refused spawn with (`refusalFrame`: `payload.kind` "error" for that
 * instance). Undefined when `text` is not one.
 */
function refusalOf(text: string, id: string): string | undefined {
  try {
    const frame = JSON.parse(text) as {
      instanceId?: string;
      payload?: { kind?: string; message?: string };
    };
    return frame.instanceId === id && frame.payload?.kind === "error"
      ? (frame.payload.message ?? "refused")
      : undefined;
  } catch {
    return undefined;
  }
}

/** One request; resolves to what came back and whether anything refused it. */
async function fire(id: string): Promise<{ answer: string; refused: boolean }> {
  if (mode === "hub-start") {
    const socket = await dashboardSocket();
    if (!socket) {
      return { answer: "the dashboard socket did not open", refused: true };
    }
    heard = [];
    socket.send(
      JSON.stringify({
        verb: "spawn",
        machineId,
        instanceId: id,
        payload: {
          instanceId: id,
          cwd: "/tmp",
          harness: "claude",
          model: "stub",
        },
      })
    );
    await Bun.sleep(ANSWER_MS);
    const refusal = heard
      .map((text) => refusalOf(text, id))
      .find((one) => one !== undefined);
    const answer = heard.map((text) => text.slice(0, 160)).join(" | ");
    return {
      answer: refusal
        ? `refused: ${refusal}`
        : answer || "no answer within 150ms",
      refused:
        refusal !== undefined ||
        answer.includes('"ok":false') ||
        answer.includes("failure"),
    };
  }
  let reply = "";
  try {
    const connection = await Bun.connect({
      unix: KEEPER_SOCKET,
      socket: {
        data(_socket, data) {
          reply += Buffer.from(data).toString("utf8");
        },
      },
    });
    connection.write(
      `${JSON.stringify({
        type: "spawn",
        commandId: `hold-${id}`,
        procId: id,
        spec: { command: "sleep", args: ["3000"] },
      })}\n`
    );
    await Bun.sleep(ANSWER_MS);
    connection.end();
  } catch (error) {
    return { answer: `the keeper refused: ${error}`, refused: true };
  }
  // The keeper's answer to this spawn: a child it started says `applied`; one
  // it refused (no room under its task limit, a fork the kernel refused) says
  // `failed` with the reason, and is not a session that was started.
  const acked = reply
    .split("\n")
    .flatMap((line) => {
      try {
        return [
          JSON.parse(line) as {
            type?: string;
            commandId?: string;
            stage?: string;
            reason?: string;
          },
        ];
      } catch {
        return [];
      }
    })
    .find(
      (message) => message.type === "ack" && message.commandId === `hold-${id}`
    );
  if (!acked) {
    return { answer: "no answer from the keeper within 150ms", refused: true };
  }
  return acked.stage === "applied"
    ? { answer: "the keeper started it", refused: false }
    : {
        answer: `refused by the keeper: ${acked.reason ?? acked.stage}`,
        refused: true,
      };
}

if (mode === "hub-start") {
  // Connected before anything is asked, so the first request is not delayed by opening the socket.
  await dashboardSocket();
}
let sent = 0;
let accepted = 0;
let sawInstalling = false;
let left = 0;
let firstSeen = 0;
let lastSeen = 0;
while (Date.now() < DEADLINE) {
  // biome-ignore lint/performance/noAwaitInLoops: a poll; each read must follow the previous answer
  const before = await phase();
  if (before === "installing") {
    sawInstalling = true;
    left = 0;
    firstSeen ||= Date.now();
    lastSeen = Date.now();
    sent += 1;
    const id = `${prefix}-${sent}`;
    const { answer, refused } = await fire(id);
    const after = await phase();
    console.log(
      `sent ${id} before=${before} after=${after ?? "no answer from the hub"} answer=${answer}`
    );
    if (after === "installing" && !refused) {
      accepted += 1;
      console.log(`accepted ${id}`);
    }
  } else if (sawInstalling && before !== undefined) {
    left += 1;
    if (left >= 3) {
      break;
    }
  }
  await Bun.sleep(POLL_MS);
}
console.log(
  `done sent=${sent} accepted=${accepted} sawInstalling=${sawInstalling} installingSeenForMs=${sawInstalling ? lastSeen - firstSeen : 0}`
);
dashboard?.close();

export {};
