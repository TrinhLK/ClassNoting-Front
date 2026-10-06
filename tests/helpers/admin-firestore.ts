/* Test double with nested documents and atomic serialized transactions. */
export function memoryFirestore(store: Map<string, any>) {
  let counter = 0;
  let lock: Promise<unknown> = Promise.resolve();
  const doc = (path: string): any => ({
    id: path.split("/").at(-1), path,
    collection: (name: string) => collection(`${path}/${name}`),
    get: async () => ({ exists: store.has(path), data: () => structuredClone(store.get(path)), ref: doc(path) }),
    set: async (data: any) => { store.set(path, structuredClone(data)); },
    update: async (data: any) => { store.set(path, { ...store.get(path), ...structuredClone(data) }); },
    create: async (data: any) => { if (store.has(path)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 }); store.set(path, structuredClone(data)); },
  });
  const collection = (path: string, filters: Array<[string, unknown]> = [], limit = Infinity): any => ({
    doc: (id = `doc_${++counter}`) => doc(`${path}/${id}`),
    where: (field: string, op: string, value: unknown) => collection(path, [...filters, [field, value]], limit),
    limit: (n: number) => collection(path, filters, n),
    get: async () => {
      const keys = [...store.keys()].filter(k => k.startsWith(path + "/") && !k.slice(path.length + 1).includes("/") && filters.every(([f, v]) => store.get(k)[f] === v)).slice(0, limit);
      const docs = await Promise.all(keys.map(k => doc(k).get())); return { empty: !docs.length, docs };
    },
  });
  const batch = () => {
    const pending: Array<() => Promise<void>> = [];
    return { set: (ref: any, value: any) => pending.push(() => ref.set(value)), update: (ref: any, value: any) => pending.push(() => ref.update(value)), commit: async () => { for (const f of pending) await f(); } };
  };
  return { collection, batch, runTransaction: (fn: (tx: any) => Promise<any>) => {
    const operation = lock.then(async () => { const writes = batch(); const result = await fn({ get: (ref: any) => ref.get(), ...writes }); await writes.commit(); return result; });
    lock = operation.catch(() => {}); return operation;
  } };
}
