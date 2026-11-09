// Biome holds any at every site: an annotation, an assertion, a parameter.
declare const value: unknown;
export const annotated: any = value;
export const cast = value as any;
export const param = (input: any): string => String(input);
