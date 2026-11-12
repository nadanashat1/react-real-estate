import { mkdirSync } from "node:fs";
import path from "node:path";
// The SQL boundary keeps local SQLite and hosted Postgres behavior aligned.
export async function createDatabase({ directory, url, pglite = false }) {
  let sqlite, pool, pgliteDb;
  if (pglite) {
    const { PGlite } = await import("@electric-sql/pglite");
    pgliteDb = new PGlite(path.join(directory, "pglite"));
  } else if (url) {
    const { Pool } = await import("pg");
    pool = new Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    });
  } else {
    const { DatabaseSync } = await import("node:sqlite");
    mkdirSync(directory, { recursive: true });
    sqlite = new DatabaseSync(path.join(directory, "estate.sqlite"));
    sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  }
  const postgres = !!(pool || pgliteDb);
  const query = async (sql, args = []) =>
    pgliteDb ? await pgliteDb.query(sql, args) : await pool.query(sql, args);
  function translate(sql) {
    let n = 0;
    sql = sql.replace(/\?/g, () => "$" + ++n).replace(/\bLIKE\b/g, "ILIKE");
    if (sql.startsWith("INSERT OR IGNORE"))
      sql =
        sql.replace("INSERT OR IGNORE", "INSERT") + " ON CONFLICT DO NOTHING";
    return sql;
  }
  return {
    async exec(sql) {
      if (sqlite) return sqlite.exec(sql);
      const ddl = sql
        .replaceAll("id INTEGER PRIMARY KEY,", "id SERIAL PRIMARY KEY,")
        .replaceAll("expires INTEGER", "expires BIGINT")
        .replaceAll("BLOB", "BYTEA");
      if (pgliteDb) return pgliteDb.exec(ddl);
      return pool.query(ddl);
    },
    prepare(sql) {
      return {
        async get(...args) {
          return sqlite
            ? sqlite.prepare(sql).get(...args)
            : (await query(translate(sql), args)).rows[0];
        },
        async all(...args) {
          return sqlite
            ? sqlite.prepare(sql).all(...args)
            : (await query(translate(sql), args)).rows;
        },
        async run(...args) {
          if (sqlite) return sqlite.prepare(sql).run(...args);
          let q = translate(sql);
          const returning =
            /^INSERT INTO (users|homes|inquiries|replies)\b/.test(q);
          if (returning) q += " RETURNING id";
          const result = await query(q, args);
          return {
            lastInsertRowid: returning ? result.rows[0]?.id : null,
            changes: result.rowCount,
          };
        },
      };
    },
    async close() {
      if (sqlite) sqlite.close();
      if (pool) await pool.end();
      if (pgliteDb) await pgliteDb.close();
    },
    dialect: postgres ? "postgres" : "sqlite",
  };
}
