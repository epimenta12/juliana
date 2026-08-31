const { sql, ensureSchema } = require('../_db');
const { isAuthed } = require('../_auth');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function slugify(text) {
  const noAccents = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return noAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'formulario';
}

module.exports = async (req, res) => {
  try {
    if (!isAuthed(req)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    await ensureSchema();

    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT f.id, f.slug, f.title, f.description, f.fields, f.created_at,
               COUNT(r.id)::int AS response_count
        FROM forms f
        LEFT JOIN form_responses r ON r.form_id = f.id
        GROUP BY f.id
        ORDER BY f.created_at DESC
      `;
      res.status(200).json(rows);
      return;
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const title = String(body.title || '').trim().slice(0, 200);
      const description = String(body.description || '').trim().slice(0, 2000);
      const fields = Array.isArray(body.fields) ? body.fields : [];
      if (!title) {
        res.status(400).json({ error: 'título é obrigatório' });
        return;
      }
      if (!fields.length) {
        res.status(400).json({ error: 'adicione ao menos um campo' });
        return;
      }

      const base = slugify(title);
      let slug = base;
      for (let i = 0; i < 20; i++) {
        const { rows } = await sql`SELECT 1 FROM forms WHERE slug = ${slug}`;
        if (!rows.length) break;
        slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      }

      const { rows } = await sql`
        INSERT INTO forms (slug, title, description, fields)
        VALUES (${slug}, ${title}, ${description}, ${JSON.stringify(fields)}::jsonb)
        RETURNING id, slug, title, description, fields, created_at
      `;
      res.status(201).json(Object.assign({ response_count: 0 }, rows[0]));
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ error: (err && err.message) || 'erro interno' });
  }
};
