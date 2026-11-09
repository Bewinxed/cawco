/**
 * What a session's Files panel says: a search that matches nothing, a list
 * the hub couldn't read. The dashboard renders them from here.
 */
export const filesWords = {
  /** A project file the hub refused to read: what came of it, said after the hub's sentence (`hubRefusal`). */
  notReadThen: (path: string) => `so ${path} could not be read.`,
  noArtifactsMatch: (query: string) => `No artifacts match “${query}”`,
  noAttachmentsMatch: (query: string) => `No attachments match “${query}”`,
  cantReadArtifacts: "Couldn't read this session's artifacts",
  cantReadAttachments: "Couldn't read this session's attachments",
  /** The Artifacts head's switch, and its two ways: each its icon, its name the travelling label (motion/Rail). */
  artifactsView: "Show artifacts as",
  thumbnails: "Thumbnails",
  list: "List",
};
