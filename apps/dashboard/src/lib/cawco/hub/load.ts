/**
 * A store's read of the hub that may come back empty: the answer, or null
 * after saying on the console why there is none.
 */
export async function load<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch (error) {
    console.error("[cawco] A hub read failed:", error);
    return null;
  }
}
