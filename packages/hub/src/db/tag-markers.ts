/**
 * The one-time migration that gives every stored send CawCo made its marker
 * tag (core injected.ts `markerTag`). Before the tag, each marker was read
 * back off the line its reader reads; now only the tag is read, so the sends
 * stored before it are given theirs once, here, by the words those hubs
 * wrote: this is the only place those words are ever read, and it runs once
 * (`data_migrations`, db `migrateSendsOnce`). The line a reader reads stays
 * as it was; the tag goes before it, as a marker is written now.
 */
import { markerTag, type NeutralUserMessage, readMarkerTag } from "@cawco/core";

/** The migration's name, as `data_migrations` keeps it. */
export const TAG_MARKERS = "tag-markers";

/** Each marker as the hubs before the tag wrote it, and the tag its words name. */
const BEFORE: readonly {
  line: RegExp;
  tag: (said: RegExpExecArray) => string;
}[] = [
  {
    line: /^\[Hand-off from the (.+?)(?:#([0-9a-f]{8}))? session — another agent, not the user\]/,
    tag: ([, from, short]) => markerTag("handoff", { from, short }),
  },
  {
    line: /^\[CawCo\] Your message to (.+?) was not delivered: /,
    tag: ([, to]) => markerTag("undelivered", { to }),
  },
  {
    line: /^\[CawCo\] The (page|canvas|preview|sheet) "([a-z0-9][a-z0-9-]{0,62})" has new responses since (\d+)\. Read them with artifact_read\(\{ id: "([0-9a-f-]{36})", since: \d+ \}\)/,
    tag: ([, kind, name, since, id]) =>
      markerTag("artifact-responses", { id, kind, name, since }),
  },
  {
    line: /^\[CawCo\] The person commented on the (page|canvas|preview|sheet) "([a-z0-9][a-z0-9-]{0,62})" \(artifact ([0-9a-f-]{36})\)\./,
    tag: ([, kind, name, id]) =>
      markerTag("artifact-comments", { id, kind, name }),
  },
  {
    line: /^\[CawCo\] The (page|canvas|preview|sheet) "([a-z0-9][a-z0-9-]{0,62})" \(artifact ([0-9a-f-]{36})\) does not compile on its stage;/,
    tag: ([, kind, name, id]) =>
      markerTag("artifact-errors", { id, kind, name }),
  },
  {
    line: /^\[CawCo\] The person changed the (page|canvas|preview|sheet) "([a-z0-9][a-z0-9-]{0,62})" \(artifact ([0-9a-f-]{36})\) from its inspector,/,
    tag: ([, kind, name, id]) =>
      markerTag("artifact-saves", { id, kind, name }),
  },
  {
    line: /^\[CawCo\] (.+) put the (page|canvas|preview|sheet) "([a-z0-9][a-z0-9-]{0,62})" in your panel \(artifact ([0-9a-f-]{36})\)\./,
    tag: ([, from, kind, name, id]) =>
      markerTag("artifact-handed", { from, id, kind, name }),
  },
  {
    line: /^\[Fleet watch\] (.+)\n\n/,
    tag: ([, line]) => markerTag("fleet-watch", { line }),
  },
  {
    line: /^\[Fork\] (.+)\n\n/,
    tag: ([, line]) => markerTag("fork", { line }),
  },
  {
    line: /^\[Report from delegate (.+?)#([0-9a-f]{8}) — (turn complete|turn failed|notice)\]\n(?:Headline: ([^\n]+)\n)?\n/,
    tag: ([, name, short, outcome, headline]) =>
      markerTag("report", {
        name,
        short,
        outcome: outcome === "notice" ? "notice" : outcome.slice(5),
        headline: headline?.trim(),
      }),
  },
  {
    line: /^\[Delegate ask from (.+?)\]\n\n[\s\S]*?\n\n\[delegate-ask instance=([0-9a-f-]{36}) request=(\S+)\]/,
    tag: ([, label, instance, request]) =>
      markerTag("delegate-ask", { label, instance, request }),
  },
  {
    line: /^\[Rule: (.+?)\]\n\n/,
    tag: ([, name]) => markerTag("rule", { name }),
  },
];

/** `text` with the tag its old marker names before it; null for text that has a tag, or opens with no marker. */
const tagged = (text: string): string | null => {
  if (readMarkerTag(text)) {
    return null;
  }
  for (const { line, tag } of BEFORE) {
    const said = line.exec(text);
    if (said) {
      return `${tag(said)}${text}`;
    }
  }
  return null;
};

/** A stored send with its marker tagged ({@link tagged}); null when it needs none. */
export const tagStoredSend = (
  body: NeutralUserMessage
): NeutralUserMessage | null => {
  const { content } = body.message;
  if (typeof content === "string") {
    const text = tagged(content);
    return text === null
      ? null
      : { ...body, message: { ...body.message, content: text } };
  }
  const at = content.findIndex((block) => block.type === "text");
  const first = content[at];
  if (first?.type !== "text") {
    return null;
  }
  const text = tagged(first.text);
  return text === null
    ? null
    : {
        ...body,
        message: {
          ...body.message,
          content: content.map((block, index) =>
            index === at ? { ...first, text } : block
          ),
        },
      };
};
