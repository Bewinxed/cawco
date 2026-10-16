/**
 * The person's messages to one session while its machine updates: one every
 * 3 s, until the stop file is there, each a `send` command on the hub's
 * dashboard socket as stage2-send.ts makes one, its id the message's. A send
 * the hub did not answer (its socket would not open, or closed, or said
 * nothing in 10 s: the hub restarting under it) is sent again under the same
 * id every second, as the dashboard's Try again sends it (client.svelte.ts
 * `retrySend`: "a hub that did take the first one after all has its record …
 * and hands the machine nothing twice"), for up to 120 s. Run inside a
 * container by the installed binary acting as bun (BUN_BE_BUN=1).
 *
 *   cawco stage2-sends.ts <hub http url> <machineId> <instanceId> <prefix> <stop file>
 *
 * One line per message: `<epoch ms> <token> accepted <tries>`, `<epoch ms>
 * <token> failed <tries> <the hub's words>`, or `<epoch ms> <token> unsent
 * <tries> <why>`. The message's words are its token, `<prefix>-<n>`. A last
 * line `done sent=<n>`.
 */
import { existsSync } from "node:fs";

const [, , hub, machineId, instanceId, prefix, stop] = Bun.argv;
if (!(hub && machineId && instanceId && prefix && stop)) {
  throw new Error(
    "usage: stage2-sends.ts HUB MACHINE INSTANCE PREFIX STOP_FILE"
  );
}
const EVERY_MS = 3000;
const ACK_MS = 10_000;
const GIVE_UP_MS = 120_000;

type Outcome =
  | { kind: "accepted" }
  | { kind: "failed"; reason: string }
  | { kind: "unanswered"; why: string };

/** One try of one send: the hub's ack, or why none came. */
const sendOnce = (commandId: string, text: string): Promise<Outcome> =>
  new Promise<Outcome>((settle) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`${hub.replace("http", "ws")}/ws/dashboard`);
    } catch (error) {
      settle({ kind: "unanswered", why: String(error) });
      return;
    }
    const timer = setTimeout(() => {
      done({ kind: "unanswered", why: `no ack in ${ACK_MS / 1000} s` });
    }, ACK_MS);
    const done = (outcome: Outcome) => {
      clearTimeout(timer);
      socket.onclose = null;
      socket.close();
      settle(outcome);
    };
    socket.onerror = () => done({ kind: "unanswered", why: "socket error" });
    socket.onclose = () =>
      done({ kind: "unanswered", why: "socket closed before the ack" });
    socket.onmessage = (event) => {
      let ack: {
        type?: string;
        commandId?: string;
        stage?: string;
        reason?: string;
      };
      try {
        ack = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (ack.type !== "command.ack" || ack.commandId !== commandId) {
        return;
      }
      done(
        ack.stage === "failed"
          ? { kind: "failed", reason: ack.reason ?? "no reason given" }
          : { kind: "accepted" }
      );
    };
    socket.onopen = () =>
      socket.send(
        JSON.stringify({
          type: "command",
          commandId,
          sessionId: instanceId,
          machineId,
          kind: "send",
          payload: {
            instanceId,
            message: {
              type: "user",
              uuid: commandId,
              origin: { kind: "human" },
              message: { role: "user", content: text },
            },
          },
        })
      );
  });

/** One message, sent again under its id until the hub answers it or {@link GIVE_UP_MS} passes. */
const message = async (token: string): Promise<string> => {
  const commandId = crypto.randomUUID();
  const end = Date.now() + GIVE_UP_MS;
  let tries = 0;
  for (;;) {
    tries += 1;
    // biome-ignore lint/performance/noAwaitInLoops: each try follows the last one's answer
    const outcome = await sendOnce(commandId, token);
    if (outcome.kind === "accepted") {
      return `accepted ${tries}`;
    }
    if (outcome.kind === "failed") {
      return `failed ${tries} ${outcome.reason.replaceAll("\n", " ")}`;
    }
    if (Date.now() >= end) {
      return `unsent ${tries} ${outcome.why}`;
    }
    await Bun.sleep(1000);
  }
};

let n = 0;
while (!existsSync(stop)) {
  const started = Date.now();
  n += 1;
  const token = `${prefix}-${n}`;
  // biome-ignore lint/performance/noAwaitInLoops: one message at a time, in order, as a person types them
  console.log(`${started} ${token} ${await message(token)}`);
  await Bun.sleep(Math.max(0, started + EVERY_MS - Date.now()));
}
console.log(`done sent=${n}`);
