import { randomUUID } from 'node:crypto';
export function memoryDb(seed = {}) {
  const tables = structuredClone(seed);
  let failure = null;
  const db = {
    tables,
    fail(table, operation) {
      failure = { table, operation };
    },
    rpc: async (name, args) => {
      if (name === 'crm_consume_limit') return { data: true, error: null };
      const row = (tables.crm_snapshots || []).find(
        (row) =>
          row.id === args.p_id &&
          row.user_id === args.p_user &&
          row.status === 'collecting' &&
          !row.lease_id,
      );
      if (row) {
        row.lease_id = args.p_lease;
        row.lease_until = '2099-01-01';
      }
      return { data: Boolean(row), error: null };
    },
    from(table) {
      tables[table] ||= [];
      let operation = 'select',
        payload,
        filters = [],
        start = 0,
        end = Infinity,
        one = false,
        returning = false;
      const chain = {
        select() {
          returning = true;
          return this;
        },
        eq(key, value) {
          filters.push((row) => row[key] === value);
          return this;
        },
        order() {
          return this;
        },
        range(a, b) {
          start = a;
          end = b;
          return this;
        },
        limit(size) {
          end = size - 1;
          return this;
        },
        maybeSingle() {
          one = true;
          return this;
        },
        single() {
          one = true;
          return this;
        },
        insert(value) {
          operation = 'insert';
          payload = value;
          return this;
        },
        upsert(value) {
          operation = 'upsert';
          payload = value;
          return this;
        },
        update(value) {
          operation = 'update';
          payload = value;
          return this;
        },
        delete() {
          operation = 'delete';
          return this;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => {
              if (failure?.table === table && failure.operation === operation) {
                failure = null;
                return { data: null, error: { message: 'synthetic failure' } };
              }
              let rows = tables[table].filter((row) => filters.every((test) => test(row)));
              if (operation === 'insert' || operation === 'upsert') {
                const values = (Array.isArray(payload) ? payload : [payload]).map((value) => ({
                  id: randomUUID(),
                  status: 'collecting',
                  completed_tasks: 0,
                  gaps: [],
                  lease_id: null,
                  started_at: new Date().toISOString(),
                  ...structuredClone(value),
                }));
                tables[table].push(...values);
                rows = values;
              }
              if (operation === 'update')
                for (const row of rows) Object.assign(row, structuredClone(payload));
              if (operation === 'delete')
                tables[table] = tables[table].filter((row) => !rows.includes(row));
              const data =
                operation === 'select' || returning
                  ? structuredClone(one ? rows[0] || null : rows.slice(start, end + 1))
                  : null;
              return { data, error: null };
            })
            .then(resolve, reject);
        },
      };
      return chain;
    },
  };
  return db;
}
