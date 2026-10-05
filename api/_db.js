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

  // Página exibida depois do envio (título, mensagem e botão opcional).
  await sql`ALTER TABLE forms ADD COLUMN IF NOT EXISTS final_page JSONB NOT NULL DEFAULT '{}'::jsonb`;

  // Visual do formulário público: 'step' (uma pergunta por vez) ou 'page' (todas as perguntas numa página).
  await sql`ALTER TABLE forms ADD COLUMN IF NOT EXISTS layout TEXT NOT NULL DEFAULT 'step'`;

  // Arquivos enviados em perguntas do tipo "upload". Ficam fora do JSON da
  // resposta (que só guarda a referência) para não pesar a listagem.
  await sql`
    CREATE TABLE IF NOT EXISTS form_files (
      id SERIAL PRIMARY KEY,
      form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      response_id INTEGER NOT NULL REFERENCES form_responses(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      data_b64 TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS form_files_response_idx ON form_files (response_id)`;

  // Termos de compra/prestação de serviço, autorização de imagem etc., por produto.
  // Os formulários apontam para um termo (termId); "version" sobe a cada alteração
  // de conteúdo e vai junto no registro do aceite.
  await sql`
    CREATE TABLE IF NOT EXISTS terms (
      id SERIAL PRIMARY KEY,
      product TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

// Preenche as perguntas de termos que apontam para um termo salvo (termId) com o
// conteúdo atual dele. Perguntas com texto/link próprio passam como estão.
async function resolveTermFields(fields) {
  const list = Array.isArray(fields) ? fields : [];
  const cache = {};
  const out = [];
  for (const f of list) {
    if (f && f.type === 'terms' && Number(f.termId)) {
      const id = Number(f.termId);
      if (!(id in cache)) {
        const { rows } = await sql`SELECT id, title, url, text, version FROM terms WHERE id = ${id}`;
        cache[id] = rows[0] || null;
      }
      const t = cache[id];
      if (t) {
        out.push(Object.assign({}, f, { text: t.text, url: t.url, termTitle: t.title, termVersion: t.version }));
        continue;
      }
    }
    out.push(f);
  }
  return out;
}

function ensureSchema() {
  if (!ensured) {
    ensured = runMigrations();
  }
  return ensured;
}

module.exports = { sql, ensureSchema, resolveTermFields };
