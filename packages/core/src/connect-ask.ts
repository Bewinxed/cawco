/**
 * A connect ask's answer as the asking agent reads it, and the same words
 * read back as the transcript's record of it. The call's result is the one
 * record every harness keeps of the ask (Claude Code's tool result, a Code
 * Mode program's call in OpenCode, pi's), so the record line is drawn from
 * it, whatever reloads the transcript, and nothing else keeps a copy.
 */
import type { ConnectAccess, ConnectAnswer } from "./frames";
import { askWords } from "./words/asks";

/** An access as the agent and the record say it. */
export const accessWords = (access: ConnectAccess): string =>
  access === "read" ? askWords.recordReadOnly : askWords.recordReadWrite;

/** An access as the card's choice names it. */
export const accessLabel = (access: ConnectAccess): string =>
  access === "read" ? askWords.readOnly : askWords.readWrite;

/** What the agent is told once its tools reach it. */
const REACHES =
  "Its tools reach this session now; call them as you would any MCP server's.";
/** Where a declined answer's words begin. */
const SAID = " They said: ";
const NOT_NOW = " They said not now.";

/**
 * What the asking agent reads. Its first sentence is what the record line
 * says: "Connected figma as you@example.com, read-only." or "figma not
 * connected." with the person's words after it.
 */
export const connectAnsweredWords = (answer: ConnectAnswer): string => {
  if (answer.outcome === "declined") {
    const words = answer.words.trim();
    return `${askWords.recordNotConnected(answer.server)}.${words ? `${SAID}${words}` : NOT_NOW}`;
  }
  const head = answer.as
    ? askWords.recordConnectedAs(answer.server, answer.as)
    : askWords.recordConnected(answer.server);
  const access = answer.access ? `, ${accessWords(answer.access)}` : "";
  return `${head}${access}. ${REACHES}`;
};

const ACCESS_OF: Record<string, ConnectAccess> = {
  [askWords.recordReadOnly]: "read",
  [askWords.recordReadWrite]: "write",
};

/** Whether `text` begins with `head`, the server's name in it matched without regard to case. */
const opens = (text: string, head: string): boolean =>
  text.slice(0, head.length).toLowerCase() === head.toLowerCase();

/**
 * The answer {@link connectAnsweredWords} wrote, read back from the call's
 * result, for the server the call named (`asked`, as the agent wrote it:
 * the hub matches it without regard to case and answers in the name the
 * fleet gives it); null for any other result (a refusal, a withdrawn ask).
 */
export const connectAnswerOf = (
  asked: string,
  result: string
): ConnectAnswer | null => {
  const text = result.trim();
  const declined = `${askWords.recordNotConnected(asked)}.`;
  if (opens(text, declined)) {
    const rest = text.slice(declined.length);
    return {
      outcome: "declined",
      server: text.slice(0, asked.length),
      words: rest.startsWith(SAID) ? rest.slice(SAID.length).trim() : "",
    };
  }
  const connected = askWords.recordConnected(asked);
  const end = text.indexOf(`. ${REACHES}`);
  if (!opens(text, connected) || end === -1) {
    return null;
  }
  const server = text.slice(connected.length - asked.length, connected.length);
  let middle = text.slice(connected.length, end);
  let access: ConnectAccess | null = null;
  const comma = middle.lastIndexOf(", ");
  const tail = comma === -1 ? undefined : ACCESS_OF[middle.slice(comma + 2)];
  if (tail) {
    access = tail;
    middle = middle.slice(0, comma);
  }
  const as = middle.startsWith(" as ") ? middle.slice(4).trim() : "";
  return { outcome: "connected", server, as: as || null, access };
};

const CONNECT_ASK_NAME = /(?:^|_)connect_ask$/;

/** A tool name that is the connect ask, under any harness's naming of it (`mcp__cawco__…`, `cawco_…`). */
export const isConnectAskTool = (name: string | undefined): boolean =>
  CONNECT_ASK_NAME.test(name ?? "");
