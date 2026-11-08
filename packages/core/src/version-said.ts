const VERSION = /\d+\.\d+\.\d+/u;

/** The first `x.y.z` in what a version command printed or a release page says. */
export const versionSaid = (text: string): string | undefined =>
  VERSION.exec(text)?.[0];
