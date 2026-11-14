// Left alone: the `hub` verb loads the hub's entry on demand.
export const hub = async (): Promise<void> => {
  const { startHub } = await import("@cawco/hub");
  await startHub();
};

// Planted: anything else of the hub's, here too.
export const app = () => import("@cawco/hub/app");
