/**
 * A video an agent sends carries its captions when it has them, on a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model, which calls `send_to_user` once) and the built dashboard at the
 * desk. Read from the engine (`HTMLVideoElement.textTracks`):
 *
 * 1. `film.mp4` sent with `film.vtt` beside it plays with one track, kind
 *    "captions", mode "showing"; the `.vtt` is not a row of its own.
 * 2. `bare.mp4`, with no `.vtt` beside it, has no tracks.
 *
 *   bun scripts/probe-kit/run.ts video-captions
 */
import { join } from "node:path";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { COMPOSER, open, type Spec } from "../kit";

const SEND = "mcp__cawco__send_to_user";
const VTT = "WEBVTT\n\n00:00.000 --> 00:01.000\nA caption.\n";

let attachments: string[] = [];
let called = false;
const respond = (seen: Seen): Reply => {
  if (seen.tools && !seen.afterTool && seen.last.includes("PROBE-SEND")) {
    called = true;
    return {
      everyMs: 5,
      words: ["Sending."],
      tool: { name: SEND, input: { message: "Two clips.", attachments } },
    };
  }
  return { everyMs: 5, words: ["ok"] };
};

/** A one-second silent clip, made with ffmpeg. */
const clip = async (path: string): Promise<void> => {
  const made = Bun.spawn(
    [
      "ffmpeg",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=gray:s=160x90:d=1",
      "-pix_fmt",
      "yuv420p",
      "-y",
      path,
    ],
    { stderr: "inherit" }
  );
  if ((await made.exited) !== 0) {
    throw new Error(`ffmpeg could not make ${path}`);
  }
};

interface Read {
  kind?: string;
  mode?: string;
  tracks: number;
}

const spec: Spec = {
  name: "video-captions",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    const film = join(fleet.repo, "film.mp4");
    const bare = join(fleet.repo, "bare.mp4");
    const captions = join(fleet.repo, "film.vtt");
    await clip(film);
    await clip(bare);
    await Bun.write(captions, VTT);
    attachments = [film, captions, bare];

    // A Telegram that pins chat 42 and takes every upload: `send_to_user`
    // succeeds as on a hub with its bridge, so its row shows what it sent.
    let pinned = false;
    const telegram = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      idleTimeout: 0,
      async fetch(request) {
        const method = new URL(request.url).pathname.split("/").pop() ?? "";
        if (method === "getUpdates") {
          if (!pinned) {
            pinned = true;
            return Response.json({
              ok: true,
              result: [
                {
                  update_id: 1,
                  message: { message_id: 1, chat: { id: 42 }, text: "hello" },
                },
              ],
            });
          }
          await Bun.sleep(5000);
          return Response.json({ ok: true, result: [] });
        }
        return Response.json({
          ok: true,
          result: { message_id: 100, chat: { id: 42 } },
        });
      },
    });
    fleet.env.CAWCO_TELEGRAM_API = `http://127.0.0.1:${telegram.port}`;
    fleet.env.CAWCO_TELEGRAM_TOKEN = "123456:captions-probe-fake";

    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    await until("Telegram's chat pinned", () => pinned, Boolean, 30_000);
    const session = await fleet.spawn("claude", "Captions", fleet.repo);
    await fleet.send(session, "PROBE-SEND");
    await until("the send_to_user call", () => called, Boolean, 180_000);
    const answered = await until(
      "the send_to_user call's result",
      () => fleet.seen.find((s) => s.afterTool),
      Boolean,
      120_000
    ).catch(() => undefined);
    check(
      "the send_to_user call came back to the model",
      answered !== undefined,
      `${await fleet.logs("hub")}\n${await fleet.logs("agent")}`
        .split("\n")
        .filter((line) => /send_to_user|telegram|attach/i.test(line))
        .slice(-15)
        .join("\n")
    );

    const base = await fleet.dashboard();
    const desk = await kit.page("desk");
    await open(desk, `${base}/session/${session}`, COMPOSER);
    await until(
      "the reply in the transcript",
      () =>
        desk.evaluate(() => document.body.innerText.includes("Sending.")),
      Boolean,
      60_000
    ).catch(() => false);
    const read = (leaf: string) =>
      desk.evaluate((name): Read | undefined => {
        const video = document.querySelector<HTMLVideoElement>(
          `video[aria-label="${name}"]`
        );
        if (!video) {
          return;
        }
        const track = video.textTracks[0];
        return {
          tracks: video.textTracks.length,
          kind: track?.kind,
          mode: track?.mode,
        };
      }, leaf);
    const filmRead = await until(
      "film.mp4's video with its captions",
      () => read("film.mp4"),
      (r) => r.tracks > 0,
      60_000
    ).catch(() => read("film.mp4"));
    const bareRead = await until(
      "bare.mp4's video",
      () => read("bare.mp4"),
      Boolean,
      60_000
    ).catch(() => read("bare.mp4"));
    const rows = await desk.evaluate(
      () =>
        [...document.querySelectorAll("figcaption [data-slot=path]")].map(
          (path) => path.textContent ?? ""
        )
    );

    check(
      "1: film.mp4 sent with film.vtt beside it has one captions track, showing",
      filmRead?.tracks === 1 &&
        filmRead.kind === "captions" &&
        filmRead.mode === "showing",
      `${JSON.stringify(filmRead)}; the transcript: ${await desk.evaluate(() =>
        document.body.innerText.slice(-1500)
      )}`
    );
    check(
      "1: film.vtt captions the video rather than showing as its own row",
      !rows.some((path) => path.endsWith(".vtt")) &&
        rows.some((path) => path.endsWith("film.mp4")),
      JSON.stringify(rows)
    );
    check(
      "2: bare.mp4 with no .vtt beside it has no tracks",
      bareRead?.tracks === 0,
      JSON.stringify(bareRead)
    );
  },
};

export default spec;
