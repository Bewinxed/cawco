// Planted: each shape control-loop-keyed-reads refuses, then the ones it leaves alone.
declare const db: {
  select: (columns?: object) => {
    from: (table: object) => Query;
  };
};
interface Query {
  all: () => unknown[];
  get: () => unknown;
  limit: (n: number) => Query;
  orderBy: (by: unknown) => Query;
  where: (when: unknown) => Query;
}
declare const instances: { id: string };
declare const sentMessageBodies: { uuid: string };
declare const projects: { id: string };
declare const when: unknown;

export const every = db.select().from(instances).all();
export const bodies = db.select().from(sentMessageBodies).orderBy(when).all();

export const keyed = db.select().from(instances).where(when).all();
export const capped = db.select().from(sentMessageBodies).limit(50).all();
export const small = db.select().from(projects).all();
export const one = db.select().from(instances).get();
