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
  await ensureSchema();

  if (req.method === 'GET') {
    if (!isAuthed(req)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const { rows } = await sql`SELECT * FROM leads ORDER BY created_at DESC`;
    res.status(200).json(rows);
    return;
  }

  if (req.method === 'POST') {
    // Público: usado pelo formulário de captura do site antes de abrir o WhatsApp.
    const body = parseBody(req);
    const name = String(body.name || '').trim().slice(0, 200);
    const phone = String(body.phone || '').trim().slice(0, 60);
    const email = String(body.email || '').trim().slice(0, 200);
    const program = String(body.program || '').trim().slice(0, 200);
    const source = String(body.source || '').trim().slice(0, 200);

    if (!name || !phone) {
      res.status(400).json({ error: 'nome e telefone são obrigatórios' });
      return;
    }

    const { rows } = await sql`
      INSERT INTO leads (name, phone, email, program, source, status)
      VALUES (${name}, ${phone}, ${email}, ${program}, ${source}, 'novo')
      RETURNING id
    `;
    res.status(201).json({ ok: true, id: rows[0].id });
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};
