const { sql } = require('@vercel/postgres');

let ensured = null;

function ensureSchema() {
  if (!ensured) {
    ensured = sql`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        program TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'novo',
        notes JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  }
  return ensured;
}

module.exports = { sql, ensureSchema };
