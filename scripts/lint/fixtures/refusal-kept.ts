// What house/refusal-kept must report (expected.txt): a call that may answer
// a refusal, made as a statement, drops it.
import { refusal } from "../../../packages/hub/src/refusal";

const check = (name: string) =>
  name ? undefined : refusal(422, "name-needed", "A name is needed.");
const checkLater = async (name: string) => await Promise.resolve(check(name));

export const drops = async (name: string) => {
  check(name);
  await checkLater(name);
  return name;
};

// Read, it stands.
export const passesUp = (name: string) => check(name) ?? name;
