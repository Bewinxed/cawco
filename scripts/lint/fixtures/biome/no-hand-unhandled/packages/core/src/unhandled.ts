// The owner file: unhandled() is where `never` is written.
export const unhandled = (value: never): never => {
  const missed: never = value;
  throw new Error(String(missed));
};
