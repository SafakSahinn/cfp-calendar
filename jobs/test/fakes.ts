// Testler için bellek içi Supabase sorgu taklidi ve fetch kaydedici.
// Sadece calendar.ts'in kullandığı alt küme desteklenir: select/eq/maybeSingle, update/eq, upsert, delete/eq.

type Row = Record<string, unknown>;

class Query {
  private filters: [string, unknown][] = [];
  private op: 'select' | 'update' | 'delete' = 'select';
  private patch: Row = {};

  constructor(private db: FakeDb, private table: string) {}

  select() { this.op = 'select'; return this; }
  update(patch: Row) { this.op = 'update'; this.patch = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(col: string, val: unknown) { this.filters.push([col, val]); return this; }

  async upsert(row: Row, opts: { onConflict?: string } = {}) {
    const keys = (opts.onConflict ?? 'id').split(',');
    const rows = this.db.rows(this.table);
    const existing = rows.find((r) => keys.every((k) => r[k] === row[k]));
    if (existing) Object.assign(existing, row);
    else rows.push({ id: `id-${rows.length + 1}`, ...row });
    return { data: null, error: null };
  }

  private matches() {
    return this.db.rows(this.table).filter((r) => this.filters.every(([c, v]) => r[c] === v));
  }

  async maybeSingle() {
    return { data: this.matches()[0] ?? null, error: null };
  }

  then<T1, T2>(resolve: (v: { data: unknown; error: null }) => T1, reject?: (e: unknown) => T2) {
    const run = async () => {
      const hits = this.matches();
      if (this.op === 'update') hits.forEach((r) => Object.assign(r, this.patch));
      if (this.op === 'delete') {
        const rows = this.db.rows(this.table);
        for (const h of hits) rows.splice(rows.indexOf(h), 1);
      }
      return { data: hits, error: null as null };
    };
    return run().then(resolve, reject);
  }
}

export class FakeDb {
  tables = new Map<string, Row[]>();
  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }
  from(table: string) {
    return new Query(this, table);
  }
}

export interface Call {
  method: string;
  url: string;
  body: unknown;
}

/** global fetch'i sırayla verilen yanıtlarla değiştirir; çağrıları kaydeder. */
export function mockFetch(responses: { status?: number; json: unknown }[]) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body;
    calls.push({
      method: init?.method ?? 'GET',
      url: String(url),
      body: typeof body === 'string' ? JSON.parse(body) : body instanceof URLSearchParams ? Object.fromEntries(body) : body,
    });
    const r = responses.shift();
    if (!r) throw new Error(`Beklenmeyen fetch: ${url}`);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}
