declare function hubRefusal(response: Response, then?: string): Promise<Error>;
declare const words: { notSaved: string; notRead: (at: string) => string };

export async function planted(response: Response, at: string) {
  await hubRefusal(response, "so it was not saved.");
  await hubRefusal(response, `so ${at} could not be read.`);
  await hubRefusal(response, words.notSaved);
  await hubRefusal(response, words.notRead(at));
  await hubRefusal(response);
}
