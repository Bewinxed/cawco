/**
 * A fake Antigravity CLI (`agy`) for the specs that drive CawCo's use of it
 * (tool-signin, image-antigravity), put first on the PATH under the spec's
 * scratch HOME. It answers what CawCo runs of agy and nothing else:
 *
 * - `--version`: 1.5.0.
 * - `-p /usage --output-format json`: the envelope agy 1.5.0 printed on
 *   obelisk when signed in (2026-11-04, the host read); signed out, what
 *   agy 1.5.2 says in a HOME with no sign-in (2026-11-07): "Authentication
 *   required. Please visit the URL to log in:", a link, then a wait of 60 s
 *   for a login before it exits 1; `broken` mode: a line that says neither,
 *   exit 2.
 * - `acp --login`: prints a sign-in link on accounts.google.com, reads one
 *   line; `good-code` signs it in (exit 0), anything else exits 3.
 * - `-p <prompt> …` (an image run): by the mode file, the documented JSON
 *   envelope (https://antigravity.google/docs/cli/headless/), writing a
 *   JPEG under `~/.gemini/antigravity-cli/brain/<conversation_id>/` first
 *   where the mode makes one.
 *
 * Every run's arguments are appended to `~/.fake-agy-runs`, one JSON array
 * a line; each `reference-*` file in its working folder as it starts, to
 * `~/.fake-agy-seen`, its SHA-256 and path a line.
 */
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** What an image run does. */
export type FakeAgyMode =
  /** Writes the image, answers SUCCESS with its path, exits 0. */
  | "image"
  /** Writes the image, then ends as agy 1.5.0 did on Pro: ERROR NOT_FOUND (code 404), exit 1. */
  | "image-then-404"
  /** Answers SUCCESS with no image written. */
  | "no-image"
  /** Writes no image, answers SUCCESS with the path of `reference-1.png` in its working folder, exits 0. */
  | "answers-reference"
  /** Writes no image, answers SUCCESS with an empty path and, as its response, the tool error agy 1.5.1's image-generator subagent got for 14 references (read in its transcript on obelisk, 2026-11-05; whether agy's own answer repeats it is not measured), exits 0. */
  | "tool-refused"
  /** Writes nothing: 429 RESOURCE_EXHAUSTED with its reset, exit 1. */
  | "quota"
  /** Writes nothing: 500 INTERNAL, as every image run on Plus did, exit 1. */
  | "internal"
  /** Not signed in: "authentication required", exit 1. */
  | "signed-out"
  /** Never ends on its own. */
  | "hang";

/** A JPEG's header to its SOF0, 64 × 48: what the size read needs. */
const FAKE_JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/wAARCAAwAEADASIAAhEBAxEB/9k=";

