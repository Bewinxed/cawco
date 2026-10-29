// Planted: an uncaught handler that says why and stays up; then one that
// ends, and a handler for another event.
declare const endProcess: (code: number, why: string) => never;

process.on("uncaughtException", (error) => {
  console.error(error);
});
process.once("unhandledRejection", (error) => {
  console.error(error);
});

process.on("unhandledRejection", (error) => endProcess(1, String(error)));
process.on("exit", () => console.log("bye"));
