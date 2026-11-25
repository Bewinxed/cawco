declare const CAWCO_ENV: Record<string, string>;
declare const readEnv: (name: string | undefined) => string | undefined;
export const hub = readEnv(CAWCO_ENV.hubUrl);
