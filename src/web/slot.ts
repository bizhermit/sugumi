export type Slot<T> = {
  readonly set: (req: Request, value: T) => void;
  readonly get: (req: Request) => T;
  readonly find: (req: Request) => T | undefined;
};

export function slot<T>(name: string): Slot<T> {
  const values = new WeakMap<Request, { readonly value: T }>();
  return {
    set: (req, value) => {
      values.set(req, { value });
    },
    get: (req) => {
      const entry = values.get(req);
      if (entry == null) {
        throw new Error(`Slot[${name}]に値が設定されていません`);
      }
      return entry.value;
    },
    find: (req) => {
      return values.get(req)?.value;
    },
  };
}
