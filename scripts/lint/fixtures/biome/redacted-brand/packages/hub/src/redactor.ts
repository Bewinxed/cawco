// Left alone: the redactor's own maker of the brand.
declare const REDACTED: unique symbol;
type Redacted<T> = T & { readonly [REDACTED]: true };
const passed = <T>(value: T): Redacted<T> => value as Redacted<T>;

export { passed };
