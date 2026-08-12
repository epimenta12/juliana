const { sql } = require('@vercel/postgres');

let ensured = null;

async function runMigrations() {
  await sql`
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
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS status_note TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS observations TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_contact_date DATE`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_date DATE`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_contact_date DATE`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT ''`;

  await sql`
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      product TEXT NOT NULL DEFAULT '',
      purchase_date DATE,
      end_date DATE,
      next_product TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ativo',
      purchase_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      observations TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

function ensureSchema() {
  if (!ensured) {
    ensured = runMigrations();
  }
  return ensured;
}

module.exports = { sql, ensureSchema };
