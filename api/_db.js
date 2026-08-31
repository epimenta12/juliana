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

  await sql`
    CREATE TABLE IF NOT EXISTS forms (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS form_responses (
      id SERIAL PRIMARY KEY,
      form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS form_responses_form_idx ON form_responses (form_id)`;
}

function ensureSchema() {
  if (!ensured) {
    ensured = runMigrations();
  }
  return ensured;
}

module.exports = { sql, ensureSchema };
