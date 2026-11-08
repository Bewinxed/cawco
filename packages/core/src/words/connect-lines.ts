/** What a connect ask's answer says. */

import { REACHES, SAID } from "../connect-ask";
import type { ConnectAccess, ConnectAnswer } from "../frames";
import { askWords } from "./asks";

/** An access as the agent and the record say it. */
export const accessWords = (access: ConnectAccess): string =>
  access === "read" ? askWords.recordReadOnly : askWords.recordReadWrite;

/** An access as the card's choice names it. */
export const accessLabel = (access: ConnectAccess): string =>
  access === "read" ? askWords.readOnly : askWords.readWrite;

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