// biome-ignore lint/plugin/no-system-path: a script's shebang, `#!/usr/bin/env bash`, the one path POSIX's exec of a script finds env at.
const SCRIPT = String.raw`#!/usr/bin/env bash
home="$HOME"
printf '%s\n' "$(printf '%s\0' "$@" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().split("\0")[:-1]))')" >> "$home/.fake-agy-runs"
for ref in "$PWD"/reference-*; do [ -f "$ref" ] && printf '%s %s\n' "$(sha256sum < "$ref" | cut -d' ' -f1)" "$ref"; done >> "$home/.fake-agy-seen"
signed="$home/.fake-agy-signed-in"
mode="$(cat "$home/.fake-agy-mode" 2>/dev/null || echo image)"
id="fa4e0000-0000-4000-8000-$(date +%s%N | tail -c 13)"
brain="$home/.gemini/antigravity-cli/brain/$id"
envelope() { printf '{"conversation_id":"%s","status":"%s","response":"%s","error":"%s","duration_seconds":1,"num_turns":1%s}\n' "$id" "$1" "$4" "$2" "$3"; }
case "$1" in
  --version) echo "1.5.0"; exit 0 ;;
  acp)
    echo "Open this link in your browser to sign in:"
    echo "https://accounts.google.com/o/oauth2/auth?client_id=fake&state=probe "
    printf "Paste the authorization code: "
    read -r code
    if [ "$code" = "good-code" ]; then touch "$signed"; echo "Signed in."; exit 0; fi
    echo "That code was not accepted."; exit 3 ;;
  -p)
    if [ "$2" = "/usage" ]; then
      if [ "$mode" = "broken" ]; then echo "something else entirely"; exit 2; fi
      if [ ! -f "$signed" ]; then
        printf '%s\n' "Authentication required. Please visit the URL to log in:" "  https://accounts.google.com/o/oauth2/auth?client_id=fake&state=probe" "" "Waiting for authentication (timeout 60s)..." "Or, paste the authorization code here and press Enter:" >&2
        sleep 60
        echo "error: authentication failed or timed out" >&2; envelope ERROR "authentication failed or timed out" ""; exit 1
      fi
      echo '{"conversation_id":"","status":"SUCCESS","response":"Gemini Models\tWeekly Limit Remaining\t100%\t2026-11-11T10:03:10Z\n","duration_seconds":0,"num_turns":0}'
      exit 0
    fi
    if [ ! -f "$signed" ] || [ "$mode" = "signed-out" ]; then
      echo "Error: authentication required" >&2; envelope ERROR "authentication required" ""; exit 1
    fi
    case "$mode" in
      hang) sleep 3600 ;;
      quota) envelope ERROR 'RESOURCE_EXHAUSTED (code 429): You have exhausted your capacity on this model. Your quota will reset after 3s.' ""; exit 1 ;;
      internal) envelope ERROR 'INTERNAL (code 500): Internal error encountered.' ""; exit 1 ;;
      no-image) envelope SUCCESS "" ',"structured_output":{"path":""}'; exit 0 ;;
      answers-reference) envelope SUCCESS "" ",\"structured_output\":{\"path\":\"$PWD/reference-1.png\"}"; exit 0 ;;
      tool-refused) envelope SUCCESS "" ',"structured_output":{"path":""}' "Error invalid tool call: invalid arguments: - at '/ImagePaths': maxItems: got 14, want 3"; exit 0 ;;
    esac
    mkdir -p "$brain"
    file="$brain/probe_image_1793790000000.jpg"
    printf '%s' "$(cat "$home/.fake-agy-jpeg")" | base64 -d > "$file"
    if [ "$mode" = "image-then-404" ]; then
      envelope ERROR 'NOT_FOUND (code 404): Requested entity was not found.' ""; exit 1
    fi
    envelope SUCCESS "" ",\"structured_output\":{\"path\":\"$file\"}"; exit 0 ;;
esac
echo "fake agy: no answer for $*" >&2
exit 64
`;

const at = (name: string): string => join(homedir(), name);

/**
 * Puts the fake agy in `bin`, whose HOME (the one it runs under) holds its
 * state: signed out, in `image` mode, while that HOME has no
 * `.fake-agy-signed-in`.
 */
export const putFakeAgy = async (bin: string): Promise<void> => {
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "agy"), SCRIPT);
  await chmod(join(bin, "agy"), 0o755);
};

/**
 * Puts the fake agy at `~/.local/bin/agy` under the spec's HOME and first on
 * the PATH, signed out, in `image` mode. Answers its controls.
 */
export const fakeAgy = async () => {
  const bin = at(".local/bin");
  await putFakeAgy(bin);
  await writeFile(at(".fake-agy-jpeg"), FAKE_JPEG);
  await rm(at(".fake-agy-signed-in"), { force: true });
  await rm(at(".fake-agy-runs"), { force: true });
  await rm(at(".fake-agy-seen"), { force: true });
  process.env.PATH = `${bin}:${process.env.PATH ?? ""}`;
  return {
    /** Sets what its image and usage runs do. */
    mode: (mode: FakeAgyMode | "broken") =>
      writeFile(at(".fake-agy-mode"), mode),
    /** Signs it in or out, as its own sign-in would. */
    signedIn: async (yes: boolean) =>
      yes
        ? await writeFile(at(".fake-agy-signed-in"), "")
        : await rm(at(".fake-agy-signed-in"), { force: true }),
    /** Each run's arguments since the last call, and forgets them. */
    runs: async (): Promise<string[][]> => {
      const text = await readFile(at(".fake-agy-runs"), "utf8").catch(() => "");
      await rm(at(".fake-agy-runs"), { force: true });
      return text
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]);
    },
    /** Each reference file in a run's working folder since the last call, by its path, its SHA-256; and forgets them. */
    seen: async (): Promise<Map<string, string>> => {
      const text = await readFile(at(".fake-agy-seen"), "utf8").catch(() => "");
      await rm(at(".fake-agy-seen"), { force: true });
      return new Map(
        text
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [sha = "", ...path] = line.split(" ");
            return [path.join(" "), sha];
          })
      );
    },
    /** Where agy keeps a conversation's files. */
    brain: at(".gemini/antigravity-cli/brain"),
  };
};
