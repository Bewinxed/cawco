import type { NeutralUserMessage } from "@cawco/core";

/** A send's words, as its record keeps them: its text, or its content's text blocks. */
export const sendWords = (body: NeutralUserMessage | null): string => {
  const content = body?.message.content;
  if (typeof content === "string") {
    return content;
  }
  return (content ?? [])
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n");
};
