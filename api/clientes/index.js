const { sql, ensureSchema } = require('../_db');
const { isAuthed } = require('../_auth');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

module.exports = async (req, res) => {
  if (!isAuthed(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  await ensureSchema();

  if (req.method === 'GET') {
    const { rows } = await sql`SELECT * FROM clientes ORDER BY created_at DESC`;
    res.status(200).json(rows);
    return;
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const name = String(body.name || '').trim().slice(0, 200);
    const phone = String(body.phone || '').trim().slice(0, 60);
    const product = String(body.product || '').trim().slice(0, 200);

    if (!name) {
      res.status(400).json({ error: 'nome é obrigatório' });
      return;
    }

    const { rows } = await sql`
      INSERT INTO clientes (name, phone, product, status)
      VALUES (${name}, ${phone}, ${product}, 'ativo')
      RETURNING id
    `;
    res.status(201).json({ ok: true, id: rows[0].id });
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};
