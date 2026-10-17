/**
 * A captions file belongs to its video, on a scratch fleet (real hub, agent
 * and sessiond; Claude Code against the mock model, which calls
 * `send_to_user` as each PROBE-SEND says; a fake Telegram that takes every
 * upload) and the built dashboard at the desk. Read from the engine
 * (`HTMLVideoElement.textTracks`, the transcript's elements) and from what
 * Telegram was sent:
 *
 * 1. `film.mp4` sent with `film.vtt` beside it plays with one track, kind
 *    "captions", mode "showing"; the `.vtt` is not a row of its own.
 * 2. `bare.mp4`, with no `.vtt` beside it, has no tracks.
 * 3. `alone.vtt`, sent with no video, is a file row (DocThumb), not a
 *    picture card.
 * 4. Telegram got `film.mp4` as exactly one sendVideo, and `film.vtt` not
 *    at all (sendVideo takes no subtitles).
 *
 *   bun scripts/probe-kit/run.ts video-captions
 */
import { join } from "node:path";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { COMPOSER, open, type Spec } from "../kit";

const SEND = "mcp__cawco__send_to_user";
const MARK = /PROBE-SEND:(\d)/;
const VTT = "WEBVTT\n\n00:00.000 --> 00:01.000\nA caption.\n";

/** Each send's attachments, by its PROBE-SEND number. */
const sends = new Map<string, string[]>();
const called = new Set<string>();
const respond = (seen: Seen): Reply => {
  const mark = seen.last.match(MARK)?.[1];
  const attachments = mark && sends.get(mark);
  if (seen.tools && !seen.afterTool && attachments) {
    called.add(mark);
    return {
      everyMs: 5,
      words: [`Sending ${mark}.`],
      tool: { name: SEND, input: { message: "Files.", attachments } },
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

/** An upload Telegram was sent: its method and its file's name. */
interface Upload {
  file: string;
  method: string;
}

const spec: Spec = {
  name: "video-captions",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    const film = join(fleet.repo, "film.mp4");
    const bare = join(fleet.repo, "bare.mp4");
    const captions = join(fleet.repo, "film.vtt");
    const alone = join(fleet.repo, "alone.vtt");
    await clip(film);
    await clip(bare);
    await Bun.write(captions, VTT);
    await Bun.write(alone, VTT);
    sends.set("1", [film, captions, bare]);
    // gone.vtt is sent, then removed before the page reads it.
    const gone = join(fleet.repo, "gone.vtt");
    await Bun.write(gone, VTT);
    sends.set("2", [alone, gone]);

    // A Telegram that pins chat 42 and takes every upload: `send_to_user`
    // succeeds as on a hub with its bridge, so its row shows what it sent.
    let pinned = false;
    const uploads: Upload[] = [];
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
        if (
          request.headers.get("content-type")?.startsWith("multipart/form-data")
        ) {
          const form = await request.formData();
          for (const value of form.values() as Iterable<unknown>) {
            if (value instanceof Blob && "name" in value) {
              uploads.push({ method, file: String(value.name) });
            }
          }
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
    for (const mark of ["1", "2"]) {
      const before = fleet.seen.filter((s) => s.afterTool).length;
      // biome-ignore lint/performance/noAwaitInLoops: one send's turn ends before the next starts
      await fleet.send(session, `PROBE-SEND:${mark}`);
      await until(`send ${mark}`, () => called.has(mark), Boolean, 180_000);
      await until(
        `send ${mark}'s result`,
        () => fleet.seen.filter((s) => s.afterTool).length > before,
        Boolean,
        120_000
      );
    }
    await Bun.file(gone).delete();
    const firstUploads = uploads.filter(
      (upload) => upload.file === "film.mp4" || upload.file === "film.vtt"
    );

    const base = await fleet.dashboard();
    const desk = await kit.page("desk");
    await open(desk, `${base}/session/${session}`, COMPOSER);
    await until(
      "both replies in the transcript",
      () => desk.evaluate(() => document.body.innerText.includes("Sending 2.")),
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
        const [track] = Array.from(video.textTracks);
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
    const loneRead = () =>
      desk.evaluate(() => ({
        doc: [...document.querySelectorAll('[data-slot="doc"]')].some(
          (doc) => doc.getAttribute("title") === "alone.vtt"
        ),
        picture: [
          ...document.querySelectorAll<HTMLImageElement>("img[data-shot]"),
        ].some((img) => img.alt === "alone.vtt"),
        missing: document.body.innerText.includes("Image not available"),
        gone: document.body.innerText.includes("Captions file not available"),
      }));
    const lone = await until(
      "alone.vtt's file row",
      loneRead,
      (r) => r.doc && r.gone,
      60_000
    ).catch(loneRead);
    const rows = await desk.evaluate(() =>
      [...document.querySelectorAll("figcaption [data-slot=path]")].map(
        (path) => path.textContent ?? ""
      )
    );

    check(
      "1: film.mp4 sent with film.vtt beside it has one captions track, showing",
      filmRead?.tracks === 1 &&
        filmRead.kind === "captions" &&
        filmRead.mode === "showing",
      JSON.stringify(filmRead)
    );
    check(
      "1: film.vtt captions the video rather than showing as its own row",
      !rows.some((path) => path.endsWith("film.vtt")) &&
        rows.some((path) => path.endsWith("film.mp4")),
      JSON.stringify(rows)
    );
    check(
      "2: bare.mp4 with no .vtt beside it has no tracks",
      bareRead?.tracks === 0,
      JSON.stringify(bareRead)
    );
    check(
      "3: gone.vtt, removed after it was sent, says Captions file not available",
      lone.gone,
      JSON.stringify(lone)
    );
    check(
      "3: alone.vtt sent by itself is a file row, not a picture card",
      lone.doc && !lone.picture && !lone.missing,
      JSON.stringify(lone)
    );
    check(
      "4: Telegram got film.mp4 as one sendVideo and film.vtt not at all",
      firstUploads.length === 1 &&
        firstUploads[0]?.method === "sendVideo" &&
        firstUploads[0]?.file === "film.mp4",
      JSON.stringify(uploads)
    );
    check(
      "3: Telegram got alone.vtt as a document, not a photo",
      uploads.some(
        (upload) =>
          upload.file === "alone.vtt" && upload.method === "sendDocument"
      ) && !uploads.some((upload) => upload.method === "sendPhoto"),
      JSON.stringify(uploads)
    );
    telegram.stop(true);
  },
};

export default spec;
