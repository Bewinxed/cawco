// The shared mock reads `last` for an answer: exempt.
declare const request: { last: string };
const answered = new Map<string, string>();
answered.set("1", request.last);
