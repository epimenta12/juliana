const { sql, ensureSchema } = require('../../_db');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function sanitizeAnswer(field, raw) {
  if (field.type === 'nps') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 10) return null;
    return n;
  }
  const s = String(raw == null ? '' : raw).trim().slice(0, 4000);
  return s || null;
}

// Rota pública — sem isAuthed: qualquer pessoa com o link deve conseguir
// abrir o formulário e responder. GET busca a definição, POST envia a
// resposta — as duas ficam no mesmo arquivo para economizar functions
// (a Vercel Hobby limita 12 por deploy).
module.exports = async (req, res) => {
  try {
    await ensureSchema();
    const slug = String(req.query.slug || '').trim().slice(0, 60);
    if (!slug) { res.status(400).json({ error: 'slug inválido' }); return; }

    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT id, slug, title, description, fields
        FROM forms WHERE slug = ${slug}
      `;
      if (!rows.length) { res.status(404).json({ error: 'formulário não encontrado' }); return; }
      res.status(200).json(rows[0]);
      return;
    }

    if (req.method === 'POST') {
      const { rows } = await sql`SELECT id, fields FROM forms WHERE slug = ${slug}`;
      if (!rows.length) { res.status(404).json({ error: 'formulário não encontrado' }); return; }
      const form = rows[0];
      const fields = Array.isArray(form.fields) ? form.fields : [];
      const body = parseBody(req);
      const rawAnswers = (body && typeof body.answers === 'object' && body.answers) || {};

      const answers = {};
      for (const field of fields) {
        const value = sanitizeAnswer(field, rawAnswers[field.key]);
        if (field.required && (value === null || value === '')) {
          res.status(400).json({ error: `campo obrigatório não preenchido: ${field.label || field.key}` });
          return;
        }
        if (value !== null) answers[field.key] = value;
      }

      await sql`INSERT INTO form_responses (form_id, answers) VALUES (${form.id}, ${JSON.stringify(answers)}::jsonb)`;
      res.status(201).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ error: (err && err.message) || 'erro interno' });
  }
};
