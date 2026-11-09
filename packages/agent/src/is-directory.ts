/** Whether a path names a directory: nothing there, or a file, is not one. */

import { stat } from "node:fs/promises";

export const isDirectory = async (path: string): Promise<boolean> => {
  const info = await stat(path).catch(() => null);
  return info?.isDirectory() ?? false;
};
