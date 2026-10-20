// A versioned, atomic transaction fake. Conflicting reads retry, and reads after
// writes fail, so concurrency/idempotency tests exercise the transaction boundary.
export const DELETE_FIELD = Symbol('delete');

export class TestTimestamp {
  constructor(readonly milliseconds: number) {}
  static fromMillis(value: number) { return new TestTimestamp(value); }
  static now() { return TestTimestamp.fromMillis(Date.now()); }
  toMillis() { return this.milliseconds; }
  toDate() { return new Date(this.milliseconds); }
}

type Data = Record<string, any>;

function clone<T>(value: T): T {
  if (value instanceof TestTimestamp || value === DELETE_FIELD || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone) as T;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)])) as T;
}

function merge(target: Data, source: Data): Data {
  const result = clone(target);
  for (const [key, value] of Object.entries(source)) {
    if (value === DELETE_FIELD) delete result[key];
    else if (value && Object.getPrototypeOf(value) === Object.prototype) {
      result[key] = merge(result[key] && typeof result[key] === 'object' ? result[key] : {}, value);
    } else result[key] = clone(value);
  }
  return result;
}

class Snapshot {
  readonly exists: boolean;
  constructor(readonly ref: DocRef, private readonly value?: Data) { this.exists = value !== undefined; }
  get id() { return this.ref.id; }
  data() { return clone(this.value); }
}

class DocRef {
  constructor(readonly db: TestFirestore, readonly path: string) {}
  get id() { return this.path.split('/').at(-1)!; }
  collection(name: string) { return new Query(this.db, `${this.path}/${name}`); }
  async get() { return this.db.read(this); }
}

class Query {
  constructor(readonly db: TestFirestore, readonly path: string, readonly max = Infinity) {}
  doc(id: string) { return new DocRef(this.db, `${this.path}/${id}`); }
  limit(max: number) { return new Query(this.db, this.path, max); }
  async get() { return this.db.readQuery(this); }
}

type Write = { ref: DocRef; data: Data; kind: 'set' | 'update' | 'create'; merge?: boolean };

export class TestFirestore {
  readonly store = new Map<string, Data>();
  readonly reads: string[] = [];
  readonly writes: string[] = [];
  readonly versions = new Map<string, number>();
  revision = 0;
  beforeCommit?: () => void;

  collection(path: string) { return new Query(this, path); }
  seed(path: string, value: Data) {
    this.store.set(path, clone(value));
    this.versions.set(path, (this.versions.get(path) ?? 0) + 1);
    this.revision++;
  }
  remove(path: string) {
    this.store.delete(path);
    this.versions.set(path, (this.versions.get(path) ?? 0) + 1);
    this.revision++;
  }
  data(path: string) { return clone(this.store.get(path)); }
  read(ref: DocRef) {
    this.reads.push(ref.path);
    return new Snapshot(ref, clone(this.store.get(ref.path)));
  }
  readQuery(query: Query) {
    this.reads.push(`${query.path}?limit=${query.max}`);
    const docs = [...this.store.entries()]
      .filter(([path]) => path.startsWith(`${query.path}/`) && path.split('/').length === query.path.split('/').length + 1)
      .slice(0, query.max)
      .map(([path, value]) => new Snapshot(new DocRef(this, path), clone(value)));
    return { docs, empty: docs.length === 0, size: docs.length };
  }

  async runTransaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const versions = new Map<string, number>();
      let queryRevision: number | undefined;
      const writes: Write[] = [];
      const result = await callback({
        get: async (target: DocRef | Query) => {
          if (writes.length) throw new Error('Transaction reads must precede writes');
          if (target instanceof DocRef) {
            versions.set(target.path, this.versions.get(target.path) ?? 0);
            return this.read(target);
          }
          queryRevision = this.revision;
          return this.readQuery(target);
        },
        create: (ref: DocRef, data: Data) => writes.push({ ref, data: clone(data), kind: 'create' }),
        update: (ref: DocRef, data: Data) => writes.push({ ref, data: clone(data), kind: 'update' }),
        set: (ref: DocRef, data: Data, options?: { merge: boolean }) =>
          writes.push({ ref, data: clone(data), kind: 'set', merge: options?.merge }),
      });
      const beforeCommit = this.beforeCommit;
      this.beforeCommit = undefined;
      beforeCommit?.();
      if ([...versions].some(([path, version]) => (this.versions.get(path) ?? 0) !== version) ||
          (queryRevision !== undefined && queryRevision !== this.revision)) continue;

      // Validate all preconditions before applying any writes.
      for (const write of writes) {
        if (write.kind === 'create' && this.store.has(write.ref.path)) throw new Error('ALREADY_EXISTS');
        if (write.kind === 'update' && !this.store.has(write.ref.path)) throw new Error('NOT_FOUND');
      }
      for (const write of writes) {
        const old = this.store.get(write.ref.path) ?? {};
        let next: Data;
        if (write.kind === 'update') {
          next = clone(old);
          for (const [field, value] of Object.entries(write.data)) {
            const parts = field.split('.');
            let target = next;
            for (const part of parts.slice(0, -1)) target = target[part] ??= {};
            if (value === DELETE_FIELD) delete target[parts.at(-1)!];
            else target[parts.at(-1)!] = clone(value);
          }
        } else next = write.merge ? merge(old, write.data) : clone(write.data);
        this.seed(write.ref.path, next);
        this.writes.push(write.ref.path);
      }
      return result;
    }
    throw new Error('Transaction retry limit exceeded');
  }
}
