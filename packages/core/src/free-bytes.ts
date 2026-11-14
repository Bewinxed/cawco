import { statfs } from "node:fs/promises";

/** The bytes free to this user on the disk `folder` is on: THE ONE reading of free space, a move's, a delegate's inputs' and a project's assets'. */
export const freeBytes = async (folder: string): Promise<number> => {
  const disk = await statfs(folder);
  return disk.bavail * disk.bsize;
};
