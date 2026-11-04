// Planted: each read of a request's `last` taken for a tool's answer, then reads it is not.
declare const request: { last: string; afterTool: boolean };
declare const seen: { last: string } | undefined;
const answered = new Map<string, string>();
const answers: string[] = [];
const reading: { answer?: string; heard?: string } = {};
let answer = "";

answered.set("1", request.last);
reading.answer = request.last;
answer ||= request.last;
answers.push(seen?.last ?? "");
answers.push(request.last);
const firstAnswer = request.last;

reading.heard = request.last;
const words = seen?.last ?? "";
const told = request.last.includes("told");
answered.set("2", "done");
export { answer, firstAnswer, told, words };
